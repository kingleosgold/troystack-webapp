import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button, Sheet } from './primitives';
import { InstallPath } from './AppStore';
import { GOLD, isAndroid, isAppleMobile, type Campaign } from '../lib/appStore';
import { CHECKOUT_WAIT, checkoutBlock, openBillingPortal, openCheckout, rememberCheckout, webCheckoutReady, webPlans, type WebPlan } from '../lib/checkout';
import { cx } from '../lib/cx';
import { GOLD_FEATURES } from '../lib/gold';
import { stillSignedInAs } from '../lib/account';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';


interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
  campaign: Campaign;
  /** The plan to have picked when the sheet opens, if it can be bought here */
  plan?: WebPlan;
}

/** What checkout said is in the way that the sheet shows instead of the plans. */
type Blocked = 'payment_issue' | 'app_store_renewing';

/**
 * Whether what was started here is still wanted when its answer lands: the
 * sheet is still open, and the account that started it is still the one
 * signed in. Closed, or under another account, nothing more happens, and
 * the page isn't sent to Stripe.
 */
function useStillWanted(): (owner: string) => () => boolean {
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  return (owner) => () => open.current && stillSignedInAs(owner);
}

function WebCheckout({
  campaign,
  initialPlan,
  onClose,
  onBlocked,
  onPlanChange,
}: {
  campaign: Campaign;
  initialPlan?: WebPlan;
  onClose: () => void;
  onBlocked: (block: Blocked) => void;
  /** Hears the picked plan, so the sheet's title and copy can follow it */
  onPlanChange?: (plan: WebPlan) => void;
}) {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Only plans with a Stripe price set here are offered. The plan picked on
  // the way in comes first, then yearly when it's one of them.
  const plans = webPlans();
  const [plan, setPlan] = useState<WebPlan>(() =>
    initialPlan && plans.some((p) => p.id === initialPlan) ? initialPlan : plans.some((p) => p.id === 'yearly') ? 'yearly' : plans[0].id,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Another checkout for this account is opening, and this one asks again shortly.
  const [waiting, setWaiting] = useState(false);
  const stillWantedFor = useStillWanted();
  const chosen = plans.find((p) => p.id === plan) ?? plans[0];
  const lifetime = plan === 'lifetime';
  useEffect(() => {
    onPlanChange?.(plan);
  }, [plan, onPlanChange]);

  const go = async () => {
    setError(null);
    if (!user) {
      rememberCheckout(plan, campaign);
      onClose();
      navigate(`/auth?redirect=checkout&plan=${plan}&next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setBusy(true);
    const wanted = stillWantedFor(user.id);
    const settle = () => {
      setBusy(false);
      setWaiting(false);
    };
    try {
      const left = await openCheckout(user.id, session?.access_token, plan, campaign, {
        onWait: () => {
          if (wanted()) setWaiting(true);
        },
        stillWanted: wanted,
      });
      if (!left) settle();
    } catch (e) {
      settle();
      if (!wanted()) return;
      const block = checkoutBlock(e);
      if (block === 'has_plan') {
        // Settings says so and puts the plan right, as it does after sign-in.
        onClose();
        navigate('/settings?checkout=have-gold');
      } else if (block === 'payment_issue' || block === 'app_store_renewing') {
        onBlocked(block);
      } else if (block === 'checkout_in_progress') {
        setError('Another checkout for this account is still opening, maybe in another tab. Try again in a moment.');
      } else {
        setError(e instanceof Error && e.message ? e.message : "Checkout didn't open. Try again in a moment.");
      }
    }
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Plan" className={cx('grid gap-2', plans.length >= 3 ? 'grid-cols-3' : plans.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
        {plans.map((p) => (
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
          : `Your first ${GOLD.trialDays} days are free if you haven't had Gold before, then ${chosen.price} ${chosen.per}. Cancel before day ${GOLD.trialDays + 1} and you won't be charged. Checkout is handled by Stripe.`}
        {!user && ' You\'ll sign in or make a free account first.'}
      </p>
      {waiting && (
        <p className="text-[13px] text-fg-2" role="status">
          {CHECKOUT_WAIT}
        </p>
      )}
      {error && (
        <p className="text-[13px] text-down" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** A Gold renewal that didn't go through. The card is updated on Stripe's billing page. */
function PaymentIssue() {
  const { user, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stillWantedFor = useStillWanted();
  const update = async () => {
    if (!user) return;
    setError(null);
    setBusy(true);
    const wanted = stillWantedFor(user.id);
    try {
      if (!(await openBillingPortal(user.id, session?.access_token, wanted))) setBusy(false);
    } catch {
      setBusy(false);
      if (wanted()) setError("The billing page didn't open. Try again in a moment.");
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-fg-2">Update your card on the billing page to keep Gold.</p>
      <Button size="lg" className="w-full" onClick={() => void update()} disabled={busy}>
        {busy ? 'Opening the billing page' : 'Update your card'}
      </Button>
      {error && (
        <p className="text-[13px] text-down" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TrialSheet({ open, onClose, reason, campaign, plan }: Props) {
  const { user } = useAuth();
  const { isGold, loading: planLoading } = useSubscription();
  // A signed-in account whose plan hasn't loaded may already have Gold, so
  // nothing is sold until it's known.
  const checking = Boolean(user) && planLoading;
  const iphone = isAppleMobile();
  const android = isAndroid();
  const web = webCheckoutReady();
  const [showWebOnIphone, setShowWebOnIphone] = useState(false);
  // The plan picked in checkout, or the one asked for on the way in.
  const [picked, setPicked] = useState<WebPlan | undefined>(plan);
  // A plan picked on the way in, like a button on the Gold page, opens card
  // checkout on that plan on an iPhone too, with the app as the other door.
  const cardFirst = web && (!iphone || Boolean(plan));
  // What checkout said is in the way, for the account it said it about. It
  // stays until the sheet closes.
  const [blocked, setBlocked] = useState<{ userId: string; block: Blocked } | null>(null);
  const block = blocked && blocked.userId === user?.id ? blocked.block : null;
  const close = () => {
    setBlocked(null);
    onClose();
  };
  const onBlocked = (b: Blocked) => {
    if (user) setBlocked({ userId: user.id, block: b });
  };
  const title = isGold
    ? 'You have Gold'
    : checking
      ? 'Checking your plan'
      : block === 'payment_issue'
        ? "Your last Gold payment didn't go through"
        : block === 'app_store_renewing'
          ? 'Your App Store plan may still be renewing'
          : picked === 'lifetime'
            ? 'Get Gold for life'
            : 'Try Gold free for a week';

  return (
    <Sheet open={open} onClose={close} title={title}>
      {isGold ? (
        <p className="text-[15px] text-fg-2">
          Gold is on for this account, so everything here is open to you. You can see or change your plan in Settings.
        </p>
      ) : checking ? (
        <p className="text-[15px] text-fg-2" role="status">
          We're still loading this account's plan, so nothing can be bought yet. It keeps trying, and this updates once it's in.
        </p>
      ) : block === 'payment_issue' ? (
        <PaymentIssue />
      ) : block === 'app_store_renewing' ? (
        // Bought through Apple, so there's nothing to buy or bill here.
        <p className="text-[15px] text-fg-2">
          Apple may still renew it, so there's nothing to buy here. To check, open Settings on your iPhone, tap your name, then Subscriptions.
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

          {!cardFirst ? (
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
                    <WebCheckout campaign={campaign} initialPlan={plan} onClose={close} onBlocked={onBlocked} onPlanChange={setPicked} />
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
              <WebCheckout campaign={campaign} initialPlan={plan} onClose={close} onBlocked={onBlocked} onPlanChange={setPicked} />
              {!android && (
                <div className="rounded-2xl border border-line bg-surface-2 p-4">
                  <p className="mb-3 text-[13px] text-fg-2">
                    {picked === 'lifetime'
                      ? `${iphone ? 'Rather use the app?' : 'Have an iPhone?'} Lifetime is in the app too, and your Gold follows your account.`
                      : `${iphone ? 'Rather use the app?' : 'Have an iPhone?'} Start the same free week in the app instead, and your Gold follows your account.`}
                  </p>
                  <InstallPath campaign={campaign} compact />
                </div>
              )}
            </div>
          )}

          {!user && (
            <p className="text-[13px] text-fg-3">
              Already have Gold?{' '}
              <Link to="/auth" onClick={close} className="font-semibold text-gold hover:text-gold-2">
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
