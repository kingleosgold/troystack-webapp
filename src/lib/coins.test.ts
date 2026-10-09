import { describe, expect, it } from 'vitest';
import { COINS, COIN_GROUPS, aOrAn, coinBySlug, inSentence, isCollectible, ounces, relatedCoins } from './coins';
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
