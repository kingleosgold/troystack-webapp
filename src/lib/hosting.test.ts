import { existsSync, readFileSync } from 'node:fs';
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

  // troystack-marketing's alias sits behind Vercel's sign-in, and the app now
  // serves privacy, terms and the calculator itself, so nothing goes there.
  it('sends nothing to the marketing project', () => {
    expect(JSON.stringify(vercel.rewrites ?? [])).not.toContain('vercel.app');
  });

  it("serves the pages troystack.com's links point at itself, /speculation included", () => {
    const sources: string[] = (vercel.redirects ?? []).map((rule: { source: string }) => rule.source);
    for (const path of ['/privacy', '/terms', '/calculator', '/speculation']) expect(sources).not.toContain(path);
  });

  // The iOS app opens troystack.com's reset links through this file, so it has
  // to come from the app's own project once troystack.com is here.
  it('serves the Apple association file as JSON for the reset link', () => {
    const file = JSON.parse(readFileSync(new URL('../../public/.well-known/apple-app-site-association', import.meta.url), 'utf8'));
    expect(file.applinks.details[0].appIDs).toContain('3BKELS5FG9.com.stacktrackerpro.app');
    expect(file.applinks.details[0].paths).toContain('/auth/reset-password');
    const header = (vercel.headers ?? []).find((item: { source: string }) => item.source === '/.well-known/apple-app-site-association');
    expect(header?.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
  });

  it("keeps the app's own Signal pages, which answer a new article's slug or 404", () => {
    const rule = (vercel.rewrites ?? []).find((item: { source: string }) => item.source === '/signal/:slug');
    expect(rule?.destination).toBe('/api/signal-html?slug=:slug');
  });

  // Vercel's /:path* with a host condition doesn't catch the bare root (live,
  // www.troystack.com/ answers 200 while its subpaths 308), so / gets its own
  // rule, the same way www.troystack.ai does.
  it('sends www.troystack.com to troystack.com, its home page included', () => {
    const rules = (vercel.redirects ?? []).filter((item: { has?: Array<{ value: string }> }) => item.has?.[0]?.value === 'www.troystack.com');
    expect(rules).toEqual([
      expect.objectContaining({ source: '/', destination: 'https://troystack.com/', permanent: true }),
      expect.objectContaining({ source: '/:path*', destination: 'https://troystack.com/:path*', permanent: true }),
    ]);
    expect((vercel.redirects ?? [])[0]).toBe(rules[0]);
  });

  it('sends www.troystack.ai straight to troystack.com in one hop', () => {
    const rules = (vercel.redirects ?? []).filter((item: { has?: Array<{ value: string }> }) => item.has?.[0]?.value === 'www.troystack.ai');
    expect(rules).toEqual([
      expect.objectContaining({ source: '/', destination: 'https://troystack.com/', permanent: true }),
      expect.objectContaining({ source: '/:path*', destination: 'https://troystack.com/:path*', permanent: true }),
    ]);
    // Ahead of the path rules, so www.troystack.ai/pricing isn't two hops.
    expect((vercel.redirects ?? []).indexOf(rules[0])).toBe(2);
  });

  // app.troystack.com served the whole app as a second copy. Jon ruled 11/11
  // that it gets a host redirect, and that guest stacks kept in that host's
  // browser storage stay behind, since synced accounts lose nothing.
  it('sends app.troystack.com to troystack.com in one hop, its home page included', () => {
    const rules = (vercel.redirects ?? []).filter((item: { has?: Array<{ value: string }> }) => item.has?.[0]?.value === 'app.troystack.com');
    expect(rules).toEqual([
      expect.objectContaining({ source: '/', destination: 'https://troystack.com/', permanent: true }),
      expect.objectContaining({ source: '/:path*', destination: 'https://troystack.com/:path*', permanent: true }),
    ]);
    // Ahead of every path rule, so app.troystack.com/dashboard isn't two hops.
    const firstPathRule = (vercel.redirects ?? []).findIndex((item: { has?: unknown }) => !item.has);
    expect((vercel.redirects ?? []).indexOf(rules[1])).toBeLessThan(firstPathRule);
  });

  // Links and emails from the old marketing site point at these files.
  it('serves the images the old troystack.com linked to', () => {
    for (const f of ['icon.png', 'og-calculator.png', 'og-speculation.png', 'og-junk-silver.png', 'screenshot.png']) {
      expect(existsSync(new URL(`../../public/${f}`, import.meta.url))).toBe(true);
    }
  });

  // The app's reset email lands on troystack.com/auth/reset-password, which the
  // association file sends into the iOS app. Without the app the browser loads
  // it, so it goes to the app's own reset page. The browser carries the
  // fragment, where Supabase puts the reset session, through the redirect.
  it("sends a reset link opened without the app to the app's reset page", () => {
    const rule = (vercel.redirects ?? []).find((item: { source: string }) => item.source === '/auth/reset-password');
    expect(rule).toMatchObject({ destination: '/reset-password', permanent: false });
    expect(rule.has).toBeUndefined();
  });

  it('keeps signed-in app routes on the shell', () => {
    const sources = (vercel.rewrites ?? []).map((rule: { source: string }) => rule.source);
    for (const path of ['/settings', '/auth', '/reset-password', '/developers/keys', '/troy/c/:conversationId']) {
      expect(sources).toContain(path);
    }
  });
});
