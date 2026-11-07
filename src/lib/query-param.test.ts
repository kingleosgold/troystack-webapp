import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module shared with the Vercel functions
import { queryParam } from '../../api/_lib/query.js';

describe('queryParam', () => {
  it('reads a parameter from req.url', () => {
    expect(queryParam({ url: '/api/coin-html?slug=morgan-silver-dollar' }, 'slug')).toBe('morgan-silver-dollar');
  });
  it('decodes percent and plus encoding the way req.query did', () => {
    expect(queryParam({ url: '/api/signal-html?slug=a%20b+c' }, 'slug')).toBe('a b c');
  });
  it('gives the first value of a repeated key', () => {
    expect(queryParam({ url: '/x?slug=one&slug=two' }, 'slug')).toBe('one');
  });
  it("gives '' for a missing, empty or unparseable url", () => {
    expect(queryParam({ url: '/x' }, 'slug')).toBe('');
    expect(queryParam({ url: '/x?slug=' }, 'slug')).toBe('');
    expect(queryParam({}, 'slug')).toBe('');
    expect(queryParam({ url: '//[' }, 'slug')).toBe('');
  });
});
