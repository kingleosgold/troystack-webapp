import { supabase } from '../lib/supabase';
import { buildNotes, parseNotes } from '../lib/holdingNotes';
import { isMetal } from '../lib/metals';
import { stableUuid } from '../lib/stableId';
import type { Holding, HoldingFormData, WeightUnit } from '../types/holding';
import { WEIGHT_TO_OZT } from '../types/holding';

/**
 * The Supabase `holdings` table, shared with the iPhone app. Reads and writes
 * follow the app's mapping (see src/services/supabaseHoldings.ts in the
 * mobile repo): `type` is the product name, `weight` is troy ounces per piece,
 * `purchase_price` is per piece, and dealer, taxes, shipping, spot and
 * premium live in the `notes` JSON. Deletes are soft, by `deleted_at`.
 */

export interface HoldingRow {
  id: string;
  user_id: string;
  metal: string;
  type: unknown;
  weight: number | string | null;
  weight_unit: string | null;
  quantity: number | string | null;
  purchase_price: number | string | null;
  purchase_date: string | null;
  notes: unknown;
  created_at: string | null;
  updated_at: string | null;
}

/** The product name, from a plain string or the JSON some old rows carry. */
export function cleanType(raw: unknown): string {
  if (raw == null) return 'Other';
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return String(obj.name || obj.type || obj.label || 'Other');
  }
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') return String(parsed.name || parsed.type || parsed.label || 'Other');
    } catch {
      // not JSON, fall through
    }
  }
  return trimmed.split('\n')[0] || 'Other';
}

function dateOnly(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : '';
}

function unitOf(value: unknown): WeightUnit {
  return value === 'g' || value === 'kg' ? value : 'oz';
}

export function fromRow(row: HoldingRow): Holding {
  const notes = parseNotes(row.notes);
  const quantity = Number(row.quantity);
  return {
    id: row.id,
    metal: isMetal(row.metal) ? row.metal : 'silver',
    type: cleanType(row.type),
    weight: Number(row.weight) || 0,
    weightUnit: unitOf(row.weight_unit),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    purchasePrice: Number(row.purchase_price) || 0,
    purchaseDate: dateOnly(row.purchase_date),
    dealer: notes.dealer,
    taxes: notes.taxes,
    shipping: notes.shipping,
    spotAtPurchase: notes.spotAtPurchase,
    premium: notes.premium,
    costBasisOverride: notes.costBasisOverride,
    timePurchased: notes.timePurchased,
    note: notes.note,
    notesMeta: notes.meta,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

/** Column values for an insert or update, keeping the row's existing notes keys. */
export function toColumns(form: HoldingFormData, previousMeta?: Record<string, unknown>) {
  return {
    metal: form.metal,
    type: form.type.trim() || 'Other',
    weight: form.weight * WEIGHT_TO_OZT[form.weightUnit],
    weight_unit: form.weightUnit,
    quantity: form.quantity,
    purchase_price: form.purchasePrice,
    purchase_date: form.purchaseDate || null,
    notes: buildNotes(previousMeta, {
      dealer: form.dealer,
      taxes: form.taxes,
      shipping: form.shipping,
      spotAtPurchase: form.spotAtPurchase,
      premium: form.premium,
      note: form.note,
    }),
  };
}

export async function fetchSupabaseHoldings(userId: string): Promise<Holding[]> {
  const { data, error } = await supabase
    .from('holdings')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data || []) as HoldingRow[]).map(fromRow);
}

/**
 * A write that didn't reach the account. `retryable` means the connection or
 * the server failed, not Supabase refusing the change, so the same write can
 * go again later. supabase-js reports a request that never got an answer as
 * status 0.
 */
export class HoldingWriteError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'HoldingWriteError';
    this.retryable = retryable;
  }
}

// A 401 means the sign-in lapsed, which signing in again fixes, so the write
// waits for that rather than being dropped.
function writeFailed(error: { message?: string; code?: string }, status: number, message: string): HoldingWriteError {
  console.error('holding write failed', status, error);
  return new HoldingWriteError(message, status === 0 || status === 401 || status === 408 || status === 429 || status >= 500);
}

/** A new row, its id made here so sending it twice can't add it twice. */
export function newHoldingRow(form: HoldingFormData, userId: string): HoldingRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    ...toColumns(form),
    created_at: now,
    updated_at: now,
  };
}

/**
 * Saves one new row. When an earlier try already landed and only its answer
 * was lost, the id is taken and the row is there, which counts as saved.
 */
export async function insertHoldingRow(row: HoldingRow): Promise<Holding> {
  const { error, status } = await supabase.from('holdings').insert(row);
  if (error && error.code !== '23505') throw writeFailed(error, status, "That didn't save. Try again.");
  return fromRow(row);
}

export async function addSupabaseHolding(form: HoldingFormData, userId: string): Promise<Holding> {
  return insertHoldingRow(newHoldingRow(form, userId));
}

/**
 * Several holdings in one write. PostgREST runs it as a single statement, so
 * an import saves every row or none of them. Each row's id comes from the
 * import's own id and the row's place in it, so sending the same import again
 * after a lost answer finds those rows already there and adds nothing twice.
 */
export async function addSupabaseHoldings(forms: HoldingFormData[], userId: string, batchId: string = crypto.randomUUID()): Promise<Holding[]> {
  if (forms.length === 0) return [];
  const now = new Date().toISOString();
  const rows: HoldingRow[] = await Promise.all(
    forms.map(async (form, i) => ({
      id: await stableUuid(`${userId}:import:${batchId}:${i}`),
      user_id: userId,
      ...toColumns(form),
      created_at: now,
      updated_at: now,
    })),
  );
  const { error, status } = await supabase.from('holdings').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw writeFailed(error, status, "That didn't save, so nothing was added. Try again.");
  return rows.map(fromRow);
}

/**
 * The columns an edit sets. `notes` is left out by an edit that shouldn't
 * touch them, as one the old site queued with no note of its own.
 */
export type HoldingUpdates = Omit<ReturnType<typeof toColumns>, 'notes'> & { notes?: string; updated_at: string };

/**
 * The columns an edit changes, the row's other notes keys kept. The app's
 * cost-basis override is a total for the line as it was, so it goes once the
 * price, count, tax or shipping changes.
 */
export function holdingUpdates(existing: Holding, form: HoldingFormData): HoldingUpdates {
  let meta = existing.notesMeta;
  const costChanged =
    form.purchasePrice !== existing.purchasePrice ||
    form.quantity !== existing.quantity ||
    (form.taxes ?? 0) !== (existing.taxes ?? 0) ||
    (form.shipping ?? 0) !== (existing.shipping ?? 0);
  if (meta && 'cost_basis' in meta && costChanged) {
    meta = { ...meta };
    delete meta.cost_basis;
  }
  return { ...toColumns(form, meta), updated_at: new Date().toISOString() };
}

/** The holding as it reads once an edit is saved, for showing before it is. */
export function holdingAfter(existing: Holding, updates: HoldingUpdates, userId: string): Holding {
  return fromRow({ id: existing.id, user_id: userId, created_at: existing.createdAt, notes: null, ...updates });
}

export async function applyHoldingUpdates(id: string, updates: HoldingUpdates, userId: string): Promise<Holding> {
  const { data, error, status } = await supabase
    .from('holdings')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw writeFailed(error, status, "That didn't save. Try again.");
  return fromRow(data as HoldingRow);
}

export async function updateSupabaseHolding(existing: Holding, form: HoldingFormData, userId: string): Promise<Holding> {
  return applyHoldingUpdates(existing.id, holdingUpdates(existing, form), userId);
}

export async function softDeleteHolding(id: string, deletedAt: string, userId: string): Promise<void> {
  const { error, status } = await supabase
    .from('holdings')
    .update({ deleted_at: deletedAt })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw writeFailed(error, status, "That didn't delete. Try again.");
}

export async function deleteSupabaseHolding(id: string, userId: string): Promise<void> {
  return softDeleteHolding(id, new Date().toISOString(), userId);
}

/** The account's id for a holding moved in from this browser's guest stack. */
function guestRowId(userId: string, guestId: string): Promise<string> {
  return stableUuid(`${userId}:guest:${guestId}`);
}

/**
 * A holding from this browser's guest stack as an account row. The account
 * keeps whole pieces, so a fractional count from an older build becomes one
 * piece holding the same ounces, cost and premium. Weight, price and premium
 * are per piece, so they scale with the count. Spot at purchase is per ounce,
 * and taxes, shipping and any cost basis the app set are totals for the
 * line, so they stay as they are.
 */
async function guestRow(h: Holding, userId: string, now: string): Promise<HoldingRow> {
  const whole = Number.isInteger(h.quantity) && h.quantity > 0;
  const scale = whole ? 1 : h.quantity;
  return {
    id: await guestRowId(userId, h.id),
    user_id: userId,
    metal: h.metal,
    type: h.type,
    weight: h.weight * scale,
    weight_unit: h.weightUnit,
    quantity: whole ? h.quantity : 1,
    purchase_price: h.purchasePrice * scale,
    purchase_date: h.purchaseDate || null,
    notes: buildNotes(h.notesMeta, {
      dealer: h.dealer,
      taxes: h.taxes,
      shipping: h.shipping,
      spotAtPurchase: h.spotAtPurchase,
      premium: h.premium == null ? undefined : h.premium * scale,
      note: h.note,
    }),
    created_at: h.createdAt || now,
    updated_at: now,
  };
}

/**
 * Copies holdings saved in this browser into an account and returns them as
 * the account holds them. Each row's id comes from the account and the
 * browser holding, so a second copy, from another tab or a retry after a
 * lost answer, finds the rows already there.
 */
export async function uploadLocalHoldings(local: Holding[], userId: string): Promise<Holding[]> {
  if (local.length === 0) return [];
  const now = new Date().toISOString();
  const rows = await Promise.all(local.map((h) => guestRow(h, userId, now)));
  const { error, status } = await supabase.from('holdings').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw writeFailed(error, status, "The holdings in this browser didn't move into your account. Try again.");
  return rows.map(fromRow);
}
