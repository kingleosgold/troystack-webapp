import { expect, test, type Page } from '@playwright/test';
import { mockBackends, signIn } from './mock';

// troystack.com's free-week links send people here signed in or not, and the
// site opens checkout once they are. Someone who already has Gold shouldn't be
// sent to buy it again.
const FREE_WEEK = '/auth?mode=signup&redirect=checkout&plan=monthly&campaign=site-signal';
const HAVE_GOLD = 'This account already has Gold, so there was nothing to buy.';

function watchCheckouts(page: Page) {
  const bodies: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/stripe/create-checkout-session') && r.method() === 'POST') bodies.push(r.postDataJSON());
  });
  return bodies;
}

/** Stands in for Stripe's pages. Routes added later win, so this goes after mockBackends. */
async function stubStripe(page: Page) {
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }),
  );
  await page.route('https://billing.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe billing</h1>' }),
  );
}

/** Opens the Gold sheet from Settings and starts checkout there, by card on an iPhone too. */
async function startFromSheet(page: Page, from = '/settings') {
  await page.goto(from);
  await page.getByText('Try Gold free for a week').first().click();
  const sheet = page.getByRole('dialog');
  const start = sheet.getByRole('button', { name: 'Start my free week' });
  const byCard = sheet.getByRole('button', { name: 'Rather start it here with a card?' });
  await expect(start.or(byCard)).toBeVisible();
  if (await byCard.isVisible()) await byCard.click();
  await start.click();
  return sheet;
}

const PAYMENT_ISSUE = "Your last Gold payment didn't go through. Update your card on the billing page to keep Gold.";
const APP_STORE = "Your App Store subscription may still be renewing, so there's nothing to buy here. On your iPhone, open Settings, tap your name, then Subscriptions.";
const OPENING = 'A checkout for this account is already opening. Trying again in a few seconds.';

test("a free account following a free-week link goes to checkout with the link's campaign", async ({ page }) => {
  await signIn(page);
  await mockBackends(page);
  await stubStripe(page);
  const checkouts = watchCheckouts(page);
  await page.goto(FREE_WEEK);
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].campaign).toBe('site-signal');
  expect(checkouts[0].price_id).toBe('price_e2e_monthly');
});

for (const tier of ['gold', 'lifetime'] as const) {
  test(`an account with ${tier} lands on Settings instead of buying Gold again`, async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { tier });
    await stubStripe(page);
    const checkouts = watchCheckouts(page);
    await page.goto(FREE_WEEK);
    await expect(page.getByText(HAVE_GOLD)).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    expect(checkouts).toHaveLength(0);
  });
}

test('when the API says the account already holds a plan, Settings says so and its Plan row catches up', async ({ page }) => {
  await signIn(page);
  // The profile reads Free, as when the app wrote Free over a web plan. The
  // API knows better, answers 409, and a sync puts Gold back.
  await mockBackends(page, { checkoutConflict: true, syncRestoresGold: true });
  await stubStripe(page);
  const checkouts = watchCheckouts(page);
  await page.goto(FREE_WEEK);
  await expect(page.getByText(HAVE_GOLD)).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  expect(checkouts).toHaveLength(1);
  await expect(page.getByText('Everything in TroyStack is open to you.')).toBeVisible();
});

test('an account with Gold that came from a page goes back to it instead', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { tier: 'gold' });
  await stubStripe(page);
  const checkouts = watchCheckouts(page);
  await page.goto('/auth?mode=signup&redirect=checkout&plan=yearly&next=/troy');
  await expect(page).toHaveURL(/\/troy$/);
  expect(checkouts).toHaveLength(0);
});

test("checkout still opens when the plan can't be read, after a short wait under a cover", async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { failProfileRead: true });
  await stubStripe(page);
  const checkouts = watchCheckouts(page);
  await page.goto(FREE_WEEK);
  await expect(page.getByRole('status').filter({ hasText: 'One moment' })).toBeVisible();
  await page.waitForTimeout(2500);
  expect(checkouts).toHaveLength(0);
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 10_000 });
  expect(checkouts).toHaveLength(1);
});

test.describe('what checkout says is in the way, after sign-in', () => {
  test("a Gold payment that didn't go through: Settings says so, offers no new plan, and its button opens the billing page", async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['payment_issue'], billingPortal: true });
    await stubStripe(page);
    const checkouts = watchCheckouts(page);
    await page.goto(FREE_WEEK);
    await expect(page.getByText(PAYMENT_ISSUE)).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText(HAVE_GOLD)).toHaveCount(0);
    await expect(page.getByText('Try Gold free for a week')).toHaveCount(0);
    expect(checkouts).toHaveLength(1);
    await page.getByRole('button', { name: 'Update your card' }).click();
    await expect(page).toHaveURL(/billing\.stripe\.com/);
  });

  test('App Store Gold that may still renew: Settings says where to look, with nothing to buy or bill', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['app_store_renewing'], billingPortal: true });
    await stubStripe(page);
    await page.goto(FREE_WEEK);
    await expect(page.getByText(APP_STORE)).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText(HAVE_GOLD)).toHaveCount(0);
    await expect(page.getByText('Try Gold free for a week')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update your card' })).toHaveCount(0);
    await expect(page.getByText('Change plan or cancel')).toHaveCount(0);
  });

  test('another checkout opening: it says so, asks once more a few seconds later, and goes to Stripe', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['checkout_in_progress'] });
    await stubStripe(page);
    const checkouts = watchCheckouts(page);
    await page.goto(FREE_WEEK);
    await expect(page.getByRole('status').filter({ hasText: OPENING })).toBeVisible();
    expect(checkouts).toHaveLength(1);
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 10_000 });
    expect(checkouts).toHaveLength(2);
  });

  test("still opening on the second try, Settings says so and checkout can be started again", async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['checkout_in_progress', 'checkout_in_progress'] });
    await stubStripe(page);
    const checkouts = watchCheckouts(page);
    await page.goto(FREE_WEEK);
    await expect(page.getByText(/Another checkout for this account was already opening, so this one didn't start/)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/settings$/);
    expect(checkouts).toHaveLength(2);
    await expect(page.getByText(HAVE_GOLD)).toHaveCount(0);
    await expect(page.getByText('Try Gold free for a week')).toBeVisible();
  });

  for (const reason of ['has_plan', 'one_from_a_newer_api']) {
    test(`${reason} lands on Settings saying the account already has Gold`, async ({ page }) => {
      await signIn(page);
      await mockBackends(page, { checkoutRefusals: [reason] });
      await stubStripe(page);
      await page.goto(FREE_WEEK);
      await expect(page.getByText(HAVE_GOLD)).toBeVisible();
      await expect(page).toHaveURL(/\/settings$/);
    });
  }
});

test.describe('what checkout says is in the way, in the Gold sheet', () => {
  test("a Gold payment that didn't go through shows a button to the billing page instead of the plans", async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['payment_issue'], billingPortal: true });
    await stubStripe(page);
    const sheet = await startFromSheet(page);
    await expect(page.getByRole('dialog', { name: "Your last Gold payment didn't go through" })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Start my free week' })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Update your card' }).click();
    await expect(page).toHaveURL(/billing\.stripe\.com/);
  });

  test('App Store Gold that may still renew says where to look, with nothing to buy or bill', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['app_store_renewing'], billingPortal: true });
    await stubStripe(page);
    const sheet = await startFromSheet(page);
    await expect(page.getByRole('dialog', { name: 'Your App Store plan may still be renewing' })).toBeVisible();
    await expect(sheet.getByText(/To check, open Settings on your iPhone, tap your name, then Subscriptions/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Start my free week' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Update your card' })).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: /App Store/ })).toHaveCount(0);
  });

  test('another checkout opening: it says so, asks once more, and goes to Stripe', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['checkout_in_progress'] });
    await stubStripe(page);
    const checkouts = watchCheckouts(page);
    const sheet = await startFromSheet(page);
    await expect(sheet.getByRole('status').filter({ hasText: OPENING })).toBeVisible();
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 10_000 });
    expect(checkouts).toHaveLength(2);
  });

  test('an account that already has a plan goes to Settings, which says so and catches up', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['has_plan'], syncRestoresGold: true });
    await stubStripe(page);
    const sheet = await startFromSheet(page);
    await expect(sheet).toBeHidden();
    await expect(page.getByText(HAVE_GOLD)).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText('Everything in TroyStack is open to you.')).toBeVisible();
  });

  test('on a Settings visit that already showed a checkout note, the next one still shows', async ({ page }) => {
    await signIn(page);
    await mockBackends(page, { checkoutRefusals: ['has_plan'] });
    await stubStripe(page);
    const sheet = await startFromSheet(page, '/settings?checkout=failed');
    await expect(sheet).toBeHidden();
    await expect(page.getByText(HAVE_GOLD)).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
  });
});
