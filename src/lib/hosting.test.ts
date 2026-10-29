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
