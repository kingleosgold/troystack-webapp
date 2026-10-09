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

/** Stands in for Stripe's page. Routes added later win, so this goes after mockBackends. */
async function stubStripe(page: Page) {
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }),
  );
}

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
