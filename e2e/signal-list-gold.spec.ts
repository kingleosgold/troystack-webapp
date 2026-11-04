import { devices, expect, test } from '@playwright/test';
import { mockBackends, sessionFor, signIn, signInElsewhereAs, signInExpired, signOutElsewhere } from './mock';

// The side card on the Signal list. The App Store only opens on an iPhone or
// iPad, so anyone else without Gold gets the web free week there.

function card(page: import('@playwright/test').Page) {
  return page.locator('aside').getByRole('heading', { name: /Troy's read on your own stack|Get it on your phone/ }).locator('..');
}

/** Notes whether the free week button ever showed in the side column, from the first paint on. */
async function watchForTry(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const hit = Array.from(document.querySelectorAll('aside button')).some((b) => b.textContent?.includes('Try Gold free for a week'));
      if (hit) (window as unknown as { sawTry?: boolean }).sawTry = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
}

test("a computer's reader gets the free week beside the list, carrying the list's own campaign", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store button');
  await signIn(page);
  await mockBackends(page);
  const checkouts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') checkouts.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto('/signal');
  await expect(page.getByRole('heading', { name: "Troy's read on your own stack" })).toBeVisible();
  // The App Store stays as the other door on a computer, a quiet line under
  // the free week that says who it's for, carrying the list's own token.
  await expect(card(page).getByText('Have an iPhone?')).toBeVisible();
  await expect(card(page).getByRole('link', { name: 'Get the app' })).toBeVisible();
  await expect(card(page).getByRole('link', { name: 'Get the app' })).toHaveAttribute('href', /[?&]ct=webapp-signal-list&/);
  // The free week fills the card's width, and nothing sits beside it.
  const tryBox = await card(page).getByRole('button', { name: 'Try Gold free for a week' }).boundingBox();
  const textBox = await card(page).locator('p').first().boundingBox();
  expect(tryBox).not.toBeNull();
  expect(textBox).not.toBeNull();
  expect(Math.abs(tryBox!.width - textBox!.width)).toBeLessThan(2);
  await card(page).getByRole('button', { name: 'Try Gold free for a week' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start my free week' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].campaign).toBe('webapp-signal-list');
});

test('a guest on a computer sees the free week beside the list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store button');
  await mockBackends(page);
  await page.goto('/signal');
  await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
});

for (const tier of ['gold', 'lifetime'] as const) {
  test(`an account with ${tier} isn't offered Gold beside the list`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the iPhone never sees the free week here');
    await signIn(page);
    await mockBackends(page, { tier });
    await watchForTry(page);
    const plan = page.waitForResponse((r) => r.url().includes('/rest/v1/profiles'));
    await page.goto('/signal');
    await plan;
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'Get it on your phone' })).toBeVisible();
    await expect(card(page).getByRole('link', { name: 'Get the app' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try Gold free for a week' })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { sawTry?: boolean }).sawTry ?? false)).toBe(false);
  });
}

test('an iPhone keeps the App Store card beside the list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'only the iPhone project is an iPhone');
  await mockBackends(page);
  await page.goto('/signal');
  await expect(page.getByRole('heading', { name: 'Get it on your phone' })).toBeVisible();
  await expect(card(page).getByRole('link', { name: 'Get the app' })).toBeVisible();
  // The list's installs count under its own token, apart from a piece's.
  await expect(card(page).getByRole('link', { name: 'Get the app' })).toHaveAttribute('href', /[?&]ct=webapp-signal-list&/);
  await expect(page.getByRole('button', { name: 'Try Gold free for a week' })).toHaveCount(0);
});

test.describe('on an Android phone', () => {
  const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
  void _browser;
  test.use(pixel);

  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures from this pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one run is enough, the device settings are the same in both');
  });

  test("a reader gets the free week and no App Store button, since it can't open", async ({ page }) => {
    await mockBackends(page);
    await page.goto('/signal');
    await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
    await expect(page.locator('aside').getByRole('link', { name: 'Get the app' })).toHaveCount(0);
  });

  test('a free account gets the free week once its plan lands', async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/signal');
    await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
    await expect(page.locator('aside').getByRole('link', { name: 'Get the app' })).toHaveCount(0);
  });

  test('a Gold account sees no card, and never the free week while its session restores', async ({ page }) => {
    await signInExpired(page);
    await mockBackends(page, { tier: 'gold' });
    await page.route('**/auth/v1/token**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fallback();
    });
    await watchForTry(page);
    await page.goto('/signal');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => (window as unknown as { sawTry?: boolean }).sawTry ?? false)).toBe(false);
    await expect(page.locator('aside').getByRole('heading', { name: /Troy's read on your own stack|Get it on your phone/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Hear it instead' })).toBeVisible();
  });
});

test("a free account on a computer never sees the phone card first while its plan loads", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store card');
  await signIn(page);
  await mockBackends(page);
  // The plan is slow, so the card sits a while not knowing what to offer.
  await page.route('**/rest/v1/profiles**', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const hit = Array.from(document.querySelectorAll('aside h2')).some((h) => h.textContent?.includes('Get it on your phone'));
      if (hit) (window as unknown as { sawPhone?: boolean }).sawPhone = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto('/signal');
  // The card holds its place while the plan loads.
  await expect(page.getByTestId('read-on-pending')).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
  await expect(page.getByTestId('read-on-pending')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { sawPhone?: boolean }).sawPhone ?? false)).toBe(false);
});

test("an account whose plan can't be read gets the phone card, not a card that waits on retries", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store card');
  await signIn(page);
  await mockBackends(page, { failProfileRead: true });
  await page.goto('/signal');
  await expect(page.getByRole('heading', { name: 'Get it on your phone' })).toBeVisible();
  await expect(page.getByTestId('read-on-pending')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try Gold free for a week' })).toHaveCount(0);
});

/**
 * Every request for supabase-js's lock fails, as when another tab holds it
 * past the timeout, so reading the session at startup rejects.
 */
async function failSessionLock(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const locks = navigator.locks;
    const request = locks.request.bind(locks) as (...args: unknown[]) => Promise<unknown>;
    (locks as unknown as { request: (...args: unknown[]) => Promise<unknown> }).request = (name: unknown, ...rest: unknown[]) =>
      typeof name === 'string' && name.startsWith('lock:sb-')
        ? Promise.reject(new Error('Acquiring an exclusive Navigator LockManager lock timed out'))
        : request(name, ...rest);
  });
}

test("a guest whose session can't be read still gets the free week, not a card that waits forever", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store card');
  await mockBackends(page);
  await failSessionLock(page);
  await page.goto('/signal');
  await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
  await expect(page.getByTestId('read-on-pending')).toHaveCount(0);
});

test("a guest with another Supabase project's session left in the browser still gets the free week when the session can't be read", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store card');
  await page.addInitScript(() => localStorage.setItem('sb-someotherproject-auth-token', '{"access_token":"x"}'));
  await mockBackends(page);
  await failSessionLock(page);
  await page.goto('/signal');
  await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
  await expect(page.getByTestId('read-on-pending')).toHaveCount(0);
});

test("an account signing back in after its plan couldn't be read waits on the plan, and never shows the phone card", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store card');
  await signIn(page, { once: true });
  await mockBackends(page);
  // The first plan read fails, so the card falls back to the phone card.
  let failing = true;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/rest/v1/profiles**', async (route) => {
    if (failing) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"upstream connect error"}' });
    await held;
    await route.fallback().catch(() => undefined);
  });
  await page.goto('/signal');
  await expect(page.getByRole('heading', { name: 'Get it on your phone' })).toBeVisible();
  // Signed out in another tab, the card offers the free week to the guest.
  await signOutElsewhere(page);
  await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
  // The same account signs back in from another tab while its plan is slow.
  failing = false;
  await page.evaluate(() => {
    (window as unknown as { sawPhone?: boolean }).sawPhone = false;
    new MutationObserver(() => {
      const hit = Array.from(document.querySelectorAll('aside h2')).some((h) => h.textContent?.includes('Get it on your phone'));
      if (hit) (window as unknown as { sawPhone?: boolean }).sawPhone = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await signInElsewhereAs(page, sessionFor());
  await expect(page.getByTestId('read-on-pending')).toBeVisible();
  release();
  await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { sawPhone?: boolean }).sawPhone ?? false)).toBe(false);
});

test("a stored session that can't be read gets the phone card, never the free week, since it may be Gold", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store card');
  await signIn(page);
  await mockBackends(page, { tier: 'gold' });
  await failSessionLock(page);
  await watchForTry(page);
  await page.goto('/signal');
  await expect(page.getByRole('heading', { name: 'Get it on your phone' })).toBeVisible();
  await expect(page.getByTestId('read-on-pending')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { sawTry?: boolean }).sawTry ?? false)).toBe(false);
});
