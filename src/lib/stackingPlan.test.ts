import { describe, expect, it } from 'vitest';
import type { HistoryPoint } from './marketApi';
import { priceOnFirstOf, runPlan } from './stackingPlan';

function point(date: string, silver: number, gold = 0): HistoryPoint {
  return { date, gold, silver, platinum: 0, palladium: 0 };
}

describe('price on the first of a month', () => {
  const points = [point('2020-01-01', 18), point('2020-03-01', 16), point('2020-04-01', 15)];
  const at = priceOnFirstOf(points, 'silver');

  it('uses the sample when the month has one', () => {
    expect(at(2020, 1)).toBe(18);
    expect(at(2020, 4)).toBe(15);
  });

  it('reads a thinned-out month off the line between its neighbors', () => {
    // Feb 1 sits 31 of the 60 days from Jan 1 to Mar 1.
    expect(at(2020, 2)).toBeCloseTo(18 - (2 * 31) / 60, 6);
  });

  it('holds the first and last samples beyond the ends', () => {
    expect(at(2019, 6)).toBe(18);
    expect(at(2020, 9)).toBe(15);
  });

  it('answers 0 with no samples for the metal', () => {
    expect(priceOnFirstOf(points, 'gold')(2020, 2)).toBe(0);
  });
});

describe('stacking plan', () => {
  const now = new Date(Date.UTC(2020, 3, 15));

  it('buys every month at the interpolated price, not a stale one', () => {
    const points = [point('2020-01-01', 20), point('2020-03-01', 10), point('2020-04-01', 10)];
    const result = runPlan(points, 'silver', 100, 2020, 0, 10, now)!;
    expect(result.months).toBe(4);
    expect(result.invested).toBe(400);
    const feb = 20 - (10 * 31) / 60;
    expect(result.ounces).toBeCloseTo(100 / 20 + 100 / feb + 100 / 10 + 100 / 10, 6);
    expect(result.value).toBeCloseTo(result.ounces * 10, 6);
  });

  it('counts the premium in what each month buys', () => {
    const points = [point('2020-01-01', 10), point('2020-04-01', 10)];
    const result = runPlan(points, 'silver', 110, 2020, 10, 10, now)!;
    expect(result.ounces).toBeCloseTo(4 * (110 / 11), 6);
  });

  it('has no value for today without a live price, instead of using an old sample', () => {
    const points = [point('2020-01-01', 20), point('2020-04-01', 10)];
    for (const spot of [0, null]) {
      const result = runPlan(points, 'silver', 100, 2020, 0, spot, now)!;
      expect(result.value).toBeNull();
      expect(result.months).toBe(4);
      // The chart ends on the first of this month at that day's price.
      expect(result.series[result.series.length - 1].v).toBeCloseTo(result.ounces * 10, 6);
    }
  });

  it('values the last point at the live price when there is one', () => {
    const points = [point('2020-01-01', 20), point('2020-04-01', 10)];
    const result = runPlan(points, 'silver', 100, 2020, 0, 12, now)!;
    expect(result.value).toBeCloseTo(result.ounces * 12, 6);
    expect(result.series[result.series.length - 1].v).toBeCloseTo(result.ounces * 12, 6);
  });

  it('has nothing to show without history or an amount', () => {
    expect(runPlan([], 'silver', 100, 2020, 0, 10, now)).toBeNull();
    expect(runPlan([point('2020-01-01', 10)], 'silver', 0, 2020, 0, 10, now)).toBeNull();
  });
});
