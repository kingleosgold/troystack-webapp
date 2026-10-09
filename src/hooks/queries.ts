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

/** Live spot. Refreshes every minute while the page is open, like the app. */
export function useSpot() {
  return useQuery({
    queryKey: ['spot'],
    queryFn: ({ signal }) => fetchSpot(signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Spot as a plain map with zeros while loading, for math. A zero isn't a
 * price, though. The feed can leave a metal out, and the read can fail, so
 * `priced` says whether a metal has a live price to show or value with.
 */
export function useSpotMap() {
  const q = useSpot();
  const prices = q.data?.prices ?? { gold: 0, silver: 0, platinum: 0, palladium: 0 };
  const changePct = q.data?.changePct ?? { gold: 0, silver: 0, platinum: 0, palladium: 0 };
  const marketsClosed = q.data ? q.data.marketsClosed : marketsClosedET();
  const priced = (m: Metal) => Boolean(q.data) && prices[m] > 0;
  return { ...q, prices, changePct, marketsClosed, priced };
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
