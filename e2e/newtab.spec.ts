import { expect, test, type Page } from '@playwright/test';
import { mockBackends } from './mock';

// Every link that opens a new tab says so to a screen reader. A sighted reader
// sees the tab appear, so the note is visually hidden and nothing else moves.
//
// Each page names one new-tab link its own content always renders. The sweep
// waits for that link inside main, so the sidebar's link can't stand in for it.
// A Read on card waits on the plan before it shows its App Store link, so the
// sweep also waits for any such card to finish before it counts.

const NOTE = '(opens in a new tab)';

async function everyNewTabLinkHasTheNote(page: Page) {
  await expect(page.getByTestId('read-on-pending')).toHaveCount(0);
  const links = page.locator('a[target="_blank"]');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    const href = await link.getAttribute('href');
    await expect(link.locator('.sr-only', { hasText: NOTE }), `link to ${href}`).toHaveCount(1);
  }
}

const PAGES = [
  { path: '/', name: `Apple Podcasts ${NOTE}` },
  { path: '/podcast', name: `Follow on Apple Podcasts ${NOTE}` },
  { path: '/dealers', name: `Visit APMEX ${NOTE}` },
  { path: '/coins/morgan-silver-dollar', name: /\(opens in a new tab\)$/ },
  { path: '/tools/junk-silver', name: /\(opens in a new tab\)$/ },
  { path: '/signal/evening-signal-2026-10-08', name: /\(opens in a new tab\)$/ },
  { path: '/auth?mode=signup', name: `Privacy Policy ${NOTE}` },
  { path: '/calculator?gold=1&silver=100', name: `Post on X ${NOTE}` },
  { path: '/speculation?gold=1&silver=100&goldTarget=10000&silverTarget=250', name: `Post on X ${NOTE}` },
];

for (const { path, name } of PAGES) {
  test(`every new-tab link on ${path} tells a screen reader`, async ({ page }) => {
    await mockBackends(page);
    await page.goto(path);
    await expect(page.locator('main').getByRole('link', { name, exact: typeof name === 'string' }).first()).toBeAttached();
    await everyNewTabLinkHasTheNote(page);
  });
}

test("every new-tab link in Troy's consent sheet tells a screen reader", async ({ page }) => {
  await mockBackends(page);
  await page.goto('/troy');
  await page.getByRole('button', { name: 'What moved metals today?' }).click();
  const consent = page.getByRole('dialog', { name: 'Before you talk to Troy' });
  await expect(consent).toBeVisible();
  await expect(consent.getByRole('link', { name: `Privacy Policy ${NOTE}`, exact: true })).toBeVisible();
  await expect(consent.getByRole('link', { name: `Terms ${NOTE}`, exact: true })).toBeVisible();
  await everyNewTabLinkHasTheNote(page);
});

test('the sidebar App Store link tells a screen reader', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The sidebar only shows on a computer.');
  await mockBackends(page);
  await page.goto('/tools');
  await expect(page.locator('aside').getByRole('link', { name: `Open the App Store ${NOTE}`, exact: true })).toBeVisible();
  await everyNewTabLinkHasTheNote(page);
});
