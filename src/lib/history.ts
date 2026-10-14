import type { HistoryPoint } from './marketApi';

/** A run this long at one price at the start of the series is the API's fill, not trading. */
const FILL_RUN = 10;

/** Real prices are logged daily, so the first one sits within days of the next. The fill is monthly. */
const NEAR_MS = 10 * 24 * 3600_000;

/**
 * The API carries platinum and palladium back to 1915 by repeating the first
 * price it recorded for them, which is from early 2025. Those repeats aren't
 * history, so they're blanked to 0, which every chart already skips. The run
 * ends on that first real price only when the point sits among the daily
 * prices after it. The API thins long ranges, so the last repeat can also be
 * a monthly fill point dated weeks before real prices begin, and that one is
 * blanked too. Gold and silver are left alone, because their long flat
 * stretches, like gold at $20.67 and then $35, are real.
 */
export function withoutFilledStart(points: HistoryPoint[]): HistoryPoint[] {
  let out = points;
  for (const m of ['platinum', 'palladium'] as const) {
    const first = out[0]?.[m];
    if (!first) continue;
    let run = 0;
    while (run < out.length && out[run][m] === first) run++;
    if (run < FILL_RUN || run === out.length) continue;
    const gap = Date.parse(out[run].date) - Date.parse(out[run - 1].date);
    const blank = gap <= NEAR_MS ? run - 1 : run;
    out = out.map((p, i) => (i < blank ? { ...p, [m]: 0 } : p));
  }
  return out;
}
