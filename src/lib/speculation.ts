// The what-if scenario troystack.com's /speculation page ran: a stack at
// prices the visitor names, against the same stack at live spot.

export const GOLD_PRESETS = [5000, 7500, 10000, 15000];
export const SILVER_PRESETS = [100, 150, 250, 500];

export interface Scenario {
  goldOz: number;
  silverOz: number;
  /** The price each metal is valued at. A metal with no target stays at spot. */
  goldAt: number;
  silverAt: number;
  current: number;
  projected: number;
  gain: number;
  /** Percent change from today's value. */
  gainPct: number;
}

/**
 * A stack valued at target prices next to the same stack at spot. A metal held
 * with no target stays at its spot price. Null without a stack, without a
 * target for a metal held, or without a live price for a metal held.
 */
export function scenario(goldOz: number, silverOz: number, goldTarget: number, silverTarget: number, gold: number, silver: number): Scenario | null {
  if (goldOz <= 0 && silverOz <= 0) return null;
  if (!((goldOz > 0 && goldTarget > 0) || (silverOz > 0 && silverTarget > 0))) return null;
  if ((goldOz > 0 && !(gold > 0)) || (silverOz > 0 && !(silver > 0))) return null;
  const goldAt = goldOz > 0 ? goldTarget || gold : 0;
  const silverAt = silverOz > 0 ? silverTarget || silver : 0;
  const current = goldOz * (goldOz > 0 ? gold : 0) + silverOz * (silverOz > 0 ? silver : 0);
  const projected = goldOz * goldAt + silverOz * silverAt;
  const gain = projected - current;
  return { goldOz, silverOz, goldAt, silverAt, current, projected, gain, gainPct: (gain / current) * 100 };
}

/** How far a target sits from today's spot, in a sentence. */
export function targetContext(name: string, target: number, spot: number): string {
  const pct = ((target - spot) / spot) * 100;
  if (Math.abs(pct) < 2) return `${name} is trading right around that today.`;
  const tenths = Math.abs(pct).toFixed(1);
  const size = Number(tenths) >= 100 ? `${Math.round(Math.abs(pct)).toLocaleString('en-US')}%` : `${tenths}%`;
  return pct > 0 ? `${name} would have to rise ${size} from today's spot.` : `That's ${size} below today's spot.`;
}
