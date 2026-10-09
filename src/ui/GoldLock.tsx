import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useTrial } from '../contexts/TrialContext';
import type { Campaign } from '../lib/appStore';

interface Props {
  children: ReactNode;
  /** What unlocks, in a few words */
  title: string;
  reason: string;
  campaign: Campaign;
  /** Shown blurred behind the lock; defaults to the children */
  teaser?: ReactNode;
  className?: string;
}

/** Gold content: open for Gold accounts, a blurred teaser with the free week for everyone else. */
export function GoldLock({ children, title, reason, campaign, teaser, className }: Props) {
  const { isGold, loading } = useSubscription();
  const { openTrial } = useTrial();
  if (isGold) return <>{children}</>;
  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="pointer-events-none select-none blur-[6px] opacity-60" aria-hidden="true">
        {teaser ?? children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-xs text-center rounded-2xl border border-line bg-surface/95 px-5 py-4 shadow-card">
          <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-gold-soft text-gold">
            <Lock size={16} aria-hidden="true" />
          </div>
          <p className="text-[14px] font-semibold text-fg">{title}</p>
          <p className="text-[13px] text-fg-2 mt-1">Part of Gold. Your first week is free.</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => openTrial({ reason, campaign })}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-btn px-4 text-[13px] font-semibold text-btn-fg hover:bg-btn-hover"
          >
            See Gold
          </button>
        </div>
      </div>
    </div>
  );
}
