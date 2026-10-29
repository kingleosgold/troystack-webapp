import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

describe('Vercel routing', () => {
  it('does not rewrite every path to the homepage, so an unknown path can 404', () => {
    const sources = (vercel.rewrites ?? []).map((rule: { source: string }) => rule.source);
    expect(sources).not.toContain('/(.*)');
    expect(sources).not.toContain('/:path*');
  });

  it('lets a coin page with no file fall to the 404 page', () => {
    const sources: string[] = (vercel.rewrites ?? []).map((rule: { source: string }) => rule.source);
    expect(sources.filter((source) => source.startsWith('/coins'))).toEqual([]);
  });

  it("serves troystack-marketing's pages from the marketing project", () => {
    const MARKETING = 'https://stacktrackergold-web.vercel.app';
    const rules: Array<{ source: string; destination: string }> = vercel.rewrites ?? [];
    for (const path of ['/privacy', '/terms', '/calculator', '/speculation', '/signal-sitemap.xml', '/api/prices', '/api/signal', '/api/signal/:slug', '/ios-swap.js']) {
      expect(rules.find((rule) => rule.source === path)?.destination, path).toBe(`${MARKETING}${path}`);
    }
  });

  it('keeps no redirect on a path marketing serves', () => {
    const sources: string[] = (vercel.redirects ?? []).map((rule: { source: string }) => rule.source);
    for (const path of ['/privacy', '/terms', '/calculator', '/speculation']) expect(sources).not.toContain(path);
  });

  it("keeps the app's own Signal pages, which answer a new article's slug or 404", () => {
    const rule = (vercel.rewrites ?? []).find((item: { source: string }) => item.source === '/signal/:slug');
    expect(rule?.destination).toBe('/api/signal-html?slug=:slug');
  });

  it('sends www.troystack.com to troystack.com', () => {
    const rule = (vercel.redirects ?? []).find((item: { has?: Array<{ value: string }> }) => item.has?.[0]?.value === 'www.troystack.com');
    expect(rule).toMatchObject({ source: '/:path*', destination: 'https://troystack.com/:path*', permanent: true });
  });

  it('keeps signed-in app routes on the shell', () => {
    const sources = (vercel.rewrites ?? []).map((rule: { source: string }) => rule.source);
    for (const path of ['/settings', '/auth', '/reset-password', '/developers/keys', '/troy/c/:conversationId']) {
      expect(sources).toContain(path);
    }
  });
});
