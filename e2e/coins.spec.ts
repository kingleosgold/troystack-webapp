import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    // The breadcrumb search results show, Coin and bar values then the coin.
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement.map((i: { name: string; item: string }) => [i.name, i.item])).toEqual([
      ['Coin and bar values', 'https://troystack.ai/coins'],
      ['Mercury dime', 'https://troystack.ai/coins/mercury-dime'],
    ]);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('<loc>https://troystack.ai/coins/mercury-dime</loc>');
  });
});

/** A spec's value on a coin page, by its label. */
const spec = (page: Page, label: string) => page.locator(`dt:text-is("${label}") + dd`);

test.describe('coins struck to different specs over the years', () => {
  test('a Panda from before 2016 is valued at a full ounce, and each era links to the other', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/coins/chinese-silver-panda');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chinese Silver Panda (30 g)');
    // 0.963558 oz of silver at $60.24
    await expect(page.getByTestId('coin-melt')).toHaveText('$58.04');
    await expect(spec(page, 'Years')).toHaveText('2016 to today');
    await page.getByRole('link', { name: 'Chinese Silver Panda (1 oz)' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chinese Silver Panda (1 oz)');
    await expect(page.getByTestId('coin-melt')).toHaveText('$60.24');
    await expect(spec(page, 'Years')).toHaveText('1989 to 2015');
    await expect(page.getByRole('link', { name: 'Chinese Silver Panda (30 g)' })).toBeVisible();

    // Adding it to a stack starts from a full ounce.
    await page.getByRole('link', { name: 'Add to my stack' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a holding' });
    await expect(dialog.getByLabel('Product')).toHaveValue('Chinese Silver Panda (1 oz)');
    await expect(dialog.getByLabel('Weight of one piece')).toHaveValue('1');
  });

  test("Britannias from before 2013 and early Maple Leafs show their own purity, weight and years", async ({ page }) => {
    await mockBackends(page);
    await page.goto('/coins/british-silver-britannia-1997-2012');
    await expect(spec(page, 'Purity')).toHaveText('.958 Britannia silver');
    await expect(spec(page, 'Total weight')).toHaveText('32.45 g');
    await expect(spec(page, 'Years')).toHaveText('1997 to 2012');
    await expect(page.getByTestId('coin-melt')).toHaveText('$60.24');
    await page.goto('/coins/british-silver-britannia');
    await expect(spec(page, 'Purity')).toHaveText('.999 fine');
    await expect(spec(page, 'Years')).toHaveText('2013 to today');
    await expect(page.getByRole('link', { name: 'British Silver Britannia (1997 to 2012)' })).toBeVisible();

    await page.goto('/coins/british-gold-britannia-1987-2012');
    await expect(spec(page, 'Purity')).toHaveText('22 karat (91.67%)');
    await expect(spec(page, 'Total weight')).toHaveText('34.05 g');
    await expect(page.getByTestId('coin-melt')).toHaveText('$4,180.80');
    await page.goto('/coins/british-gold-britannia');
    await expect(spec(page, 'Purity')).toHaveText('.9999 fine');
    await expect(spec(page, 'Years')).toHaveText('2013 to today');

    await page.goto('/coins/canadian-gold-maple-leaf-1979-1982');
    await expect(spec(page, 'Purity')).toHaveText('.999 fine');
    await page.goto('/coins/canadian-gold-maple-leaf');
    await expect(spec(page, 'Years')).toHaveText('late 1982 to today');
  });

  test('the melt calculator offers each era of a coin at its own weight', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/tools/melt');
    const perPiece = spec(page, 'Per piece');
    await page.getByLabel('Coin or bar').selectOption('chinese-gold-panda-1-oz');
    await expect(perPiece).toHaveText('$4,180.80');
    // 0.963558 oz of gold at $4,180.80
    await page.getByLabel('Coin or bar').selectOption('chinese-gold-panda');
    await expect(perPiece).toHaveText('$4,028.44');
  });

  test('each era page arrives with its own title, and the old addresses still answer', async ({ request }) => {
    const older = await (await request.get('/coins/chinese-silver-panda-1-oz.html')).text();
    expect(older).toContain('<title>1 oz Chinese Silver Panda melt value today | TroyStack</title>');
    expect(older).toContain('<noscript><h1>Chinese Silver Panda (1 oz)</h1>');
    const current = await (await request.get('/coins/chinese-silver-panda.html')).text();
    expect(current).toContain('<title>30 g Chinese Silver Panda melt value today | TroyStack</title>');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const slug of ['chinese-silver-panda', 'chinese-silver-panda-1-oz', 'british-gold-britannia-1987-2012', 'canadian-gold-maple-leaf-1979-1982']) {
      expect(sitemap).toContain(`<loc>https://troystack.ai/coins/${slug}</loc>`);
    }
  });
});

const PRICES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'prices.json'), 'utf8')) as { prices: Record<string, unknown> };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' };

/** Answers the prices request with only some metals, and counts the reads. */
async function pricesWithout(page: Page, missing: string[]) {
  let reads = 0;
  const body = { ...PRICES, prices: { ...PRICES.prices } };
  for (const m of missing) delete body.prices[m];
  await page.route('https://api.troystack.ai/v1/prices', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    reads += 1;
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  return () => reads;
}

test.describe('coin values without every price', () => {
  test('the list shows No price for a metal the feed leaves out, says which, and asks again', async ({ page }) => {
    await mockBackends(page);
    const reads = await pricesWithout(page, ['platinum', 'palladium']);
    await page.goto('/coins');
    await expect(page.getByRole('link', { name: /Morgan silver dollar/ })).toContainText('$46.59');
    await expect(page.getByRole('link', { name: /American Platinum Eagle/ })).toContainText('No price');
    await expect(page.getByRole('link', { name: /American Palladium Eagle/ })).toContainText('No price');
    const notice = page.getByText("There's no live platinum or palladium price right now, so values that need it are on hold.");
    await expect(notice).toBeVisible();
    const before = reads();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(reads).toBeGreaterThan(before);
    // Narrowed to silver, there's nothing missing to mention.
    await page.getByLabel('Find a coin or bar').fill('morgan');
    await expect(notice).toHaveCount(0);

    await page.goto('/coins/american-platinum-eagle');
    await expect(page.getByTestId('coin-melt')).toHaveText('No price');
    await expect(page.getByText("There's no live platinum price right now, so values that need it are on hold.")).toBeVisible();
  });

  test("the list calls prices out of date once they haven't updated for a few minutes", async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-09T14:00:00Z') });
    await mockBackends(page);
    await page.goto('/coins');
    await expect(page.getByRole('link', { name: /Morgan silver dollar/ })).toContainText('$46.59');
    // The feed goes down and stays down.
    await page.route('https://api.troystack.ai/v1/prices', (route) => route.fulfill({ status: 503, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"error":"Prices unavailable"}' }));
    await page.clock.fastForward('04:00');
    await expect(page.getByText("Prices haven't updated since 10:00 AM ET, so values that need them are on hold.")).toBeVisible();
    await expect(page.getByRole('link', { name: /Morgan silver dollar/ })).toContainText('No price');
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
