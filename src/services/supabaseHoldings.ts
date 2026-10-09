import { supabase } from '../lib/supabase';
import { buildNotes, parseNotes } from '../lib/holdingNotes';
import { isMetal } from '../lib/metals';
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

function writeFailed(error: { message?: string; code?: string }, status: number, message: string): HoldingWriteError {
  console.error('holding write failed', status, error);
  return new HoldingWriteError(message, status === 0 || status === 408 || status === 429 || status >= 500);
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
 * Several holdings in one insert. PostgREST runs it as a single statement, so
 * an import saves every row or none of them, and trying again can't double up.
 */
export async function addSupabaseHoldings(forms: HoldingFormData[], userId: string): Promise<Holding[]> {
  if (forms.length === 0) return [];
  const now = new Date().toISOString();
  const rows = forms.map((form) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    ...toColumns(form),
    created_at: now,
    updated_at: now,
  }));
  const { error } = await supabase.from('holdings').insert(rows);
  if (error) {
    console.error('holdings import failed', error);
    throw new Error("That didn't save, so nothing was added. Try again.");
  }
  return rows.map((row) => fromRow(row as HoldingRow));
}

export type HoldingUpdates = ReturnType<typeof toColumns> & { updated_at: string };

/** The columns an edit changes, the row's other notes keys kept. */
export function holdingUpdates(existing: Holding, form: HoldingFormData): HoldingUpdates {
  return { ...toColumns(form, existing.notesMeta), updated_at: new Date().toISOString() };
}

/** The holding as it reads once an edit is saved, for showing before it is. */
export function holdingAfter(existing: Holding, updates: HoldingUpdates, userId: string): Holding {
  return fromRow({ id: existing.id, user_id: userId, created_at: existing.createdAt, ...updates });
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

/** Copy holdings saved in this browser into a new account. */
export async function uploadLocalHoldings(local: Holding[], userId: string): Promise<void> {
  if (local.length === 0) return;
  const now = new Date().toISOString();
  const rows = local.map((h) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    metal: h.metal,
    type: h.type,
    weight: h.weight,
    weight_unit: h.weightUnit,
    quantity: h.quantity,
    purchase_price: h.purchasePrice,
    purchase_date: h.purchaseDate || null,
    notes: buildNotes(h.notesMeta, {
      dealer: h.dealer,
      taxes: h.taxes,
      shipping: h.shipping,
      spotAtPurchase: h.spotAtPurchase,
      premium: h.premium,
      note: h.note,
    }),
    created_at: h.createdAt || now,
    updated_at: now,
  }));
  const { error } = await supabase.from('holdings').insert(rows);
  if (error) throw error;
}
