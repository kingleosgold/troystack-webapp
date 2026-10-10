import { useEffect, useSyncExternalStore } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  fetchHistory,
  fetchSparklines,
  fetchSpot,
  fetchVault,
  fetchVaultHistory,
  type HistoryRange,
} from '../lib/marketApi';
import { fetchArticle, fetchLatestDigest, fetchSignalPage, SIGNAL_PAGE_SIZE } from '../lib/signalApi';
import { fetchPodcast } from '../lib/podcastApi';
import { marketsClosedET } from '../lib/market';
import type { Metal } from '../types/holding';

/** How often spot is read while the page is in view. */
export const SPOT_REFRESH_MS = 60_000;

/**
 * How old the last good read of spot can be and still count as live: three
 * refreshes. One or two that fail in a row don't take prices off the page,
 * and a longer outage does.
 */
export const SPOT_LIVE_MS = 3 * SPOT_REFRESH_MS;

/** Whether spot from a good read at `readAt` still counts as live. */
export function spotIsLive(readAt: number, now = Date.now()): boolean {
  return readAt > 0 && now - readAt <= SPOT_LIVE_MS;
}

// Prices stop counting as live at a set time after the last good read, and
// nothing else has to happen then to say so. Offline, reads wait for the
// connection rather than failing, so no answer arrives to redraw the page.
// One timer for that moment tells everything showing prices at once, so the
// price bar and the page under it change together.
const liveWatchers = new Set<() => void>();
let liveTimer: ReturnType<typeof setTimeout> | undefined;
let liveReadAt = 0;

function setLiveTimer(): void {
  clearTimeout(liveTimer);
  liveTimer = undefined;
  if (liveWatchers.size === 0 || !spotIsLive(liveReadAt)) return;
  liveTimer = setTimeout(() => {
    // A timer can wake a moment early, so it checks before telling anyone.
    if (spotIsLive(liveReadAt)) setLiveTimer();
    else liveWatchers.forEach((w) => w());
  }, liveReadAt + SPOT_LIVE_MS + 1 - Date.now());
}

function subscribeLive(callback: () => void): () => void {
  liveWatchers.add(callback);
  if (liveWatchers.size === 1) setLiveTimer();
  return () => {
    liveWatchers.delete(callback);
    if (liveWatchers.size === 0) setLiveTimer();
  };
}

/** Times the end of the live window from the latest good read of spot. */
function watchLive(readAt: number): void {
  if (readAt === liveReadAt) return;
  liveReadAt = readAt;
  setLiveTimer();
}

/** Live spot. Refreshes every minute while the page is open, like the app. */
export function useSpot() {
  return useQuery({
    queryKey: ['spot'],
    queryFn: ({ signal }) => fetchSpot(signal),
    refetchInterval: SPOT_REFRESH_MS,
    staleTime: 30_000,
    // Back in view after a while, spot is read again right away, not at the next refresh.
    refetchOnWindowFocus: true,
  });
}

/**
 * Spot as a plain map with zeros while loading, for math. A zero isn't a
 * price, though. The feed can leave a metal out, and the read can fail, so
 * `priced` says whether a metal has a live price to show or value with. A
 * failed refresh keeps the last answer, so prices count as live only while
 * the last good read is recent. Past that they're `stale`, out of date.
 */
export function useSpotMap() {
  const q = useSpot();
  const prices = q.data?.prices ?? { gold: 0, silver: 0, platinum: 0, palladium: 0 };
  const changePct = q.data?.changePct ?? { gold: 0, silver: 0, platinum: 0, palladium: 0 };
  const marketsClosed = q.data ? q.data.marketsClosed : marketsClosedET();
  const readAt = q.data ? q.dataUpdatedAt : 0;
  useEffect(() => watchLive(readAt), [readAt]);
  const live = useSyncExternalStore(subscribeLive, () => spotIsLive(readAt), () => false);
  const stale = Boolean(q.data) && !live;
  // A read on its way with nothing failing, as when the page comes back into
  // view. Old prices wait for it rather than being called out of date.
  const refreshing = q.isFetching && !q.isError;
  // Prices on their way, the first read or a read of old ones, so values
  // show as loading rather than as No price until it lands.
  const awaiting = q.isLoading || (stale && refreshing);
  const priced = (m: Metal) => live && prices[m] > 0;
  return { ...q, prices, changePct, marketsClosed, priced, live, stale, refreshing, awaiting };
}

export type SpotMap = ReturnType<typeof useSpotMap>;

export function useSparklines() {
  return useQuery({
    queryKey: ['sparklines'],
    queryFn: ({ signal }) => fetchSparklines(signal),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });
}

export function useHistory(range: HistoryRange, maxPoints = 240, enabled = true) {
  return useQuery({
    queryKey: ['history', range, maxPoints],
    queryFn: ({ signal }) => fetchHistory(range, maxPoints, signal),
    staleTime: 15 * 60_000,
    enabled,
  });
}

export function useVault() {
  return useQuery({
    queryKey: ['vault'],
    queryFn: ({ signal }) => fetchVault(signal),
    staleTime: 30 * 60_000,
  });
}

export function useVaultHistory(days: number, enabled: boolean) {
  return useQuery({
    queryKey: ['vault-history', days],
    queryFn: ({ signal }) => fetchVaultHistory(days, signal),
    staleTime: 30 * 60_000,
    enabled,
  });
}

export function useSignalFeed(category = '') {
  return useInfiniteQuery({
    queryKey: ['signal-feed', category],
    queryFn: ({ pageParam, signal }) => fetchSignalPage(pageParam, category || undefined, signal),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < SIGNAL_PAGE_SIZE ? undefined : all.length * SIGNAL_PAGE_SIZE),
    staleTime: 5 * 60_000,
  });
}

export function useLatestDigest() {
  return useQuery({
    queryKey: ['signal-latest'],
    queryFn: ({ signal }) => fetchLatestDigest(signal),
    staleTime: 10 * 60_000,
  });
}

export function useArticle(slug: string | undefined) {
  return useQuery({
    queryKey: ['signal-article', slug],
    queryFn: ({ signal }) => fetchArticle(slug as string, signal),
    enabled: Boolean(slug),
    staleTime: 30 * 60_000,
  });
}

export function usePodcast() {
  return useQuery({
    queryKey: ['podcast'],
    queryFn: ({ signal }) => fetchPodcast(signal),
    staleTime: 30 * 60_000,
  });
}
