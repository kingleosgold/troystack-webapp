import { expect, test } from '@playwright/test';
import { mockBackends, signIn } from './mock';

// The Gold page lists every plan at the checkout's own price, and a plan
// picked there is the one checkout opens with.

test('the Gold page shows the three plans at their checkout prices', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/gold');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Troy, all day, around your stack');
  const plans = page.getByLabel('Plans');
  await expect(plans.getByText('$39.99')).toBeVisible();
  await expect(plans.getByText('$4.99')).toBeVisible();
  await expect(plans.getByText('$99.99')).toBeVisible();
  await expect(page).toHaveTitle(/TroyStack Gold/);
});

test('picking Lifetime on the Gold page opens checkout with Lifetime picked', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  const checkouts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') checkouts.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto('/gold');
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  const sheet = page.getByRole('dialog');
  // On an iPhone too, a plan picked here opens card checkout on that plan.
  const buy = sheet.getByRole('button', { name: 'Get Lifetime for $99.99' });
  await expect(buy).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Rather start it here with a card?' })).toHaveCount(0);
  await expect(sheet).toHaveAccessibleName('Get Gold for life');
  await expect(sheet.getByText(/Lifetime is in the app too/)).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /Lifetime/ })).toHaveAttribute('aria-checked', 'true');
  await buy.click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts[0].price_id).toBe('price_e2e_lifetime');
  expect(checkouts[0].campaign).toBe('webapp-gold');
});

test('switching plans in the sheet moves its title with the plan', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/gold');
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toHaveAccessibleName('Get Gold for life');
  await sheet.getByRole('radio', { name: /Yearly/ }).click();
  await expect(sheet).toHaveAccessibleName('Try Gold free for a week');
  await expect(sheet.getByRole('button', { name: 'Start my free week' })).toBeVisible();
  await expect(sheet.getByText(/Start the same free week in the app instead/)).toBeVisible();
});

test('an account with Gold sees its plan instead of prices', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { tier: 'gold' });
  await page.goto('/gold');
  await expect(page.getByText('You have Gold on this account.')).toBeVisible();
  await expect(page.getByLabel('Plans')).toHaveCount(0);
});

test('a new visitor goes from a plan on the Gold page through one sign-up form to Stripe', async ({ page }) => {
  await mockBackends(page);
  const checkouts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') checkouts.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto('/gold');
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Get Lifetime for $99.99' }).click();
  // The sign-up form opens first, with one password field.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your free account');
  await expect(page.getByLabel('Password again')).toHaveCount(0);
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].price_id).toBe('price_e2e_lifetime');
  expect(checkouts[0].campaign).toBe('webapp-gold');
});

test('someone with an account can still sign in from the checkout form', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/auth?redirect=checkout&plan=yearly');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your free account');
  await page.getByRole('button', { name: 'Have an account? Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to TroyStack');
});
