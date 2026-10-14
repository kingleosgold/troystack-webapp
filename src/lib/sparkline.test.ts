import { describe, expect, it } from 'vitest';
import { sparklineShape } from './sparkline';

const xs = (line: string) => [...line.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));

describe('a small price line', () => {
  it('puts each price at its own time, so a stretch with prices missing keeps its length', () => {
    const shape = sparklineShape([10, 11, 12], [0, 10, 100], 100, 40)!;
    expect(xs(shape.line)).toEqual([0, 10, 100]);
  });

  it('leaves a price out together with its time', () => {
    const shape = sparklineShape([10, 0, Number.NaN, 12], [0, 25, 50, 100], 100, 40)!;
    expect(xs(shape.line)).toEqual([0, 100]);
  });

  it('spaces prices evenly without times, or with times that do not match them one for one', () => {
    expect(xs(sparklineShape([10, 11, 12], undefined, 100, 40)!.line)).toEqual([0, 50, 100]);
    expect(xs(sparklineShape([10, 11, 12], [0, 100], 100, 40)!.line)).toEqual([0, 50, 100]);
  });

  it('draws nothing from fewer than two prices', () => {
    expect(sparklineShape([10, 0], [0, 1], 100, 40)).toBeNull();
  });
});
