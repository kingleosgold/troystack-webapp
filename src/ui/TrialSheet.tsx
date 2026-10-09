import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button, Sheet } from './primitives';
import { InstallPath } from './AppStore';
import { GOLD, isAndroid, isAppleMobile, type Campaign } from '../lib/appStore';
import { rememberCheckout, startCheckout, WEB_PLANS, webCheckoutReady, type WebPlan } from '../lib/checkout';
import { cx } from '../lib/cx';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';

const GOLD_FEATURES = [
  '30 questions a day with Troy, and he keeps every conversation',
  'A morning brief written around your stack',
  'Your stack value history, day by day',
  'The full COMEX vault picture with the 30-day trend',
  'Unlimited receipt scans',
  'Troy reads his answers aloud',
];

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
  campaign: Campaign;
}

function WebCheckout({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [plan, setPlan] = useState<WebPlan>('yearly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = WEB_PLANS.find((p) => p.id === plan)!;
  const lifetime = plan === 'lifetime';

  const go = async () => {
    setError(null);
    if (!user) {
      rememberCheckout(plan, campaign);
      onClose();
      navigate(`/auth?redirect=checkout&plan=${plan}&next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      await startCheckout(user.id, session?.access_token, plan, campaign);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Checkout didn't open. Try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Plan" className="grid grid-cols-3 gap-2">
        {WEB_PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={plan === p.id}
            onClick={() => setPlan(p.id)}
            className={cx(
              'relative rounded-xl border px-3 py-2.5 text-left transition-colors',
              plan === p.id ? 'border-gold bg-gold-soft' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <span className="block text-[12px] text-fg-3">{p.label}</span>
            <span className="block text-[15px] font-semibold text-fg tnum">{p.price}</span>
            <span className="block text-[11px] text-fg-3">{p.note ?? p.per}</span>
          </button>
        ))}
      </div>
      <Button size="lg" className="w-full" onClick={() => void go()} disabled={busy}>
        {busy ? 'Opening checkout' : lifetime ? `Get Lifetime for ${chosen.price}` : 'Start my free week'}
      </Button>
      <p className="text-[12px] text-fg-3">
        {lifetime
          ? 'One payment, Gold for good. Checkout is handled by Stripe.'
          : `Free for ${GOLD.trialDays} days, then ${chosen.price} ${chosen.per}. Cancel before day ${GOLD.trialDays + 1} and you won't be charged. Checkout is handled by Stripe.`}
        {!user && ' You\'ll sign in or make a free account first.'}
      </p>
      {error && (
        <p className="text-[13px] text-down" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TrialSheet({ open, onClose, reason, campaign }: Props) {
  const { user } = useAuth();
  const { isGold } = useSubscription();
  const iphone = isAppleMobile();
  const android = isAndroid();
  const web = webCheckoutReady();
  const [showWebOnIphone, setShowWebOnIphone] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title={isGold ? 'You have Gold' : 'Try Gold free for a week'}>
      {isGold ? (
        <p className="text-[15px] text-fg-2">
          Gold is on for this account, so everything here is open to you. You can see or change your plan in Settings.
        </p>
      ) : (
        <div className="space-y-5">
          {reason && <p className="text-[15px] text-fg">{reason}</p>}
          <ul className="space-y-2.5">
            {GOLD_FEATURES.map((f) => (
              <li key={f} className="flex gap-2.5 text-[14px] text-fg-2">
                <Check size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {iphone || !web ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-line bg-surface-2 p-4">
                <p className="text-[14px] text-fg">
                  The first {GOLD.trialDays} days are free in the TroyStack app. Then it's {GOLD.monthly} a month or {GOLD.yearly} a year, and you can cancel anytime in your iPhone's settings.
                </p>
                <p className="mt-1.5 text-[12px] text-fg-3">Apple gives the free week to first-time subscribers.</p>
              </div>
              <InstallPath campaign={campaign} />
              {iphone && web && (
                showWebOnIphone ? (
                  <div className="pt-1">
                    <WebCheckout campaign={campaign} onClose={onClose} />
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowWebOnIphone(true)} className="text-[13px] font-semibold text-gold hover:text-gold-2">
                    Rather start it here with a card?
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <WebCheckout campaign={campaign} onClose={onClose} />
              {!android && (
                <div className="rounded-2xl border border-line bg-surface-2 p-4">
                  <p className="mb-3 text-[13px] text-fg-2">Have an iPhone? Start the same free week in the app instead, and your Gold follows your account.</p>
                  <InstallPath campaign={campaign} compact />
                </div>
              )}
            </div>
          )}

          {!user && (
            <p className="text-[13px] text-fg-3">
              Already have Gold?{' '}
              <Link to="/auth" onClick={onClose} className="font-semibold text-gold hover:text-gold-2">
                Sign in with the same account
              </Link>{' '}
              and it unlocks here.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
