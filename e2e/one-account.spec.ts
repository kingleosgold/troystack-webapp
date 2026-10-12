import * as XLSX from 'xlsx';
import { expect, test, type Page } from '@playwright/test';
import { holdRequests, mockBackends, SAMPLE_HOLDINGS, signIn, signInElsewhere, signInExpired, signOutElsewhere } from './mock';

// Whatever is started for one account stays with it. When another account
// signs in, here or in another tab, or this one signs out, an answer still on
// its way for the last one is dropped, and forms, sheets and notes about it
// go. A sheet with a save going stays open until the save is done. And prices
// keep the times they were taken.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CSV = { name: 'my-stack.csv', mimeType: 'text/csv', buffer: Buffer.from('Product,Metal,Oz per piece,Quantity\nAmerican Silver Eagle,silver,1,20\n') };
const FREE_WEEK = '/auth?mode=signup&redirect=checkout&plan=monthly&campaign=site-signal';

function workbook(name: string) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Product', 'Metal', 'Oz per piece', 'Quantity'], ['Gold Maple Leaf', 'gold', 1, 2]]), 'Stack');
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer };
}

/** Holds the Excel reader, which loads the first time a workbook is opened. */
async function holdExcelReader(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let asked = 0;
  await page.route(/\/assets\/xlsx-[^/]+\.js$/, async (route) => {
    asked += 1;
    await held;
    await route.fallback();
  });
  return { release, asked: () => asked };
}

/** Stands in for Stripe's pages. */
async function stubStripe(page: Page) {
  await page.route(/^https:\/\/(checkout|billing)\.stripe\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe</h1>' }));
}

/** Opens the Gold sheet from Settings and gets to the plans, by card on an iPhone too. */
async function openGoldSheet(page: Page) {
  await page.goto('/settings');
  await page.getByText('Try Gold free for a week').first().click();
  const sheet = page.getByRole('dialog');
  const start = sheet.getByRole('button', { name: 'Start my free week' });
  const byCard = sheet.getByRole('button', { name: 'Rather start it here with a card?' });
  await expect(start.or(byCard)).toBeVisible();
  if (await byCard.isVisible()) await byCard.click();
  return { sheet, start };
}

/** Opens the chat list, which sits beside the chat on wide screens and behind a button on phones. */
async function openChatList(page: Page) {
  const toggle = page.getByRole('button', { name: 'Your chats' });
  const beside = page.locator('aside').getByRole('button', { name: /^Delete / }).first();
  await expect(toggle.or(beside)).toBeVisible();
  if (await toggle.isVisible()) await toggle.click();
}

const importSheet = (page: Page) => page.getByRole('dialog', { name: /^Add from/ });

test.describe('a receipt scan', () => {
  for (const change of ['another account signs in', 'the account signs out'] as const) {
    test(`is dropped, uncounted, when ${change} while it's being read`, async ({ page }) => {
      await signIn(page);
      const mock = await mockBackends(page);
      const scan = await holdRequests(page, (u) => u.pathname === '/v1/scan-receipt', 'POST');
      await page.goto('/troy');
      await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
      await expect.poll(() => scan.seen.length).toBe(1);

      if (change === 'another account signs in') await signInElsewhere(page);
      else await signOutElsewhere(page);
      scan.release();
      await page.waitForTimeout(800);
      await expect(importSheet(page)).toHaveCount(0);
      await expect(page.getByText('1 oz Silver Eagle')).toHaveCount(0);
      expect(mock.calls.filter((c) => c === 'POST /v1/increment-scan')).toHaveLength(0);
    });
  }

  test("still running when another account signs in, it doesn't hold that account's Troy", async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    const scan = await holdRequests(page, (u) => u.pathname === '/v1/scan-receipt', 'POST');
    await page.goto('/troy');
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
    await expect.poll(() => scan.seen.length).toBe(1);
    await signInElsewhere(page);

    // The new account can ask right away, with the scan still out.
    const box = page.getByRole('textbox', { name: 'Message Troy' });
    await box.fill('How is my stack doing?');
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    const answer = await holdRequests(page, (u) => /^\/v1\/troy\/conversations\/[^/]+\/messages$/.test(u.pathname), 'POST');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect.poll(() => answer.seen.length).toBe(1);

    // The old scan ending doesn't let go of the question the new account is waiting on.
    scan.release();
    await page.waitForTimeout(800);
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    answer.release();
    await expect(page.getByText(/Your stack is worth/)).toBeVisible();
    await expect(importSheet(page)).toHaveCount(0);
  });
});

test.describe('a spreadsheet import', () => {
  test("on the Troy page, rows read for one account never open for another", async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/troy');
    const reader = await holdExcelReader(page);
    await page.locator('input[type="file"][accept=".csv,.xlsx,.xls"]').setInputFiles(workbook('vault.xlsx'));
    await expect.poll(reader.asked).toBe(1);
    await signInElsewhere(page);
    reader.release();
    await page.waitForTimeout(800);
    await expect(importSheet(page)).toHaveCount(0);
  });

  test('on the Troy page, rows waiting to be added go when another account signs in', async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/troy');
    await page.locator('input[type="file"][accept=".csv,.xlsx,.xls"]').setInputFiles(CSV);
    await expect(importSheet(page)).toBeVisible();
    await signInElsewhere(page);
    await expect(importSheet(page)).toHaveCount(0);
  });

  test("on the Troy page, the note about rows added for one account doesn't show once another has signed in", async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page);
    await page.goto('/troy');
    await page.locator('input[type="file"][accept=".csv,.xlsx,.xls"]').setInputFiles(CSV);
    const sheet = importSheet(page);
    mock.holdWrites();
    await sheet.getByRole('button', { name: 'Add 1 to my stack' }).click();
    await expect(sheet.getByText(/Adding these to your stack/)).toBeVisible();
    await signInElsewhere(page);
    mock.releaseWrites();
    await expect.poll(() => mock.inserts.length).toBe(1);
    await page.waitForTimeout(500);
    await expect(page.getByText(/Added 1 item to your stack/)).toHaveCount(0);
  });

  test('picked while sign-in is still loading at startup, rows open for the account it loads', async ({ page }) => {
    await signInExpired(page);
    await mockBackends(page);
    const refresh = await holdRequests(page, (u) => u.pathname === '/auth/v1/token', 'POST');
    await page.goto('/stack');
    await expect.poll(() => refresh.seen.length).toBe(1);
    await page.locator('input[type="file"][accept=".csv,.xlsx,.xls"]').setInputFiles(CSV);
    await page.waitForTimeout(300);
    refresh.release();
    // Once the account has loaded, the rows are offered to it.
    await expect(page.getByText('The same stack you see in the TroyStack app.')).toBeVisible();
    await expect(importSheet(page)).toBeVisible();
    await expect(importSheet(page).getByRole('button', { name: 'Add 1 to my stack' })).toBeVisible();
  });

  test('on the stack page, rows go with the account that picked them, and rows read for one never open for the next', async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/stack');
    await page.locator('input[type="file"][accept=".csv,.xlsx,.xls"]').setInputFiles(CSV);
    await expect(importSheet(page)).toBeVisible();
    await signInElsewhere(page);
    await expect(importSheet(page)).toHaveCount(0);

    const reader = await holdExcelReader(page);
    await page.locator('input[type="file"][accept=".csv,.xlsx,.xls"]').setInputFiles(workbook('vault.xlsx'));
    await expect.poll(reader.asked).toBe(1);
    await signOutElsewhere(page);
    reader.release();
    await page.waitForTimeout(800);
    await expect(importSheet(page)).toHaveCount(0);
  });
});

test.describe('the holding editor', () => {
  test('stays open while an add saves, whatever tries to close it, and adds one holding', async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page, { liveRows: true });
    await page.goto('/stack?add=1');
    const dialog = page.getByRole('dialog', { name: 'Add a holding' });
    await dialog.getByLabel('Product').fill('Gold Maple Leaf');
    mock.holdWrites();
    await dialog.getByRole('button', { name: 'Add to stack' }).click();
    await expect(dialog.getByRole('button', { name: 'Saving' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    mock.releaseWrites();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Gold Maple Leaf').first()).toBeVisible();
    expect(mock.inserts).toHaveLength(1);
  });

  test('stays open while a delete goes through', async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page, { holdings: SAMPLE_HOLDINGS, liveRows: true });
    await page.goto('/stack');
    await page.getByRole('button', { name: /Gold Maple Leaf/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit holding' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    mock.holdWrites();
    await dialog.getByRole('button', { name: 'Delete it' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep' })).toBeDisabled();
    mock.releaseWrites();
    await expect(dialog).toBeHidden();
    expect(mock.patches).toHaveLength(1);
  });

  test('goes when another account signs in, with the holding it had open', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { holdings: SAMPLE_HOLDINGS });
    await page.goto('/stack');
    await page.getByRole('button', { name: /Gold Maple Leaf/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit holding' });
    await expect(dialog).toBeVisible();
    await signInElsewhere(page);
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('Settings', () => {
  test('a note about one account goes when another signs in', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { billingPortal: true });
    await page.goto('/settings?checkout=payment-issue');
    await expect(page.getByRole('button', { name: 'Update your card' })).toBeVisible();
    await signInElsewhere(page);
    await expect(page.getByText(/Your last Gold payment didn't go through/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update your card' })).toHaveCount(0);
  });

  test("a checkout's confirmation that lands after another account signed in isn't shown to it", async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    const verify = await holdRequests(page, (u) => u.pathname === '/v1/stripe/verify-session', 'POST');
    await page.goto('/settings?session_id=cs_test_e2e');
    await expect.poll(() => verify.seen.length).toBe(1);
    await signInElsewhere(page);
    verify.release();
    await page.waitForTimeout(800);
    await expect(page.getByText(/Gold is on|confirming your payment/)).toHaveCount(0);
  });

  test("a plan check that lands after another account signed in isn't shown to it", async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/settings');
    await expect(page.getByText('Refresh my plan')).toBeVisible();
    await expect(page.getByText('Try Gold free for a week')).toBeVisible();
    const sync = await holdRequests(page, (u) => u.pathname === '/v1/sync-subscription');
    await page.getByText('Refresh my plan').click();
    await expect.poll(() => sync.seen.length).toBe(1);
    await signInElsewhere(page);
    sync.release();
    await page.waitForTimeout(800);
    await expect(page.getByText(/Your plan is up to date|couldn't be checked/)).toHaveCount(0);
  });

  test("the billing page for one account doesn't open once another has signed in", async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { tier: 'gold', billingPortal: true });
    await stubStripe(page);
    await page.goto('/settings');
    const portal = await holdRequests(page, (u) => u.pathname === '/v1/stripe/customer-portal', 'POST');
    await page.getByText('Change plan or cancel').click();
    await expect.poll(() => portal.seen.length).toBe(1);
    await signInElsewhere(page);
    portal.release();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/settings/);
  });

  test('changing the email or password stays open while it saves, and goes when another account signs in', async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/settings');
    await page.getByText('Email and password').click();
    const sheet = page.getByRole('dialog', { name: /email (or|and) (a )?password/i });
    await sheet.getByLabel('New password').fill('a longer password');
    const save = await holdRequests(page, (u) => u.pathname === '/auth/v1/user', 'PUT');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => save.seen.length).toBe(1);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    save.release();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Your password is updated.')).toBeVisible();

    await page.getByText('Email and password').click();
    await expect(sheet).toBeVisible();
    await signInElsewhere(page);
    await expect(sheet).toHaveCount(0);
  });
});

test.describe('checkout', () => {
  test("from the Gold sheet, a checkout still opening when the sheet closes doesn't take the page to Stripe", async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await stubStripe(page);
    const { sheet, start } = await openGoldSheet(page);
    const checkout = await holdRequests(page, (u) => u.pathname === '/v1/stripe/create-checkout-session', 'POST');
    await start.click();
    await expect.poll(() => checkout.seen.length).toBe(1);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    checkout.release();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/settings/);
  });

  test("from the Gold sheet, a checkout still opening when another account signs in doesn't take the page to Stripe", async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await stubStripe(page);
    const { start } = await openGoldSheet(page);
    const checkout = await holdRequests(page, (u) => u.pathname === '/v1/stripe/create-checkout-session', 'POST');
    await start.click();
    await expect.poll(() => checkout.seen.length).toBe(1);
    await signInElsewhere(page);
    checkout.release();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/settings/);
  });

  test("after sign-in, a checkout still opening when another account signs in doesn't take the page to Stripe", async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await stubStripe(page);
    const checkout = await holdRequests(page, (u) => u.pathname === '/v1/stripe/create-checkout-session', 'POST');
    await page.goto(FREE_WEEK);
    await expect.poll(() => checkout.seen.length).toBe(1);
    await signInElsewhere(page);
    checkout.release();
    await page.waitForTimeout(800);
    await expect(page).not.toHaveURL(/stripe\.com/);
    await expect(page.getByRole('status').filter({ hasText: /Opening checkout|already opening/ })).toHaveCount(0);
  });

  test("the Gold sheet's billing page for a payment that didn't go through doesn't open once the sheet closes", async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['payment_issue'], billingPortal: true });
    await stubStripe(page);
    const { start } = await openGoldSheet(page);
    await start.click();
    const sheet = page.getByRole('dialog', { name: "Your last Gold payment didn't go through" });
    await expect(sheet).toBeVisible();
    const portal = await holdRequests(page, (u) => u.pathname === '/v1/stripe/customer-portal', 'POST');
    await sheet.getByRole('button', { name: 'Update your card' }).click();
    await expect.poll(() => portal.seen.length).toBe(1);
    await sheet.getByRole('button', { name: 'Close' }).click();
    portal.release();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/settings/);
  });
});

test.describe('API keys', () => {
  test("a new key made for one account isn't shown once another has signed in", async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/developers/keys');
    await expect(page.getByText('…a1b2')).toBeVisible();
    const generate = await holdRequests(page, (u) => u.pathname === '/v1/api-keys/generate', 'POST');
    await page.getByRole('button', { name: 'New key' }).click();
    await expect.poll(() => generate.seen.length).toBe(1);
    await signInElsewhere(page);
    generate.release();
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog', { name: 'Your new API key' })).toHaveCount(0);
    await expect(page.getByText('tsk_e2e_new_secret_key')).toHaveCount(0);
  });

  test('the revoke sheet stays open while the key is revoked, and goes when another account signs in', async ({ page }) => {
    await signIn(page);
    await mockBackends(page);
    await page.goto('/developers/keys');
    await page.getByRole('button', { name: 'Revoke' }).click();
    const sheet = page.getByRole('dialog', { name: 'Revoke this key?' });
    const revoke = await holdRequests(page, (u) => u.pathname.startsWith('/v1/api-keys/key-'), 'DELETE');
    await sheet.getByRole('button', { name: 'Revoke' }).click();
    await expect.poll(() => revoke.seen.length).toBe(1);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(sheet).toBeVisible();
    revoke.release();
    await expect(sheet).toBeHidden();

    // Read the list again, so there's a key to open the sheet for.
    await page.reload();
    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(sheet).toBeVisible();
    await signInElsewhere(page);
    await expect(sheet).toHaveCount(0);
  });
});

test("a password reset page that opened with nobody signed in never takes on an account that signs in later", async ({ page }) => {
  await mockBackends(page);
  await page.goto('/reset-password');
  await expect(page.getByText(/That reset link has expired or was already used/)).toBeVisible();
  await signInElsewhere(page);
  await page.waitForTimeout(300);
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/That reset link has expired or was already used/)).toBeVisible();
});

test("a password reset link's form goes when another account signs in, rather than change that account's password", async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  await page.goto('/reset-password');
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await signInElsewhere(page);
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Another account signed in on this browser/)).toBeVisible();
});

test.describe('Troy', () => {
  test("a spoken answer still loading when another account signs in isn't played", async ({ page }) => {
    await signIn(page);
    await page.addInitScript(() => {
      const w = window as unknown as { plays: number };
      w.plays = 0;
      HTMLMediaElement.prototype.play = function play() {
        w.plays += 1;
        return Promise.resolve();
      };
    });
    await mockBackends(page, { tier: 'gold', conversations: 2 });
    await page.goto('/troy/c/conv-1');
    await expect(page.getByText('Saved answer for conv-1.')).toBeVisible();
    const speech = await holdRequests(page, (u) => u.pathname === '/v1/troy/speak', 'POST');
    await page.getByRole('button', { name: 'Listen' }).first().click();
    await expect.poll(() => speech.seen.length).toBe(1);
    await signInElsewhere(page);
    speech.release();
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as unknown as { plays: number }).plays)).toBe(0);
  });

  test("a visitor's answer still on its way when an account signs in doesn't land in that account's chat", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('troy_ai_consent_v1', '{"version":1}'));
    await mockBackends(page);
    await page.goto('/troy');
    const ask = await holdRequests(page, (u) => u.pathname === '/v1/troy/ask', 'POST');
    await page.getByRole('textbox', { name: 'Message Troy' }).fill('What moved silver today?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect.poll(() => ask.seen.length).toBe(1);
    await signInElsewhere(page);
    ask.release();
    await page.waitForTimeout(800);
    await expect(page.getByText(/The move came after the Fed minutes/)).toHaveCount(0);
  });

  test("a chat delete that fails after another account signed in says nothing to that account", async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { tier: 'gold', conversations: 2, failDeletes: true });
    await page.goto('/troy');
    await openChatList(page);
    const del = await holdRequests(page, (u) => u.pathname === '/v1/troy/conversations/conv-0', 'DELETE');
    await page.locator('aside, [role="dialog"]').getByRole('button', { name: 'Delete Silver ratio' }).filter({ visible: true }).click();
    await expect.poll(() => del.seen.length).toBe(1);
    await signInElsewhere(page);
    del.release();
    await page.waitForTimeout(800);
    await expect(page.getByText(/That chat couldn't be deleted/)).toHaveCount(0);
  });

  test("a visitor's daily limit doesn't carry into an account that signs in", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('troy_ai_consent_v1', '{"version":1}'));
    await mockBackends(page, { visitorUsedElsewhere: true });
    await page.goto('/troy');
    const box = page.getByRole('textbox', { name: 'Message Troy' });
    await box.fill('What moved silver today?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText("That's today's 3 free questions.")).toBeVisible();
    await expect(box).toBeDisabled();

    await signInElsewhere(page);
    await expect(page.getByText("That's today's 3 free questions.")).toHaveCount(0);
    await expect(box).toBeEnabled();
  });

  test('a question waiting on consent goes when another account signs in', async ({ page }) => {
    await signIn(page);
    await page.addInitScript(() => localStorage.removeItem('troy_ai_consent_v1'));
    await mockBackends(page);
    await page.goto('/troy');
    await page.getByRole('textbox', { name: 'Message Troy' }).fill('How is my stack doing?');
    await page.getByRole('button', { name: 'Send' }).click();
    const consent = page.getByRole('dialog', { name: 'Before you talk to Troy' });
    await expect(consent).toBeVisible();
    await signInElsewhere(page);
    await expect(consent).toHaveCount(0);
  });
});

test("a failed move of the browser's stack says nothing once another account has signed in", async ({ page }) => {
  await signIn(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'stacktracker_holdings',
      JSON.stringify([{ id: 'g1', metal: 'gold', type: 'Gold Buffalo', weight: 1, weightUnit: 'oz', quantity: 1, purchasePrice: 4100, purchaseDate: '2026-10-01', createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z' }]),
    );
  });
  await mockBackends(page, { holdings: SAMPLE_HOLDINGS, failInserts: 1 });
  await page.goto('/stack');
  await expect(page.getByText('This browser still has 1 holding you added before signing in.')).toBeVisible();
  const move = await holdRequests(page, (u) => u.pathname === '/rest/v1/holdings', 'POST');
  await page.getByRole('button', { name: 'Add them to my account' }).click();
  await expect.poll(() => move.seen.length).toBe(1);
  await signInElsewhere(page);
  move.release();
  await page.waitForTimeout(800);
  await expect(page.getByText(/didn't move into your account/)).toHaveCount(0);
});

test.describe('prices over the last 24 hours', () => {
  // The feed skipped gold's 11th to 20th samples, two and a half hours of the day.
  const GAP = Array.from({ length: 10 }, (_, i) => 10 + i);

  test("the price page's 24-hour chart keeps each price at the time it was taken", async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-09T14:00:00Z') });
    await mockBackends(page, { sparklineZeros: { gold: GAP } });
    await page.goto('/prices/gold');
    await page.getByRole('tab', { name: '24H' }).click();
    const chart = page.locator('.recharts-wrapper').first();
    await expect(chart).toBeVisible();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + box.height / 2);
    // The first sample was taken Wednesday evening, not 24 hours before the page read the prices.
    await expect(page.locator('.recharts-tooltip-wrapper')).toContainText(/Wed (9:44|9:59|10:14) PM ET/);
  });

  test("the home page's small charts keep each price at the time it was taken", async ({ page }) => {
    await mockBackends(page, { sparklineZeros: { gold: GAP } });
    await page.goto('/');
    const line = page.locator('main a[href="/prices/gold"] svg path[fill="none"]').first();
    await expect(line).toBeVisible();
    const d = (await line.getAttribute('d'))!;
    const xs = [...d.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
    // 86 samples left of 96, taken every 15 minutes. The one after the gap is
    // the 21st sample, 20 of 95 steps across, not the 11th point of 86.
    expect(xs).toHaveLength(86);
    expect(xs[10]).toBeCloseTo((20 / 95) * 100, 1);
    expect(xs[85]).toBeCloseTo(100, 1);
  });
});
