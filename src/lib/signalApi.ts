import { getJson } from './apiClient';
import { plainDashes } from './text';

export interface SignalSource {
  name: string;
  title: string;
  url: string | null;
}

export interface SignalArticle {
  id: string;
  slug: string;
  title: string;
  oneLiner: string;
  commentary: string;
  sources: SignalSource[];
  category: string;
  imageUrl: string | null;
  /** True for the Stack Signal digests (morning, evening, weekly) */
  isDigest: boolean;
  publishedAt: string;
  goldAtPublish: number | null;
  silverAtPublish: number | null;
}

interface RawArticle {
  id?: string;
  slug?: string;
  title?: string;
  troy_one_liner?: string | null;
  troy_commentary?: string | null;
  sources?: Array<{ name?: string; title?: string; url?: string | null } | string> | null;
  category?: string | null;
  image_url?: string | null;
  is_stack_signal?: boolean | null;
  published_at?: string | null;
  created_at?: string | null;
  gold_price_at_publish?: number | null;
  silver_price_at_publish?: number | null;
}

function normalizeSources(raw: RawArticle['sources']): SignalSource[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SignalSource[] = [];
  for (const s of raw) {
    const src = typeof s === 'string' ? { name: s, title: s, url: null } : {
      name: s?.name || '',
      title: s?.title || s?.name || '',
      url: s?.url || null,
    };
    const key = `${src.name}|${src.title}`;
    if (!src.title || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...src, title: plainDashes(src.title) });
  }
  return out;
}

/**
 * Some stories come back with a one-liner cut off after a word or two ("Fed",
 * "Gold shines as"). Those read as broken, so only a real sentence counts and
 * everything else falls back to the commentary.
 */
export function usableOneLiner(raw: string | null | undefined): string {
  const s = plainDashes((raw || '').trim());
  const words = s.split(/\s+/).filter(Boolean).length;
  return words >= 5 && s.length >= 25 ? s : '';
}

export function normalizeArticle(raw: RawArticle): SignalArticle {
  return {
    id: raw.id || raw.slug || '',
    slug: raw.slug || '',
    title: plainDashes(raw.title || 'Untitled'),
    oneLiner: usableOneLiner(raw.troy_one_liner),
    commentary: raw.troy_commentary || '',
    sources: normalizeSources(raw.sources),
    category: raw.category || 'market',
    imageUrl: raw.image_url || null,
    isDigest: Boolean(raw.is_stack_signal),
    publishedAt: raw.published_at || raw.created_at || '',
    goldAtPublish: Number(raw.gold_price_at_publish) || null,
    silverAtPublish: Number(raw.silver_price_at_publish) || null,
  };
}

export const SIGNAL_PAGE_SIZE = 12;

export async function fetchSignalPage(offset: number, category?: string, signal?: AbortSignal): Promise<SignalArticle[]> {
  const params = new URLSearchParams({ limit: String(SIGNAL_PAGE_SIZE), offset: String(offset) });
  if (category) params.set('category', category);
  const raw = await getJson<{ articles?: RawArticle[] } | RawArticle[]>(`/v1/stack-signal?${params}`, { signal });
  const list = Array.isArray(raw) ? raw : raw.articles || [];
  return list.map(normalizeArticle).filter((a) => a.slug);
}

export async function fetchLatestDigest(signal?: AbortSignal): Promise<SignalArticle | null> {
  const raw = await getJson<{ signal?: RawArticle | null }>('/v1/stack-signal/latest', { signal });
  return raw.signal ? normalizeArticle(raw.signal) : null;
}

export async function fetchArticle(slug: string, signal?: AbortSignal): Promise<SignalArticle> {
  const raw = await getJson<{ article?: RawArticle } & RawArticle>(`/v1/stack-signal/${encodeURIComponent(slug)}`, { signal });
  return normalizeArticle(raw.article || raw);
}

export const SIGNAL_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: '', label: 'All' },
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
  { id: 'macro', label: 'Macro' },
  { id: 'comex', label: 'COMEX' },
  { id: 'central_banks', label: 'Central banks' },
  { id: 'geopolitical', label: 'Geopolitics' },
  { id: 'mining', label: 'Mining' },
  { id: 'market_data', label: 'Market data' },
];

const EXTRA_LABELS: Record<string, string> = {
  synthesis: 'Daily editorial',
  supply_demand: 'Supply and demand',
  policy: 'Policy',
  market: 'Market',
  platinum: 'Platinum',
  palladium: 'Palladium',
};

export function categoryLabel(id: string): string {
  const known = EXTRA_LABELS[id] || SIGNAL_CATEGORIES.find((c) => c.id === id && c.id)?.label;
  if (known) return known;
  const words = (id || 'news').replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
