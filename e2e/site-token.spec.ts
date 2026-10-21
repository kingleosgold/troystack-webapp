import { expect, test, type Page } from '@playwright/test';
import { mockBackends, sessionFor } from './mock';

// A troystack.com link's site-* token rides from /gold through sign-up to
// Stripe, and back to /gold if they back out, whichever way they sign in.

function watch(page: Page) {
  const checkouts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') checkouts.push(r.postDataJSON());
  });
  return checkouts;
}

async function stubStripe(page: Page) {
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }),
  );
}

for (const provider of ['Google', 'Apple'] as const) {
  test(`a troystack.com visitor who signs in with ${provider} reaches Stripe with the link's token`, async ({ page, baseURL }) => {
    await mockBackends(page);
    await stubStripe(page);
    // The provider sends the browser back to the return address with the
    // session in the hash, and supabase-js signs in from it, as it does live.
    const session = sessionFor();
    const returned = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: String(session.expires_in),
      expires_at: String(Math.floor(Date.now() / 1000) + session.expires_in),
      token_type: session.token_type,
    });
    const authorize: string[] = [];
    await page.route('https://e2e.supabase.co/auth/v1/authorize**', (route) => {
      authorize.push(route.request().url());
      const back = new URL(route.request().url()).searchParams.get('redirect_to') ?? `${baseURL}/`;
      return route.fulfill({ status: 302, headers: { Location: `${back}#${returned}` } });
    });
    // supabase-js reads the user with the token from the hash.
    const userBearers: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/auth/v1/user') userBearers.push(r.headers()['authorization'] ?? '');
    });
    const checkouts = watch(page);

    await page.goto('/gold?campaign=site-pricing');
    await page.getByRole('button', { name: 'Get Lifetime' }).click();
    await page.getByRole('button', { name: `Continue with ${provider}` }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/);

    expect(userBearers).toContain(`Bearer ${session.access_token}`);
    expect(authorize).toHaveLength(1);
    expect(new URL(authorize[0]).searchParams.get('provider')).toBe(provider.toLowerCase());
    expect(new URL(authorize[0]).searchParams.get('redirect_to')).toBe(`${baseURL}/`);
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].campaign).toBe('site-pricing');
    expect(checkouts[0].cancel_url).toBe(`${baseURL}/gold?campaign=site-pricing&back=1`);
  });
}

test("backing out of Stripe lands on the plans with the link's token, and a second try still carries it", async ({ page, baseURL }) => {
  await mockBackends(page);
  await stubStripe(page);
  const checkouts = watch(page);
  const steps: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/funnel') && r.method() === 'POST') steps.push(r.postDataJSON());
  });
  await page.goto('/gold?campaign=site-signal');
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts[0].cancel_url).toBe(`${baseURL}/gold?campaign=site-signal&back=1`);

  // Stripe's back link.
  await page.goto(checkouts[0].cancel_url as string);
  // Signed in now, so one tap goes straight to Stripe.
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts).toHaveLength(2);
  expect(checkouts[1].campaign).toBe('site-signal');
  expect(checkouts[1].cancel_url).toBe(`${baseURL}/gold?campaign=site-signal&back=1`);
  // The view and tap counted on the way in, so the second pass adds neither.
  expect(steps).toEqual([
    { step: 'gold_view', campaign: 'site-signal' },
    { step: 'plan_tap', plan: 'lifetime', campaign: 'site-signal' },
    { step: 'signup', plan: 'lifetime', campaign: 'site-signal' },
  ]);
});

test('a Gold-page checkout with no troystack.com token backs out to the plans, not to /auth', async ({ page, baseURL }) => {
  await mockBackends(page);
  await stubStripe(page);
  const checkouts = watch(page);
  await page.goto('/gold');
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts[0].campaign).toBe('webapp-gold');
  expect(checkouts[0].cancel_url).toBe(`${baseURL}/gold?back=1`);

  // Backing out of Stripe, signed in now, shows the plans again.
  await page.goto(checkouts[0].cancel_url as string);
  await expect(page).toHaveURL(/\/gold\?back=1$/);
  await expect(page.getByRole('button', { name: 'Get Lifetime' })).toBeVisible();
});
