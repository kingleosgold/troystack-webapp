import type { Holding } from '../types/holding';
import { fromRow, HoldingWriteError, type HoldingRow, type HoldingUpdates } from './supabaseHoldings';

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
      list = list.map((h) => (h.id === w.id ? w.holding : h));
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
