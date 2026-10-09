import { expect, test, type Page } from '@playwright/test';
import { mockBackends, signIn } from './mock';

// Coin and bar values, gram and karat prices. Split from site.spec.ts so the
// two files' tests don't collide when branches add to them.

const SHOTS = process.env.E2E_SCREENS === '1';

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.png`, fullPage: true });
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Client-side navigation, the way a link inside the app moves, so cached data stays. */
async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test.describe('coin values', () => {
  test('a coin page values one coin and a pile of them at live spot', async ({ page }) => {
    const errors = watchErrors(page);
    await mockBackends(page);
    await page.goto('/coins/morgan-silver-dollar');
    // 0.77344 oz of silver at $60.24
    await expect(page.getByTestId('coin-melt')).toHaveText('$46.59');
    await page.getByRole('button', { name: '20', exact: true }).click();
    await expect(page.getByTestId('coin-total')).toHaveText('$931.84');
    await page.getByLabel('How many').fill('1,000');
    await expect(page.getByTestId('coin-total')).toHaveText('$46,592.03');
    // Coins come whole, and a decimal is read down rather than dropped.
    await page.getByLabel('How many').fill('2.5');
    await expect(page.getByTestId('coin-total')).toHaveText('$93.18');
    await expect(page.getByText('Whole coins only, so this counts 2.')).toBeVisible();
    await expect(page.getByText(/Melt is the floor/)).toBeVisible();
    await expect(page).toHaveTitle('Morgan silver dollar melt value today | TroyStack');
    expect(errors).toEqual([]);
    await shot(page, 'coin-morgan');
  });

  test('adding from a coin page starts the form filled in for that coin', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/coins/american-gold-eagle');
    await page.getByRole('link', { name: 'Add to my stack' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a holding' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/stack$/);
    await expect(dialog.getByRole('tab', { name: 'Gold' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByLabel('Product')).toHaveValue('American Gold Eagle (1 oz)');
    await expect(dialog.getByLabel('Weight of one piece')).toHaveValue('1');
    await dialog.getByRole('button', { name: 'Add to stack' }).click();
    await expect(dialog).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stacktracker_holdings') || '[]'));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ metal: 'gold', type: 'American Gold Eagle (1 oz)', weight: 1 });
    // The next add starts blank again.
    await page.getByRole('button', { name: 'Add a holding' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Add a holding' }).getByLabel('Product')).toHaveValue('');
  });

  test('a coin page fits a 320 pixel screen without scrolling sideways', async ({ page }) => {
    await mockBackends(page);
    await page.setViewportSize({ width: 320, height: 700 });
    for (const path of ['/coins/american-silver-eagle', '/coins', '/prices/gold']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('coin values lists every piece at spot and finds one by name', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/coins');
    await expect(page.getByRole('link', { name: /Morgan silver dollar/ })).toContainText('$46.59');
    const search = page.getByLabel('Find a coin or bar');
    await search.fill('krugerrand');
    await expect(page.getByRole('link', { name: /South African Krugerrand/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Morgan silver dollar/ })).toHaveCount(0);
    await search.fill('zzz');
    await expect(page.getByText('Nothing by that name')).toBeVisible();
  });

  test('the melt calculator and junk silver tool lead to each coin', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/tools/melt');
    await page.getByLabel('Coin or bar').selectOption('south-african-krugerrand');
    await page.getByRole('link', { name: /Weight, purity and what to know/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('South African Krugerrand');
    await goInApp(page, '/tools/junk-silver');
    await page.getByRole('link', { name: 'Mercury dime', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mercury dime');
  });

  test('price pages show a gram, a kilo and karat gold at spot', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/prices/gold');
    const byWeight = page.getByRole('definition').filter({ hasText: '$134.42' });
    await expect(byWeight.first()).toBeVisible();
    const karat = page.getByRole('group', { name: 'By purity, per gram' });
    await expect(karat.getByText('14 karat', { exact: true })).toBeVisible();
    await expect(karat.getByText('$78.41')).toBeVisible();
    await expect(page.getByRole('group', { name: 'By weight' }).getByText('$134,415.84')).toBeVisible();
    await expect(page).toHaveTitle('Gold price today per ounce, gram and karat | TroyStack');
  });

  test('the melt calculator prices karat gold by weight', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/tools/melt');
    await page.getByLabel('Coin or bar').selectOption('custom');
    await page.getByLabel('Weight', { exact: true }).fill('10');
    await page.getByRole('combobox', { name: 'Unit' }).selectOption('g');
    await page.getByRole('button', { name: '14k' }).click();
    await expect(page.getByLabel('Purity %')).toHaveValue('58.33');
    // 10 grams of 14 karat gold at $4,180.80 an ounce
    await expect(page.getByText('$784.05').first()).toBeVisible();
  });

  test('a coin page arrives with its own title and facts before any script runs', async ({ request }) => {
    const html = await (await request.get('/coins/mercury-dime.html')).text();
    expect(html).toContain('<title>Mercury dime melt value today | TroyStack</title>');
    expect(html).toContain('<link rel="canonical" href="https://troystack.ai/coins/mercury-dime" />');
    expect(html).toContain('<noscript><h1>Mercury dime</h1>');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('<loc>https://troystack.ai/coins/mercury-dime</loc>');
  });
});

test('the count on a coin page starts at one on the next coin', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/coins/morgan-silver-dollar');
  await page.getByLabel('How many').fill('20');
  await page.getByRole('link', { name: /Peace silver dollar/ }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Peace silver dollar');
  await expect(page.getByLabel('How many')).toHaveValue('1');
});

test("a coin's add form that loads late doesn't reopen after the form was used by hand", async ({ page }) => {
  await signIn(page);
  const api = await mockBackends(page);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route(/\/assets\/coins-[^/]+\.js$/, async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/stack?add=1&coin=morgan-silver-dollar');
  await page.getByRole('button', { name: 'Add a holding' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a holding' });
  await dialog.getByLabel('Product').fill('Morgan dollar');
  await dialog.getByLabel('Weight of one piece').fill('0.7734');
  await dialog.getByRole('button', { name: 'Add to stack' }).click();
  await expect(dialog).toBeHidden();
  release();
  await page.waitForTimeout(800);
  await expect(dialog).toBeHidden();
  expect(api.inserts.length).toBe(1);
});
