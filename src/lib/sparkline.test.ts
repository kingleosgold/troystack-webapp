import { describe, expect, it } from 'vitest';
import { SPARKLINE_GAP_MS, sparklineShape } from './sparkline';

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

  it('leaves a gap across a market-closed stretch instead of bridging it', () => {
    const shape = sparklineShape([10, 11, 12, 13], [0, 60_000, 60_000 + SPARKLINE_GAP_MS + 1, 60_000 + SPARKLINE_GAP_MS + 120_000], 100, 40)!;
    const moves = shape.line.match(/M/g) ?? [];
    expect(moves).toHaveLength(2);
    expect(shape.area.match(/Z/g)).toHaveLength(2);
    // The closed stretch still takes its share of the width.
    expect(xs(shape.line)[1]).toBeLessThan(20);
    expect(xs(shape.line)[2]).toBeGreaterThan(80);
  });
});
