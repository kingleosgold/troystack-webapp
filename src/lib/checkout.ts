import { postJson } from './apiClient';
import type { Campaign } from './appStore';

/**
 * Gold bought on the web goes through Stripe on the TroyStack API. Monthly and
 * yearly start with the same free week the app gives. Lifetime is a one-time
 * payment with no trial.
 */

export type WebPlan = 'monthly' | 'yearly' | 'lifetime';

const PRICE_IDS: Record<WebPlan, string> = {
  monthly: (import.meta.env.VITE_STRIPE_GOLD_MONTHLY_PRICE_ID as string | undefined) || '',
  yearly: (import.meta.env.VITE_STRIPE_GOLD_YEARLY_PRICE_ID as string | undefined) || '',
  lifetime: (import.meta.env.VITE_STRIPE_GOLD_LIFETIME_PRICE_ID as string | undefined) || '',
};

export const WEB_PLANS: Array<{ id: WebPlan; label: string; price: string; per: string; note?: string }> = [
  { id: 'yearly', label: 'Yearly', price: '$39.99', per: 'a year', note: 'Save 33%' },
  { id: 'monthly', label: 'Monthly', price: '$4.99', per: 'a month' },
  { id: 'lifetime', label: 'Lifetime', price: '$149.99', per: 'once' },
];

export function isWebPlan(v: unknown): v is WebPlan {
  return v === 'monthly' || v === 'yearly' || v === 'lifetime';
}

export function webCheckoutReady(plan: WebPlan = 'yearly'): boolean {
  return Boolean(PRICE_IDS[plan]);
}

// Signing in with Google or Apple leaves the site and comes back to the home
// page, so the plan someone picked waits here, for half an hour at most.
const INTENT_KEY = 'stg_checkout_redirect';
const CAMPAIGN_KEY = 'stg_checkout_campaign';

/**
 * Where a checkout started, stored on the Stripe session. A surface of this
 * site, or a site-* token from troystack.com's own links.
 */
export type CheckoutCampaign = Campaign | `site-${string}`;

/** A site-* token from a link, shaped the way the API accepts it, or undefined. */
export function siteCampaign(value: string | null | undefined): CheckoutCampaign | undefined {
  return typeof value === 'string' && /^site-[a-z0-9-]{1,35}$/.test(value) ? (value as CheckoutCampaign) : undefined;
}
const INTENT_TTL_MS = 30 * 60 * 1000;

export function rememberCheckout(plan: WebPlan, campaign?: CheckoutCampaign, now = Date.now()): void {
  try {
    localStorage.setItem(INTENT_KEY, JSON.stringify({ plan, at: now }));
    if (campaign) localStorage.setItem(CAMPAIGN_KEY, campaign);
    else localStorage.removeItem(CAMPAIGN_KEY);
  } catch {
    // storage blocked; they can pick the plan again after signing in
  }
}

export function forgetCheckout(): void {
  try {
    localStorage.removeItem(INTENT_KEY);
    localStorage.removeItem(CAMPAIGN_KEY);
  } catch {
    // nothing to clear
  }
}

/** The plan picked before signing in, if it was picked in the last half hour. Reading it clears it. */
export function takeCheckoutIntent(now = Date.now()): { plan: WebPlan; campaign?: CheckoutCampaign } | null {
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    const campaign = localStorage.getItem(CAMPAIGN_KEY) || undefined;
    forgetCheckout();
    if (!raw) return null;
    // A bare plan name is from the old site, which never cleared it after a
    // Google or Apple sign-in. Those are stale, so only timed entries count.
    let plan: unknown = raw;
    let at = 0;
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as { plan?: unknown; at?: unknown };
      plan = parsed.plan;
      at = typeof parsed.at === 'number' ? parsed.at : 0;
    }
    if (!isWebPlan(plan) || now - at > INTENT_TTL_MS || at > now + 60_000) return null;
    return { plan, campaign: campaign as CheckoutCampaign | undefined };
  } catch {
    return null;
  }
}

// Where to land after signing in. Only paths on this site count.
const NEXT_KEY = 'stg_auth_next';

export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/auth')) return null;
  return next;
}

export function rememberNextPath(next: string | null | undefined): void {
  const safe = safeNextPath(next);
  try {
    if (safe) localStorage.setItem(NEXT_KEY, safe);
  } catch {
    // fine, they land on the home page
  }
}

export function takeNextPath(): string | null {
  try {
    const next = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    return safeNextPath(next);
  } catch {
    return null;
  }
}

/** Sends the browser to Stripe Checkout. Resolves only if something goes wrong before that. */
export async function startCheckout(userId: string, token: string | undefined, plan: WebPlan, campaign?: CheckoutCampaign): Promise<void> {
  const priceId = PRICE_IDS[plan];
  if (!priceId) throw new Error('Web checkout is not set up here yet.');
  const origin = window.location.origin;
  const { url } = await postJson<{ url: string }>('/v1/stripe/create-checkout-session', {
    user_id: userId,
    price_id: priceId,
    campaign,
    success_url: `${origin}/settings?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${window.location.pathname}`,
  }, { token });
  if (!url) throw new Error('Checkout did not start.');
  window.location.assign(url);
}

export function verifyCheckout(sessionId: string): Promise<{ success: boolean; tier?: string }> {
  return postJson('/v1/stripe/verify-session', { session_id: sessionId });
}

/** Stripe's billing page, where web subscribers change plans or cancel. */
export async function openBillingPortal(userId: string, token: string | undefined): Promise<void> {
  const { url } = await postJson<{ url: string }>(
    '/v1/stripe/customer-portal',
    { user_id: userId, return_url: `${window.location.origin}/settings` },
    { token },
  );
  window.location.assign(url);
}
