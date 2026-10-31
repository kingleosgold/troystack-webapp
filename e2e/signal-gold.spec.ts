import { devices, expect, test } from '@playwright/test';
import { mockBackends, signIn, signInExpired } from './mock';

// The card under a Signal piece. The App Store only opens on an iPhone or
// iPad, so anyone else without Gold gets the web free week there.

const PIECE = '/signal/evening-signal-2026-10-08';

function card(page: import('@playwright/test').Page) {
  return page.locator('article').getByRole('heading', { name: 'Troy writes these all day' }).locator('..');
}

test("a computer's reader gets the free week under a piece, carrying the Signal's campaign", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store button');
  await signIn(page);
  await mockBackends(page);
  const checkouts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') checkouts.push(r.postDataJSON());
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await page.goto(PIECE);
  // The App Store stays as the other door on a computer.
  await expect(card(page).getByRole('link', { name: 'Get TroyStack for iPhone' })).toBeVisible();
  await card(page).getByRole('button', { name: 'Try Gold free for a week' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Start my free week' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].campaign).toBe('webapp-signal');
});

test('a guest on a computer sees the free week under a piece', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the iPhone keeps the App Store button');
  await mockBackends(page);
  await page.goto(PIECE);
  await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
});

for (const tier of ['gold', 'lifetime'] as const) {
  test(`an account with ${tier} isn't offered Gold under a piece`, async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { tier });
    // The plan has loaded once Settings names it, then the piece opens in the same tab.
    await page.goto('/settings');
    await expect(page.locator('main').getByText(tier === 'lifetime' ? 'Lifetime' : 'Gold', { exact: true }).first()).toBeVisible();
    await page.goto(PIECE);
    await expect(card(page).getByRole('link', { name: 'Get TroyStack for iPhone' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try Gold free for a week' })).toHaveCount(0);
  });
}

test('an iPhone keeps the App Store button under a piece', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'only the iPhone project is an iPhone');
  await mockBackends(page);
  await page.goto(PIECE);
  await expect(card(page).getByRole('link', { name: 'Get TroyStack for iPhone' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Gold free for a week' })).toHaveCount(0);
});

test.describe('on an Android phone', () => {
  const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
  void _browser;
  test.use(pixel);

  test("a reader gets the free week and no App Store button, since it can't open", async ({ page }) => {
    await mockBackends(page);
    await page.goto(PIECE);
    await expect(card(page).getByRole('button', { name: 'Try Gold free for a week' })).toBeVisible();
    await expect(card(page).getByRole('link', { name: 'Get TroyStack for iPhone' })).toHaveCount(0);
  });

  test('a Gold account never sees the free week while its session restores', async ({ page }) => {
    await signInExpired(page);
    await mockBackends(page, { tier: 'gold' });
    await page.route('**/auth/v1/token**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fallback();
    });
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const hit = Array.from(document.querySelectorAll('article button')).some((b) => b.textContent?.includes('Try Gold free for a week'));
        if (hit) (window as unknown as { sawTry?: boolean }).sawTry = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto(PIECE);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Wait past the slow refresh, then check the free week never showed.
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => (window as unknown as { sawTry?: boolean }).sawTry ?? false)).toBe(false);
  });
});
