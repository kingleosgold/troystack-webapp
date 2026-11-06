import { expect, test } from '@playwright/test';
import { mockBackends, signIn, USER_ID } from './mock';

// A weight is kept exactly as it came, and shown rounded, so saving an edit
// to anything else never changes it. And each page has one address.

// A gram of .9999 gold, in troy ounces, more exactly than the form shows it.
const GRAM_BAR_OZT = 0.0321475315;

function row(id: string, unit: 'oz' | 'g') {
  return {
    id,
    user_id: USER_ID,
    metal: 'gold',
    type: unit === 'g' ? 'Gram bar, entered in grams' : 'Gram bar, entered in ounces',
    weight: GRAM_BAR_OZT,
    weight_unit: unit,
    quantity: 100,
    purchase_price: 140,
    purchase_date: '2026-09-01',
    notes: null,
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
  };
}

test("editing a holding's price leaves its weight exactly as the account has it, in ounces or grams", async ({ page }) => {
  await signIn(page);
  const mock = await mockBackends(page, { holdings: [row('w-oz', 'oz'), row('w-g', 'g')], liveRows: true });
  await page.goto('/stack');
  for (const [i, name] of ['Gram bar, entered in ounces', 'Gram bar, entered in grams'].entries()) {
    await page.getByRole('button', { name: new RegExp(name) }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit holding' });
    // The field shows it rounded.
    await expect(dialog.getByLabel('Weight of one piece')).toHaveValue(i === 0 ? '0.03215' : '0.9999');
    await dialog.getByLabel('Price per piece').fill('150');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => mock.patches.length).toBe(i + 1);
    expect(mock.patches[i].body.weight, name).toBe(GRAM_BAR_OZT);
    expect(mock.patches[i].body.purchase_price, name).toBe(150);
  }
});

test("a changed weight is saved as entered", async ({ page }) => {
  await signIn(page);
  const mock = await mockBackends(page, { holdings: [row('w-oz', 'oz')], liveRows: true });
  await page.goto('/stack');
  await page.getByRole('button', { name: /Gram bar, entered in ounces/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Edit holding' });
  await dialog.getByLabel('Weight of one piece').fill('0.5');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => mock.patches.length).toBe(1);
  expect(mock.patches[0].body.weight).toBe(0.5);
});

test("editing a holding in this browser's own stack leaves its weight exactly as it was", async ({ page }) => {
  await page.addInitScript((ozt) => {
    if (sessionStorage.getItem('e2e_seeded')) return;
    sessionStorage.setItem('e2e_seeded', '1');
    localStorage.setItem(
      'stacktracker_holdings',
      JSON.stringify([{ id: 'g1', metal: 'gold', type: 'Gram bar', weight: ozt, weightUnit: 'g', quantity: 100, purchasePrice: 140, purchaseDate: '2026-09-01', createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' }]),
    );
  }, GRAM_BAR_OZT);
  await mockBackends(page);
  await page.goto('/stack');
  await page.getByRole('button', { name: /Gram bar/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Edit holding' });
  await dialog.getByLabel('Price per piece').fill('150');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stacktracker_holdings') || '[]'));
  expect(saved[0].weight).toBe(GRAM_BAR_OZT);
  expect(saved[0].purchasePrice).toBe(150);
});

test('the gold price page has one address, in the page as served, in the app and in the sitemap', async ({ page, request }) => {
  const served = await (await request.get('/prices.html')).text();
  expect(served).toContain('<link rel="canonical" href="https://troystack.com/prices/gold" />');
  expect(served).toContain('<meta property="og:url" content="https://troystack.com/prices/gold" />');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('<loc>https://troystack.com/prices/gold</loc>');
  expect(sitemap).not.toContain('<loc>https://troystack.com/prices</loc>');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(new Set(locs).size).toBe(locs.length);

  await mockBackends(page);
  await page.goto('/prices');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://troystack.com/prices/gold');
});

test("a Signal piece opened by a differently cased link takes the API's slug as its address", async ({ page }) => {
  await mockBackends(page);
  await page.goto('/signal/Evening-Signal-2026-10-08');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://troystack.com/signal/evening-signal-2026-10-08');
});

test("the not-found page as served doesn't share as the home page or name a canonical address", async ({ request }) => {
  const served = await (await request.get('/404.html')).text();
  expect(served).not.toContain('rel="canonical"');
  expect(served).not.toContain('property="og:url"');
  expect(served).toContain('<meta property="og:title" content="Page not found | TroyStack" />');
  expect(served).toContain('<meta name="twitter:title" content="Page not found | TroyStack" />');
  expect(served).toContain('<meta property="og:description" content="That page is not on TroyStack." />');
  expect(served).toContain('<meta name="twitter:description" content="That page is not on TroyStack." />');
});
