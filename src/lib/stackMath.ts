import type { Holding, Metal } from '../types/holding';
import { METALS } from './metals';

/**
 * Stack math, written to match the iPhone app line for line so a stack reads
 * the same on both:
 * - value is troy ounces per piece x quantity x spot
 * - a line's cost is price per piece x quantity + taxes + shipping
 * - the totals use that cost; a single line shows the app's cost basis
 *   override when one is set, the way the app's holding view does
 * - today's change counts only holdings bought before today (UTC date, as the
 *   app does) and uses the API's percent move for each metal
 */

export type SpotMap = Record<Metal, number>;
export type PercentMap = Partial<Record<Metal, number>>;

export interface MetalTotals {
  oz: number;
  value: number;
  cost: number;
  gain: number;
  gainPct: number;
  premiums: number;
  avgCostPerOz: number;
  count: number;
}

export interface StackTotals {
  value: number;
  cost: number;
  gain: number;
  gainPct: number;
  premiums: number;
  premiumsPct: number;
  dayChange: number;
  dayChangePct: number;
  byMetal: Record<Metal, MetalTotals>;
  count: number;
}

export function lineOz(h: Holding): number {
  return (h.weight || 0) * (h.quantity || 0);
}

export function lineValue(h: Holding, spot: SpotMap): number {
  return lineOz(h) * (spot[h.metal] || 0);
}

/** Cost used in the totals: price x quantity + taxes + shipping. */
export function lineCost(h: Holding): number {
  return (h.purchasePrice || 0) * (h.quantity || 0) + (h.taxes || 0) + (h.shipping || 0);
}

/** Cost shown on a single line: the app's override when set. */
export function lineCostBasis(h: Holding): number {
  if (h.costBasisOverride && h.costBasisOverride > 0) return h.costBasisOverride;
  return lineCost(h);
}

/** Premium over spot per piece, the way the app fills it in. */
export function premiumPerPiece(unitPrice: number, spotPerOz: number, ozPerPiece: number): number {
  return Math.max(0, unitPrice - spotPerOz * ozPerPiece);
}

function emptyMetal(): MetalTotals {
  return { oz: 0, value: 0, cost: 0, gain: 0, gainPct: 0, premiums: 0, avgCostPerOz: 0, count: 0 };
}

function utcToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function stackTotals(holdings: Holding[], spot: SpotMap, percent: PercentMap = {}, now = new Date()): StackTotals {
  const byMetal = Object.fromEntries(METALS.map((m) => [m, emptyMetal()])) as Record<Metal, MetalTotals>;
  const today = utcToday(now);
  let preTodayNow = 0;
  let preTodayPrev = 0;

  for (const h of holdings) {
    const t = byMetal[h.metal];
    if (!t) continue;
    const ounces = lineOz(h);
    t.oz += ounces;
    t.value += ounces * (spot[h.metal] || 0);
    t.cost += lineCost(h);
    t.premiums += (h.premium || 0) * (h.quantity || 0);
    t.count += 1;

    const ownedBeforeToday = !h.purchaseDate || h.purchaseDate < today;
    if (ownedBeforeToday) {
      const current = spot[h.metal] || 0;
      const pct = percent[h.metal] || 0;
      const prev = pct !== 0 ? current / (1 + pct / 100) : current;
      preTodayNow += ounces * current;
      preTodayPrev += ounces * prev;
    }
  }

  let value = 0;
  let cost = 0;
  let premiums = 0;
  for (const m of METALS) {
    const t = byMetal[m];
    t.gain = t.value - t.cost;
    t.gainPct = t.cost > 0 ? (t.gain / t.cost) * 100 : 0;
    t.avgCostPerOz = t.oz > 0 ? t.cost / t.oz : 0;
    value += t.value;
    cost += t.cost;
    premiums += t.premiums;
  }

  const gain = value - cost;
  const dayChange = preTodayNow - preTodayPrev;
  return {
    value,
    cost,
    gain,
    gainPct: cost > 0 ? (gain / cost) * 100 : 0,
    premiums,
    premiumsPct: cost > 0 ? (premiums / cost) * 100 : 0,
    dayChange,
    dayChangePct: preTodayPrev > 0 ? (dayChange / preTodayPrev) * 100 : 0,
    byMetal,
    count: holdings.length,
  };
}

/** Value of the stack at hypothetical prices (the What If tool). */
export function valueAt(holdings: Holding[], prices: SpotMap): number {
  return holdings.reduce((sum, h) => sum + lineOz(h) * (prices[h.metal] || 0), 0);
}
