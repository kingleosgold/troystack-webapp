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
  refetch: () => Promise<void>;
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const SubscriptionContext = createContext<SubscriptionState | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [isTrial, setIsTrial] = useState(false);
  const [trialEnd, setTrialEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef<number>(0);

  const fetchTier = useCallback(async () => {
    if (!user) {
      setTier('free');
      setIsTrial(false);
      setTrialEnd(null);
      setLoading(false);
      return;
    }

    // Throttle: skip if fetched less than 10s ago (protects against rapid refetch calls)
    const now = Date.now();
    if (now - lastFetchRef.current < 10_000) return;
    lastFetchRef.current = now;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_status, trial_end')
        .eq('id', user.id)
        .single();

      if (error || !data) {
        setTier('free');
        setIsTrial(false);
        setTrialEnd(null);
      } else {
        const raw = data.subscription_tier as string;
        if (raw === 'lifetime') setTier('lifetime');
        else if (raw === 'gold') setTier('gold');
        else setTier('free');

        const status = (data as Record<string, unknown>).subscription_status as string | undefined;
        const end = (data as Record<string, unknown>).trial_end as string | undefined;
        setIsTrial(status === 'trialing');
        setTrialEnd(end || null);
      }
    } catch {
      setTier('free');
      setIsTrial(false);
      setTrialEnd(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch once on mount / user change
  useEffect(() => {
    lastFetchRef.current = 0; // reset throttle on user change
    fetchTier();
  }, [fetchTier]);

  // Background refresh every 5 minutes
  useEffect(() => {
    if (!user) return;
    const id = setInterval(fetchTier, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [user, fetchTier]);

  const isGold = tier === 'gold' || tier === 'lifetime';

  return (
    <SubscriptionContext.Provider value={{ tier, loading, isGold, isTrial, trialEnd, refetch: fetchTier }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useSubscription(): SubscriptionState {
  const ctx = useContext(SubscriptionContext);
  if (ctx === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return ctx;
}
