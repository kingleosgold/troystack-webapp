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


/** Client-side navigation, the way a link inside the app moves, so cached data stays. */
async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

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

test('pages fit a small phone without scrolling sideways', async ({ page }) => {
  await mockBackends(page);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ['/', '/prices/gold', '/signal', '/tools/melt', '/tools/what-if', '/troy', '/stack', '/app', '/developers']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("platinum's long-run chart starts where its real prices do", async ({ page }) => {
  await mockBackends(page);
  await page.goto('/prices/platinum');
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByText('Platinum prices on TroyStack go back to March 2025.')).toBeVisible();
  // The API repeats the first recorded price back to 1915, and none of those repeats is drawn.
  await expect(page.getByText('since March 2025')).toBeVisible();
  await expect(page.getByText('over the full history')).toHaveCount(0);
  await page.getByRole('tab', { name: '1Y' }).click();
  await expect(page.getByText(/prices on TroyStack go back to/)).toHaveCount(0);
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

test('a troystack.com trial link goes from sign-in straight to checkout, tagged with where it came from', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  const checkout = page.waitForRequest((r) => r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST');
  await page.goto('/auth?mode=signup&redirect=checkout&plan=monthly&campaign=site-pricing');
  const req = await checkout;
  const body = req.postDataJSON();
  expect(body.campaign).toBe('site-pricing');
  expect(body.price_id).toBe('price_e2e_monthly');
  expect(req.headers()['authorization']).toMatch(/^Bearer /);
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

  test("clearing a visitor's stack empties it on every page", async ({ page }) => {
    await mockBackends(page);
    await page.goto('/stack?add=1');
    const dialog = page.getByRole('dialog', { name: 'Add a holding' });
    await dialog.getByLabel('Product').fill('American Silver Eagle');
    await dialog.getByRole('button', { name: 'Add to stack' }).click();
    await expect(dialog).toBeHidden();
    // Moving inside the app keeps the cached stack, which is what has to go.
    await goInApp(page, '/settings');
    await expect(page.getByText('1 holding, as CSV')).toBeVisible();
    await page.getByText("Clear this browser's stack").click();
    await page.getByRole('dialog', { name: "Clear this browser's stack?" }).getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('Nothing to download yet')).toBeVisible();
    await goInApp(page, '/stack');
    await expect(page.getByText('American Silver Eagle')).toHaveCount(0);
  });

  test('clearing the purchase date drops the spot looked up for it', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/stack?add=1');
    const dialog = page.getByRole('dialog', { name: 'Add a holding' });
    await dialog.getByLabel('Product').fill('American Silver Eagle');
    await dialog.getByLabel('Price per piece').fill('50');
    await expect(dialog.getByText(/spot that day was \$47\.20/)).toBeVisible();
    await dialog.getByLabel('Purchase date').fill('');
    await expect(dialog.getByText(/spot that day was/)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Add to stack' }).click();
    await expect(dialog).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stacktracker_holdings') || '[]'));
    expect(saved).toHaveLength(1);
    expect(saved[0].purchaseDate).toBe('');
    expect(saved[0].spotAtPurchase).toBeUndefined();
    expect(saved[0].premium).toBeUndefined();
  });

  test('a spreadsheet import that fails adds nothing, and trying again adds each row once', async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page, { failInserts: 1 });
    await page.goto('/stack');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'my-stack.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Product,Metal,Oz per piece,Quantity,Price per piece,Note\nAmerican Silver Eagle,silver,1,20,38,"Tube one,\nfrom the show"\nGold Maple Leaf,gold,1,1,4050,\n'),
    });
    const sheet = page.getByRole('dialog', { name: 'Add from my-stack.csv' });
    await sheet.getByRole('button', { name: 'Add 2 to my stack' }).click();
    await expect(sheet.getByText("That didn't save, so nothing was added. Try again.")).toBeVisible();
    await sheet.getByRole('button', { name: 'Add 2 to my stack' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Gold Maple Leaf').first()).toBeVisible();
    // One insert per attempt, each carrying both rows, so the retry can't double anything.
    expect(mock.inserts).toHaveLength(2);
    for (const body of mock.inserts) expect(Array.isArray(body) ? body.length : 0).toBe(2);
    const eagle = (mock.inserts[1] as Array<{ type: string; notes: string }>).find((r) => r.type === 'American Silver Eagle');
    expect(JSON.parse(eagle!.notes).note).toBe('Tube one,\nfrom the show');
  });

  test('a holding added while the connection is down waits in the browser, then reaches the account', async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page);
    await page.goto('/stack');
    await expect(page.getByText('Nothing in your stack yet')).toBeVisible();
    mock.setConnection(false);
    await page.getByRole('button', { name: 'Add a holding' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add a holding' });
    await dialog.getByLabel('Product').fill('American Silver Eagle');
    await dialog.getByLabel('Quantity').fill('20');
    await dialog.getByRole('button', { name: 'Add to stack' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('American Silver Eagle').first()).toBeVisible();
    await expect(page.getByText("One change is saved in this browser and will reach your account when you're back online.")).toBeVisible();
    expect(mock.inserts).toHaveLength(1);

    mock.setConnection(true);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText(/saved in this browser and will reach your account/)).toHaveCount(0);
    expect(mock.inserts).toHaveLength(2);
    const [first, second] = mock.inserts as Array<{ id: string; type: string }>;
    expect(second.type).toBe('American Silver Eagle');
    expect(second.id, 'the same row is sent again, so it can never land twice').toBe(first.id);
  });

  test('a signed-in stack records its daily snapshot even when storage is blocked', async ({ page }) => {
    await signIn(page);
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (String(key).startsWith('troystack_snapshot_')) throw new DOMException('blocked', 'SecurityError');
        return get.call(this, key);
      };
    });
    const mock = await mockBackends(page, { holdings: SAMPLE_HOLDINGS });
    await page.goto('/stack');
    await expect(page.getByText('American Silver Eagle').first()).toBeVisible();
    await expect.poll(() => mock.calls.filter((c) => c === 'POST /v1/snapshots').length).toBe(1);
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

test('back from checkout, Gold shows right away', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  await page.goto('/settings?session_id=cs_test_e2e');
  await expect(page.getByText(/Gold is on/)).toBeVisible();
  await expect(page.getByText('Gold, free week')).toBeVisible();
  await expect(page).not.toHaveURL(/session_id/);
});

test('someone who had Gold before is welcomed back without a free week', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { verifyStatus: 'active' });
  await page.goto('/settings?session_id=cs_test_e2e');
  await expect(page.getByText('Gold is on. Thanks for coming back.')).toBeVisible();
  await expect(page.getByText(/free week has started/)).toHaveCount(0);
});

test("a plan refresh that can't reach the API says so", async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { failSync: true });
  await page.goto('/settings');
  await page.getByRole('button', { name: /Refresh my plan/ }).click();
  await expect(page.getByText("Your plan couldn't be checked just now. Try again in a minute.")).toBeVisible();
  await expect(page.getByText('Your plan is up to date.')).toHaveCount(0);
});

test('typing in the email and password sheet keeps the cursor in the field', async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: /Email and password/ }).click();
  const email = page.getByLabel('New email');
  await email.click();
  await page.keyboard.type('new@example.com', { delay: 20 });
  await expect(email).toHaveValue('new@example.com');
  await expect(email).toBeFocused();
});

test("a page saved before checkout doesn't take over the return from Stripe", async ({ page }) => {
  await signIn(page);
  await page.addInitScript(() => localStorage.setItem('stg_auth_next', JSON.stringify({ path: '/troy', at: Date.now() })));
  await mockBackends(page);
  await page.goto('/settings?session_id=cs_test_e2e');
  await expect(page.getByText(/Gold is on/)).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
});

test('a free account at its daily limit is told so, and no empty chat is left behind', async ({ page }) => {
  await signIn(page);
  const mock = await mockBackends(page, { chatLimitReached: true });
  await page.goto('/troy');
  await page.getByRole('textbox').fill('What moved silver today?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/That's today's 3 free questions/)).toBeVisible();
  await expect.poll(() => mock.calls.filter((c) => c === 'DELETE /v1/troy/conversations/conv-new').length).toBe(1);
  await expect(page).toHaveURL(/\/troy$/);
});

/** Opens the chat list, which sits behind a button on a phone. */
async function openChatList(page: Page) {
  const toggle = page.getByRole('button', { name: 'Your chats' });
  if (await toggle.isVisible()) await toggle.click();
}

test("a saved chat can't be written to until it has loaded", async ({ page }) => {
  await signIn(page);
  const api = await mockBackends(page, { conversations: 2, holdChatLoads: true });
  await page.goto('/troy/c/conv-0');
  await expect(page.getByText('Loading this chat', { exact: true })).toBeVisible();
  const box = page.getByRole('textbox', { name: 'Message Troy' });
  await expect(box).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gold/silver ratio', exact: true })).toHaveCount(0);
  api.releaseChatLoads();
  await expect(page.getByText('Saved answer for conv-0.')).toBeVisible();
  await expect(box).toBeEnabled();
  await box.fill('And platinum?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Your stack is worth')).toBeVisible();
  await expect(page.getByText('And platinum?')).toBeVisible();
  await expect(page.getByText('Saved answer for conv-0.')).toBeVisible();
});

test('a chat started here is loaded again after visiting another one', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { conversations: 2 });
  await page.goto('/troy');
  await page.getByRole('textbox').fill('How is my stack doing?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Your stack is worth/).first()).toBeVisible();
  await expect(page).toHaveURL(/\/troy\/c\/conv-new$/);

  await openChatList(page);
  await page.locator('li').getByRole('button', { name: 'Silver ratio', exact: true }).filter({ visible: true }).click();
  await expect(page.getByText('Saved answer for conv-0.')).toBeVisible();
  await expect(page.getByText('How is my stack doing?')).toHaveCount(0);

  await openChatList(page);
  await page.locator('li').getByRole('button', { name: 'New chat', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/troy\/c\/conv-new$/);
  await expect(page.getByText('How is my stack doing?')).toBeVisible();
  await expect(page.getByText('Saved answer for conv-0.')).toHaveCount(0);
});

test("a chat whose delete doesn't go through stays put and says so", async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { conversations: 2, tier: 'gold', failDeletes: true });
  await page.goto('/troy/c/conv-0');
  await expect(page.getByText('Saved answer for conv-0.')).toBeVisible();
  await openChatList(page);
  await page.getByRole('button', { name: 'Delete Silver ratio' }).filter({ visible: true }).click();
  await expect(page.getByText("That chat couldn't be deleted. Check your connection and try again.")).toBeVisible();
  await expect(page).toHaveURL(/\/troy\/c\/conv-0$/);
  await expect(page.getByText('Saved answer for conv-0.')).toBeVisible();
  // The list is still open on a phone and always shown on a computer.
  await expect(page.locator('li').getByRole('button', { name: 'Silver ratio', exact: true }).filter({ visible: true })).toBeVisible();
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

test('starting one copy of an episode stops the other copy on the page', async ({ page }) => {
  // Audio can't load offline, so playing and pausing are stood in for.
  await page.addInitScript(() => {
    const playing = new WeakSet<HTMLMediaElement>();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return !playing.has(this);
      },
    });
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      playing.add(this);
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      if (!playing.has(this)) return;
      playing.delete(this);
      this.dispatchEvent(new Event('pause'));
    };
  });
  await mockBackends(page);
  await page.goto('/');
  const plays = page.getByRole('button', { name: /^Play / });
  await expect(plays).toHaveCount(2);
  await plays.nth(0).click();
  await expect(page.getByRole('button', { name: /^Pause / })).toHaveCount(1);
  await page.getByRole('button', { name: /^Play / }).first().click();
  await expect(page.getByRole('button', { name: /^Pause / })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(1);
});

// A tiny PNG, enough for the photo picker.
const PHOTO = { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') };

test('a free account\'s receipt scan is counted before it runs', async ({ page }) => {
  await signIn(page);
  const api = await mockBackends(page);
  await page.goto('/troy');
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(PHOTO);
  await expect(page.getByText('1 oz Silver Eagle')).toBeVisible();
  const count = api.calls.indexOf('POST /v1/increment-scan');
  const scan = api.calls.indexOf('POST /v1/scan-receipt');
  expect(count).toBeGreaterThanOrEqual(0);
  expect(scan).toBeGreaterThan(count);
});

test("a receipt scan that can't be counted doesn't run", async ({ page }) => {
  await signIn(page);
  const api = await mockBackends(page, { failScanCount: true });
  await page.goto('/troy');
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(PHOTO);
  await expect(page.getByText("Receipt scans aren't available right now. Try again in a moment.")).toBeVisible();
  expect(api.calls).not.toContain('POST /v1/scan-receipt');
});

test('a lifetime account can still reach billing and receipts', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { tier: 'lifetime' });
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: /Billing and receipts/ })).toBeVisible();
  await expect(page.getByText('Change plan or cancel')).toHaveCount(0);
});
