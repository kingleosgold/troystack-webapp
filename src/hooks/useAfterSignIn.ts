import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from './useSubscription';
import {
  CHECKOUT_WAIT,
  forgetCheckout,
  forgetNextPath,
  hasCheckoutIntent,
  isWebPlan,
  openCheckout,
  rememberCheckout,
  rememberNextPath,
  settingsAfterCheckout,
  siteCampaign,
  takeCheckoutIntent,
  takeNextPath,
} from '../lib/checkout';

/**
 * Finishes what someone started before signing in. Google and Apple sign-in
 * come back to the home page, and email confirmation links do too, so this
 * runs app-wide: it opens checkout for a plan picked in the last half hour,
 * or goes to the page they were on, or leaves the sign-in page.
 *
 * It stays out of the way in two places. A password reset link signs the
 * account in, and the new password comes first. A return from Stripe means the
 * checkout is done, so nothing waiting from before it may take the page over.
 *
 * Checkout waits for the account's plan, five seconds at most, so someone who
 * already has Gold, from the app or the web, lands on Settings instead of
 * being sent to buy it again. If the plan can't be read in time, checkout
 * opens and the API turns away an account that already has a plan. Whatever
 * the API says is in the way, Settings says so and what to do about it.
 */
export type CheckoutOverlay = null | 'One moment' | 'Opening checkout' | typeof CHECKOUT_WAIT;

export function useAfterSignIn(): { checkoutOverlay: CheckoutOverlay } {
  const { user, session, loading } = useAuth();
  const { tier, loading: planLoading } = useSubscription();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [checkoutOverlay, setCheckoutOverlay] = useState<CheckoutOverlay>(null);
  const handledFor = useRef<string | null>(null);
  // The account whose plan didn't load in time. Tied to the account, so a
  // second sign-in on the same page waits for its own plan.
  const [waitOverFor, setWaitOverFor] = useState<string | null>(null);
  // Stripe sends people back with a full page load, so the address the page
  // opened at says whether this visit is a return from checkout.
  const landedFromStripe = useRef(typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('session_id'));
  const onAuthPage = pathname === '/auth';
  const onResetPage = pathname === '/reset-password';

  // A sign-in link says what to do afterwards. It's kept as soon as the page
  // opens, before the sign-in page's own code has loaded, so neither a trip to
  // Google or Apple nor an account that's already signed in loses it.
  useEffect(() => {
    if (!onAuthPage) return;
    const params = new URLSearchParams(search);
    const plan = params.get('plan');
    if (params.get('redirect') === 'checkout' && isWebPlan(plan)) rememberCheckout(plan, siteCampaign(params.get('campaign')));
    rememberNextPath(params.get('next'));
  }, [onAuthPage, search]);

  // The plan usually lands in well under a second. This stops checkout
  // waiting on it forever when it can't be read.
  useEffect(() => {
    if (!user || !planLoading) return;
    const id = user.id;
    const timer = window.setTimeout(() => setWaitOverFor(id), 5000);
    return () => window.clearTimeout(timer);
  }, [user, planLoading]);

  useEffect(() => {
    if (loading) {
      handledFor.current = null;
      return;
    }
    if (!user) {
      handledFor.current = null;
      // A return from Stripe that finds nobody signed in has nothing to
      // settle, so a sign-in later on this page is handled as usual.
      landedFromStripe.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckoutOverlay(null);
      return;
    }
    if (onResetPage) return;
    const key = `${user.id}:${onAuthPage}`;
    if (handledFor.current === key) return;

    if (landedFromStripe.current) {
      handledFor.current = key;
      landedFromStripe.current = false;
      forgetCheckout();
      forgetNextPath();
      return;
    }

    if (planLoading && waitOverFor !== user.id && hasCheckoutIntent()) {
      // Covers the wait wherever the sign-in landed, so nobody browses off
      // and gets pulled to Stripe a few seconds later.
      setCheckoutOverlay('One moment');
      return;
    }
    handledFor.current = key;

    const intent = takeCheckoutIntent();
    if (intent) {
      if (!planLoading && (tier === 'gold' || tier === 'lifetime')) {
        // Nothing to buy. Back to where they were going, or Settings says so.
        setCheckoutOverlay(null);
        navigate(takeNextPath() ?? '/settings?checkout=have-gold', { replace: true });
        return;
      }
      // Stripe brings them back to Settings, so an older return path is done with.
      forgetNextPath();
      // The browser is about to leave for Stripe; the overlay covers the wait.
      setCheckoutOverlay('Opening checkout');
      openCheckout(user.id, session?.access_token, intent.plan, intent.campaign, () => setCheckoutOverlay(CHECKOUT_WAIT)).catch((err: unknown) => {
        setCheckoutOverlay(null);
        navigate(settingsAfterCheckout(err), { replace: true });
      });
      return;
    }
    setCheckoutOverlay(null);
    const next = takeNextPath();
    if (next) navigate(next, { replace: true });
    else if (onAuthPage) navigate('/', { replace: true });
  }, [loading, user, session?.access_token, onAuthPage, onResetPage, navigate, tier, planLoading, waitOverFor]);

  return { checkoutOverlay };
}
