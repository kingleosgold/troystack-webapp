import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS Vercel function
import handler from '../../api/signal-html.js';

const SHELL = '<html><head><title>TroyStack</title><meta name="description" content="home" /><link rel="canonical" href="https://troystack.ai/" /><meta property="og:url" content="x" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:image" content="x" /><meta property="og:type" content="website" /><meta name="twitter:title" content="x" /><meta name="twitter:description" content="x" /><meta name="twitter:image" content="x" /></head><body></body></html>';

type Upstream = (url: string) => Promise<Response> | Response;

function run(slug: string, upstream: Upstream) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('https://troystack.ai/')) {
      return new Response(url.endsWith('/404.html') ? '<title>Page not found</title>' : SHELL, { status: 200 });
    }
    return upstream(url);
  }));
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end(b: string) { this.body = b; },
  };
  const req = { query: { slug }, headers: { host: 'troystack.ai', 'x-forwarded-proto': 'https' } };
  return (handler(req, res) as Promise<void>).then(() => res);
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('signal-html', () => {
  it('fills in the article and caches for five minutes', async () => {
    const res = await run('gold-2026-10-20', () => json({ article: { slug: 'gold-2026-10-20', title: 'Gold — higher', troy_one_liner: 'Central banks keep buying gold every single month', troy_commentary: 'Long body.' } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=300');
    expect(res.body).toContain('<title>Gold, higher | TroyStack</title>');
    expect(res.body).toContain('<meta name="description" content="Central banks keep buying gold every single month" />');
    expect(res.body).toContain('<link rel="canonical" href="https://troystack.ai/signal/gold-2026-10-20" />');
  });

  it('skips a one-liner cut to a word or two', async () => {
    const res = await run('fed-2026-10-08', () => json({ article: { slug: 'fed-2026-10-08', title: 'Fed minutes', troy_one_liner: 'Gold shines as', troy_commentary: 'Gold fell after the minutes.' } }));
    expect(res.body).toContain('<meta name="description" content="Gold fell after the minutes." />');
    expect(res.body).not.toContain('Gold shines as');
  });

  it('answers 404 for a slug the API does not know', async () => {
    const res = await run('nope', () => json({ error: 'not found' }, 404));
    expect(res.statusCode).toBe(404);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('answers a retryable 503 that is never cached when the API fails', async () => {
    const failures: Upstream[] = [
      () => json({ error: 'boom' }, 500),
      () => new Response('not json', { status: 200 }),
      () => { throw new Error('timeout'); },
    ];
    for (const upstream of failures) {
      const res = await run('gold-2026-10-20', upstream);
      expect(res.statusCode).toBe(503);
      expect(res.headers['Cache-Control']).toBe('no-store');
      expect(res.headers['Retry-After']).toBe('60');
      expect(res.body).toBe(SHELL);
    }
  });
});

describe('signal-html with odd article text', () => {
  it("keeps a $ in the title as text and takes the API's slug for the canonical", async () => {
    const res = await run('Gold-2026-10-20', () => json({ article: { slug: 'gold-2026-10-20', title: "Gold at $' and $& and $`", troy_commentary: 'Body.' } }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>Gold at $' and $&amp; and $` | TroyStack</title>");
    expect(res.body).toContain('<link rel="canonical" href="https://troystack.ai/signal/gold-2026-10-20" />');
  });
});
