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
    // Coming back from the provider signs the browser in, as supabase-js does
    // when it reads the return address.
    await page.addInitScript((value) => {
      if (new URLSearchParams(location.search).has('e2e_oauth')) localStorage.setItem('sb-e2e-auth-token', value);
    }, JSON.stringify(sessionFor()));
    await mockBackends(page);
    await stubStripe(page);
    const authorize: string[] = [];
    await page.route('https://e2e.supabase.co/auth/v1/authorize**', (route) => {
      authorize.push(route.request().url());
      return route.fulfill({ status: 302, headers: { Location: `${baseURL}/?e2e_oauth=1` } });
    });
    const checkouts = watch(page);

    await page.goto('/gold?campaign=site-pricing');
    await page.getByRole('button', { name: 'Get Lifetime' }).click();
    await page.getByRole('button', { name: `Continue with ${provider}` }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/);

    expect(authorize).toHaveLength(1);
    expect(new URL(authorize[0]).searchParams.get('provider')).toBe(provider.toLowerCase());
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].campaign).toBe('site-pricing');
    expect(checkouts[0].cancel_url).toBe(`${baseURL}/gold?campaign=site-pricing`);
  });
}

test("backing out of Stripe lands on the plans with the link's token, and a second try still carries it", async ({ page, baseURL }) => {
  await mockBackends(page);
  await stubStripe(page);
  const checkouts = watch(page);
  await page.goto('/gold?campaign=site-signal');
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts[0].cancel_url).toBe(`${baseURL}/gold?campaign=site-signal`);

  // Stripe's back link.
  await page.goto(checkouts[0].cancel_url as string);
  // Signed in now, so one tap goes straight to Stripe.
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts).toHaveLength(2);
  expect(checkouts[1].campaign).toBe('site-signal');
  expect(checkouts[1].cancel_url).toBe(`${baseURL}/gold?campaign=site-signal`);
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
  expect(checkouts[0].cancel_url).toBe(`${baseURL}/gold`);

  // Backing out of Stripe, signed in now, shows the plans again.
  await page.goto(checkouts[0].cancel_url as string);
  await expect(page).toHaveURL(/\/gold$/);
  await expect(page.getByRole('button', { name: 'Get Lifetime' })).toBeVisible();
});
