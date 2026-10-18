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
  const byCard = sheet.getByRole('button', { name: 'Rather start it here with a card?' });
  const buy = sheet.getByRole('button', { name: 'Get Lifetime for $99.99' });
  await expect(buy.or(byCard)).toBeVisible();
  if (await byCard.isVisible()) await byCard.click();
  await expect(sheet.getByRole('radio', { name: /Lifetime/ })).toHaveAttribute('aria-checked', 'true');
  await buy.click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts[0].price_id).toBe('price_e2e_lifetime');
  expect(checkouts[0].campaign).toBe('webapp-gold');
});

test('an account with Gold sees its plan instead of prices', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { tier: 'gold' });
  await page.goto('/gold');
  await expect(page.getByText('You have Gold on this account.')).toBeVisible();
  await expect(page.getByLabel('Plans')).toHaveCount(0);
});
