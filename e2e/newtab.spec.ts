import { expect, test } from '@playwright/test';
import { mockBackends } from './mock';

// Every link that opens a new tab says so to a screen reader. A sighted reader
// sees the tab appear, so the note is visually hidden and nothing else moves.

const PAGES = [
  { path: '/', name: 'Apple Podcasts (opens in a new tab)' },
  { path: '/podcast', name: 'Follow on Apple Podcasts (opens in a new tab)' },
  { path: '/dealers', name: null },
  { path: '/coins/morgan-silver-dollar', name: null },
  { path: '/tools/junk-silver', name: null },
  { path: '/signal/evening-signal-2026-10-08', name: null },
  { path: '/auth?mode=signup', name: 'Privacy Policy (opens in a new tab)' },
];

for (const { path, name } of PAGES) {
  test(`every new-tab link on ${path} tells a screen reader`, async ({ page }) => {
    await mockBackends(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    if (name) await expect(page.getByRole('link', { name, exact: true }).first()).toBeAttached();
    const links = page.locator('a[target="_blank"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      const href = await link.getAttribute('href');
      await expect(link.locator('.sr-only', { hasText: '(opens in a new tab)' }), `link to ${href}`).toHaveCount(1);
    }
  });
}
