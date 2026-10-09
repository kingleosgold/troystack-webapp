import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Holding, HoldingFormData, Metal, WeightUnit } from '../types/holding';
import { PRODUCT_PRESETS, WEIGHT_TO_OZT } from '../types/holding';
import { METALS, METAL_LABEL } from '../lib/metals';
import { fetchHistoricalSpot } from '../lib/marketApi';
import { premiumPerPiece } from '../lib/stackMath';
import { money } from '../lib/format';
import { Button, Field, Input, Segmented, Select, Sheet, Textarea } from './primitives';

interface Props {
  open: boolean;
  onClose: () => void;
  holding?: Holding | null;
  onSave: (form: HoldingFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

function initialForm(h?: Holding | null): Record<string, string> {
  if (!h) {
    return { metal: 'silver', type: '', weight: '1', weightUnit: 'oz', quantity: '1', purchasePrice: '', purchaseDate: todayISO(), dealer: '', taxes: '', shipping: '', note: '' };
  }
  const shownWeight = h.weightUnit === 'oz' ? h.weight : h.weight / WEIGHT_TO_OZT[h.weightUnit];
  return {
    metal: h.metal,
    type: h.type,
    weight: String(+shownWeight.toFixed(5)),
    weightUnit: h.weightUnit,
    quantity: String(h.quantity),
    purchasePrice: h.purchasePrice ? String(h.purchasePrice) : '',
    purchaseDate: h.purchaseDate,
    dealer: h.dealer ?? '',
    taxes: h.taxes ? String(h.taxes) : '',
    shipping: h.shipping ? String(h.shipping) : '',
    note: h.note ?? '',
  };
}

const num = (v: string) => {
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

export function HoldingEditor({ open, onClose, holding, onSave, onDelete }: Props) {
  const [f, setF] = useState<Record<string, string>>(() => initialForm(holding));
  const [more, setMore] = useState(Boolean(holding?.dealer || holding?.taxes || holding?.shipping || holding?.note));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spotThen, setSpotThen] = useState<number | null>(holding?.spotAtPurchase ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const metal = f.metal as Metal;
  const set = (key: string, value: string) => setF((prev) => ({ ...prev, [key]: value }));

  // Spot on the purchase date, for the premium the app records with each holding.
  useEffect(() => {
    if (!open) return;
    const date = f.purchaseDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetchHistoricalSpot(date, controller.signal)
        .then((spot) => setSpotThen(spot[metal] ?? null))
        .catch(() => setSpotThen(null));
    }, 400);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [open, f.purchaseDate, metal]);

  const ozPerPiece = (num(f.weight) || 0) * WEIGHT_TO_OZT[f.weightUnit as WeightUnit];
  const price = num(f.purchasePrice);
  const premium = useMemo(() => (spotThen && price > 0 && ozPerPiece > 0 ? premiumPerPiece(price, spotThen, ozPerPiece) : undefined), [spotThen, price, ozPerPiece]);

  const choosePreset = (name: string) => {
    set('type', name);
    const preset = PRODUCT_PRESETS[metal].find((p) => p.name === name);
    if (preset) {
      setF((prev) => ({ ...prev, type: name, weight: String(preset.ozt), weightUnit: 'oz' }));
    }
  };

  const submit = async () => {
    setError(null);
    const weight = num(f.weight);
    const quantity = num(f.quantity);
    const purchasePrice = f.purchasePrice.trim() ? num(f.purchasePrice) : 0;
    if (!(weight > 0)) return setError('Enter the weight of one piece.');
    if (!(quantity > 0)) return setError('Enter how many you have.');
    if (!(purchasePrice >= 0)) return setError('Enter the price you paid per piece, or leave it blank.');
    if (f.purchaseDate && f.purchaseDate > todayISO()) return setError("The purchase date can't be in the future.");
    const form: HoldingFormData = {
      metal,
      type: f.type.trim() || `${METAL_LABEL[metal]} ${weight} ${f.weightUnit}`,
      weight,
      weightUnit: f.weightUnit as WeightUnit,
      quantity,
      purchasePrice,
      purchaseDate: f.purchaseDate,
      dealer: f.dealer.trim() || undefined,
      taxes: num(f.taxes) > 0 ? num(f.taxes) : undefined,
      shipping: num(f.shipping) > 0 ? num(f.shipping) : undefined,
      spotAtPurchase: spotThen ?? undefined,
      premium,
      note: f.note.trim() || undefined,
    };
    try {
      setSaving(true);
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={holding ? 'Edit holding' : 'Add a holding'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Segmented<Metal>
          label="Metal"
          value={metal}
          onChange={(m) => set('metal', m)}
          options={METALS.map((m) => ({ value: m, label: METAL_LABEL[m] }))}
          className="w-full [&>button]:flex-1"
        />
        <Field label="Product" htmlFor="h-type">
          <Input id="h-type" list={`presets-${metal}`} value={f.type} onChange={(e) => choosePreset(e.target.value)} placeholder="American Silver Eagle 1 oz" autoComplete="off" />
          <datalist id={`presets-${metal}`}>
            {PRODUCT_PRESETS[metal].map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Weight of one piece" htmlFor="h-weight">
            <Input id="h-weight" inputMode="decimal" value={f.weight} onChange={(e) => set('weight', e.target.value)} />
          </Field>
          <Field label="Unit" htmlFor="h-unit">
            <Select id="h-unit" value={f.weightUnit} onChange={(e) => set('weightUnit', e.target.value)}>
              <option value="oz">troy oz</option>
              <option value="g">grams</option>
              <option value="kg">kilos</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="h-qty">
            <Input id="h-qty" inputMode="decimal" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </Field>
          <Field label="Price per piece" htmlFor="h-price">
            <Input id="h-price" inputMode="decimal" placeholder="$0.00" value={f.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} />
          </Field>
        </div>
        <Field
          label="Purchase date"
          htmlFor="h-date"
          hint={spotThen && price > 0 ? `${METAL_LABEL[metal]} spot that day was ${money(spotThen)}, so you paid ${money(premium ?? 0)} over spot per piece.` : undefined}
        >
          <Input id="h-date" type="date" max={todayISO()} value={f.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} />
        </Field>

        <button type="button" onClick={() => setMore((v) => !v)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-gold" aria-expanded={more}>
          Dealer, taxes, shipping and notes
          <ChevronDown size={14} className={more ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden="true" />
        </button>
        {more && (
          <div className="space-y-4">
            <Field label="Dealer" htmlFor="h-dealer">
              <Input id="h-dealer" value={f.dealer} onChange={(e) => set('dealer', e.target.value)} placeholder="Where you bought it" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sales tax" hint="For this whole line" htmlFor="h-tax">
                <Input id="h-tax" inputMode="decimal" placeholder="$0.00" value={f.taxes} onChange={(e) => set('taxes', e.target.value)} />
              </Field>
              <Field label="Shipping" hint="For this whole line" htmlFor="h-ship">
                <Input id="h-ship" inputMode="decimal" placeholder="$0.00" value={f.shipping} onChange={(e) => set('shipping', e.target.value)} />
              </Field>
            </div>
            <Field label="Note" htmlFor="h-note">
              <Textarea id="h-note" rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
          </div>
        )}

        {error && <p className="text-[13px] text-down" role="alert">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-2">
          {holding && onDelete ? (
            confirmDelete ? (
              <span className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="!text-down"
                  onClick={async () => {
                    try {
                      setSaving(true);
                      await onDelete();
                      onClose();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "That didn't delete. Try again.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Delete it
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" className="!text-down" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving' : holding ? 'Save' : 'Add to stack'}</Button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
