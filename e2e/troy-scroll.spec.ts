import { expect, test, type Page } from '@playwright/test';
import { mockBackends, signIn } from './mock';

// /troy keeps Troy's coin and heading on screen when a chat is empty, and
// scrolls whatever comes under the chat into view.

const LONG = 'Silver held its ground while gold slipped, and the ratio moved a point. '.repeat(6);

function longChat(prefix: string) {
  return Array.from({ length: 24 }, (_, i) => ({
    id: `${prefix}-${i}`,
    role: i % 2 ? 'assistant' : 'user',
    content: `${i % 2 ? 'Answer' : 'Question'} ${i + 1}. ${LONG}`,
    created_at: '2026-10-08T12:00:00Z',
  }));
}

const scroller = (page: Page) => page.locator('section div.overflow-y-auto').first();

test('New chat from far down a long chat opens at the top with the coin showing', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { tier: 'gold', conversations: 2 });
  await page.route(
    (url) => url.pathname === '/v1/troy/conversations/conv-1',
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ id: 'conv-1', title: 'Junk silver value', created_at: '', updated_at: '', messages: longChat('m-long') }),
      });
    },
  );
  await page.goto('/troy/c/conv-1');
  await expect(page.getByText('Answer 24.')).toBeInViewport();
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  const toggle = page.getByRole('button', { name: 'Your chats' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'New chat' }).filter({ visible: true }).click();

  await expect(page).toHaveURL(/\/troy$/);
  await expect(page.getByRole('heading', { name: 'Ask Troy anything' })).toBeInViewport();
  await expect(page.locator('img[srcset*="troy-192"]')).toBeInViewport();
  expect(await scroller(page).evaluate((el) => el.scrollTop)).toBe(0);
});

test("a visitor's limit card scrolls into view when the count lands after their saved chat", async ({ page }) => {
  const chat = longChat('v');
  await page.addInitScript((saved) => sessionStorage.setItem('troy_visitor_chat_v1', JSON.stringify(saved)), chat);
  await mockBackends(page, { visitorQuota: { questionsUsed: 3, questionsLimit: 3, resetsAt: '2026-10-09T00:00:00Z' } });
  // The count comes back after the saved chat is already on screen.
  await page.route(
    (url) => url.pathname === '/v1/troy/ask/status',
    async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ questionsUsed: 3, questionsLimit: 3, resetsAt: '2026-10-09T00:00:00Z' }),
      });
    },
  );
  await page.goto('/troy');
  await expect(page.getByText('Answer 24.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create a free account' })).toBeInViewport();
});

test("New chat clears an old note and opens at the top", async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { tier: 'gold', conversations: 2, failDeletes: true });
  await page.route(
    (url) => url.pathname === '/v1/troy/conversations/conv-1',
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ id: 'conv-1', title: 'Junk silver value', created_at: '', updated_at: '', messages: longChat('m-note') }),
      });
    },
  );
  await page.goto('/troy/c/conv-1');
  await expect(page.getByText('Answer 24.')).toBeInViewport();

  const toggle = page.getByRole('button', { name: 'Your chats' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Delete Silver ratio' }).filter({ visible: true }).click();
  const note = page.getByText("That chat couldn't be deleted.");
  await expect(note).toBeAttached();
  // The chat scrolls down to the note. Let that finish, as it would before anyone taps again.
  await expect
    .poll(() => scroller(page).evaluate((el) => Math.round(el.scrollHeight - el.clientHeight - el.scrollTop)))
    .toBeLessThan(2);

  // On a phone the list stays open after the failed delete, so New chat is right there.
  await page.getByRole('button', { name: 'New chat' }).filter({ visible: true }).click();

  await expect(page).toHaveURL(/\/troy$/);
  await expect(note).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ask Troy anything' })).toBeInViewport();
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBe(0);
});

test('a note on an empty chat goes, and New chat brings the coin back into view', async ({ page, isMobile }) => {
  // A computer window fits the empty chat and its note without scrolling.
  test.skip(!isMobile, 'only a phone scrolls an empty chat');
  await signIn(page);
  await mockBackends(page, { tier: 'gold', conversations: 2, failDeletes: true });
  await page.goto('/troy');
  await expect(page.getByRole('heading', { name: 'Ask Troy anything' })).toBeVisible();

  const toggle = page.getByRole('button', { name: 'Your chats' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Delete Silver ratio' }).filter({ visible: true }).click();
  const note = page.getByText("That chat couldn't be deleted.");
  await expect(note).toBeAttached();
  expect(await scroller(page).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect
    .poll(() => scroller(page).evaluate((el) => Math.round(el.scrollHeight - el.clientHeight - el.scrollTop)))
    .toBeLessThan(2);

  await page.getByRole('button', { name: 'New chat' }).filter({ visible: true }).click();

  await expect(note).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ask Troy anything' })).toBeInViewport();
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBe(0);
});

test('New chat tapped while the chat is still gliding to a note lands exactly at the top', async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { tier: 'gold', conversations: 2, failDeletes: true });
  await page.route(
    (url) => url.pathname === '/v1/troy/conversations/conv-1',
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ id: 'conv-1', title: 'Junk silver value', created_at: '', updated_at: '', messages: longChat('m-glide') }),
      });
    },
  );
  await page.goto('/troy/c/conv-1');
  await expect(page.getByText('Answer 24.')).toBeInViewport();
  // Start part way up, so the glide down to the note takes a moment.
  await scroller(page).evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 1500);
  });

  const toggle = page.getByRole('button', { name: 'Your chats' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Delete Silver ratio' }).filter({ visible: true }).click();
  await expect(page.getByText("That chat couldn't be deleted.")).toBeAttached();
  // No wait for the glide to finish. On main this left the chat about 23px
  // down in the iPhone project. Chromium can't show WebKit's own overshoot.
  await page.getByRole('button', { name: 'New chat' }).filter({ visible: true }).click();

  await expect(page).toHaveURL(/\/troy$/);
  // Settled means two reads at 0 a few frames apart, so a glide still
  // passing through the top can't count and a slow runner isn't cut off.
  await expect
    .poll(() =>
      scroller(page).evaluate(async (el) => {
        const first = el.scrollTop;
        for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
        return [first, el.scrollTop];
      }),
    )
    .toEqual([0, 0]);
});
