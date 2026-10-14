import type { Metal } from '../types/holding';
import { getJson } from './apiClient';
import { METALS } from './metals';
import { withoutFilledStart } from './history';

export type MetalMap<T> = Record<Metal, T>;

export interface Spot {
  prices: MetalMap<number>;
  /** Percent move against the last trading day's close */
  changePct: MetalMap<number>;
  /** Dollar move against the last trading day's close */
  changeAmt: MetalMap<number>;
  marketsClosed: boolean;
  timestamp: string;
}

interface RawPrices {
  timestamp?: string;
  marketsClosed?: boolean;
  prices?: Partial<Record<Metal, { price?: number; change_pct?: number }>>;
  change?: Partial<Record<Metal, { amount?: number; percent?: number; prevClose?: number }>>;
}

export async function fetchSpot(signal?: AbortSignal): Promise<Spot> {
  const raw = await getJson<RawPrices>('/v1/prices', { signal });
  const prices = {} as MetalMap<number>;
  const changePct = {} as MetalMap<number>;
  const changeAmt = {} as MetalMap<number>;
  for (const m of METALS) {
    const price = Number(raw.prices?.[m]?.price) || 0;
    const pct = Number(raw.prices?.[m]?.change_pct ?? raw.change?.[m]?.percent) || 0;
    const amount = raw.change?.[m]?.amount;
    prices[m] = price;
    changePct[m] = pct;
    changeAmt[m] = Number.isFinite(amount as number)
      ? (amount as number)
      : pct !== 0 && price > 0
        ? price - price / (1 + pct / 100)
        : 0;
  }
  if (!prices.gold && !prices.silver) throw new Error('Prices are unavailable right now');
  return {
    prices,
    changePct,
    changeAmt,
    marketsClosed: Boolean(raw.marketsClosed),
    timestamp: raw.timestamp || new Date().toISOString(),
  };
}

export interface Sparklines {
  /** Each metal's prices over the last 24 hours, oldest first. */
  series: MetalMap<number[]>;
  /** When each of those prices was taken, in milliseconds, one for one with `series`. */
  times: MetalMap<number[]>;
}

const DAY_MS = 24 * 3600_000;

/**
 * The last 24 hours of prices, each kept with the time it was taken. A
 * missing price, a zero or one with no usable time leaves out its time with
 * it, so every price that's left still sits at its own moment. Without a time
 * for every price, they're spaced over the day before `now`, counted before
 * anything is left out, for the same reason.
 */
export function pairSparklines(raw: { sparklines?: Partial<MetalMap<unknown[]>>; timestamps?: unknown[] }, now = Date.now()): Sparklines {
  const series = {} as MetalMap<number[]>;
  const times = {} as MetalMap<number[]>;
  const stamps = raw.timestamps ?? [];
  for (const m of METALS) {
    const values = raw.sparklines?.[m] ?? [];
    const timed = stamps.length === values.length;
    const step = DAY_MS / Math.max(1, values.length - 1);
    series[m] = [];
    times[m] = [];
    values.forEach((value, i) => {
      const v = Number(value);
      const t = timed ? Date.parse(String(stamps[i])) : now - (values.length - 1 - i) * step;
      if (value == null || !Number.isFinite(v) || v <= 0 || !Number.isFinite(t)) return;
      series[m].push(v);
      times[m].push(t);
    });
  }
  return { series, times };
}

export async function fetchSparklines(signal?: AbortSignal): Promise<Sparklines> {
  const raw = await getJson<{ sparklines?: Partial<MetalMap<unknown[]>>; timestamps?: unknown[] }>('/v1/sparkline-24h', { signal });
  return pairSparklines(raw);
}

export type HistoryRange = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'ALL';

export interface HistoryPoint {
  date: string;
  gold: number;
  silver: number;
  platinum: number;
  palladium: number;
}

export async function fetchHistory(range: HistoryRange, maxPoints = 240, signal?: AbortSignal): Promise<HistoryPoint[]> {
  // The `data` array carries all four metals per date whichever metal is asked for.
  const raw = await getJson<{ data?: Array<Partial<HistoryPoint> & { date: string }> }>(
    `/v1/prices/history?metal=gold&range=${range}&maxPoints=${maxPoints}`,
    { signal },
  );
  const points = (raw.data || [])
    .filter((p) => p && p.date)
    .map((p) => ({
      date: p.date,
      gold: Number(p.gold) || 0,
      silver: Number(p.silver) || 0,
      platinum: Number(p.platinum) || 0,
      palladium: Number(p.palladium) || 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Only the long ranges reach back past the first platinum and palladium prices.
  return range === '5Y' || range === 'ALL' ? withoutFilledStart(points) : points;
}

export interface VaultRow {
  date: string;
  registered_oz: number;
  eligible_oz: number;
  combined_oz: number;
  registered_change_oz: number;
  eligible_change_oz: number;
  combined_change_oz?: number;
  updated_at?: string;
}

export async function fetchVault(signal?: AbortSignal): Promise<Partial<MetalMap<VaultRow>>> {
  return getJson<Partial<MetalMap<VaultRow>>>('/v1/vault-watch', { signal });
}

export async function fetchVaultHistory(days = 30, signal?: AbortSignal): Promise<Partial<MetalMap<VaultRow[]>>> {
  const raw = await getJson<{ data?: Partial<MetalMap<VaultRow[]>> }>(`/v1/vault-watch?days=${days}`, { signal });
  return raw.data || {};
}

/** Spot on a past date, for filling in premium paid. */
export async function fetchHistoricalSpot(date: string, signal?: AbortSignal): Promise<Partial<MetalMap<number>>> {
  const raw = await getJson<Partial<MetalMap<number | null>>>(`/v1/historical-spot?date=${encodeURIComponent(date)}`, { signal });
  const out: Partial<MetalMap<number>> = {};
  for (const m of METALS) {
    const v = Number(raw[m]);
    if (Number.isFinite(v) && v > 0) out[m] = v;
  }
  return out;
}
