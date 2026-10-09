/**
 * The iPhone app stores a holding's extra fields as JSON in the Supabase
 * row's `notes` column:
 *
 *   { local_id, source, time_purchased, taxes, shipping, spot_price,
 *     premium, cost_basis }
 *
 * `source` is the dealer. Zero or empty values are left out, the way the app
 * writes them. The site reads the same keys, adds `note` for a free-text
 * note, and on save keeps every key it found, so editing a holding on the web
 * never strips what the app recorded.
 */

export interface NotesFields {
  dealer?: string;
  taxes?: number;
  shipping?: number;
  spotAtPurchase?: number;
  premium?: number;
  costBasisOverride?: number;
  timePurchased?: string;
  localId?: number | string;
  note?: string;
  /** Every key found in the JSON, known or not */
  meta: Record<string, unknown>;
}

function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseNotes(raw: unknown): NotesFields {
  if (raw == null) return { meta: {} };

  let obj: Record<string, unknown> | null = null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { meta: {} };
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed;
      } catch {
        obj = null;
      }
    }
    if (!obj) return { note: trimmed, meta: {} };
  } else {
    return { meta: {} };
  }

  const localId = obj.local_id;
  return {
    dealer: nonEmptyString(obj.source),
    taxes: positiveNumber(obj.taxes),
    shipping: positiveNumber(obj.shipping),
    spotAtPurchase: positiveNumber(obj.spot_price),
    premium: positiveNumber(obj.premium),
    costBasisOverride: positiveNumber(obj.cost_basis),
    timePurchased: nonEmptyString(obj.time_purchased),
    localId: typeof localId === 'number' || typeof localId === 'string' ? localId : undefined,
    note: nonEmptyString(obj.note),
    meta: { ...obj },
  };
}

let lastLocalId = 0;

/**
 * An id in the app's own format (milliseconds since 1970), unique within this
 * page even when several holdings are saved in the same millisecond.
 */
export function newLocalId(now = Date.now()): number {
  lastLocalId = Math.max(now, lastLocalId + 1);
  return lastLocalId;
}

export interface NotesInput {
  dealer?: string;
  taxes?: number;
  shipping?: number;
  spotAtPurchase?: number;
  premium?: number;
  note?: string;
}

/**
 * The notes JSON to save. Starts from the keys already on the row, sets the
 * ones the form edits, and drops empty values. A row that has never had a
 * local id gets one, so the app can track it the same way it tracks its own.
 */
export function buildNotes(previous: Record<string, unknown> | undefined, input: NotesInput): string {
  const out: Record<string, unknown> = { ...(previous ?? {}) };
  const set = (key: string, value: unknown) => {
    const empty =
      value == null ||
      (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) ||
      (typeof value === 'string' && !value.trim());
    if (empty) delete out[key];
    else out[key] = typeof value === 'string' ? value.trim() : value;
  };
  set('source', input.dealer);
  set('taxes', input.taxes);
  set('shipping', input.shipping);
  set('spot_price', input.spotAtPurchase);
  set('premium', input.premium);
  set('note', input.note);
  if (out.local_id == null || out.local_id === '') out.local_id = newLocalId();
  return JSON.stringify(out);
}
