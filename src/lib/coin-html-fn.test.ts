import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The function reads its built page from its bundle first. Here there's no
// bundle, so every read falls to the deployment, which fetch answers below.
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(async () => { throw new Error('no bundle'); }) }));

// @ts-expect-error plain JS Vercel function
import handler from '../../api/coin-html.js';

const NOW = Date.parse('2026-11-05T15:00:00Z');
const BUILT = (answer: string) =>
  `<html><head><title>Morgan</title></head><body><div id="root"><main class="x"><h1>Morgan</h1><p>${answer}</p></main></div></body></html>`;
const STALE = 'A Morgan silver dollar holds 0.7734 troy oz of silver. At silver spot of $40.00, one coin melts to $30.94 (as of Nov 1, 2026, 3:44 AM ET).';

type Upstream = (url: string) => Promise<Response> | Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fresh = (silver: number) => json({ timestamp: new Date(NOW - 60_000).toISOString(), marketsClosed: false, prices: { silver: { price: silver }, gold: { price: 4000 } } });

function run(query: Record<string, string> | string, prices: Upstream, site: Upstream = (url) => new Response(url.endsWith('/404') ? '<title>Page not found</title>' : BUILT(STALE))) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    return url.startsWith('https://api.troystack.ai/') ? prices(url) : site(url);
  }));
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end(b: string) { this.body = b; },
  };
  // req.query is Vercel's url.parse() getter, so the handler must read req.url instead.
  const req = {
    url: `/api/coin-html?${new URLSearchParams(query)}`,
    get query(): never { throw new Error('req.query read'); },
    headers: { host: 'troystack.com', 'x-forwarded-proto': 'https' },
  };
  return (handler(req, res) as Promise<void>).then(() => ({ res, calls }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('coin-html', () => {
  it('puts live spot in a coin page and caches it at the edge for five minutes', async () => {
    const { res, calls } = await run({ slug: 'morgan-silver-dollar' }, () => fresh(50));
    expect(calls).toContain('https://troystack.com/_ssr/coins/morgan-silver-dollar');
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    // 0.77344 oz at $50.00
    expect(res.body).toContain('At silver spot of $50.00, one coin melts to $38.67 (as of Nov 5, 2026, 9:59 AM ET).');
    expect(res.body).not.toContain('$40.00');
    expect(res.body).toContain('<title>Morgan</title>');
    expect(res.body.match(/<main/g)).toHaveLength(1);
  });

  it('prices a gold coin from gold spot', async () => {
    const { res } = await run({ slug: 'american-gold-eagle' }, () => fresh(50));
    expect(res.body).toContain('At gold spot of $4,000.00, one coin melts to $4,000.00');
  });

  it('gives the junk silver calculator both silver figures at live spot', async () => {
    const { res, calls } = await run({ page: 'junk-silver' }, () => fresh(50));
    expect(calls).toContain('https://troystack.com/_ssr/tools/junk-silver');
    expect(res.body).toContain("0.7234 troy oz of silver as struck. At silver spot of $50.00, that's $36.17");
    expect(res.body).toContain('At silver spot of $50.00, that\'s $35.75');
  });

  it('leaves the build\'s number out, briefly cached, when spot fails or is stale', async () => {
    for (const prices of [
      () => new Response('down', { status: 503 }),
      () => { throw new Error('timeout'); },
      () => json({ timestamp: new Date(NOW - 5 * 24 * 3600_000).toISOString(), prices: { silver: { price: 50 } } }),
      () => json({ prices: { silver: { price: 0 } }, timestamp: new Date(NOW).toISOString() }),
    ] as Upstream[]) {
      const { res } = await run({ slug: 'morgan-silver-dollar' }, prices);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('$40.00');
      expect(res.body).toContain('A Morgan silver dollar holds 0.7734 troy oz of silver. Its melt value is that weight times live silver spot.');
      expect(res.headers['Cache-Control']).toBe('public, max-age=0, s-maxage=60');
    }
  });

  it('answers 404 with the site page for a slug that is not a coin', async () => {
    for (const slug of ['not-a-coin', '../index', '', 'constructor']) {
      const { res, calls } = await run({ slug }, () => fresh(50));
      expect(res.statusCode).toBe(404);
      expect(res.body).toContain('Page not found');
      expect(res.headers['Cache-Control']).toBe('no-store');
      expect(calls.some((url) => url.startsWith('https://api.troystack.ai/'))).toBe(false);
    }
  });

  it('keeps crawlers off the plain 404 page used when the site 404 cannot be read', async () => {
    const { res } = await run({ slug: 'not-a-coin' }, () => fresh(50), () => new Response('no', { status: 500 }));
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain("That page isn't here");
    expect(res.body).toContain('<meta name="robots" content="noindex, follow" />');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('answers 502 without caching when the built page cannot be read or has no body to replace', async () => {
    for (const site of [() => new Response('no', { status: 500 }), () => new Response('<html><div id="root"></div></html>')] as Upstream[]) {
      const { res } = await run({ slug: 'morgan-silver-dollar' }, () => fresh(50), site);
      expect(res.statusCode).toBe(502);
      expect(res.headers['Cache-Control']).toBe('no-store');
    }
  });

  it('keeps a coin address on its coin when ?page= is added', async () => {
    const { res } = await run({ slug: 'morgan-silver-dollar', page: 'junk-silver' }, () => fresh(50));
    expect(res.body).toContain('one coin melts to $38.67');
    expect(res.body).not.toContain('Junk silver melt value calculator</h1>');
  });

  it("answers 404 when a visitor's own ?slug= rides along with the address's", async () => {
    const { res } = await run('slug=morgan-silver-dollar&slug=peace-dollar', () => fresh(50));
    expect(res.statusCode).toBe(404);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it("answers 404, not the junk silver page, when a repeated ?slug= comes with ?page=junk-silver", async () => {
    const { res } = await run('slug=morgan-silver-dollar&slug=peace-dollar&page=junk-silver', () => fresh(50));
    expect(res.statusCode).toBe(404);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).not.toContain('Junk silver melt value calculator</h1>');
  });

  it('answers 404 for a repeated ?page=junk-silver with no slug', async () => {
    const { res } = await run('page=junk-silver&page=junk-silver', () => fresh(50));
    expect(res.statusCode).toBe(404);
  });

  it('leaves a $ in the new text as written', async () => {
    const { res } = await run({ slug: 'morgan-silver-dollar' }, () => fresh(50), () => new Response(BUILT('$&')));
    expect(res.body).toContain('$38.67');
    expect(res.body).not.toContain('$&');
  });
});
