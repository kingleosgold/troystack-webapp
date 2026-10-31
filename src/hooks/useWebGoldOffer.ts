import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from './useSubscription';
import { isAndroid, isAppleMobile } from '../lib/appStore';
import { webCheckoutReady } from '../lib/checkout';

export type WebGoldOffer = {
  /** Offer the web free week. */
  webGold: boolean;
  /** Show the App Store button. */
  showAppStore: boolean;
  /**
   * The free week may still be offered once the session and the plan are
   * known. A card holds its place while this is true, so a computer doesn't
   * show the App Store version first and then swap.
   */
  pending: boolean;
};

/**
 * Whether a card offers the web free week and whether it shows the App Store.
 * The App Store only opens on an iPhone or iPad, so anyone else without Gold
 * gets the web free week once the session and the plan are known, since a
 * session still restoring reads as a guest. Android gets no App Store button.
 */
export function useWebGoldOffer(): WebGoldOffer {
  const { loading: authLoading } = useAuth();
  const { isGold, loading: planLoading, unreadable } = useSubscription();
  const apple = isAppleMobile();
  // Only monthly and yearly carry the free week, so Lifetime alone doesn't count.
  const offerable = !apple && !isGold && (webCheckoutReady('monthly') || webCheckoutReady('yearly'));
  const known = !authLoading && !planLoading;
  const webGold = offerable && known;
  // A plan that can't be read isn't offered the free week, since it may be
  // Gold, and the card falls back to the App Store rather than wait on retries.
  const pending = offerable && !known && !unreadable;
  const showAppStore = apple || !isAndroid();
  return { webGold, showAppStore, pending };
}
