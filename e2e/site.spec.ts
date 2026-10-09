import { expect, test, type Page } from '@playwright/test';
import { mockBackends, SAMPLE_HOLDINGS, signIn } from './mock';

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

/** The house style has no long dashes anywhere on the page. */
async function expectNoLongDashes(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text, 'page text has an em dash').not.toContain('\u2014');
}

const PAGES: Array<[string, string | RegExp]> = [
  ['/', /Gold and silver today/i],
  ['/prices/silver', /Silver spot price/],
  ['/signal', /Metals news, with Troy's read/],
  ['/signal/evening-signal-2026-10-08', /The Stack Signal, October 8, 2026/],
  ['/podcast', /The Stack Signal/],
  ['/vault', /Vault/i],
  ['/tools', /Calculators for stackers/],
  ['/tools/melt', /Melt value/i],
  ['/tools/junk-silver', /Junk silver/i],
  ['/tools/what-if', /What if/i],
  ['/tools/stacking-history', /Stacking history/i],
  ['/tools/ratio', /ratio/i],
  ['/dealers', /Buying gold and silver online/],
  ['/app', /Your stack and Troy/],
  ['/stack', /stack/i],
  ['/settings', /Settings/],
  ['/auth', /Sign in to TroyStack/],
  ['/developers', /TroyStack API/],
  ['/nope', /That page isn't here/],
];

test.describe('every page', () => {
  for (const [path, heading] of PAGES) {
    test(`renders ${path}`, async ({ page }) => {
      const errors = watchErrors(page);
      await mockBackends(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(heading, { timeout: 15_000 });
      await page.waitForLoadState('networkidle');
      await expectNoLongDashes(page);
      expect(errors).toEqual([]);
      await shot(page, path === '/' ? 'home' : path.slice(1).replace(/\//g, '_'));
    });
  }
});

test('home shows live prices and Troy\'s read', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/');
  await expect(page.getByText('$4,180.80').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/PBOC's record physical buying/).filter({ visible: true }).first()).toBeVisible();
});

test('signal hides one-liners that were cut off', async ({ page }) => {
  await mockBackends(page);
  await page.goto('/signal');
  await expect(page.getByText("Gold's Resilience Tested by Fluctuating Yields").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/^Gold shines as$/)).toHaveCount(0);
});

test.describe('Troy for visitors', () => {
  test('answers three questions, then offers an account and the free week', async ({ page }) => {
    await mockBackends(page, { visitorQuota: { questionsUsed: 2, questionsLimit: 3, resetsAt: new Date(Date.now() + 6 * 3600_000).toISOString() } });
    await page.goto('/troy');
    await expect(page.getByText('1 of 3 free questions left today')).toBeVisible();
    await page.getByRole('button', { name: 'What moved metals today?' }).click();
    await expect(page.getByRole('dialog', { name: 'Before you talk to Troy' })).toBeVisible();
    await page.getByRole('button', { name: 'I understand' }).click();
    await expect(page.getByText(/The move came after the Fed minutes/)).toBeVisible();
    await shot(page, 'troy-answer');

    await page.getByRole('textbox').fill('And platinum?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/That's today's 3 free questions/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a free account' })).toBeVisible();
    await expectNoLongDashes(page);
    await shot(page, 'troy-limit');
  });

  test('asks visitors to sign in when the visitor route is not live', async ({ page }) => {
    await mockBackends(page, { visitorQuota: null });
    await page.goto('/troy');
    await expect(page.getByText('Sign in to ask Troy')).toBeVisible();
  });

  test('a question from another page is asked on arrival', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('troy_ai_consent_v1', '{"version":1}'));
    await mockBackends(page);
    await page.goto('/troy?q=What%20is%20junk%20silver%20worth');
    await expect(page.getByText('What is junk silver worth')).toBeVisible();
    await expect(page.getByText(/The move came after the Fed minutes/)).toBeVisible();
  });
});

test.describe('free week', () => {
  test('starts on the web on a computer, or in the App Store on an iPhone', async ({ page }, info) => {
    await mockBackends(page);
    await page.goto('/settings');
    await page.getByText('Try Gold free for a week').first().click();
    const sheet = page.getByRole('dialog', { name: 'Try Gold free for a week' });
    await expect(sheet).toBeVisible();
    if (info.project.name === 'iphone') {
      const store = sheet.getByRole('link', { name: /App Store/ }).first();
      await expect(store).toHaveAttribute('href', /ct=webapp-settings/);
      await shot(page, 'trial-iphone');
    } else {
      await expect(sheet.getByRole('radio', { name: /Yearly/ })).toHaveAttribute('aria-checked', 'true');
      await expect(sheet.getByRole('img', { name: /QR code/ })).toBeVisible();
      await shot(page, 'trial-desktop');
      await sheet.getByRole('button', { name: 'Start my free week' }).click();
      await expect(page).toHaveURL(/\/auth\?redirect=checkout&plan=yearly/);
      await expect(page.getByText(/straight to checkout for your free week/)).toBeVisible();
    }
  });
});

test.describe('stack', () => {
  test('a visitor can add a holding and see it valued at spot', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/stack?add=1');
    const dialog = page.getByRole('dialog', { name: 'Add a holding' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Product').fill('American Silver Eagle');
    await dialog.getByLabel('Quantity').fill('20');
    await dialog.getByLabel('Price per piece').fill('38');
    await dialog.getByRole('button', { name: 'Add to stack' }).click();
    await expect(dialog).toBeHidden();
    // 20 oz at $60.24
    await expect(page.getByText('$1,204.80').filter({ visible: true }).first()).toBeVisible();
    await shot(page, 'stack-guest');
  });

  test('signed in, it shows the same rows the app saved', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { holdings: SAMPLE_HOLDINGS });
    await page.goto('/stack');
    await expect(page.getByText('American Silver Eagle').first()).toBeVisible();
    await expect(page.getByText('Gold Maple Leaf').first()).toBeVisible();
    // 60 oz silver at $60.24 plus 1 oz gold at $4,180.80
    await expect(page.getByText('$7,795.20').filter({ visible: true }).first()).toBeVisible();
    await shot(page, 'stack-signed-in');
  });
});

test('signed-in free accounts see their three newest chats', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { conversations: 5 });
  await page.goto('/troy');
  if (test.info().project.name === 'iphone') await page.getByRole('button', { name: 'Your chats' }).click();
  await expect(page.getByText(/You have 5 chats with Troy/).filter({ visible: true }).first()).toBeVisible();
  await shot(page, 'troy-signed-in');
});

test('light theme holds up', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('stacktracker_theme', 'light'));
  await mockBackends(page);
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.getByText('$4,180.80').filter({ visible: true }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, 'home-light');
});
