import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

describe('Vercel routing', () => {
  it('does not rewrite every path to the homepage, so an unknown path can 404', () => {
    const sources = (vercel.rewrites ?? []).map((rule: { source: string }) => rule.source);
    expect(sources).not.toContain('/(.*)');
    expect(sources).not.toContain('/:path*');
  });

  it('serves coin pages and the junk silver calculator through the function that adds live spot', () => {
    const rules: { source: string; destination: string }[] = vercel.rewrites ?? [];
    const coinRules = rules.filter((rule) => rule.source.startsWith('/coins'));
    // /coins itself stays the static index, and an unknown slug gets the function's 404.
    expect(coinRules).toEqual([{ source: '/coins/:slug', destination: '/api/coin-html?slug=:slug' }]);
    expect(rules.find((rule) => rule.source === '/tools/junk-silver')?.destination).toBe('/api/coin-html?page=junk-silver');
    expect(vercel.functions['api/coin-html.js'].includeFiles).toContain('dist/_ssr/**');
  });

  it('keeps the built copies the function reads out of search', () => {
    const rule = (vercel.headers ?? []).find((item: { source: string }) => item.source === '/_ssr/(.*)');
    expect(rule?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' });
  });

  it('sends an unknown Signal slug to the page that can answer 404', () => {
    const rule = (vercel.rewrites ?? []).find((item: { source: string }) => item.source === '/signal/:slug');
    expect(rule?.destination).toBe('/api/signal-html?slug=:slug');
  });

  it('keeps signed-in app routes on the shell', () => {
    const sources = (vercel.rewrites ?? []).map((rule: { source: string }) => rule.source);
    for (const path of ['/settings', '/auth', '/reset-password', '/developers/keys', '/troy/c/:conversationId']) {
      expect(sources).toContain(path);
    }
  });
});
