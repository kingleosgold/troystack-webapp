import { afterEach, describe, expect, it, vi } from 'vitest';

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
    vi.stubGlobal('window', { location: { origin: 'https://troystack.ai', pathname: '/settings', assign } });
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
    const done = c.openCheckout('7b1c6c1e-1111-4a2b-9c3d-000000000001', 'token', 'monthly', undefined, onWait);
    await vi.advanceTimersByTimeAsync(c.CHECKOUT_RETRY_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await done;
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
});
