import { describe, expect, it } from 'vitest';
import { amount, ounces, ratioContext, stackPower } from './purchasingPower';

describe('stack purchasing power', () => {
  it('values the stack at spot and against 1971', () => {
    const r = stackPower(1, 100, 4000, 50)!;
    expect(r.goldValue).toBe(4000);
    expect(r.silverValue).toBe(5000);
    expect(r.total).toBe(9000);
    expect(r.value1971).toBeCloseTo(35 + 129, 6);
    expect(r.barrels1971).toBeCloseTo(164 / 3.6, 6);
    expect(r.barrelsToday).toBeCloseTo(9000 / 70, 6);
    expect(r.ratio).toBe(80);
  });

  it('has nothing to say without a stack or without both prices', () => {
    expect(stackPower(0, 0, 4000, 50)).toBeNull();
    expect(stackPower(1, 0, 0, 50)).toBeNull();
    expect(stackPower(0, 10, 4000, 0)).toBeNull();
  });

  it('reads only positive numbers as ounces', () => {
    expect(ounces('2.5')).toBe(2.5);
    expect(ounces('-1')).toBe(0);
    expect(ounces('abc')).toBe(0);
    expect(ounces(null)).toBe(0);
  });

  it('places the ratio against its long-run average', () => {
    expect(ratioContext(85)).toMatch(/^Above 80/);
    expect(ratioContext(70)).toMatch(/leaning cheap/);
    expect(ratioContext(60)).toMatch(/^Near/);
    expect(ratioContext(40)).toMatch(/^Below 50/);
  });

  it('rounds big amounts to whole numbers', () => {
    expect(amount(1234.56)).toBe('1,235');
    expect(amount(12.34)).toBe('12.3');
    expect(amount(Number.NaN)).toBe('0');
  });
});
