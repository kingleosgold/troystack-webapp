import type { Holding } from '../types/holding';

/**
 * The account's stack as it was last read, kept in this browser so a reload
 * while the connection is down still shows it, with any changes waiting to
 * be sent on top. Each account has its own copy, and signing out clears them.
 */

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const PREFIX = 'troystack_stack_copy_';
const EVENT = 'troystack:stack-copy';

export interface StackCopy {
  /** When the account was last read, as an ISO time. */
  savedAt: string;
  holdings: Holding[];
}

function defaultStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveStackCopy(userId: string, holdings: Holding[], store: Store | null = defaultStore(), now = new Date()): void {
  if (!store) return;
  try {
    store.setItem(PREFIX + userId, JSON.stringify({ savedAt: now.toISOString(), holdings }));
  } catch {
    // Storage is full or blocked. The next read tries again.
  }
}

export function readStackCopy(userId: string, store: Store | null = defaultStore()): StackCopy | null {
  if (!store) return null;
  try {
    const parsed: unknown = JSON.parse(store.getItem(PREFIX + userId) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const { savedAt, holdings } = parsed as Record<string, unknown>;
    if (typeof savedAt !== 'string' || !Array.isArray(holdings)) return null;
    return { savedAt, holdings: holdings as Holding[] };
  } catch {
    return null;
  }
}

/** Every account's copy goes, as at sign-out on a shared computer. */
export function clearStackCopies(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // nothing kept to clear
  }
}

// Which account's stack is on screen from its copy, and since when, so every
// page showing the stack can say so.
const shown = new Map<string, string>();

export function markCopyShown(userId: string, savedAt: string | null): void {
  if ((shown.get(userId) ?? null) === savedAt) return;
  if (savedAt) shown.set(userId, savedAt);
  else shown.delete(userId);
  try {
    globalThis.dispatchEvent?.(new Event(EVENT));
  } catch {
    // no window, as in unit tests
  }
}

export function copyShownSince(userId: string | undefined): string | null {
  return userId ? shown.get(userId) ?? null : null;
}

export function subscribeStackCopy(callback: () => void): () => void {
  globalThis.addEventListener?.(EVENT, callback);
  return () => globalThis.removeEventListener?.(EVENT, callback);
}
