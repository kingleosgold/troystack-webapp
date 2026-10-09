import { useState } from 'react';
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
}

interface Props {
  rows: ImportRow[];
  source: string;
  onClose: () => void;
  onConfirm: (rows: ImportRow[]) => Promise<void>;
}

function usable(r: ImportRow): boolean {
  return Boolean(r.metal && r.weight && r.weight > 0);
}

/** Review rows from a receipt scan or a spreadsheet before they join the stack. */
export function ImportSheet({ rows, source, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const good = rows.filter(usable);
  const skipped = rows.length - good.length;

  return (
    <Sheet open onClose={onClose} title={`Add from ${source}`} width="lg">
      <p className="text-[14px] text-fg-2">
        {good.length} {good.length === 1 ? 'item' : 'items'} ready to add.
        {skipped > 0 && ` ${skipped} ${skipped === 1 ? 'row is' : 'rows are'} missing a metal or weight and will be skipped.`}
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
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          disabled={busy || good.length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm(good);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Some items didn\'t save. Try again.');
            } finally {
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
