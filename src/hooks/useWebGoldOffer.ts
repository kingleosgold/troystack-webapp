import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from './useSubscription';
import { isAndroid, isAppleMobile } from '../lib/appStore';
import { webCheckoutReady } from '../lib/checkout';

/**
 * Whether a Signal card offers the web free week and whether it shows the App
 * Store. The App Store only opens on an iPhone or iPad, so anyone else without
 * Gold gets the web free week once the session and the plan are known, since a
 * session still restoring reads as a guest. Android gets no App Store button.
 */
export function useWebGoldOffer(): { webGold: boolean; showAppStore: boolean } {
  const { loading: authLoading } = useAuth();
  const { isGold, loading: planLoading } = useSubscription();
  const apple = isAppleMobile();
  // Only monthly and yearly carry the free week, so Lifetime alone doesn't count.
  const webGold = !apple && !authLoading && !planLoading && !isGold && (webCheckoutReady('monthly') || webCheckoutReady('yearly'));
  const showAppStore = apple || !isAndroid();
  return { webGold, showAppStore };
}
