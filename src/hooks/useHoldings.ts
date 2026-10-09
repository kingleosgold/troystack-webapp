import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import type { Holding, HoldingFormData } from '../types/holding';
import {
  addLocalHolding,
  addLocalHoldings,
  clearLocalHoldings,
  deleteLocalHolding,
  getLocalHoldings,
  updateLocalHolding,
} from '../services/holdings';
import {
  addSupabaseHolding,
  addSupabaseHoldings,
  deleteSupabaseHolding,
  fetchSupabaseHoldings,
  updateSupabaseHolding,
  uploadLocalHoldings,
} from '../services/supabaseHoldings';

const GUEST_KEY = ['holdings', 'guest'];

/**
 * The stack. Signed in, it's the account's rows in Supabase, the same rows
 * the iPhone app reads. Signed out, it's saved in this browser. The first
 * time someone signs in to an account with no holdings, what they added as a
 * guest moves into the account, the rule the app uses too.
 */
export function useHoldings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const key = useMemo(() => (userId ? ['holdings', userId] : GUEST_KEY), [userId]);
  const [localVersion, setLocalVersion] = useState(0);

  // Once the browser's guest stack is gone, its cached copy goes too, so no
  // page keeps showing holdings that were cleared or moved into an account.
  const emptyGuestStack = useCallback(() => {
    clearLocalHoldings();
    qc.setQueryData<Holding[]>(GUEST_KEY, []);
  }, [qc]);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Holding[]> => {
      if (!user) return getLocalHoldings();
      const remote = await fetchSupabaseHoldings(user.id);
      if (remote.length === 0) {
        const local = getLocalHoldings();
        if (local.length > 0) {
          await uploadLocalHoldings(local, user.id);
          emptyGuestStack();
          return fetchSupabaseHoldings(user.id);
        }
      }
      return remote;
    },
    staleTime: 60_000,
  });

  const setData = useCallback(
    (fn: (prev: Holding[]) => Holding[]) => qc.setQueryData<Holding[]>(key, (prev) => fn(prev ?? [])),
    [qc, key],
  );

  const add = useCallback(
    async (form: HoldingFormData): Promise<Holding> => {
      const h = user ? await addSupabaseHolding(form, user.id) : addLocalHolding(form);
      setData((prev) => [h, ...prev]);
      return h;
    },
    [user, setData],
  );

  // An import is one write, so a failure leaves nothing behind and trying
  // the same file again can't add anything twice.
  const addMany = useCallback(
    async (forms: HoldingFormData[]): Promise<number> => {
      if (forms.length === 0) return 0;
      const added = user ? await addSupabaseHoldings(forms, user.id) : addLocalHoldings(forms);
      setData((prev) => [...added, ...prev]);
      return added.length;
    },
    [user, setData],
  );

  const update = useCallback(
    async (existing: Holding, form: HoldingFormData): Promise<Holding> => {
      const h = user ? await updateSupabaseHolding(existing, form, user.id) : updateLocalHolding(existing, form);
      setData((prev) => prev.map((x) => (x.id === existing.id ? h : x)));
      return h;
    },
    [user, setData],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (user) await deleteSupabaseHolding(id, user.id);
      else deleteLocalHolding(id);
      setData((prev) => prev.filter((x) => x.id !== id));
    },
    [user, setData],
  );

  // A signed-in account that already had holdings leaves a guest stack in
  // the browser untouched; the stack page offers to add it or clear it.
  const leftInBrowser = useMemo(() => {
    void localVersion;
    return user ? getLocalHoldings() : [];
  }, [user, localVersion]);

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
    leftInBrowser,
    moveBrowserStackIn,
    clearBrowserStack,
  };
}
