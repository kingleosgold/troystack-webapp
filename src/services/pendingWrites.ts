import type { Holding, HoldingFormData } from '../types/holding';
import { parseNotes } from '../lib/holdingNotes';
import { isMetal } from '../lib/metals';
import { GUEST_STACK_KEY } from './holdings';
import { fromRow, HoldingWriteError, toColumns, type HoldingRow, type HoldingUpdates } from './supabaseHoldings';

/**
 * Changes to a signed-in stack that couldn't reach the account because the
 * connection or the server was down. They wait in this browser, are shown as
 * if saved, and go out in order once the connection is back. The old site did
 * the same. Each account keeps its own list, so a change never lands in
 * someone else's stack on a shared computer.
 */

export type PendingWrite =
  | { wid: string; kind: 'add'; row: HoldingRow }
  | { wid: string; kind: 'update'; id: string; updates: HoldingUpdates; holding: Holding }
  | { wid: string; kind: 'delete'; id: string; deletedAt: string };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const EVENT = 'troystack:pending-writes';

function keyFor(userId: string) {
  return `troystack_pending_writes_${userId}`;
}

function refusedKeyFor(userId: string) {
  return `troystack_pending_refused_${userId}`;
}

function announce() {
  try {
    globalThis.dispatchEvent?.(new Event(EVENT));
  } catch {
    // no window, as in unit tests
  }
}

function defaultStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isPendingWrite(w: unknown): w is PendingWrite {
  if (!w || typeof w !== 'object') return false;
  const x = w as Record<string, unknown>;
  if (typeof x.wid !== 'string') return false;
  if (x.kind === 'add') return Boolean(x.row && typeof (x.row as HoldingRow).id === 'string');
  if (x.kind === 'update') return typeof x.id === 'string' && Boolean(x.updates) && Boolean(x.holding);
  if (x.kind === 'delete') return typeof x.id === 'string' && typeof x.deletedAt === 'string';
  return false;
}

export function readPending(userId: string, store: Store | null = defaultStore()): PendingWrite[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(keyFor(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isPendingWrite) : [];
  } catch {
    return [];
  }
}

/** Saves the list. False when this browser won't store it. */
export function savePending(userId: string, list: PendingWrite[], store: Store | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    if (list.length === 0) store.removeItem(keyFor(userId));
    else store.setItem(keyFor(userId), JSON.stringify(list));
  } catch {
    return false;
  }
  announce();
  return true;
}

/**
 * How many changes made offline the account refused, kept until someone
 * reads the notice, so it shows on the stack page whichever page sent them.
 */
export function readRefused(userId: string, store: Store | null = defaultStore()): number {
  if (!store) return 0;
  try {
    const n = Number(store.getItem(refusedKeyFor(userId)));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function addRefused(userId: string, count: number, store: Store | null = defaultStore()): void {
  if (!store || count <= 0) return;
  try {
    store.setItem(refusedKeyFor(userId), String(readRefused(userId, store) + count));
  } catch {
    return;
  }
  announce();
}

export function clearRefused(userId: string, store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(refusedKeyFor(userId));
  } catch {
    return;
  }
  announce();
}

/** The old site's list of changes it couldn't send. It had no account on it. */
const LEGACY_KEY = 'stacktracker_pending_actions';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The old site's ids for holdings kept in the browser, the time they were made first. */
const LEGACY_LOCAL_ID = /^(\d{13})-[a-z0-9]+$/;

interface LegacyAction {
  id?: unknown;
  type?: unknown;
  data?: unknown;
  holdingId?: unknown;
  timestamp?: unknown;
}

/**
 * The old site's form, read the way the new one reads a row. The old site hid
 * notes that held the app's JSON, so its form carries at most a note someone
 * typed, and none of the app's keys. An edit with no note leaves the row's
 * notes alone (see adoptLegacyPending).
 */
function legacyForm(data: unknown): { form: HoldingFormData; meta: Record<string, unknown> } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const weight = Number(d.weight);
  const quantity = Number(d.quantity);
  if (!isMetal(d.metal) || !(weight > 0) || !(quantity > 0)) return null;
  const notes = parseNotes(typeof d.notes === 'string' ? d.notes : null);
  return {
    form: {
      metal: d.metal,
      type: typeof d.type === 'string' ? d.type : '',
      weight,
      weightUnit: d.weightUnit === 'g' || d.weightUnit === 'kg' ? d.weightUnit : 'oz',
      quantity,
      purchasePrice: Number(d.purchasePrice) || 0,
      purchaseDate: typeof d.purchaseDate === 'string' ? d.purchaseDate.slice(0, 10) : '',
      dealer: notes.dealer,
      taxes: notes.taxes,
      shipping: notes.shipping,
      spotAtPurchase: notes.spotAtPurchase,
      premium: notes.premium,
      note: notes.note,
    },
    meta: notes.meta,
  };
}

function readJsonArray(store: Store, key: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(store.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

/**
 * The browser copy the old site made of a holding added offline. It made
 * the copy right after it queued the add, and the copy's id starts with the
 * time it was made, so the copy is the one made within two seconds after.
 */
function copyOf(copies: unknown[], at: number, taken: Set<string>): string | null {
  let best: { id: string; gap: number } | null = null;
  for (const c of copies) {
    const id = c && typeof c === 'object' ? (c as Record<string, unknown>).id : null;
    if (typeof id !== 'string' || taken.has(id)) continue;
    const m = LEGACY_LOCAL_ID.exec(id);
    if (!m) continue;
    const gap = Number(m[1]) - at;
    if (gap >= 0 && gap <= 2000 && (!best || gap < best.gap)) best = { id, gap };
  }
  return best?.id ?? null;
}

/**
 * The old site kept the changes it couldn't send in one list with no account
 * on it, and cleared that list at sign-out, so what's in it belongs to whoever
 * is signed in. They move into this account's list, ahead of anything newer,
 * and the old list goes. An add the old site made offline also left a copy in
 * the browser stack, and the copy goes too, so the stack page doesn't offer to
 * add it a second time. An edit or delete of that copy folds into its add. A
 * change that could never land, like an edit of a holding the old site only
 * had in the browser, is dropped. Running it twice moves nothing twice.
 * Returns how many changes moved.
 */
export function adoptLegacyPending(userId: string, store: Store | null = defaultStore()): number {
  if (!store) return 0;
  let present: boolean;
  try {
    present = store.getItem(LEGACY_KEY) !== null;
  } catch {
    return 0;
  }
  if (!present) return 0;
  const actions = readJsonArray(store, LEGACY_KEY) ?? [];
  const copies = readJsonArray(store, GUEST_STACK_KEY) ?? [];

  const out: Array<PendingWrite | null> = [];
  const addForCopy = new Map<string, number>();
  actions.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const a = raw as LegacyAction;
    const ts = Number(a.timestamp);
    const at = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
    const when = new Date(at).toISOString();
    const wid = `legacy:${typeof a.id === 'string' && a.id ? a.id : `${i}-${at}`}`;
    const target = typeof a.holdingId === 'string' ? a.holdingId : '';

    if (a.type === 'add') {
      const f = legacyForm(a.data);
      if (!f) return;
      const row: HoldingRow = { id: crypto.randomUUID(), user_id: userId, ...toColumns(f.form, f.meta), created_at: when, updated_at: when };
      out.push({ wid, kind: 'add', row });
      const copy = copyOf(copies, at, new Set(addForCopy.keys()));
      if (copy) addForCopy.set(copy, out.length - 1);
    } else if ((a.type === 'update' || a.type === 'delete') && UUID.test(target)) {
      if (a.type === 'delete') {
        out.push({ wid, kind: 'delete', id: target, deletedAt: when });
        return;
      }
      const f = legacyForm(a.data);
      if (!f) return;
      // An edit with no note of its own leaves the notes column out, so the
      // app's keys there (its id for the row, the dealer, cost basis and the
      // rest) stay as they are.
      const { notes, ...columns } = toColumns(f.form, f.meta);
      const updates: HoldingUpdates = f.form.note ? { ...columns, notes, updated_at: when } : { ...columns, updated_at: when };
      out.push({ wid, kind: 'update', id: target, updates, holding: fromRow({ id: target, user_id: userId, created_at: null, notes: null, ...updates }) });
    } else if ((a.type === 'update' || a.type === 'delete') && addForCopy.has(target)) {
      const at2 = addForCopy.get(target)!;
      const add = out[at2];
      if (!add || add.kind !== 'add') return;
      if (a.type === 'delete') {
        out[at2] = null;
        return;
      }
      const f = legacyForm(a.data);
      if (f) out[at2] = { ...add, row: { ...add.row, ...toColumns(f.form, f.meta), updated_at: when } };
    }
  });

  const current = readPending(userId, store);
  const have = new Set(current.map((w) => w.wid));
  const moved = out.filter((w): w is PendingWrite => w !== null && !have.has(w.wid));
  // If the account's list can't be saved, the old list stays for next time.
  if (moved.length > 0 && !savePending(userId, [...moved, ...current], store)) return 0;
  try {
    store.removeItem(LEGACY_KEY);
    if (addForCopy.size > 0) {
      const left = copies.filter((c) => !addForCopy.has(String((c as Record<string, unknown> | null)?.id)));
      if (left.length > 0) store.setItem(GUEST_STACK_KEY, JSON.stringify(left));
      else store.removeItem(GUEST_STACK_KEY);
    }
  } catch {
    // The adds carry their old ids, so a second try can't queue them twice.
  }
  announce();
  return moved.length;
}

/** Calls back when any account's list changes, in this tab or another. */
export function subscribePending(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith('troystack_pending_writes_') || e.key.startsWith('troystack_pending_refused_')) callback();
  };
  globalThis.addEventListener?.(EVENT, callback);
  globalThis.addEventListener?.('storage', onStorage);
  return () => {
    globalThis.removeEventListener?.(EVENT, callback);
    globalThis.removeEventListener?.('storage', onStorage);
  };
}

/** The stack as the account will hold it once everything waiting is saved. */
export function withPending(remote: Holding[], pending: PendingWrite[]): Holding[] {
  let list = remote;
  for (const w of pending) {
    if (w.kind === 'add') {
      if (!list.some((h) => h.id === w.row.id)) list = [fromRow(w.row), ...list];
    } else if (w.kind === 'update') {
      // The holding keeps the date it was added, which an edit doesn't change.
      // An edit that leaves the notes column alone keeps what's read from it.
      list = list.map((h) => {
        if (h.id !== w.id) return h;
        const next: Holding = { ...w.holding, createdAt: h.createdAt };
        if (w.updates.notes !== undefined) return next;
        return {
          ...next,
          dealer: h.dealer,
          taxes: h.taxes,
          shipping: h.shipping,
          spotAtPurchase: h.spotAtPurchase,
          premium: h.premium,
          costBasisOverride: h.costBasisOverride,
          timePurchased: h.timePurchased,
          note: h.note,
          notesMeta: h.notesMeta,
        };
      });
    } else {
      list = list.filter((h) => h.id !== w.id);
    }
  }
  return list;
}

/** Worth sending again later: the connection or the server failed. */
export function canRetry(e: unknown): boolean {
  if (e instanceof HoldingWriteError) return e.retryable;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export interface SendResult {
  sent: number;
  refused: number;
  waiting: number;
}

/**
 * Sends what's waiting, oldest first. It stops at the first change that still
 * can't get through, so the rest keep their order. A change the account
 * refuses outright can never go through, so it's dropped and counted.
 */
export async function sendPending(
  userId: string,
  send: (w: PendingWrite) => Promise<unknown>,
  store: Store | null = defaultStore(),
): Promise<SendResult> {
  let sent = 0;
  let refused = 0;
  // Changes the old site left go first, since they're older.
  adoptLegacyPending(userId, store);
  for (;;) {
    const [next] = readPending(userId, store);
    if (!next) break;
    try {
      await send(next);
      sent += 1;
    } catch (e) {
      if (canRetry(e)) break;
      console.error('a change made offline was refused', e);
      refused += 1;
    }
    if (!savePending(userId, readPending(userId, store).filter((w) => w.wid !== next.wid), store)) break;
  }
  addRefused(userId, refused, store);
  return { sent, refused, waiting: readPending(userId, store).length };
}
