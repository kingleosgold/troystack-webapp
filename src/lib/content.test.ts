// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { excerpt, plainDashes } from './text';
import { normalizeArticle, usableOneLiner } from './signalApi';
import { parsePodcastFeed } from './podcastApi';
import { rememberCheckout, rememberNextPath, safeNextPath, sheetReturnPath, siteCampaign, takeCheckoutIntent, takeNextPath } from './checkout';
import { appStoreUrl } from './appStore';

describe('copy clean-up', () => {
  it('turns em dashes into commas or hyphens', () => {
    expect(plainDashes('The Stack Signal \u2014 October 8, 2026')).toBe('The Stack Signal, October 8, 2026');
    expect(plainDashes('the underlying current\u2014that the Fed is losing\u2014is what matters')).toBe('the underlying current, that the Fed is losing, is what matters');
    expect(plainDashes('from 2008–2012')).toBe('from 2008-2012');
    expect(plainDashes('\u2014 a quote')).toBe('a quote');
    expect(plainDashes('he said no\u2014')).toBe('he said no');
  });

  it('cuts excerpts at a word and drops markdown', () => {
    const e = excerpt('Gold is up **$16** an oz today and the ratio sits near **69.6:1** for now', 40);
    expect(e).not.toContain('**');
    expect(e.endsWith('…')).toBe(true);
    expect(e.length).toBeLessThanOrEqual(41);
  });
});

describe('Signal stories', () => {
  it('ignores one-liners that were cut off', () => {
    expect(usableOneLiner('Fed')).toBe('');
    expect(usableOneLiner('Gold shines as')).toBe('');
    expect(usableOneLiner('Fed minutes hammered paper gold, but the PBOC tells the real story.')).not.toBe('');
  });

  it('normalizes titles and drops duplicate sources', () => {
    const a = normalizeArticle({
      slug: 's',
      title: 'Fed \u2014 yields and gold',
      troy_one_liner: 'Fed',
      sources: [
        { name: 'Kitco', title: 'Gold firms \u2014 Kitco', url: 'https://example.com' },
        { name: 'Kitco', title: 'Gold firms \u2014 Kitco', url: 'https://example.com' },
      ],
    });
    expect(a.title).toBe('Fed, yields and gold');
    expect(a.oneLiner).toBe('');
    expect(a.sources).toHaveLength(1);
    expect(a.sources[0].title).toBe('Gold firms, Kitco');
  });
});

describe('podcast feed', () => {
  it('reads episodes newest first', () => {
    const show = parsePodcastFeed(`<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>The Stack Signal</title>
      <item><title>Older \u2014 one</title><guid>a</guid><pubDate>Tue, 06 Oct 2026 21:40:00 GMT</pubDate><enclosure url="https://x/a.mp3" type="audio/mpeg"/><itunes:duration>04:12</itunes:duration></item>
      <item><title>Newer</title><guid>b</guid><pubDate>Wed, 07 Oct 2026 21:40:00 GMT</pubDate><enclosure url="https://x/b.mp3" type="audio/mpeg"/><itunes:duration>250</itunes:duration></item>
      <item><title>No audio</title><guid>c</guid><pubDate>Thu, 08 Oct 2026 21:40:00 GMT</pubDate></item>
    </channel></rss>`);
    expect(show.episodes.map((e) => e.slug)).toEqual(['b', 'a']);
    expect(show.episodes[1].title).toBe('Older, one');
    expect(show.episodes[1].durationSec).toBe(252);
    expect(show.episodes[0].durationSec).toBe(250);
  });
});

describe('sign-in hand-offs', () => {
  afterEach(() => localStorage.clear());

  it('opens checkout only for a plan picked in the last half hour', () => {
    const now = Date.parse('2026-10-08T20:00:00Z');
    rememberCheckout('yearly', 'webapp-troy-limit', now);
    expect(takeCheckoutIntent(now + 10 * 60_000)).toEqual({ plan: 'yearly', campaign: 'webapp-troy-limit' });
    expect(takeCheckoutIntent(now + 10 * 60_000)).toBeNull();

    rememberCheckout('monthly', undefined, now);
    expect(takeCheckoutIntent(now + 31 * 60_000)).toBeNull();
  });

  it('carries a troystack.com campaign into checkout, and only a well-formed one', () => {
    expect(siteCampaign('site-pricing')).toBe('site-pricing');
    expect(siteCampaign('webapp-trial')).toBeUndefined();
    expect(siteCampaign('site-Pricing')).toBeUndefined();
    expect(siteCampaign('site-' + 'x'.repeat(40))).toBeUndefined();
    expect(siteCampaign(null)).toBeUndefined();
    const now = Date.parse('2026-10-08T20:00:00Z');
    rememberCheckout('monthly', siteCampaign('site-pricing'), now);
    expect(takeCheckoutIntent(now + 60_000)).toEqual({ plan: 'monthly', campaign: 'site-pricing' });
  });

  it("keeps the campaign when the plan sheet's sign-in link repeats the plan without one", () => {
    const now = Date.parse('2026-10-08T20:00:00Z');
    rememberCheckout('yearly', 'webapp-troy-limit', now);
    rememberCheckout('yearly', undefined, now + 1000, true);
    expect(takeCheckoutIntent(now + 2000)).toEqual({ plan: 'yearly', campaign: 'webapp-troy-limit' });

    rememberCheckout('yearly', 'webapp-troy-limit', now);
    rememberCheckout('monthly', undefined, now + 1000, true);
    expect(takeCheckoutIntent(now + 2000)).toEqual({ plan: 'monthly' });

    // A link's own token wins over the kept one.
    rememberCheckout('yearly', 'webapp-gold', now);
    rememberCheckout('yearly', 'site-pricing', now + 1000, true);
    expect(takeCheckoutIntent(now + 2000)).toEqual({ plan: 'yearly', campaign: 'site-pricing' });
  });

  it("doesn't hand a kept campaign to a different sign-in link for the same plan", () => {
    const now = Date.parse('2026-10-08T20:00:00Z');
    rememberCheckout('yearly', 'webapp-gold', now);
    rememberCheckout('yearly', undefined, now + 10 * 60_000);
    expect(takeCheckoutIntent(now + 10 * 60_000 + 1000)).toEqual({ plan: 'yearly' });
  });

  it('forgets a return path after half an hour, and one saved without a time', () => {
    const now = Date.parse('2026-10-08T20:00:00Z');
    rememberNextPath('/troy', now);
    expect(takeNextPath(now + 31 * 60_000)).toBeNull();
    rememberNextPath('/troy', now);
    expect(takeNextPath(now + 60_000)).toBe('/troy');
    localStorage.setItem('stg_auth_next', '/troy');
    expect(takeNextPath(now)).toBeNull();
  });

  it('drops an older return path when the sign-in page opens without one', () => {
    const now = Date.parse('2026-10-08T20:00:00Z');
    rememberNextPath('/stack', now);
    rememberNextPath(null, now + 60_000);
    expect(takeNextPath(now + 120_000)).toBeNull();
    rememberNextPath('/stack', now);
    rememberNextPath('//evil.example', now + 60_000);
    expect(takeNextPath(now + 120_000)).toBeNull();
  });

  it('ignores the bare plan names the old site left behind', () => {
    localStorage.setItem('stg_checkout_redirect', 'monthly');
    expect(takeCheckoutIntent()).toBeNull();
  });

  it('only returns to pages on this site', () => {
    expect(safeNextPath('/troy')).toBe('/troy');
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('/auth?next=/x')).toBeNull();
    rememberNextPath('/stack?import=1');
    expect(takeNextPath()).toBe('/stack?import=1');
    expect(takeNextPath()).toBeNull();
  });

  it("sends the plan sheet's sign-in back to the page with only its troystack.com token", () => {
    expect(sheetReturnPath('/gold', '?campaign=site-pricing')).toBe('/gold?campaign=site-pricing');
    expect(sheetReturnPath('/gold', '?campaign=site-pricing&back=1')).toBe('/gold?campaign=site-pricing');
    expect(sheetReturnPath('/gold', '?back=1&campaign=site-signal&x=1')).toBe('/gold?campaign=site-signal');
    expect(sheetReturnPath('/gold', '?campaign=webapp-trial')).toBe('/gold');
    expect(sheetReturnPath('/gold', '?campaign=site-%2F%2Fevil')).toBe('/gold');
    expect(sheetReturnPath('/troy', '')).toBe('/troy');
    expect(safeNextPath(sheetReturnPath('/gold', '?campaign=site-pricing'))).toBe('/gold?campaign=site-pricing');
  });
});

describe('App Store links', () => {
  it('carry the provider and campaign tokens', () => {
    const url = new URL(appStoreUrl('webapp-troy-limit'));
    expect(url.pathname).toContain('id6757343766');
    expect(url.searchParams.get('pt')).toBe('96487801');
    expect(url.searchParams.get('ct')).toBe('webapp-troy-limit');
    expect(new URL(appStoreUrl('webapp-home', true)).searchParams.get('ct')).toBe('webapp-home-qr');
  });
});
