import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTH_ALIASES, authAliasTarget } from './authAliases';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

describe('sign-up and sign-in addresses', () => {
  it('opens the matching form', () => {
    expect(authAliasTarget('signup', '')).toBe('/auth?mode=signup');
    expect(authAliasTarget('signin', '')).toBe('/auth?mode=signin');
  });

  it('keeps where the visitor was headed', () => {
    expect(authAliasTarget('signup', '?next=%2Ftroy')).toBe('/auth?next=%2Ftroy&mode=signup');
  });

  it('lets the address decide the form over a stray mode value', () => {
    expect(authAliasTarget('signup', '?mode=forgot')).toBe('/auth?mode=signup');
  });

  it('matches the redirects Vercel serves, so a typed address never hits the 404 page', () => {
    for (const { path, mode } of AUTH_ALIASES) {
      const rule = vercel.redirects.find((r: { source: string }) => r.source === path);
      expect(rule, path).toBeDefined();
      expect(rule.destination).toBe(`/auth?mode=${mode}`);
      expect(rule.permanent).toBe(false);
    }
  });

  it('never redirects /auth itself', () => {
    expect(vercel.redirects.some((r: { source: string }) => r.source === '/auth')).toBe(false);
  });
});
