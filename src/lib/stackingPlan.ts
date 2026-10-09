import type { HistoryPoint } from './marketApi';
import type { ChartPoint } from '../ui/PriceChart';

export type PlanMetal = 'gold' | 'silver';

export interface PlanResult {
  invested: number;
  ounces: number;
  /** What it's worth at today's live spot, or null when there's no live price. */
  value: number | null;
  months: number;
  series: ChartPoint[];
  investedSeries: ChartPoint[];
}

/**
 * Spot on the first of any month. The full history is thinned to fit the
 * API's 1,000 points, so many months have no sample of their own. Those are
 * read off the straight line between the samples on either side, rather than
 * buying at a price that's a month or two old.
 */
export function priceOnFirstOf(points: HistoryPoint[], metal: PlanMetal): (year: number, month: number) => number {
  const samples = points
    .filter((p) => p[metal] > 0)
    .map((p) => ({ t: Date.parse(`${p.date.slice(0, 10)}T00:00:00Z`), v: p[metal] }))
    .filter((s) => Number.isFinite(s.t))
    .sort((a, b) => a.t - b.t);
  return (year, month) => {
    if (samples.length === 0) return 0;
    const t = Date.UTC(year, month - 1, 1);
    let lo = 0;
    let hi = samples.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const after = samples[lo];
    const before = samples[lo - 1];
    if (after && after.t === t) return after.v;
    if (!before) return after.v;
    if (!after) return before.v;
    return before.v + ((after.v - before.v) * (t - before.t)) / (after.t - before.t);
  };
}

/**
 * The same dollar amount every month from January of the start year to this
 * month, valued at today's live spot. Without a live price there's no value
 * for today, rather than one from an old sample, and the chart ends on this
 * month's first.
 */
export function runPlan(
  points: HistoryPoint[],
  metal: PlanMetal,
  monthly: number,
  startYear: number,
  premiumPct: number,
  spotNow: number | null,
  now: Date = new Date(),
): PlanResult | null {
  if (!points.length || monthly <= 0) return null;
  const priceAt = priceOnFirstOf(points, metal);
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth() + 1;
  let ounces = 0;
  let invested = 0;
  let months = 0;
  const series: ChartPoint[] = [];
  const investedSeries: ChartPoint[] = [];
  for (let y = startYear, m = 1; y < endYear || (y === endYear && m <= endMonth); ) {
    const price = priceAt(y, m);
    if (price > 0) {
      ounces += monthly / (price * (1 + premiumPct / 100));
      invested += monthly;
      months += 1;
      const t = Date.UTC(y, m - 1, 1);
      series.push({ t, v: ounces * price });
      investedSeries.push({ t, v: invested });
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  if (!months) return null;
  const live = spotNow != null && spotNow > 0;
  const value = live ? ounces * spotNow : null;
  if (value !== null) series[series.length - 1] = { ...series[series.length - 1], v: value };
  return { invested, ounces, value, months, series, investedSeries };
}
