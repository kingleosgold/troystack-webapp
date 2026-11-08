import { expect, test, type Page } from '@playwright/test';
import { holdRequests, MESSAGES_PATH, mockBackends, signIn } from './mock';

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
/** Pixels left between the bottom of the chat and the bottom of what's on screen. */
const atBottom = (page: Page) =>
  scroller(page).evaluate((el) => Math.round(el.scrollHeight - el.clientHeight - el.scrollTop));

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
  await expect(page.getByRole('link', { name: 'Create a free account' })).toBeInViewport({ ratio: 1 });
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
    .poll(() => atBottom(page))
    .toBeLessThan(2);

  // On a phone the list stays open after the failed delete, so New chat is right there.
  await page.getByRole('button', { name: 'New chat' }).filter({ visible: true }).click();

  await expect(page).toHaveURL(/\/troy$/);
  await expect(note).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ask Troy anything' })).toBeInViewport();
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBe(0);
});

test('a note on an empty chat goes, and New chat brings the coin back into view', async ({ page }) => {
  // At the md breakpoint and up the chat list moves to a sidebar and the
  // window fits the empty chat and its note without scrolling.
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'only a phone-width chat scrolls when empty');
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
    .poll(() => atBottom(page))
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
  // No wait for the glide to finish. Before the fix in #80 this left the
  // chat about 23px down in the iPhone project. Chromium can't show WebKit's own overshoot.
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
  // And nothing late, like a refetch or a layout shift, moves it after that.
  await page.waitForTimeout(500);
  expect(await scroller(page).evaluate((el) => el.scrollTop)).toBe(0);
});

/** Drops the connection and brings it back, which refetches stale queries. */
async function reconnect(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
}

for (const [name, next] of [
  // Still at the limit, with a new count, so the reply is a new object and the card's words change.
  ['a refetch that changes the count', { questionsUsed: 5, questionsLimit: 5, resetsAt: '2026-10-10T04:00:00Z' }],
  ["the day's rollover clearing the limit", { questionsUsed: 0, questionsLimit: 3, resetsAt: '2026-10-11T04:00:00Z' }],
] as const) {
  test(`a visitor at the limit reading back up stays put on ${name}`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-09T14:00:00Z') });
    const chat = longChat('r');
    await page.addInitScript((saved) => sessionStorage.setItem('troy_visitor_chat_v1', JSON.stringify(saved)), chat);
    await mockBackends(page, { visitorQuota: { questionsUsed: 3, questionsLimit: 3, resetsAt: '2026-10-10T04:00:00Z' } });
    let reads = 0;
    let body: object = { questionsUsed: 3, questionsLimit: 3, resetsAt: '2026-10-10T04:00:00Z' };
    await page.route(
      (url) => url.pathname === '/v1/troy/ask/status',
      (route) => {
        reads += 1;
        return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
      },
    );
    await page.goto('/troy');
    await expect(page.getByRole('link', { name: 'Create a free account' })).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() => atBottom(page))
      .toBeLessThan(2);

    // The visitor reads back up to an earlier answer.
    await scroller(page).evaluate((el) => {
      el.scrollTop = 300;
    });
    const before = reads;
    body = next;
    await page.clock.fastForward('02:00');
    await reconnect(page);
    await expect.poll(() => reads).toBeGreaterThan(before);
    // The new reply reached the page, not just the route.
    if (next.questionsUsed === 0) await expect(page.getByRole('link', { name: 'Create a free account' })).toHaveCount(0);
    else await expect(page.getByText("That's today's 5 free questions.")).toBeAttached();
    // Give a glide time to start and run.
    await page.waitForTimeout(800);
    // The card leaving can shift the layout a pixel on a phone. Being pulled
    // down would move it thousands.
    const top = await scroller(page).evaluate((el) => el.scrollTop);
    expect(Math.abs(top - 300)).toBeLessThan(5);
  });
}

test("a visitor's question refused at the limit brings the card into view under a long chat", async ({ page }) => {
  const chat = longChat('q');
  await page.addInitScript((saved) => {
    sessionStorage.setItem('troy_visitor_chat_v1', JSON.stringify(saved));
    localStorage.setItem('troy_ai_consent_v1', '{"version":1}');
  }, chat);
  // The count says a question is left, but someone else on the connection used it.
  await mockBackends(page, { visitorQuota: { questionsUsed: 2, questionsLimit: 3, resetsAt: '2026-10-10T04:00:00Z' }, visitorUsedElsewhere: true });
  await page.goto('/troy');
  await expect(page.getByText('Answer 24.')).toBeVisible();
  await expect(page.getByText('1 of 3 free questions left today')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create a free account' })).toHaveCount(0);

  // The visitor reads back up, then asks.
  await scroller(page).evaluate((el) => {
    el.scrollTop = 300;
  });
  const answer = await holdRequests(page, (u) => u.pathname === '/v1/troy/ask', 'POST');
  await page.getByRole('textbox', { name: 'Message Troy' }).fill('What moved silver today?');
  await page.getByRole('button', { name: 'Send' }).click();
  // The question shows while it's asked.
  await expect(page.getByText('What moved silver today?')).toBeVisible();
  await expect.poll(() => answer.seen.length).toBe(1);
  answer.release();

  await expect(page.getByText("That's today's 3 free questions.")).toBeAttached();
  // The refused question comes off the chat, so only the card is new.
  await expect(page.getByText('What moved silver today?')).toHaveCount(0);
  // The card is taller than the question and the typing dots it replaces, so
  // the scroll from sending stops short of the new bottom. Only the scroll
  // when the card shows up gets all the way down.
  await expect(page.getByRole('link', { name: 'Create a free account' })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => atBottom(page)).toBeLessThan(2);
});

test("a free account's question refused at the limit brings the card into view under a long chat", async ({ page }) => {
  await signIn(page);
  await mockBackends(page, { conversations: 2, chatLimitReached: true });
  await page.route(
    (url) => url.pathname === '/v1/troy/conversations/conv-1',
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ id: 'conv-1', title: 'Junk silver value', created_at: '', updated_at: '', messages: longChat('m-limit') }),
      });
    },
  );
  await page.goto('/troy/c/conv-1');
  await expect(page.getByText('Answer 24.')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Try Gold free for a week' })).toHaveCount(0);

  await scroller(page).evaluate((el) => {
    el.scrollTop = 300;
  });
  const answer = await holdRequests(page, (u) => MESSAGES_PATH.test(u.pathname), 'POST');
  await page.getByRole('textbox', { name: 'Message Troy' }).fill('What moved silver today?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('What moved silver today?')).toBeVisible();
  await expect.poll(() => answer.seen.length).toBe(1);
  answer.release();

  await expect(page.getByText("That's today's 3 free questions.")).toBeAttached();
  await expect(page.getByText('What moved silver today?')).toHaveCount(0);
  // The chat already had messages, so it stays open and isn't deleted.
  await expect(page).toHaveURL(/\/troy\/c\/conv-1$/);
  await expect(page.getByRole('button', { name: 'Try Gold free for a week' })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => atBottom(page)).toBeLessThan(2);
});

test("a free account's first question in a new chat, refused at the limit, leaves the card fully in view", async ({ page }) => {
  await signIn(page);
  const api = await mockBackends(page, { conversations: 2, chatLimitReached: true });
  await page.goto('/troy');
  await expect(page.getByRole('heading', { name: 'Ask Troy anything' })).toBeVisible();

  const answer = await holdRequests(page, (u) => MESSAGES_PATH.test(u.pathname), 'POST');
  await page.getByRole('textbox', { name: 'Message Troy' }).fill('What moved silver today?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('What moved silver today?')).toBeVisible();
  // A chat was made for the question.
  await expect(page).toHaveURL(/\/troy\/c\/conv-new$/);
  await expect.poll(() => answer.seen.length).toBe(1);
  answer.release();

  await expect(page.getByText("That's today's 3 free questions.")).toBeAttached();
  await expect(page.getByText('What moved silver today?')).toHaveCount(0);
  // It was empty, so it goes and the page is back on /troy.
  await expect(page).toHaveURL(/\/troy$/);
  await expect.poll(() => api.calls.filter((c) => c === 'DELETE /v1/troy/conversations/conv-new').length).toBe(1);
  await expect(page.getByRole('button', { name: 'Try Gold free for a week' })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => atBottom(page)).toBeLessThan(2);
});

test("a visitor's question that doesn't get through brings its note into view under a long chat", async ({ page }) => {
  const chat = longChat('f');
  await page.addInitScript((saved) => {
    sessionStorage.setItem('troy_visitor_chat_v1', JSON.stringify(saved));
    localStorage.setItem('troy_ai_consent_v1', '{"version":1}');
  }, chat);
  await mockBackends(page, { failAsks: 1 });
  await page.goto('/troy');
  await expect(page.getByText('Answer 24.')).toBeVisible();

  // The visitor reads back up, then asks, and the answer comes back a 502.
  await scroller(page).evaluate((el) => {
    el.scrollTop = 300;
  });
  await page.getByRole('textbox', { name: 'Message Troy' }).fill('What moved silver today?');
  await page.getByRole('button', { name: 'Send' }).click();

  const card = page.getByRole('alert').filter({ hasText: "Troy couldn't answer that just now." });
  await expect(card).toBeInViewport({ ratio: 1 });
  await expect(card.getByRole('button', { name: 'Ask again' })).toBeInViewport({ ratio: 1 });
  // The question comes off the chat and waits on the note to be asked again.
  await expect(page.getByText('What moved silver today?')).toHaveCount(1);
  await expect.poll(() => atBottom(page)).toBeLessThan(2);
});
