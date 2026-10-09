import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { startCheckout, takeCheckoutIntent, takeNextPath } from '../lib/checkout';

/**
 * Finishes what someone started before signing in. Google and Apple sign-in
 * come back to the home page, and email confirmation links do too, so this
 * runs app-wide: it opens checkout for a plan picked in the last half hour,
 * or goes to the page they were on, or leaves the sign-in page.
 */
export function useAfterSignIn(): { openingCheckout: boolean } {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const handledFor = useRef<string | null>(null);
  const onAuthPage = pathname === '/auth';

  useEffect(() => {
    if (loading || !user) {
      handledFor.current = null;
      return;
    }
    const key = `${user.id}:${onAuthPage}`;
    if (handledFor.current === key) return;
    handledFor.current = key;

    const intent = takeCheckoutIntent();
    if (intent) {
      // The browser is about to leave for Stripe; the overlay covers the wait.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpeningCheckout(true);
      startCheckout(user.id, session?.access_token, intent.plan, intent.campaign).catch(() => {
        setOpeningCheckout(false);
        navigate('/settings?checkout=failed', { replace: true });
      });
      return;
    }
    const next = takeNextPath();
    if (next) navigate(next, { replace: true });
    else if (onAuthPage) navigate('/', { replace: true });
  }, [loading, user, session?.access_token, onAuthPage, navigate]);

  return { openingCheckout };
}
