import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import type { Holding, HoldingFormData } from '../types/holding';
import {
  addLocalHolding,
  addLocalHoldings,
  clearLocalHoldings,
  deleteLocalHolding,
  getLocalHoldings,
  guestStackSnapshot,
  updateLocalHolding,
} from '../services/holdings';
import {
  addSupabaseHoldings,
  applyHoldingUpdates,
  fetchSupabaseHoldings,
  fromRow,
  holdingAfter,
  holdingUpdates,
  insertHoldingRow,
  newHoldingRow,
  softDeleteHolding,
  uploadLocalHoldings,
} from '../services/supabaseHoldings';
import {
  adoptLegacyPending,
  canRetry,
  clearRefused,
  readPending,
  readRefused,
  savePending,
  sendPending,
  subscribePending,
  withPending,
  type PendingWrite,
} from '../services/pendingWrites';
import { copyShownSince, markCopyShown, readStackCopy, saveStackCopy, subscribeStackCopy } from '../services/stackCopy';

const GUEST_KEY = ['holdings', 'guest'];

// One send at a time per account, however many components ask.
const sending = new Map<string, Promise<{ sent: number; refused: number; waiting: number }>>();

function sendWrite(userId: string) {
  return (w: PendingWrite) => {
    if (w.kind === 'add') return insertHoldingRow(w.row);
    if (w.kind === 'update') return applyHoldingUpdates(w.id, w.updates, userId);
    return softDeleteHolding(w.id, w.deletedAt, userId);
  };
}

function sendOnce(userId: string) {
  let run = sending.get(userId);
  if (!run) {
    run = sendPending(userId, sendWrite(userId)).finally(() => sending.delete(userId));
    sending.set(userId, run);
  }
  return run;
}

/**
 * The stack. Signed in, it's the account's rows in Supabase, the same rows
 * the iPhone app reads. Signed out, it's saved in this browser. The first
 * time someone signs in to an account with no holdings, what they added as a
 * guest moves into the account, the rule the app uses too.
 *
 * Signed in, a change that can't reach the account because the connection or
 * the server is down waits in this browser and shows as saved. It goes out
 * when the connection is back, and while anything waits, newer changes queue
 * behind it so they land in the order they were made.
 */
export function useHoldings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const key = useMemo(() => (userId ? ['holdings', userId] : GUEST_KEY), [userId]);
  const [localVersion, setLocalVersion] = useState(0);
  const mounted = useRef(true);

  const pendingCount = useSyncExternalStore(
    subscribePending,
    () => (userId ? readPending(userId).length : 0),
    () => 0,
  );
  // When the stack on screen is the copy from the last read, since when.
  const offlineSince = useSyncExternalStore(subscribeStackCopy, () => copyShownSince(userId), () => null);
  const refused = useSyncExternalStore(
    subscribePending,
    () => (userId ? readRefused(userId) : 0),
    () => 0,
  );

  // Once the browser's guest stack is gone, its cached copy goes too, so no
  // page keeps showing holdings that were cleared or moved into an account,
  // and the offer to move them goes with it.
  const emptyGuestStack = useCallback(() => {
    clearLocalHoldings();
    qc.setQueryData<Holding[]>(GUEST_KEY, []);
    setLocalVersion((v) => v + 1);
  }, [qc]);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Holding[]> => {
      if (!user) return getLocalHoldings();
      // Changes the old site couldn't send join this account's list first.
      // Their browser copies leave the guest stack with them, before it can
      // be moved into an empty account.
      adoptLegacyPending(user.id);
      let remote: Holding[];
      try {
        remote = await fetchSupabaseHoldings(user.id);
      } catch (e) {
        // A reload with the connection down shows the stack as it was last
        // read, with changes waiting to be sent on top, rather than losing
        // what the queue already showed as saved.
        const copy = readStackCopy(user.id);
        if (!copy) throw e;
        markCopyShown(user.id, copy.savedAt);
        return withPending(copy.holdings, readPending(user.id));
      }
      if (remote.length === 0) {
        const local = getLocalHoldings();
        if (local.length > 0) {
          // If the move fails, the account's stack still loads and the stack
          // page offers to move them again.
          try {
            await uploadLocalHoldings(local, user.id);
            emptyGuestStack();
            remote = await fetchSupabaseHoldings(user.id);
          } catch (e) {
            console.error('moving the browser stack failed', e);
          }
        }
      }
      saveStackCopy(user.id, remote);
      markCopyShown(user.id, null);
      return withPending(remote, readPending(user.id));
    },
    staleTime: 60_000,
  });

  const setData = useCallback(
    (fn: (prev: Holding[]) => Holding[]) => qc.setQueryData<Holding[]>(key, (prev) => fn(prev ?? [])),
    [qc, key],
  );

  // After a send the stack is read again. A refusal is kept for the notice.
  const settle = useCallback(
    (result: { sent: number; refused: number }) => {
      if (!mounted.current || !userId) return;
      if (result.sent > 0 || result.refused > 0) void qc.invalidateQueries({ queryKey: ['holdings', userId] });
    },
    [qc, userId],
  );

  const flush = useCallback(() => {
    if (!userId) return;
    sendOnce(userId).then(settle, (e) => console.error('sending saved changes failed', e));
  }, [userId, settle]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Send what's waiting now, when the connection comes back, and each minute
  // while anything is left.
  useEffect(() => {
    if (!userId) return;
    flush();
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      if (readPending(userId).length > 0) flush();
    }, 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [userId, flush]);

  // Puts a change in line. Returns false when this browser won't hold it.
  const wait = useCallback(
    (write: PendingWrite): boolean => {
      if (!userId) return false;
      return savePending(userId, [...readPending(userId), write]);
    },
    [userId],
  );

  // Sends a change now, or puts it in line when the account can't be reached
  // or something older is still waiting.
  const write = useCallback(
    async (send: () => Promise<unknown>, pending: PendingWrite): Promise<void> => {
      if (!userId) return;
      if (readPending(userId).length > 0) {
        if (!wait(pending)) throw new Error("That didn't save. Try again.");
        flush();
        return;
      }
      try {
        await send();
      } catch (e) {
        if (!canRetry(e) || !wait(pending)) throw e;
      }
    },
    [userId, wait, flush],
  );

  const add = useCallback(
    async (form: HoldingFormData): Promise<Holding> => {
      if (!user) {
        const h = addLocalHolding(form);
        setData((prev) => [h, ...prev]);
        return h;
      }
      const row = newHoldingRow(form, user.id);
      await write(() => insertHoldingRow(row), { wid: crypto.randomUUID(), kind: 'add', row });
      const h = fromRow(row);
      setData((prev) => [h, ...prev.filter((x) => x.id !== h.id)]);
      return h;
    },
    [user, setData, write],
  );

  // An import is one write, so a failure leaves nothing behind. Trying the
  // same import again (the same batchId) can't add anything twice. It isn't
  // held for later.
  const addMany = useCallback(
    async (forms: HoldingFormData[], batchId?: string): Promise<number> => {
      if (forms.length === 0) return 0;
      const added = user ? await addSupabaseHoldings(forms, user.id, batchId) : addLocalHoldings(forms);
      const ids = new Set(added.map((h) => h.id));
      setData((prev) => [...added, ...prev.filter((h) => !ids.has(h.id))]);
      return added.length;
    },
    [user, setData],
  );

  const update = useCallback(
    async (existing: Holding, form: HoldingFormData): Promise<Holding> => {
      if (!user) {
        const h = updateLocalHolding(existing, form);
        setData((prev) => prev.map((x) => (x.id === existing.id ? h : x)));
        return h;
      }
      const updates = holdingUpdates(existing, form);
      let h = holdingAfter(existing, updates, user.id);
      await write(
        async () => {
          h = await applyHoldingUpdates(existing.id, updates, user.id);
        },
        { wid: crypto.randomUUID(), kind: 'update', id: existing.id, updates, holding: h },
      );
      setData((prev) => prev.map((x) => (x.id === existing.id ? h : x)));
      return h;
    },
    [user, setData, write],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!user) {
        deleteLocalHolding(id);
      } else {
        const deletedAt = new Date().toISOString();
        await write(() => softDeleteHolding(id, deletedAt, user.id), { wid: crypto.randomUUID(), kind: 'delete', id, deletedAt });
      }
      setData((prev) => prev.filter((x) => x.id !== id));
    },
    [user, setData, write],
  );

  // A signed-in account that already had holdings leaves a guest stack in
  // the browser untouched; the stack page offers to add it or clear it. It's
  // read again when the stored stack changes, as when copies of the old
  // site's offline adds leave it.
  const guestStored = useSyncExternalStore(subscribePending, () => (userId ? guestStackSnapshot() : ''), () => '');
  const leftInBrowser = useMemo(() => {
    void localVersion;
    void guestStored;
    return user ? getLocalHoldings() : [];
  }, [user, localVersion, guestStored]);
  // While the account's stack is loading, the automatic move may be running,
  // so the offer to move them waits until it's done.
  const offerToMove = query.isFetching ? [] : leftInBrowser;

  const moveBrowserStackIn = useCallback(async () => {
    if (!user) return;
    const local = getLocalHoldings();
    await uploadLocalHoldings(local, user.id);
    emptyGuestStack();
    setLocalVersion((v) => v + 1);
    await qc.invalidateQueries({ queryKey: key });
  }, [user, qc, key, emptyGuestStack]);

  const clearBrowserStack = useCallback(() => {
    emptyGuestStack();
    setLocalVersion((v) => v + 1);
  }, [emptyGuestStack]);

  return {
    holdings: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    isGuest: !user,
    add,
    addMany,
    update,
    remove,
    refresh: query.refetch,
    leftInBrowser: offerToMove,
    moveBrowserStackIn,
    clearBrowserStack,
    /** Changes saved in this browser that haven't reached the account yet. */
    pendingCount,
    /** When the account couldn't be read, the time of the copy shown instead. */
    offlineSince,
    /** Changes made offline that the account refused when they were sent. */
    refused,
    dismissRefused: () => {
      if (userId) clearRefused(userId);
    },
  };
}
