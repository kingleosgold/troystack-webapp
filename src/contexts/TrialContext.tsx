import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CheckoutCampaign, WebPlan } from '../lib/checkout';
import { TrialSheet } from '../ui/TrialSheet';

interface TrialRequest {
  /** One line on why Gold came up, shown above the features */
  reason?: string;
  campaign?: CheckoutCampaign;
  /** The plan to have picked when the sheet opens */
  plan?: WebPlan;
  /** The plan was already picked, so checkout starts without asking again */
  start?: boolean;
}

interface TrialContextValue {
  openTrial: (req?: TrialRequest) => void;
}

const TrialContext = createContext<TrialContextValue | null>(null);

/**
 * Anything on the site that's Gold opens this sheet. On a computer it starts
 * the free week right here through Stripe, with the iPhone app as the other
 * door. On an iPhone it sends people to the App Store. Either way the campaign
 * token says which part of the site they came from.
 */
export function TrialProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<TrialRequest | null>(null);
  // Each opening starts the sheet fresh, so a plan or choice from the last
  // time doesn't carry over.
  const [opened, setOpened] = useState(0);
  const openTrial = useCallback((r: TrialRequest = {}) => {
    setReq(r);
    setOpened((n) => n + 1);
  }, []);
  const close = useCallback(() => setReq(null), []);
  const value = useMemo(() => ({ openTrial }), [openTrial]);
  return (
    <TrialContext.Provider value={value}>
      {children}
      <TrialSheet key={opened} open={req !== null} onClose={close} reason={req?.reason} campaign={req?.campaign ?? 'webapp-trial'} plan={req?.plan} start={req?.start} />
    </TrialContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useTrial(): TrialContextValue {
  const ctx = useContext(TrialContext);
  if (!ctx) throw new Error('useTrial must be used inside TrialProvider');
  return ctx;
}
