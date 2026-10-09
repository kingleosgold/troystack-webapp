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

/** The plans this site can sell, the ones with a Stripe price set for it. */
export function webPlans(): typeof WEB_PLANS {
  return WEB_PLANS.filter((p) => Boolean(PRICE_IDS[p.id]));
}

/** Whether this plan can be bought here, or with no plan named, whether any can. */
export function webCheckoutReady(plan?: WebPlan): boolean {
  return plan ? Boolean(PRICE_IDS[plan]) : webPlans().length > 0;
}

// Signing in with Google or Apple leaves the site and comes back to the home
// page, so the plan someone picked waits here, for half an hour at most, with
// the surface it was picked on.
const INTENT_KEY = 'stg_checkout_redirect';
// Where an earlier build of this site kept the campaign. Cleared with the plan.
const OLD_CAMPAIGN_KEY = 'stg_checkout_campaign';
const INTENT_TTL_MS = 30 * 60 * 1000;

/**
 * Where a checkout started, stored on the Stripe session. A surface of this
 * site, or a site-* token from troystack.com's own links.
 */
export type CheckoutCampaign = Campaign | `site-${string}`;

/** A site-* token from a link, shaped the way the API accepts it, or undefined. */
export function siteCampaign(value: string | null | undefined): CheckoutCampaign | undefined {
  return typeof value === 'string' && /^site-[a-z0-9-]{1,35}$/.test(value) ? (value as CheckoutCampaign) : undefined;
}

interface StoredIntent {
  plan: WebPlan;
  at: number;
  campaign?: CheckoutCampaign;
}

function readIntent(now: number): StoredIntent | null {
  const raw = localStorage.getItem(INTENT_KEY);
  // A bare plan name is from the old site, which never cleared it after a
  // Google or Apple sign-in. Those are stale, so only timed entries count.
  if (!raw || !raw.startsWith('{')) return null;
  const parsed = JSON.parse(raw) as { plan?: unknown; at?: unknown; campaign?: unknown };
  const at = typeof parsed.at === 'number' ? parsed.at : 0;
  if (!isWebPlan(parsed.plan) || now - at > INTENT_TTL_MS || at > now + 60_000) return null;
  const campaign = typeof parsed.campaign === 'string' && parsed.campaign ? (parsed.campaign as CheckoutCampaign) : undefined;
  return { plan: parsed.plan, at, campaign };
}

/**
 * Keeps the plan picked before signing in. The sign-in link may not repeat
 * the campaign, so a campaign already kept for the same plan stays with it.
 */
export function rememberCheckout(plan: WebPlan, campaign?: CheckoutCampaign, now = Date.now()): void {
  try {
    let kept = campaign;
    if (!kept) {
      const existing = readIntent(now);
      if (existing?.plan === plan) kept = existing.campaign;
    }
    const intent: StoredIntent = kept ? { plan, at: now, campaign: kept } : { plan, at: now };
    localStorage.setItem(INTENT_KEY, JSON.stringify(intent));
    localStorage.removeItem(OLD_CAMPAIGN_KEY);
  } catch {
    // storage blocked; they can pick the plan again after signing in
  }
}

export function forgetCheckout(): void {
  try {
    localStorage.removeItem(INTENT_KEY);
    localStorage.removeItem(OLD_CAMPAIGN_KEY);
  } catch {
    // nothing to clear
  }
}

/** Whether a plan picked before signing in is still waiting, without using it up. */
export function hasCheckoutIntent(now = Date.now()): boolean {
  try {
    return readIntent(now) !== null;
  } catch {
    return false;
  }
}

/** The plan picked before signing in, if it was picked in the last half hour. Reading it clears it. */
export function takeCheckoutIntent(now = Date.now()): { plan: WebPlan; campaign?: CheckoutCampaign } | null {
  try {
    const intent = readIntent(now);
    forgetCheckout();
    if (!intent) return null;
    return intent.campaign ? { plan: intent.plan, campaign: intent.campaign } : { plan: intent.plan };
  } catch {
    forgetCheckout();
    return null;
  }
}

// Where to land after signing in, for half an hour at most. Only paths on
// this site count.
const NEXT_KEY = 'stg_auth_next';

export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/auth')) return null;
  return next;
}

export function rememberNextPath(next: string | null | undefined, now = Date.now()): void {
  const safe = safeNextPath(next);
  try {
    if (safe) localStorage.setItem(NEXT_KEY, JSON.stringify({ path: safe, at: now }));
  } catch {
    // fine, they land on the home page
  }
}

export function forgetNextPath(): void {
  try {
    localStorage.removeItem(NEXT_KEY);
  } catch {
    // nothing to clear
  }
}

export function takeNextPath(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    if (!raw || !raw.startsWith('{')) return null;
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    const at = typeof parsed.at === 'number' ? parsed.at : 0;
    if (now - at > INTENT_TTL_MS || at > now + 60_000) return null;
    return safeNextPath(typeof parsed.path === 'string' ? parsed.path : null);
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

/** `status` is the subscription's, 'trialing' during the free week. Older API versions leave it out. */
export function verifyCheckout(sessionId: string): Promise<{ success: boolean; tier?: string; status?: string }> {
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
