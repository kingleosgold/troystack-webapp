import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS shared with the build
import * as html from '../../scripts/coin-html.mjs';
import { COINS, coinBySlug, otherEras, relatedCoins } from './coins';
import COPY from './coinCopy.json';
import JUNK from './junkSilverPage.json';
import SEO from './seo.json';

const ADVICE = /buy now|good time to buy|undervalued|will rise|guaranteed return/i;
const PRIORITY = [
  'american-silver-eagle',
  'silver-roosevelt-dime',
  'morgan-silver-dollar',
  'american-gold-eagle',
  'american-gold-eagle-tenth-oz',
  'south-african-krugerrand',
  'canadian-silver-maple-leaf',
  'silver-washington-quarter',
  '1964-kennedy-half-dollar',
  'mercury-dime',
  'peace-silver-dollar',
  'canadian-gold-maple-leaf',
  'american-gold-buffalo',
];
const FRESH = { timestamp: '2026-10-28T07:00:00.000Z', marketsClosed: false, prices: { silver: { price: 48.5 }, gold: { price: 4000 } } };
const NOW = Date.parse('2026-10-28T08:00:00.000Z');

describe('coin page FAQs', () => {
  const pages = [...COINS.filter((c) => c.faq), { slug: 'junk-silver', faq: JUNK.faq }];

  it('cover the priority pages with 4 to 7 questions each', () => {
    for (const slug of PRIORITY) {
      const faq = coinBySlug(slug)?.faq ?? [];
      expect(faq.length, slug).toBeGreaterThanOrEqual(4);
      expect(faq.length, slug).toBeLessThanOrEqual(7);
    }
    expect(JUNK.faq.length).toBeGreaterThanOrEqual(4);
  });

  it('answer in 40 to 80 words with no dollar amount, dash or advice, since the text never refreshes', () => {
    for (const p of pages) {
      for (const { q, a } of p.faq!) {
        const words = a.split(/\s+/).length;
        expect(words, `${p.slug}: ${q}`).toBeGreaterThanOrEqual(40);
        expect(words, `${p.slug}: ${q}`).toBeLessThanOrEqual(80);
        expect(`${q} ${a}`, p.slug).not.toMatch(/[$–—]/);
        expect(`${q} ${a}`, p.slug).not.toMatch(ADVICE);
      }
    }
  });

  it('cite a source and a date on every page that has one', () => {
    for (const c of COINS) {
      expect(c.modified, c.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (c.faq) expect(c.sources?.length, c.slug).toBeGreaterThan(0);
      for (const s of c.sources ?? []) expect(s.url, c.slug).toMatch(/^https:\/\/www\.(usmint\.gov|mint\.ca|randrefinery\.com)\//);
    }
  });

  it('keep the copy free of advice', () => {
    for (const text of [...Object.values(COPY), ...COINS.map((c) => `${c.title} ${c.description} ${c.about} ${c.h1 ?? ''}`)]) {
      expect(text).not.toMatch(ADVICE);
      expect(text).not.toMatch(/[–—]/);
    }
  });
});

describe('the prerendered coin page', () => {
  it('links the same related coins the app shows', () => {
    for (const c of COINS) {
      expect(html.relatedCoins(COINS, c).map((o: { slug: string }) => o.slug), c.slug).toEqual(relatedCoins(c).map((o) => o.slug));
      expect(html.otherEras(COINS, c).map((o: { slug: string }) => o.slug), c.slug).toEqual(otherEras(c).map((o) => o.slug));
    }
  });

  it('carries at least 8 internal links on every coin page', () => {
    for (const c of COINS) {
      const body: string = html.coinBody(COINS, c, null, COPY);
      const internal = [...body.matchAll(/<a href="(\/[^"]*)"/g)];
      expect(internal.length, c.slug).toBeGreaterThanOrEqual(8);
    }
  });

  it('opens with the heading, the answer, the specs, the FAQ and the sources', () => {
    const c = coinBySlug('american-silver-eagle')!;
    const body: string = html.coinBody(COINS, c, html.usableSnapshot(FRESH, 'silver', NOW), COPY);
    expect(body).toContain('<h1>American Silver Eagle value today</h1>');
    expect(body).toContain('An American Silver Eagle holds 1 troy oz of silver. At silver spot of $48.50, one coin melts to $48.50 (as of Oct 28, 2026, 3:00 AM ET).');
    expect(body).toContain('<th scope="row">Purity</th><td>.999 fine</td>');
    expect(body).toContain('<h3>Why do Silver Eagles cost more than spot?</h3>');
    expect(body).toContain(COPY.bullion);
    expect(body).toContain('href="https://www.usmint.gov/coins/coin-medal-programs/american-eagle/silver-bullion"');
    expect(body).toContain('href="/stack?add=1&amp;coin=american-silver-eagle"');
    expect(body).toContain('href="/prices/silver"');
  });

  it('values a fraction of an ounce to the cent and says when markets are closed', () => {
    const c = coinBySlug('silver-roosevelt-dime')!;
    const snap = html.usableSnapshot({ ...FRESH, marketsClosed: true }, 'silver', NOW);
    // 0.07234 oz at $48.50
    expect(html.answerSentence(c, snap)).toBe('A silver Roosevelt dime holds 0.0723 troy oz of silver. At silver spot of $48.50, one coin melts to $3.51 (markets closed, last price Oct 28, 2026, 3:00 AM ET).');
  });

  it('leaves the number out when the build has no fresh price', () => {
    const c = coinBySlug('morgan-silver-dollar')!;
    expect(html.usableSnapshot(null, 'silver', NOW)).toBeNull();
    expect(html.usableSnapshot({ ...FRESH, prices: { silver: { price: 0 } } }, 'silver', NOW)).toBeNull();
    expect(html.usableSnapshot({ ...FRESH, timestamp: '2026-10-20T00:00:00Z' }, 'silver', NOW)).toBeNull();
    expect(html.usableSnapshot(FRESH, 'platinum', NOW)).toBeNull();
    const line: string = html.answerSentence(c, null);
    expect(line).toBe('A Morgan silver dollar holds 0.7734 troy oz of silver. Its melt value is that weight times live silver spot.');
    expect(html.coinBody(COINS, c, null, COPY)).not.toContain('melts to');
  });

  it('writes one structured data block whose FAQ matches the page word for word, with no price in it', () => {
    for (const c of COINS) {
      const ld = html.coinLd(c);
      const types = ld['@graph'].map((n: { '@type': string }) => n['@type']);
      expect(types, c.slug).toEqual(c.faq ? ['BreadcrumbList', 'WebPage', 'FAQPage'] : ['BreadcrumbList', 'WebPage']);
      const page = ld['@graph'][1];
      expect(page['@id']).toBe(`https://troystack.ai/coins/${c.slug}`);
      expect(page.dateModified).toBe(c.modified);
      expect(page).not.toHaveProperty('reviewedBy');
      if (!c.faq) continue;
      const faq = ld['@graph'][2].mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => ({ q: q.name, a: q.acceptedAnswer.text }));
      expect(faq).toEqual(c.faq);
      expect(JSON.stringify(faq)).not.toContain('$');
    }
  });

  it('does the same for the junk silver calculator, with both silver figures', () => {
    const body: string = html.junkBody(JUNK, COINS, html.usableSnapshot(FRESH, 'silver', NOW), COPY);
    expect(body).toContain('<h1>Junk silver melt value calculator</h1>');
    // 0.7234 and 0.715 oz at $48.50
    expect(body).toContain("that's $35.08");
    expect(body).toContain("that's $34.68");
    expect(body).toContain('href="/coins/mercury-dime"');
    const ld = html.junkLd(JUNK, SEO['/tools/junk-silver']);
    expect(ld['@graph'].map((n: { '@type': string }) => n['@type'])).toEqual(['BreadcrumbList', 'WebPage', 'FAQPage']);
    expect(ld['@graph'][2].mainEntity).toHaveLength(JUNK.faq.length);
  });

  it('escapes text so a quote or bracket in the copy cannot break the page', () => {
    expect(html.escape('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('leaves lastmod out of a sitemap row with no date of its own', () => {
    expect(html.sitemapRow('https://troystack.ai/coins', undefined)).toBe('  <url><loc>https://troystack.ai/coins</loc></url>');
    expect(html.sitemapRow('https://troystack.ai/coins/mercury-dime', '2026-10-28')).toBe('  <url><loc>https://troystack.ai/coins/mercury-dime</loc><lastmod>2026-10-28</lastmod></url>');
  });
});
