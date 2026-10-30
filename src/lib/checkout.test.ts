import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The price ids are read when the module loads, so each case loads it fresh.
async function withPrices(ids: { monthly?: string; yearly?: string; lifetime?: string }) {
  vi.resetModules();
  vi.stubEnv('VITE_STRIPE_GOLD_MONTHLY_PRICE_ID', ids.monthly ?? '');
  vi.stubEnv('VITE_STRIPE_GOLD_YEARLY_PRICE_ID', ids.yearly ?? '');
  vi.stubEnv('VITE_STRIPE_GOLD_LIFETIME_PRICE_ID', ids.lifetime ?? '');
  return import('./checkout');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the plans offered on the web', () => {
  it('are only the ones with a Stripe price set', async () => {
    const c = await withPrices({ monthly: 'price_m', lifetime: 'price_l' });
    expect(c.webPlans().map((p) => p.id)).toEqual(['monthly', 'lifetime']);
    expect(c.webCheckoutReady()).toBe(true);
    expect(c.webCheckoutReady('monthly')).toBe(true);
    expect(c.webCheckoutReady('yearly')).toBe(false);
  });

  it('make checkout ready when only monthly is set, and not ready when none is', async () => {
    expect((await withPrices({ monthly: 'price_m' })).webCheckoutReady()).toBe(true);
    const none = await withPrices({});
    expect(none.webPlans()).toEqual([]);
    expect(none.webCheckoutReady()).toBe(false);
  });
});

describe('the plans the Gold page lists', () => {
  it('are only the sellable ones when checkout runs here, so a click never buys another plan', async () => {
    const c = await withPrices({ monthly: 'price_m', yearly: 'price_y' });
    expect(c.goldPagePlans().map((p) => p.id)).toEqual(['yearly', 'monthly']);
  });

  it('are all three at their prices when nothing can be bought here', async () => {
    const c = await withPrices({});
    expect(c.goldPagePlans().map((p) => [p.id, p.price])).toEqual([
      ['yearly', '$39.99'],
      ['monthly', '$4.99'],
      ['lifetime', '$99.99'],
    ]);
  });
});

describe('what checkout says is in the way', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads the reason on a 409, and one it does not know, or none, as already having a plan', async () => {
    const c = await withPrices({ monthly: 'price_m' });
    const { ApiError } = await import('./apiClient');
    const refused = (reason?: string) => new ApiError('Conflict', 409, reason === undefined ? { error: 'Conflict' } : { error: 'Conflict', reason });
    expect(c.checkoutBlock(refused('payment_issue'))).toBe('payment_issue');
    expect(c.checkoutBlock(refused('app_store_renewing'))).toBe('app_store_renewing');
    expect(c.checkoutBlock(refused('checkout_in_progress'))).toBe('checkout_in_progress');
    expect(c.checkoutBlock(refused('has_plan'))).toBe('has_plan');
    expect(c.checkoutBlock(refused('something_new'))).toBe('has_plan');
    expect(c.checkoutBlock(refused())).toBe('has_plan');
    expect(c.checkoutBlock(new ApiError('Server error', 500))).toBeNull();
    expect(c.checkoutBlock(new Error('offline'))).toBeNull();

    expect(c.settingsAfterCheckout(refused('payment_issue'))).toBe('/settings?checkout=payment-issue');
    expect(c.settingsAfterCheckout(refused('app_store_renewing'))).toBe('/settings?checkout=app-store');
    expect(c.settingsAfterCheckout(refused('checkout_in_progress'))).toBe('/settings?checkout=in-progress');
    expect(c.settingsAfterCheckout(refused())).toBe('/settings?checkout=have-gold');
    expect(c.settingsAfterCheckout(new ApiError('Server error', 500))).toBe('/settings?checkout=failed');
  });

  it('asks once more a few seconds after finding another checkout for the account opening, and only once', async () => {
    const c = await withPrices({ monthly: 'price_m' });
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { origin: 'https://troystack.com', pathname: '/settings', assign } });
    const answers = [
      { status: 409, body: { error: 'A checkout for this account is already opening.', reason: 'checkout_in_progress' } },
      { status: 200, body: { url: 'https://checkout.stripe.com/c/pay/e2e' } },
    ];
    const fetch = vi.fn(async () => {
      const a = answers.shift()!;
      return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetch);
    vi.useFakeTimers();
    const onWait = vi.fn();
    const done = c.openCheckout('7b1c6c1e-1111-4a2b-9c3d-000000000001', 'token', 'monthly', undefined, { onWait });
    await vi.advanceTimersByTimeAsync(c.CHECKOUT_RETRY_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await done).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/e2e');

    // Still opening the second time, it stops and says so.
    answers.push(
      { status: 409, body: { error: 'Opening', reason: 'checkout_in_progress' } },
      { status: 409, body: { error: 'Opening', reason: 'checkout_in_progress' } },
    );
    const again = c.openCheckout('7b1c6c1e-1111-4a2b-9c3d-000000000001', 'token', 'monthly').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(c.CHECKOUT_RETRY_MS);
    expect(c.checkoutBlock(await again)).toBe('checkout_in_progress');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("doesn't leave for Stripe, or ask again, once checkout is no longer wanted", async () => {
    const c = await withPrices({ monthly: 'price_m' });
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { origin: 'https://troystack.com', pathname: '/settings', assign } });
    const answers = [
      { status: 200, body: { url: 'https://checkout.stripe.com/c/pay/e2e' } },
      { status: 409, body: { error: 'Opening', reason: 'checkout_in_progress' } },
    ];
    const fetch = vi.fn(async () => {
      const a = answers.shift()!;
      return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetch);
    let wanted = true;
    const stillWanted = () => wanted;

    // Another account signed in while checkout opened. The page stays put.
    const first = c.openCheckout('7b1c6c1e-1111-4a2b-9c3d-000000000001', 'token', 'monthly', undefined, {
      stillWanted: () => {
        wanted = false;
        return stillWanted();
      },
    });
    expect(await first).toBe(false);
    expect(assign).not.toHaveBeenCalled();

    // The same, while it waited to ask again: it doesn't ask.
    vi.useFakeTimers();
    wanted = true;
    const second = c.openCheckout('7b1c6c1e-1111-4a2b-9c3d-000000000001', 'token', 'monthly', undefined, { stillWanted });
    await vi.advanceTimersByTimeAsync(1);
    wanted = false;
    await vi.advanceTimersByTimeAsync(c.CHECKOUT_RETRY_MS);
    expect(await second).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(assign).not.toHaveBeenCalled();

    // The billing page, the same.
    answers.push({ status: 200, body: { url: 'https://billing.stripe.com/p/session/e2e' } });
    expect(await c.openBillingPortal('7b1c6c1e-1111-4a2b-9c3d-000000000001', 'token', () => false)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('where a checkout backs out to', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function cancelUrlFor(pathname: string, campaign?: string, tappedOnGold = true) {
    const c = await withPrices({ monthly: 'price_m' });
    if (tappedOnGold && campaign) c.rememberGoldTap('monthly', campaign as never);
    vi.stubGlobal('window', { location: { origin: 'https://troystack.ai', pathname, assign: vi.fn() } });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/e2e' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await c.startCheckout('7b1c6c1e-1111-4a2b-9c3d-000000000001', 'token', 'monthly', campaign as never);
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    return (JSON.parse(String(init.body)) as { cancel_url: string }).cancel_url;
  }

  it('is the plans with the token for a troystack.com link, wherever checkout opened', async () => {
    expect(await cancelUrlFor('/auth', 'site-pricing')).toBe('https://troystack.ai/gold?campaign=site-pricing&back=1');
  });

  it('is the plans for a Gold-page pick, even when checkout opened on /auth after sign-up', async () => {
    expect(await cancelUrlFor('/auth', 'webapp-gold')).toBe('https://troystack.ai/gold?back=1');
    expect(await cancelUrlFor('/', 'webapp-gold')).toBe('https://troystack.ai/gold?back=1');
  });

  it("doesn't say the counts happened when this tab never tapped a plan on the Gold page under that campaign", async () => {
    expect(await cancelUrlFor('/auth', 'site-pricing', false)).toBe('https://troystack.ai/gold?campaign=site-pricing');
    expect(await cancelUrlFor('/auth', 'webapp-gold', false)).toBe('https://troystack.ai/gold');
    const c = await withPrices({ monthly: 'price_m' });
    c.rememberGoldTap('monthly', 'site-signal' as never);
    expect(await cancelUrlFor('/auth', 'site-pricing', false)).toBe('https://troystack.ai/gold?campaign=site-pricing');
  });

  it('is the page checkout opened on for anything else', async () => {
    expect(await cancelUrlFor('/settings', 'webapp-settings')).toBe('https://troystack.ai/settings');
    expect(await cancelUrlFor('/troy')).toBe('https://troystack.ai/troy');
  });
});

describe('a plan tapped on the Gold page', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const now = 1_800_000_000_000;

  it('is the plan back from Stripe under the same campaign', async () => {
    const c = await withPrices({ monthly: 'price_m' });
    c.rememberGoldTap('yearly', 'webapp-gold', now);
    expect(c.backedOutPlan('1', 'webapp-gold', now + 60_000)).toBe('yearly');
  });

  it("isn't, without back=1 or under another campaign", async () => {
    const c = await withPrices({ monthly: 'price_m' });
    c.rememberGoldTap('yearly', 'webapp-gold', now);
    expect(c.backedOutPlan(null, 'webapp-gold', now)).toBeUndefined();
    expect(c.backedOutPlan('0', 'webapp-gold', now)).toBeUndefined();
    expect(c.backedOutPlan('1', 'site-pricing', now)).toBeUndefined();
  });

  it('lasts half an hour, so the same tab back much later counts again', async () => {
    const c = await withPrices({ monthly: 'price_m' });
    c.rememberGoldTap('monthly', 'site-pricing' as never, now);
    expect(c.goldTap(now + 30 * 60 * 1000)).toEqual({ plan: 'monthly', campaign: 'site-pricing' });
    expect(c.goldTap(now + 30 * 60 * 1000 + 1)).toBeNull();
    expect(c.backedOutPlan('1', 'site-pricing', now + 31 * 60 * 1000)).toBeUndefined();
  });

  it("isn't one with no time, a time ahead of the clock, an unknown plan or a broken value", async () => {
    const c = await withPrices({ monthly: 'price_m' });
    store.set('stg_gold_tap', JSON.stringify({ plan: 'monthly', campaign: 'webapp-gold' }));
    expect(c.goldTap(now)).toBeNull();
    store.set('stg_gold_tap', JSON.stringify({ plan: 'monthly', campaign: 'webapp-gold', at: now + 5 * 60 * 1000 }));
    expect(c.goldTap(now)).toBeNull();
    store.set('stg_gold_tap', JSON.stringify({ plan: 'weekly', campaign: 'webapp-gold', at: now }));
    expect(c.goldTap(now)).toBeNull();
    store.set('stg_gold_tap', JSON.stringify({ plan: 'monthly', campaign: 7, at: now }));
    expect(c.goldTap(now)).toBeNull();
    store.set('stg_gold_tap', '{not json');
    expect(c.goldTap(now)).toBeNull();
  });

  it("keeps a back-out to the Gold page from saying the counts happened once the tap is stale", async () => {
    const c = await withPrices({ monthly: 'price_m' });
    c.rememberGoldTap('monthly', 'webapp-gold', Date.now() - 31 * 60 * 1000);
    vi.stubGlobal('window', { location: { origin: 'https://troystack.ai', pathname: '/auth', assign: vi.fn() } });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/e2e' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await c.startCheckout('7b1c6c1e-1111-4a2b-9c3d-000000000001', 'token', 'monthly', 'webapp-gold');
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((JSON.parse(String(init.body)) as { cancel_url: string }).cancel_url).toBe('https://troystack.ai/gold');
  });
});
