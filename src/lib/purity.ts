import type { Metal } from '../types/holding';
import { OZT_PER_GRAM, OZT_PER_KG } from './metals';

/** Troy ounces in a pennyweight, the unit jewelers and scrap buyers weigh in. */
export const OZT_PER_DWT = 0.05;

/** The weights people price metal in, as troy ounces. */
export const WEIGHTS: Array<{ label: string; ozt: number }> = [
  { label: 'Per gram', ozt: OZT_PER_GRAM },
  { label: 'Per pennyweight', ozt: OZT_PER_DWT },
  { label: 'Per troy ounce', ozt: 1 },
  { label: 'Per kilo', ozt: OZT_PER_KG },
];

/**
 * Common purities for each metal, purest first, the ones jewelry and older
 * coins are made in. The first is pure metal, which is what spot prices, so
 * 24 karat matches the per gram price the way buyers quote it. `short` is the
 * label on the melt calculator's quick picks.
 */
export const PURITIES: Record<Metal, Array<{ label: string; short: string; fineness: number }>> = {
  gold: [
    { label: '24 karat', short: '24k', fineness: 1 },
    { label: '22 karat', short: '22k', fineness: 22 / 24 },
    { label: '18 karat', short: '18k', fineness: 18 / 24 },
    { label: '14 karat', short: '14k', fineness: 14 / 24 },
    { label: '10 karat', short: '10k', fineness: 10 / 24 },
  ],
  silver: [
    { label: 'Fine silver', short: 'Fine', fineness: 1 },
    { label: 'Sterling, .925', short: 'Sterling', fineness: 0.925 },
    { label: 'US coin silver, 90%', short: '90%', fineness: 0.9 },
    { label: 'Canadian coin silver, 80%', short: '80%', fineness: 0.8 },
  ],
  platinum: [
    { label: 'Pure platinum', short: 'Pure', fineness: 1 },
    { label: 'Jewelry platinum, 950', short: '950', fineness: 0.95 },
  ],
  palladium: [
    { label: 'Pure palladium', short: 'Pure', fineness: 1 },
    { label: 'Jewelry palladium, 950', short: '950', fineness: 0.95 },
  ],
};

/** What a gram of metal at this purity is worth at spot. */
export function perGram(spotPerOz: number, fineness = 1): number {
  return spotPerOz * OZT_PER_GRAM * fineness;
}

/** Purity as the melt calculator's percent field shows it: 99.9, 58.33, 92.5 */
export function purityPercent(fineness: number): string {
  return String(+(fineness * 100).toFixed(2));
}

