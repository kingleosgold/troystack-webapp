import type { HistoryPoint } from './marketApi';

/** A run this long at one price at the start of the series is the API's fill, not trading. */
const FILL_RUN = 10;

/**
 * The API carries platinum and palladium back to 1915 by repeating the first
 * price it recorded for them, which is from February 2025. Those repeats
 * aren't history, so they're blanked to 0, which every chart already skips.
 * The last point of the run is kept, since it's the first real price. Gold
 * and silver are left alone, because their long flat stretches, like gold at
 * $20.67 and then $35, are real.
 */
export function withoutFilledStart(points: HistoryPoint[]): HistoryPoint[] {
  let out = points;
  for (const m of ['platinum', 'palladium'] as const) {
    const first = out[0]?.[m];
    if (!first) continue;
    let run = 0;
    while (run < out.length && out[run][m] === first) run++;
    if (run < FILL_RUN || run === out.length) continue;
    out = out.map((p, i) => (i < run - 1 ? { ...p, [m]: 0 } : p));
  }
  return out;
}
