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

test('picking Lifetime on the Gold page goes straight to Stripe on Lifetime', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  const checkouts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') checkouts.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto('/gold');
  // The card already showed the plan and price, so there's no second pick.
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].price_id).toBe('price_e2e_lifetime');
  expect(checkouts[0].campaign).toBe('webapp-gold');
});

test('switching plans in the sheet moves its title with the plan', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  // Settings opens the sheet with no plan picked, so it asks for one.
  await page.goto('/settings');
  await page.getByRole('button', { name: /Try Gold free for a week/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toHaveAccessibleName('Try Gold free for a week');
  // An iPhone sees the app first, with card checkout one tap away.
  const card = sheet.getByRole('button', { name: 'Rather start it here with a card?' });
  if (await card.isVisible()) await card.click();
  await sheet.getByRole('radio', { name: /Lifetime/ }).click();
  await expect(sheet).toHaveAccessibleName('Get Gold for life');
  await expect(sheet.getByRole('button', { name: 'Get Lifetime for $99.99' })).toBeVisible();
  await sheet.getByRole('radio', { name: /Yearly/ }).click();
  await expect(sheet).toHaveAccessibleName('Try Gold free for a week');
  await expect(sheet.getByRole('button', { name: 'Start my free week' })).toBeVisible();
});

test('the plans hold still while a checkout is opening', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  // Checkout answers slowly, so the sheet stays up while it opens.
  await page.route('**/v1/stripe/create-checkout-session', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/slow' }) });
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto('/gold');
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'Opening checkout' })).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /Yearly/ })).toBeDisabled();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
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
  // The sign-up form opens next, with one password field.
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

test("a later sign-in link with no campaign doesn't inherit the Gold page's", async ({ page }) => {
  await mockBackends(page);
  const checkouts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') checkouts.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  // Lifetime picked on the Gold page waits for sign-in, tagged webapp-gold.
  await page.goto('/gold');
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await expect(page).toHaveURL(/\/auth\?redirect=checkout&plan=lifetime&from=sheet/);
  // Then a link from somewhere else asks for the same plan with no campaign.
  await page.goto('/auth?mode=signup&redirect=checkout&plan=lifetime');
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].price_id).toBe('price_e2e_lifetime');
  expect(checkouts[0].campaign).toBeUndefined();
});

test('a new visitor who picks monthly lands on sign-up with monthly kept', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/gold');
  await page.getByLabel('Plans').getByRole('button', { name: 'Start free week' }).nth(1).click();
  await expect(page).toHaveURL(/\/auth\?redirect=checkout&plan=monthly/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your free account');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('someone with an account can still sign in from the checkout form', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/auth?redirect=checkout&plan=yearly');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your free account');
  await page.getByRole('button', { name: 'Have an account? Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to TroyStack');
});

test('the Gold page counts the view, the plan tap and the sign-up, and nothing about who', async ({ page }) => {
  await mockBackends(page);
  const steps: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/funnel') && r.method() === 'POST') steps.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto('/gold');
  await expect.poll(() => steps.length).toBe(1);
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(steps).toEqual([
    { step: 'gold_view', campaign: 'webapp-gold' },
    { step: 'plan_tap', plan: 'lifetime', campaign: 'webapp-gold' },
    { step: 'signup', plan: 'lifetime', campaign: 'webapp-gold' },
  ]);
});

test('an automated browser opens the Gold page and picks a plan without a single count', async ({ page }) => {
  await mockBackends(page, { automated: true });
  const steps: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/funnel') && r.method() === 'POST') steps.push(r.postDataJSON());
  });
  await page.goto('/gold');
  expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  // The view and tap would have gone by now, as in the test above.
  await page.waitForLoadState('networkidle');
  expect(steps).toEqual([]);
});

test('a visitor from a troystack.com link keeps its page token from the Gold page to Stripe', async ({ page }) => {
  await mockBackends(page);
  const steps: Array<Record<string, unknown>> = [];
  const checkouts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/funnel') && r.method() === 'POST') steps.push(r.postDataJSON());
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') checkouts.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto('/gold?campaign=site-pricing');
  await expect.poll(() => steps.length).toBe(1);
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(steps).toEqual([
    { step: 'gold_view', campaign: 'site-pricing' },
    { step: 'plan_tap', plan: 'lifetime', campaign: 'site-pricing' },
    { step: 'signup', plan: 'lifetime', campaign: 'site-pricing' },
  ]);
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].campaign).toBe('site-pricing');
});

test('a token that is not a troystack.com page counts as the Gold page', async ({ page }) => {
  await mockBackends(page);
  const steps: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/funnel') && r.method() === 'POST') steps.push(r.postDataJSON());
  });
  await page.goto('/gold?campaign=webapp-troy-limit');
  await expect.poll(() => steps.length).toBe(1);
  expect(steps[0]).toEqual({ step: 'gold_view', campaign: 'webapp-gold' });
});
