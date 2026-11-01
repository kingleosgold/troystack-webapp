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

  it('sends www.troystack.com to troystack.com', () => {
    const rule = (vercel.redirects ?? []).find((item: { has?: Array<{ value: string }> }) => item.has?.[0]?.value === 'www.troystack.com');
    expect(rule).toMatchObject({ source: '/:path*', destination: 'https://troystack.com/:path*', permanent: true });
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
