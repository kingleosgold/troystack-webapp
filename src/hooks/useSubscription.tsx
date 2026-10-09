import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export type SubscriptionTier = 'free' | 'gold' | 'lifetime';

interface SubscriptionState {
  tier: SubscriptionTier;
  loading: boolean;
  isGold: boolean;
  isTrial: boolean;
  trialEnd: string | null;
  /** Reads the plan again. `force` skips the ten-second guard, for right after checkout or a refresh someone asked for. */
  refetch: (options?: { force?: boolean }) => Promise<void>;
}

/** The plan read from one account's profile. */
interface Plan {
  userId: string;
  tier: SubscriptionTier;
  isTrial: boolean;
  trialEnd: string | null;
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const SubscriptionContext = createContext<SubscriptionState | undefined>(undefined);

async function readPlan(userId: string): Promise<Plan> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_status, trial_end')
      .eq('id', userId)
      .single();
    if (error || !data) return { userId, tier: 'free', isTrial: false, trialEnd: null };
    const row = data as Record<string, unknown>;
    const raw = row.subscription_tier;
    return {
      userId,
      tier: raw === 'lifetime' ? 'lifetime' : raw === 'gold' ? 'gold' : 'free',
      isTrial: row.subscription_status === 'trialing',
      trialEnd: typeof row.trial_end === 'string' && row.trial_end ? row.trial_end : null,
    };
  } catch {
    return { userId, tier: 'free', isTrial: false, trialEnd: null };
  }
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [plan, setPlan] = useState<Plan | null>(null);
  const lastFetchRef = useRef<number>(0);
  // Each read gets a number and only the newest may set the plan, so a slow
  // read that started before checkout can't put Free back afterwards.
  const readRef = useRef(0);

  const fetchTier = useCallback(
    (options?: { force?: boolean }): Promise<void> => {
      if (!userId) return Promise.resolve();
      // Skip a read within ten seconds of the last one unless it's forced.
      const now = Date.now();
      if (!options?.force && now - lastFetchRef.current < 10_000) return Promise.resolve();
      lastFetchRef.current = now;
      const read = ++readRef.current;
      return readPlan(userId).then((next) => {
        if (read === readRef.current) setPlan(next);
      });
    },
    [userId],
  );

  // Read once for each account that signs in
  useEffect(() => {
    lastFetchRef.current = 0;
    void fetchTier();
  }, [fetchTier]);

  // Background refresh every 5 minutes
  useEffect(() => {
    if (!userId) return;
    const id = setInterval(() => void fetchTier(), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [userId, fetchTier]);

  // A plan read for someone else, or no one signed in, counts as Free.
  const current = userId && plan?.userId === userId ? plan : null;
  const tier = current?.tier ?? 'free';
  const value: SubscriptionState = {
    tier,
    loading: Boolean(userId) && !current,
    isGold: tier === 'gold' || tier === 'lifetime',
    isTrial: current?.isTrial ?? false,
    trialEnd: current?.trialEnd ?? null,
    refetch: fetchTier,
  };

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useSubscription(): SubscriptionState {
  const ctx = useContext(SubscriptionContext);
  if (ctx === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return ctx;
}
