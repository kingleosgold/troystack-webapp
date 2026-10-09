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
