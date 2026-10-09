import { describe, expect, it } from 'vitest';
import { withoutFilledStart } from './history';
import type { HistoryPoint } from './marketApi';

const FILL = 937.71;

function point(date: string, platinum: number, palladium = platinum, gold = 2600): HistoryPoint {
  return { date, gold, silver: 30, platinum, palladium };
}

/** Twelve monthly points through 2024 carrying the fill, as the API sends them. */
function filledYear(): HistoryPoint[] {
  return Array.from({ length: 12 }, (_, i) => point(`2024-${String(i + 1).padStart(2, '0')}-01`, FILL));
}

describe('long-run history', () => {
  it('blanks the repeated platinum and palladium fill and keeps the first real price', () => {
    const pts = [...filledYear(), point('2025-02-18', FILL), point('2025-02-21', 950), point('2025-02-24', 955)];
    const out = withoutFilledStart(pts);
    expect(out.slice(0, 12).every((p) => p.platinum === 0 && p.palladium === 0)).toBe(true);
    expect(out[12]).toMatchObject({ date: '2025-02-18', platinum: FILL, palladium: FILL });
    expect(out[13].platinum).toBe(950);
  });

  it('blanks a last repeat that is a monthly fill point, so the chart starts at a real day', () => {
    // The first real day was thinned away, so the run ends on December 1.
    const pts = [...filledYear(), point('2025-02-21', 950), point('2025-02-24', 955)];
    const out = withoutFilledStart(pts);
    expect(out.slice(0, 12).every((p) => p.platinum === 0)).toBe(true);
    expect(out.find((p) => p.platinum > 0)?.date).toBe('2025-02-21');
  });

  it("leaves gold's real flat years alone", () => {
    const pts = Array.from({ length: 15 }, (_, i) => point(`${1920 + i}-01-01`, 900 + i, 800 + i, i < 12 ? 20.67 : 35));
    expect(withoutFilledStart(pts)).toEqual(pts);
  });

  it('keeps a short run and a series that never moves', () => {
    const short = Array.from({ length: 15 }, (_, i) => point(`${2010 + i}-01-01`, i < 3 ? 1000 : 1000 + i, 500 + i));
    expect(withoutFilledStart(short)).toEqual(short);
    const flat = Array.from({ length: 15 }, (_, i) => point(`${2010 + i}-01-01`, 1000));
    expect(withoutFilledStart(flat)).toEqual(flat);
    expect(withoutFilledStart([])).toEqual([]);
  });
});
