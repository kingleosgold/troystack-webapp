import { describe, expect, it } from 'vitest';
import { METALS } from './metals';
import { OZT_PER_DWT, PURITIES, WEIGHTS, perGram, purityPercent } from './purity';

describe('prices by weight and purity', () => {
  it('values a gram, a pennyweight and a kilo from the ounce price', () => {
    const spot = 4180.8;
    expect(perGram(spot)).toBeCloseTo(134.4158, 3);
    expect(spot * OZT_PER_DWT).toBeCloseTo(209.04, 2);
    expect(WEIGHTS.map((w) => w.label)).toEqual(['Per gram', 'Per pennyweight', 'Per troy ounce', 'Per kilo']);
  });

  it('prices karat gold by its share of pure gold', () => {
    const k14 = PURITIES.gold.find((p) => p.short === '14k')!;
    expect(perGram(4180.8, k14.fineness)).toBeCloseTo(78.4092, 3);
  });

  it('lists purities from purest down for every metal', () => {
    for (const m of METALS) {
      const list = PURITIES[m];
      expect(list.length, m).toBeGreaterThan(0);
      for (let i = 0; i < list.length; i++) {
        expect(list[i].fineness, m).toBeGreaterThan(0);
        expect(list[i].fineness, m).toBeLessThanOrEqual(1);
        if (i > 0) expect(list[i].fineness, m).toBeLessThan(list[i - 1].fineness);
      }
    }
  });

  it('prices 24 karat and fine silver at spot, the way buyers quote them', () => {
    expect(perGram(4180.8, PURITIES.gold[0].fineness)).toBe(perGram(4180.8));
    expect(PURITIES.silver[0].fineness).toBe(1);
  });

  it('writes purity the way the melt calculator shows it', () => {
    expect(purityPercent(1)).toBe('100');
    expect(purityPercent(0.999)).toBe('99.9');
    expect(purityPercent(14 / 24)).toBe('58.33');
    expect(purityPercent(22 / 24)).toBe('91.67');
    expect(purityPercent(0.925)).toBe('92.5');
  });
});
