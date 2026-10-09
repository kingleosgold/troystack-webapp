import { describe, expect, it } from 'vitest';
import { withoutFilledStart } from './history';
import type { HistoryPoint } from './marketApi';

function series(n: number, at: (i: number) => Partial<HistoryPoint>): HistoryPoint[] {
  return Array.from({ length: n }, (_, i) => ({ date: `20${String(10 + i).padStart(2, '0')}-01-01`, gold: 20.67, silver: 1, platinum: 0, palladium: 0, ...at(i) }));
}

describe('long-run history', () => {
  it('blanks the repeated platinum and palladium fill but keeps the first real price', () => {
    const pts = series(15, (i) => ({ platinum: i < 12 ? 937.71 : 950 + i, palladium: i < 12 ? 939.17 : 960 + i }));
    const out = withoutFilledStart(pts);
    expect(out.slice(0, 11).every((p) => p.platinum === 0 && p.palladium === 0)).toBe(true);
    expect(out[11].platinum).toBe(937.71);
    expect(out[12].platinum).toBe(962);
    expect(out[14].palladium).toBe(974);
  });

  it("leaves gold's real flat years alone", () => {
    const pts = series(15, (i) => ({ gold: i < 12 ? 20.67 : 35, platinum: 900 + i, palladium: 800 + i }));
    expect(withoutFilledStart(pts)).toEqual(pts);
  });

  it('keeps a short run and a series that never moves', () => {
    const short = series(15, (i) => ({ platinum: i < 3 ? 1000 : 1000 + i, palladium: 500 + i }));
    expect(withoutFilledStart(short)).toEqual(short);
    const flat = series(15, () => ({ platinum: 1000, palladium: 1000 }));
    expect(withoutFilledStart(flat)).toEqual(flat);
    expect(withoutFilledStart([])).toEqual([]);
  });
});
