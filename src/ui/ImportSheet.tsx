import { useRef, useState } from 'react';
import type { Metal } from '../types/holding';
import { money } from '../lib/format';
import { Button, Sheet } from './primitives';

export interface ImportRow {
  description?: string;
  metal?: Metal;
  /** Troy ounces per piece */
  weight?: number;
  quantity?: number;
  purchasePrice?: number;
  purchaseDate?: string;
  dealer?: string;
  taxes?: number;
  shipping?: number;
  note?: string;
}

interface Props {
  rows: ImportRow[];
  source: string;
  onClose: () => void;
  /** `batchId` stays the same for every try from this sheet, so a retry can't add rows twice. */
  onConfirm: (rows: ImportRow[], batchId: string) => Promise<void>;
}

// The account keeps whole pieces, the same as the app.
function usable(r: ImportRow): boolean {
  const countOk = r.quantity == null || (Number.isInteger(r.quantity) && r.quantity > 0);
  return Boolean(r.metal && r.weight && r.weight > 0 && countOk);
}

/** Review rows from a receipt scan or a spreadsheet before they join the stack. */
export function ImportSheet({ rows, source, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  // Set the moment a save starts, so a close that lands before the sheet
  // redraws is held back too.
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId] = useState(() => crypto.randomUUID());
  const good = rows.filter(usable);
  const skipped = rows.length - good.length;
  // While the rows are saving, the sheet stays open. Closed, the save would
  // finish out of sight, and opening the file again would be a new import
  // that could add the same rows a second time.
  const close = () => {
    if (!saving.current) onClose();
  };

  return (
    <Sheet open onClose={close} title={`Add from ${source}`} width="lg">
      <p className="text-[14px] text-fg-2">
        {good.length} {good.length === 1 ? 'item' : 'items'} ready to add.
        {skipped > 0 && ` ${skipped} ${skipped === 1 ? "row is missing a metal or weight, or its count isn't a whole number, so it" : "rows are missing a metal or weight, or their count isn't a whole number, so they"} will be skipped.`}
      </p>
      <div className="mt-3 max-h-[50vh] overflow-auto rounded-xl border border-line">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-surface-2 text-fg-3">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-left font-medium">Metal</th>
              <th className="px-3 py-2 text-right font-medium">Oz each</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Price each</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={usable(r) ? 'border-t border-line' : 'border-t border-line opacity-50'}>
                <td className="px-3 py-2 text-fg">{r.description || 'Unnamed'}</td>
                <td className="px-3 py-2 text-fg-2 capitalize">{r.metal ?? 'missing'}</td>
                <td className="px-3 py-2 text-right text-fg-2 tnum">{r.weight ?? 'missing'}</td>
                <td className="px-3 py-2 text-right text-fg-2 tnum">{r.quantity ?? 1}</td>
                <td className="px-3 py-2 text-right text-fg-2 tnum">{r.purchasePrice != null ? money(r.purchasePrice) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 text-[13px] text-down" role="alert">{error}</p>}
      {busy && (
        <p className="mt-3 text-[13px] text-fg-2" role="status">
          Adding these to your stack. This closes once they're saved.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
        <Button
          disabled={busy || good.length === 0}
          onClick={async () => {
            if (saving.current) return;
            saving.current = true;
            setBusy(true);
            setError(null);
            try {
              await onConfirm(good, batchId);
              saving.current = false;
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "That didn't save, so nothing was added. Try again.");
            } finally {
              saving.current = false;
              setBusy(false);
            }
          }}
        >
          {busy ? 'Adding' : `Add ${good.length} to my stack`}
        </Button>
      </div>
    </Sheet>
  );
}
