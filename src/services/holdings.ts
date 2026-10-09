import type { Holding, HoldingFormData } from '../types/holding';
import { WEIGHT_TO_OZT } from '../types/holding';
import { isMetal } from '../lib/metals';

/**
 * A guest's stack, kept in this browser until they sign in. Signing in to an
 * account with no holdings moves these into it, the same rule the app uses
 * for a guest's stack.
 */

const STORAGE_KEY = 'stacktracker_holdings';

function readRaw(): unknown[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function positive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Older builds saved a free-text `notes`; it becomes `note`. A holding saved
 * without an id gets one from its place in the list, so it reads the same
 * every time.
 */
function normalize(raw: unknown, index: number): Holding | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  if (!isMetal(h.metal)) return null;
  const now = new Date().toISOString();
  return {
    id: String(h.id || `guest-${index}`),
    metal: h.metal,
    type: String(h.type || 'Other'),
    weight: Number(h.weight) || 0,
    weightUnit: h.weightUnit === 'g' || h.weightUnit === 'kg' ? h.weightUnit : 'oz',
    quantity: positive(h.quantity) ?? 1,
    purchasePrice: Number(h.purchasePrice) || 0,
    purchaseDate: typeof h.purchaseDate === 'string' ? h.purchaseDate.slice(0, 10) : '',
    dealer: typeof h.dealer === 'string' ? h.dealer : undefined,
    taxes: positive(h.taxes),
    shipping: positive(h.shipping),
    spotAtPurchase: positive(h.spotAtPurchase),
    premium: positive(h.premium),
    note: typeof h.note === 'string' ? h.note : typeof h.notes === 'string' ? h.notes : undefined,
    createdAt: typeof h.createdAt === 'string' ? h.createdAt : now,
    updatedAt: typeof h.updatedAt === 'string' ? h.updatedAt : now,
  };
}

export function getLocalHoldings(): Holding[] {
  return readRaw()
    .map((raw, i) => normalize(raw, i))
    .filter((h): h is Holding => h !== null);
}

function save(holdings: Holding[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch {
    throw new Error("This browser wouldn't save your stack. Check that site storage is allowed.");
  }
}

function fromForm(form: HoldingFormData, base?: Holding): Holding {
  const now = new Date().toISOString();
  return {
    id: base?.id ?? crypto.randomUUID(),
    metal: form.metal,
    type: form.type.trim() || 'Other',
    weight: form.weight * WEIGHT_TO_OZT[form.weightUnit],
    weightUnit: form.weightUnit,
    quantity: form.quantity,
    purchasePrice: form.purchasePrice,
    purchaseDate: form.purchaseDate,
    dealer: form.dealer?.trim() || undefined,
    taxes: positive(form.taxes),
    shipping: positive(form.shipping),
    spotAtPurchase: positive(form.spotAtPurchase),
    premium: positive(form.premium),
    note: form.note?.trim() || undefined,
    notesMeta: base?.notesMeta,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

export function addLocalHolding(form: HoldingFormData): Holding {
  const holding = fromForm(form);
  save([holding, ...getLocalHoldings()]);
  return holding;
}

/** Several holdings in one save, so an import lands whole or not at all. */
export function addLocalHoldings(forms: HoldingFormData[]): Holding[] {
  const added = forms.map((form) => fromForm(form));
  save([...added, ...getLocalHoldings()]);
  return added;
}

export function updateLocalHolding(existing: Holding, form: HoldingFormData): Holding {
  const updated = fromForm(form, existing);
  save(getLocalHoldings().map((h) => (h.id === existing.id ? updated : h)));
  return updated;
}

export function deleteLocalHolding(id: string): void {
  save(getLocalHoldings().filter((h) => h.id !== id));
}

export function clearLocalHoldings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

/** CSV of a stack, with the same columns the import reads back. */
export function holdingsToCSV(holdings: Holding[]): string {
  const header = ['Product', 'Metal', 'Oz per piece', 'Quantity', 'Price per piece', 'Purchase date', 'Dealer', 'Taxes', 'Shipping', 'Note'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = holdings.map((h) => [
    h.type,
    h.metal,
    h.weight,
    h.quantity,
    h.purchasePrice,
    h.purchaseDate,
    h.dealer ?? '',
    h.taxes ?? '',
    h.shipping ?? '',
    h.note ?? '',
  ].map(esc).join(','));
  return [header.join(','), ...rows].join('\n');
}
