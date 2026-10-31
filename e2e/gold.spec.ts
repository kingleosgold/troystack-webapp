import { devices, expect, test } from '@playwright/test';
import { mockBackends, signIn, signInExpired } from './mock';

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

test('an automated browser opens the Gold page, picks a plan and signs up without a single count', async ({ page }) => {
  await mockBackends(page, { automated: true });
  const steps: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/funnel') && r.method() === 'POST') steps.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto('/gold');
  // Only webdriver gives it away, since the device profile's user agent reads as a person.
  expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
  expect(await page.evaluate(() => /headless/i.test(navigator.userAgent))).toBe(false);
  await page.getByRole('button', { name: 'Get Lifetime' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  // A person's sign-up count goes before the page leaves for Stripe, as the
  // test above shows, so by now any count would have been seen.
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

test("home's Gold block opens the web free week as well as the App Store", async ({ page }) => {
  await mockBackends(page);
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Start the free week on the web' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/gold$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Troy, all day, around your stack');
  await expect(page.getByLabel('Plans').getByRole('button', { name: 'Start free week' }).first()).toBeVisible();
});

for (const tier of ['gold', 'lifetime'] as const) {
  test(`home doesn't offer the free week to an account with ${tier}`, async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { tier });
    await page.goto('/');
    // The account row names the plan only once it has loaded, which is when the block would show the link.
    await expect(page.locator('a[href="/settings"][title*="@"]').getByText(tier === 'lifetime' ? 'Lifetime' : 'Gold', { exact: true })).toBeAttached();
    await expect(page.getByText('Your stack and Troy, in your pocket')).toBeVisible();
    await expect(page.getByText(/Gold starts with a free week/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Start the free week on the web' })).toHaveCount(0);
  });
}

test('a free account sees the web free week on home once its plan loads', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Start the free week on the web' })).toBeVisible();
});

test.describe('on an Android phone', () => {
  const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
  void _browser;
  test.use(pixel);

  test("the top bar opens the web free week, since the App Store link can't", async ({ page }) => {
    await mockBackends(page);
    await page.goto('/prices');
    const bar = page.locator('div.sticky').first();
    await expect(bar.getByRole('link', { name: 'Get the app' })).toHaveCount(0);
    await bar.getByRole('link', { name: 'Try Gold free' }).click();
    await expect(page).toHaveURL(/\/gold$/);
    await expect(page.getByLabel('Plans').getByRole('button', { name: 'Start free week' }).first()).toBeVisible();
  });

  for (const tier of ['gold', 'lifetime'] as const) {
    test(`the top bar doesn't offer Gold to an account with ${tier}`, async ({ page }) => {
      await signIn(page);
      await mockBackends(page, { tier });
      // The plan has loaded once Settings names it.
      await page.goto('/settings');
      const bar = page.locator('div.sticky').first();
      await expect(page.locator('main').getByText(tier === 'lifetime' ? 'Lifetime' : 'Gold', { exact: true }).first()).toBeVisible();
      await expect(bar.getByRole('link', { name: 'Try Gold free' })).toHaveCount(0);
      await expect(bar.getByRole('link', { name: 'Get the app' })).toBeVisible();
    });
  }

  test('a free account sees Try Gold free once its plan loads', async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/settings');
    await expect(page.locator('main').getByText('Free', { exact: true }).first()).toBeVisible();
    await expect(page.locator('div.sticky').first().getByRole('link', { name: 'Try Gold free' })).toBeVisible();
  });

  test('a free account never sees Get the app first while its plan loads', async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.route('**/rest/v1/profiles**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fallback();
    });
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const bar = document.querySelector('div.sticky');
        const hit = Array.from(bar?.querySelectorAll('a') ?? []).some((a) => a.textContent?.includes('Get the app'));
        if (hit) (window as unknown as { sawApp?: boolean }).sawApp = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto('/prices');
    const bar = page.locator('div.sticky').first();
    await expect(bar.getByTestId('nav-gold-pending')).toBeAttached();
    await expect(bar.getByRole('link', { name: 'Try Gold free' })).toBeVisible();
    await expect(bar.getByTestId('nav-gold-pending')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { sawApp?: boolean }).sawApp ?? false)).toBe(false);
  });

  test("a Gold account never sees Try Gold free while its session restores", async ({ page }) => {
    await signInExpired(page);
    await mockBackends(page, { tier: 'gold' });
    // The refresh is slow, so the page sits a while with no session yet.
    await page.route('**/auth/v1/token**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fallback();
    });
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.querySelector('div.sticky a[href="/gold"]')) (window as unknown as { sawTry?: boolean }).sawTry = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto('/settings');
    await expect(page.locator('main').getByText('Gold', { exact: true }).first()).toBeVisible();
    await expect(page.locator('div.sticky').first().getByRole('link', { name: 'Get the app' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { sawTry?: boolean }).sawTry ?? false)).toBe(false);
  });
});

test('an iPhone keeps the App Store button in the top bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'the phone top bar only shows below the desktop width');
  await mockBackends(page);
  await page.goto('/prices');
  const bar = page.locator('div.sticky').first();
  await expect(bar.getByRole('link', { name: 'Get the app' })).toBeVisible();
  await expect(bar.getByRole('link', { name: 'Try Gold free' })).toHaveCount(0);
});
