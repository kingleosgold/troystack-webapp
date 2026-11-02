import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTH_ALIASES } from './authAliases';
import { PAGE_ALIASES, pageAliasTarget } from './pageAliases';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

describe('pricing and download addresses', () => {
  it('opens the page with nothing added', () => {
    expect(pageAliasTarget('/gold', '')).toBe('/gold');
    expect(pageAliasTarget('/gold', '?')).toBe('/gold');
  });

  it('keeps a campaign token and every other query value as it came', () => {
    expect(pageAliasTarget('/gold', '?campaign=site-pricing&x=1')).toBe('/gold?campaign=site-pricing&x=1');
    expect(pageAliasTarget('/app', 'ref=a')).toBe('/app?ref=a');
  });

  it('matches the redirects Vercel serves, so a typed address never hits the 404 page', () => {
    for (const { path, to } of PAGE_ALIASES) {
      const rule = vercel.redirects.find((r: { source: string }) => r.source === path);
      expect(rule, path).toBeDefined();
      expect(rule.destination).toBe(to);
      expect(rule.permanent).toBe(false);
    }
  });

  it('never redirects a page the app already serves, or an auth alias', () => {
    const taken = new Set(['/gold', '/app', '/auth', ...AUTH_ALIASES.map((a) => a.path)]);
    for (const { path } of PAGE_ALIASES) expect(taken.has(path), path).toBe(false);
    expect(new Set(PAGE_ALIASES.map((a) => a.path)).size).toBe(PAGE_ALIASES.length);
  });
});
