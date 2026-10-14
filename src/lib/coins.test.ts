import { describe, expect, it } from 'vitest';
import { COINS, COIN_GROUPS, aOrAn, coinBySlug, inSentence, isCollectible, otherEras, ounces, relatedCoins } from './coins';
import { METALS, OZT_PER_GRAM } from './metals';

describe('the coin catalog', () => {
  it('gives every piece its own address', () => {
    const slugs = COINS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('files every piece under a group of its own metal', () => {
    for (const c of COINS) {
      expect(METALS).toContain(c.metal);
      const group = COIN_GROUPS.find((g) => g.id === c.group);
      expect(group, c.slug).toBeDefined();
      expect(group!.metal, c.slug).toBe(c.metal);
    }
    for (const g of COIN_GROUPS) expect(COINS.some((c) => c.group === g.id), g.id).toBe(true);
  });

  it('holds metal that agrees with each piece weight and purity', () => {
    for (const c of COINS) {
      expect(c.fineOzt, c.slug).toBeGreaterThan(0);
      expect(c.fineness, c.slug).toBeGreaterThan(0);
      expect(c.fineness, c.slug).toBeLessThanOrEqual(1);
      if (c.grossGrams == null) continue;
      const fromSpecs = c.grossGrams * OZT_PER_GRAM * c.fineness;
      // Bullion is sold on its stated content, which can round the last
      // tenth of a percent, as with a .999 coin sold as a full ounce.
      expect(Math.abs(fromSpecs - c.fineOzt) / c.fineOzt, c.slug).toBeLessThan(0.005);
    }
  });

  it('keeps titles and descriptions short enough for search results, in house style', () => {
    for (const c of COINS) {
      expect(c.title.length, c.slug).toBeLessThanOrEqual(60);
      expect(c.description.length, c.slug).toBeLessThanOrEqual(160);
      expect(c.title, c.slug).toMatch(/today/);
      for (const text of [c.name, c.title, c.description, c.about, c.purity, c.face ?? '', c.mint ?? '', c.years ?? '']) {
        expect(text, c.slug).not.toMatch(/[–—]/);
      }
    }
  });

  it('finds a piece by its address and nothing for a wrong one', () => {
    expect(coinBySlug('morgan-silver-dollar')?.fineOzt).toBe(0.77344);
    expect(coinBySlug('nope')).toBeUndefined();
    expect(coinBySlug(undefined)).toBeUndefined();
  });

  it('suggests other pieces from the same group first, never the piece itself', () => {
    const morgan = coinBySlug('morgan-silver-dollar')!;
    const related = relatedCoins(morgan);
    expect(related).toHaveLength(6);
    expect(related.map((c) => c.slug)).not.toContain('morgan-silver-dollar');
    expect(related.every((c) => c.group === 'us-silver')).toBe(true);
    const palladium = relatedCoins(coinBySlug('american-palladium-eagle')!);
    expect(palladium.every((c) => c.metal === 'palladium')).toBe(true);
  });

  it('marks older US silver and old gold as worth checking against a price guide', () => {
    expect(isCollectible(coinBySlug('mercury-dime')!)).toBe(true);
    expect(isCollectible(coinBySlug('20-dollar-double-eagle')!)).toBe(true);
    expect(isCollectible(coinBySlug('american-silver-eagle')!)).toBe(false);
  });
});

describe('coins struck to different specs over the years', () => {
  it('holds a full ounce in a Panda from before 2016 and 30 grams in one since', () => {
    for (const metal of ['silver', 'gold']) {
      const now = coinBySlug(`chinese-${metal}-panda`)!;
      const before = coinBySlug(`chinese-${metal}-panda-1-oz`)!;
      expect(now, metal).toMatchObject({ grossGrams: 30, fineness: 0.999, years: '2016 to today' });
      expect(before, metal).toMatchObject({ fineOzt: 1, fineness: 0.999 });
      // The 30 gram coin holds about 3.6% less, which valuing an older coin as one would lose.
      expect(1 - now.fineOzt / before.fineOzt, metal).toBeCloseTo(0.036, 3);
    }
    expect(coinBySlug('chinese-silver-panda-1-oz')!.years).toBe('1989 to 2015');
    expect(coinBySlug('chinese-gold-panda-1-oz')!.years).toBe('1982 to 2015');
  });

  it('gives Britannias from before 2013 their own purity and heavier blank, and early Maple Leafs theirs', () => {
    expect(coinBySlug('british-silver-britannia-1997-2012')).toMatchObject({ fineOzt: 1, fineness: 0.958, grossGrams: 32.45, years: '1997 to 2012' });
    expect(coinBySlug('british-silver-britannia')).toMatchObject({ fineOzt: 1, fineness: 0.999, years: '2013 to today' });
    expect(coinBySlug('british-gold-britannia-1987-2012')).toMatchObject({ fineOzt: 1, fineness: 0.9167, grossGrams: 34.05, purity: '22 karat (91.67%)', years: '1987 to 2012' });
    expect(coinBySlug('british-gold-britannia')).toMatchObject({ fineOzt: 1, fineness: 0.9999, years: '2013 to today' });
    expect(coinBySlug('canadian-gold-maple-leaf-1979-1982')).toMatchObject({ fineOzt: 1, fineness: 0.999, years: '1979 to 1982' });
    expect(coinBySlug('canadian-gold-maple-leaf')).toMatchObject({ fineOzt: 1, fineness: 0.9999, years: 'late 1982 to today' });
  });

  it('keeps the addresses these coins had, and links each run of years to the others', () => {
    for (const slug of ['chinese-silver-panda', 'chinese-gold-panda', 'british-silver-britannia', 'british-gold-britannia', 'canadian-gold-maple-leaf']) {
      expect(coinBySlug(slug)?.series, slug).toBe(slug);
    }
    const series = COINS.filter((c) => c.series);
    expect(series).toHaveLength(10);
    for (const c of series) {
      const eras = otherEras(c);
      expect(eras.length, c.slug).toBe(1);
      expect(eras[0].metal, c.slug).toBe(c.metal);
      expect(eras[0].years, c.slug).not.toBe(c.years);
      // The other years have a link of their own, so they aren't among the suggestions too.
      expect(relatedCoins(c).map((r) => r.slug), c.slug).not.toContain(eras[0].slug);
    }
    expect(otherEras(coinBySlug('morgan-silver-dollar')!)).toEqual([]);
  });
});

describe('coin wording', () => {
  it('picks a or an', () => {
    expect(aOrAn('American Silver Eagle')).toBe('an');
    expect(aOrAn('1 oz gold bar')).toBe('a');
    expect(aOrAn('Morgan silver dollar')).toBe('a');
  });

  it('lowercases descriptive names mid-sentence and keeps proper ones', () => {
    expect(inSentence(coinBySlug('war-nickel')!)).toBe('war nickel');
    expect(inSentence(coinBySlug('silver-roosevelt-dime')!)).toBe('silver Roosevelt dime');
    expect(inSentence(coinBySlug('mercury-dime')!)).toBe('Mercury dime');
  });

  it('writes ounces without trailing zeros', () => {
    expect(ounces(1)).toBe('1');
    expect(ounces(0.77344)).toBe('0.7734');
    expect(ounces(32.1507)).toBe('32.15');
    expect(ounces(100)).toBe('100');
  });
});
