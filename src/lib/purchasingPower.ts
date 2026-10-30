// What a stack of gold and silver buys, from the calculator troystack.com
// carried. The prices of things are round present-day figures, and 1971 is
// the last year the dollar was tied to gold.
export const GOLD_1971 = 35;
export const SILVER_1971 = 1.29;
export const OIL_1971 = 3.6;
export const OIL_TODAY = 70;
export const RENT = 1800;
export const WAGE = 30;
export const GAS = 3.5;

export interface StackPower {
  goldOz: number;
  silverOz: number;
  goldValue: number;
  silverValue: number;
  total: number;
  value1971: number;
  barrels1971: number;
  barrelsToday: number;
  ratio: number;
}

/** A typed amount in ounces, or 0 for anything that isn't a positive number. */
export function ounces(value: string | null | undefined): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function stackPower(goldOz: number, silverOz: number, gold: number, silver: number): StackPower | null {
  if (!(gold > 0) || !(silver > 0) || (goldOz <= 0 && silverOz <= 0)) return null;
  const goldValue = goldOz * gold;
  const silverValue = silverOz * silver;
  const total = goldValue + silverValue;
  const value1971 = goldOz * GOLD_1971 + silverOz * SILVER_1971;
  return {
    goldOz,
    silverOz,
    goldValue,
    silverValue,
    total,
    value1971,
    barrels1971: value1971 / OIL_1971,
    barrelsToday: total / OIL_TODAY,
    ratio: gold / silver,
  };
}

/** Where a gold/silver ratio sits against its long-run average near 60. */
export function ratioContext(ratio: number): string {
  if (ratio >= 80) return 'Above 80, silver is historically undervalued relative to gold.';
  if (ratio >= 65) return 'Above the long-term average of about 60. Silver leaning cheap.';
  if (ratio >= 50) return 'Near the long-term average of about 60.';
  return 'Below 50, silver is historically rich relative to gold.';
}

/** Whole numbers from 100 up, otherwise the given decimals. */
export function amount(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 100) return Math.round(n).toLocaleString('en-US');
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
