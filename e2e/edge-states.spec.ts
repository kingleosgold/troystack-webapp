import { expect, test, type Page } from '@playwright/test';
import { BRIEF_TEXT, mockBackends, SAMPLE_HOLDINGS, signIn, USER_ID } from './mock';

// A value the site can't get says so, with a way to try again, instead of
// reading as zero, as empty or as still loading. A plan it can't read yet is
// unknown, not Free. A visitor's question isn't spent on a refusal, a scan
// only counts when it finds metal, a chat that didn't load takes no new
// message, and signing out doesn't quietly drop changes still waiting.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Opens the chat list, which sits behind a button on a phone. */
async function openChatList(page: Page) {
  const toggle = page.getByRole('button', { name: 'Your chats' });
  if (await toggle.isVisible()) await toggle.click();
}

function countRequests(page: Page, test: (url: string, method: string) => boolean) {
  let n = 0;
  page.on('request', (r) => {
    if (test(r.url(), r.method())) n += 1;
  });
  return () => n;
}

const stackCard = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'Your stack', exact: true }) });

test.describe('a metal with no live price', () => {
  test('shows no move or per-gram price on its page, and no move on its home tile', async ({ page }) => {
    // The mock keeps palladium's change figures in the answer, as the API can.
    await mockBackends(page, { missingPrices: ['palladium'] });
    await page.goto('/prices/palladium');
    await expect(page.getByText("There's no live palladium price right now.")).toBeVisible();
    const header = page.locator('header', { hasText: 'Palladium spot price' });
    await expect(header.getByText('since the last close')).toHaveCount(0);
    await expect(header.getByText(/\$14\.00|1\.23%/)).toHaveCount(0);
    await expect(page.getByText('High in range')).toBeVisible();
    await expect(page.getByText('Per gram')).toHaveCount(0);

    await page.goto('/');
    const tile = page.getByRole('link', { name: /^Palladium price/ });
    await expect(tile.getByText('No price right now')).toBeVisible();
    await expect(tile.getByText(/today|%/)).toHaveCount(0);
  });

  test("with gold missing, no gold/silver ratio shows anywhere, not even a 0", async ({ page }) => {
    await mockBackends(page, { missingPrices: ['gold'] });
    await page.goto('/prices/silver');
    await expect(page.getByText('High in range')).toBeVisible();
    await expect(page.getByText('Gold/silver ratio')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Gold\/silver/ })).toHaveCount(0);
    // A ratio of 0 rendered as a bare 0 beside the stats and in the price bar.
    const bareZeros = (selector: string) =>
      page.locator(selector).evaluateAll((els) => els.flatMap((el) => [...el.childNodes]).filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === '0').length);
    expect(await bareZeros('dl')).toBe(0);
    expect(await bareZeros('[aria-label="Live spot prices"]')).toBe(0);
  });

  test('a 24-hour chart with no points says so instead of loading forever', async ({ page }) => {
    await mockBackends(page, { emptySparklines: ['palladium'] });
    await page.goto('/prices/palladium');
    await page.getByRole('tab', { name: '24H' }).click();
    await expect(page.getByText("There aren't enough palladium prices in this range to draw a chart.")).toBeVisible();
  });

  test('the what-if box for it starts empty, not at 0, and a quick move leaves it empty', async ({ page }) => {
    await mockBackends(page, { missingPrices: ['palladium'] });
    await page.goto('/tools/what-if');
    await expect(page.locator('#wi-gold')).not.toHaveValue('');
    await expect(page.locator('#wi-palladium')).toHaveValue('');
    await page.getByRole('button', { name: '+25%' }).click();
    await expect(page.locator('#wi-palladium')).toHaveValue('');
  });

  test("the home page's stack card says which price is missing", async ({ page }) => {
    await signIn(page);
    const platinum = { ...SAMPLE_HOLDINGS[1], id: 'r3', metal: 'platinum', type: 'Platinum Maple Leaf', purchase_price: 1500 };
    await mockBackends(page, { holdings: [...SAMPLE_HOLDINGS, platinum], missingPrices: ['platinum'] });
    await page.goto('/');
    await expect(stackCard(page).getByText('Waiting for prices')).toBeVisible();
    await expect(stackCard(page).getByText("There's no live platinum price right now, so values that need it are on hold.")).toBeVisible();
  });
});

test.describe('prices that are down', () => {
  test('the price bar says so and asks again when tapped', async ({ page }) => {
    const mock = await mockBackends(page, { failPrices: true });
    await page.goto('/signal');
    const retry = page.getByRole('button', { name: 'Prices unavailable, tap to retry' }).filter({ visible: true });
    await expect(retry).toBeVisible();
    const before = mock.calls.filter((c) => c === 'GET /v1/prices').length;
    await retry.click();
    await expect.poll(() => mock.calls.filter((c) => c === 'GET /v1/prices').length).toBeGreaterThan(before);
  });

  test('the ratio tool says there is no price and offers to try again', async ({ page }) => {
    await mockBackends(page, { failPrices: true });
    await page.goto('/tools/ratio');
    const now = page.locator('section', { hasText: 'Right now' });
    await expect(now.getByText('No price', { exact: true })).toBeVisible();
    await expect(now.getByText("Live prices didn't load, so values that need them are on hold.")).toBeVisible();
    await expect(now.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

test.describe('history with too little in it', () => {
  test('the ratio chart and the stacking tool say so instead of loading forever', async ({ page }) => {
    await mockBackends(page, { emptyHistory: true });
    await page.goto('/tools/ratio');
    await expect(page.getByText("There isn't enough price history in this range to draw the ratio.")).toBeVisible();
    await page.goto('/tools/stacking-history');
    await expect(page.getByText("There's no price history to run this on.")).toBeVisible();
  });

  test('the stacking tool asks for an amount when the box is cleared', async ({ page }) => {
    await mockBackends(page);
    await page.goto('/tools/stacking-history');
    await expect(page.getByText('Worth today')).toBeVisible();
    await page.locator('#dca-amount').fill('');
    await expect(page.getByText("Enter how much you'd buy each month.")).toBeVisible();
  });
});

test("a vault report missing a metal says so for that metal and offers to try again", async ({ page }) => {
  const mock = await mockBackends(page, { vaultMissing: ['platinum'] });
  await page.goto('/vault');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Platinum', exact: true }) });
  await expect(card.getByText("There's no platinum report right now.")).toBeVisible();
  const before = mock.calls.filter((c) => c === 'GET /v1/vault-watch').length;
  await card.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => mock.calls.filter((c) => c === 'GET /v1/vault-watch').length).toBeGreaterThan(before);
});

test("the home page's podcast card says when episodes didn't load, and tries again", async ({ page }) => {
  const mock = await mockBackends(page, { failPodcast: true });
  await page.goto('/');
  const card = page.locator('section', { hasText: 'All episodes' });
  await expect(card.getByText("Episodes didn't load.")).toBeVisible();
  const before = mock.calls.filter((c) => c === 'GET /v1/podcast/feed.xml').length;
  await card.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => mock.calls.filter((c) => c === 'GET /v1/podcast/feed.xml').length).toBeGreaterThan(before);
});

test("a stack that didn't load is never shown as an empty one", async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { failHoldingsRead: true });
  await page.goto('/');
  await expect(stackCard(page).getByText("Your stack didn't load.")).toBeVisible();
  await expect(page.getByText('Start your stack')).toHaveCount(0);

  await page.goto('/tools/what-if');
  await expect(page.getByText("Your stack didn't load, so this uses the amounts you type.")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add your stack' })).toHaveCount(0);

  await page.goto('/settings');
  await expect(page.getByText("Your stack didn't load. Tap to try again.")).toBeVisible();
  await expect(page.getByText('Nothing to download yet')).toHaveCount(0);
});

test.describe('a plan that is still unknown', () => {
  test("isn't treated as Free in Troy, and the Gold locks say it's being checked", async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page, { tier: 'gold', failProfileRead: true, conversations: 5 });
    const profileReads = countRequests(page, (url, method) => url.includes('/rest/v1/profiles') && method === 'GET');
    await page.goto('/troy');
    await expect(page.getByRole('heading', { name: 'Ask Troy anything' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Free plan, 3 a day' })).toHaveCount(0);
    await openChatList(page);
    // The fifth and oldest chat shows, so the free plan's cap of three isn't applied.
    await expect(page.getByRole('button', { name: 'Stack check', exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/Gold keeps every one of them/)).toHaveCount(0);

    await page.goto('/vault');
    await expect(page.getByText('Checking your plan').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'See Gold' })).toHaveCount(0);
    await expect(page.getByText('Your first week is free.')).toHaveCount(0);
    const before = profileReads();
    await page.getByRole('button', { name: 'Try again' }).first().click();
    await expect.poll(profileReads).toBeGreaterThan(before);
    expect(mock.calls).not.toContain('POST /v1/stripe/create-checkout-session');
  });

  test('is read again once the sign-in sync puts back Gold the app wrote over', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { syncRestoresGoldAtSignIn: true });
    const profileReads = countRequests(page, (url, method) => url.includes('/rest/v1/profiles') && method === 'GET');
    await page.goto('/settings');
    // The first read says Free. Without a second read it would stay Free for five minutes.
    await expect(page.getByText('Everything in TroyStack is open to you.')).toBeVisible();
    expect(profileReads()).toBeGreaterThanOrEqual(2);
  });
});

test.describe("a visitor at the day's limit", () => {
  test('keeps a question handed over from another page for after signing up', async ({ page }) => {
    const q = 'What does the Fed news mean for gold and silver stackers?';
    const mock = await mockBackends(page, { visitorQuota: { questionsUsed: 3, questionsLimit: 3, resetsAt: '2026-10-10T04:00:00Z' } });
    await page.addInitScript(() => localStorage.setItem('troy_ai_consent_v1', '{"version":1}'));
    await page.goto(`/troy?q=${encodeURIComponent(q)}`);
    await expect(page.getByText("That's today's 3 free questions.")).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message Troy' })).toBeDisabled();
    expect(mock.asks, 'the question would only be refused').toHaveLength(0);
    await expect(page).toHaveURL(/\/troy\?q=/);

    // Signing up from the limit card comes back and asks it.
    await page.getByRole('link', { name: 'Create a free account' }).click();
    await expect(page).toHaveURL(/\/auth\?next=/);
    await page.locator('#auth-email').fill('stacker@example.com');
    await page.locator('#auth-password').fill('correct-horse');
    await page.locator('form button[type=submit]').click();
    await expect(page).toHaveURL(/\/troy\/c\/conv-new$/);
    await expect(page.getByText(q)).toBeVisible();
    expect(mock.calls).toContain('POST /v1/troy/conversations/conv-new/messages');
  });

  test("that the count didn't know about sees the count and the limit card agree", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('troy_ai_consent_v1', '{"version":1}'));
    await mockBackends(page, { visitorUsedElsewhere: true });
    await page.goto('/troy');
    await expect(page.getByText('3 of 3 free questions left today')).toBeVisible();
    await page.getByRole('textbox', { name: 'Message Troy' }).fill('What moved silver today?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText("That's today's 3 free questions.")).toBeVisible();
    await expect(page.getByText('0 of 3 free questions left today')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a free account' })).toHaveAttribute(
      'href',
      `/auth?next=${encodeURIComponent(`/troy?q=${encodeURIComponent('What moved silver today?')}`)}`,
    );
  });
});

test('a second receipt picked while the first is being checked is ignored, so only one scan is counted', async ({ page }) => {
  await signIn(page);
  const mock = await mockBackends(page, { scanStatusDelayMs: 1500 });
  await page.goto('/troy');
  await expect(page.getByRole('textbox', { name: 'Message Troy' })).toBeVisible();
  const input = page.locator('input[type=file][accept="image/*"]');
  await input.setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('button', { name: 'Add a receipt or spreadsheet' })).toBeDisabled();
  await input.setInputFiles({ name: 'another.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('dialog', { name: /Add from/ })).toBeVisible();
  expect(mock.calls.filter((c) => c === 'POST /v1/increment-scan')).toHaveLength(1);
  expect(mock.calls.filter((c) => c === 'POST /v1/scan-receipt')).toHaveLength(1);
});

test.describe("Today's brief", () => {
  test('shows in the chat it was asked from', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { tier: 'gold' });
    await page.goto('/troy');
    await page.getByRole('button', { name: "Today's brief" }).click();
    await expect(page.getByText(BRIEF_TEXT)).toBeVisible();
  });

  test('stays out of a chat opened while it loads', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { tier: 'gold', conversations: 2, briefDelayMs: 1500 });
    await page.goto('/troy');
    await page.getByRole('button', { name: "Today's brief" }).click();
    await openChatList(page);
    await page.getByRole('button', { name: 'Junk silver value', exact: true }).filter({ visible: true }).click();
    await expect(page.getByText('Saved answer for conv-1.')).toBeVisible();
    // Past the brief's answer.
    await page.waitForTimeout(2000);
    await expect(page.getByText(BRIEF_TEXT)).toHaveCount(0);
  });
});

test.describe('a receipt scan that finds nothing', () => {
  for (const scanResult of ['empty', 'fail'] as const) {
    test(`doesn't use up a free scan (${scanResult === 'empty' ? 'no metal on it' : 'the scan fails'})`, async ({ page }) => {
      await signIn(page);
      const mock = await mockBackends(page, { scanResult });
      await page.goto('/troy');
      await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByText(scanResult === 'empty' ? "Troy couldn't find any metal on that receipt." : "That receipt didn't scan. Try a clearer photo.")).toBeVisible();
      expect(mock.calls).toContain('POST /v1/scan-receipt');
      expect(mock.calls).not.toContain('POST /v1/increment-scan');
    });
  }
});

test.describe("a saved chat that didn't load", () => {
  test('takes no new message until it loads, and says so with a way to load it again', async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page, { conversations: 2, failChatReads: 100 });
    await page.goto('/troy/c/conv-0');
    await expect(page.getByText("This chat didn't load.")).toBeVisible();
    const box = page.getByRole('textbox', { name: 'Message Troy' });
    await expect(box).toBeDisabled();
    await expect(box).toHaveAttribute('placeholder', "This chat didn't load");
    await expect(page.getByRole('button', { name: 'What moved metals today?' })).toHaveCount(0);

    mock.setChatReadFailures(0);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Saved answer for conv-0.')).toBeVisible();
    await expect(page.getByText("This chat didn't load.")).toHaveCount(0);
    await expect(box).toBeEnabled();
    expect(mock.calls.filter((c) => c === 'POST /v1/troy/conversations/conv-0/messages')).toHaveLength(0);
  });

  test("doesn't stop another chat from opening, or a new one from starting", async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page, { conversations: 2, failChatReads: 100 });
    await page.goto('/troy/c/conv-0');
    await expect(page.getByText("This chat didn't load.")).toBeVisible();
    mock.setChatReadFailures(0);
    await openChatList(page);
    await page.getByRole('button', { name: 'Junk silver value', exact: true }).filter({ visible: true }).click();
    await expect(page.getByText('Saved answer for conv-1.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message Troy' })).toBeEnabled();

    await page.goto('/troy/c/conv-0');
    await expect(page.getByText('Saved answer for conv-0.')).toBeVisible();
    await openChatList(page);
    await page.getByRole('button', { name: 'New chat' }).filter({ visible: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Ask Troy anything' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message Troy' })).toBeEnabled();
  });

  test('a new chat started after one failed to load can be asked in', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { conversations: 2, failChatReads: 100 });
    await page.goto('/troy/c/conv-0');
    await expect(page.getByText("This chat didn't load.")).toBeVisible();
    await openChatList(page);
    await page.getByRole('button', { name: 'New chat' }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/troy$/);
    await expect(page.getByText("This chat didn't load.")).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Message Troy' })).toBeEnabled();
  });
});

const waitingKey = `troystack_pending_writes_${USER_ID}`;
const refusedKey = `troystack_pending_refused_${USER_ID}`;
const keysFor = (page: Page) => page.evaluate(([w, r]) => [localStorage.getItem(w) !== null, localStorage.getItem(r) !== null], [waitingKey, refusedKey]);

async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/** Adds a holding while the connection is down, so it waits in the browser. */
async function addWhileOffline(page: Page, mock: Awaited<ReturnType<typeof mockBackends>>) {
  await page.goto('/stack');
  await expect(page.getByText('Nothing in your stack yet')).toBeVisible();
  mock.setConnection(false);
  await page.getByRole('button', { name: 'Add a holding' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a holding' });
  await dialog.getByLabel('Product').fill('American Silver Eagle');
  await dialog.getByRole('button', { name: 'Add to stack' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("One change is saved in this browser and will reach your account when you're back online.")).toBeVisible();
}

test.describe('signing out', () => {
  test('sends changes still waiting first, then drops what this account kept in the browser', async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page);
    await addWhileOffline(page, mock);
    await page.evaluate((key) => localStorage.setItem(key, '1'), refusedKey);
    await goInApp(page, '/settings');
    await page.locator('section').getByRole('button', { name: 'Sign out' }).click();
    // Back online just as they sign out: the waiting add goes, and nothing is asked.
    mock.setConnection(true);
    const tries = mock.inserts.length;
    await page.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).length)).toBe(0);
    await expect(page.getByRole('dialog', { name: 'Sign out now?' })).toHaveCount(0);
    expect(mock.inserts, 'the sign-out sent the waiting add once').toHaveLength(tries + 1);
    expect(await keysFor(page)).toEqual([false, false]);
  });

  test("asks first when changes can't be sent, and staying keeps them", async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page);
    await addWhileOffline(page, mock);
    await goInApp(page, '/settings');
    await page.locator('section').getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out', exact: true }).click();
    const ask = page.getByRole('dialog', { name: 'Sign out now?' });
    await expect(ask.getByText("One change you made hasn't reached your account yet. If you sign out, it's dropped from this browser.")).toBeVisible();
    await ask.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(ask).toBeHidden();
    await expect(page).toHaveURL(/\/settings$/);
    expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('sb-')))).toBe(true);
    expect((await keysFor(page))[0], 'the waiting change is still here').toBe(true);

    await page.locator('section').getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('dialog', { name: 'Sign out now?' }).getByRole('button', { name: 'Sign out anyway' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).length)).toBe(0);
    expect(await keysFor(page)).toEqual([false, false]);
  });

  test('asks the same way from the sidebar and the phone menu', async ({ page }) => {
    await signIn(page);
    const mock = await mockBackends(page);
    await addWhileOffline(page, mock);
    if (test.info().project.name === 'iphone') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('dialog', { name: 'TroyStack' }).getByRole('button', { name: 'Sign out' }).click();
    } else {
      await page.locator('aside').getByRole('button', { name: 'Sign out' }).click();
    }
    const ask = page.getByRole('dialog', { name: 'Sign out now?' });
    await expect(ask.getByText(/One change you made hasn't reached your account yet/)).toBeVisible();
    await ask.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(page).toHaveURL(/\/stack$/);
    expect((await keysFor(page))[0]).toBe(true);
  });
});
