import { getText } from './apiClient';
import { plainDashes } from './text';

export interface Episode {
  /** Matches the Stack Signal digest's slug */
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSec: number;
  audioUrl: string;
  /** Article page on troystack.com */
  link: string;
}

export interface PodcastShow {
  title: string;
  description: string;
  imageUrl: string;
  episodes: Episode[];
}

function text(el: Element | null | undefined, tag: string): string {
  if (!el) return '';
  const node = el.getElementsByTagName(tag)[0];
  return (node?.textContent || '').trim();
}

function parseDuration(value: string): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parsePodcastFeed(xml: string): PodcastShow {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The podcast feed could not be read');
  const channel = doc.getElementsByTagName('channel')[0];
  const imageEl = channel?.getElementsByTagName('itunes:image')[0];
  const items = Array.from(doc.getElementsByTagName('item'));
  const episodes: Episode[] = items
    .map((item) => {
      const enclosure = item.getElementsByTagName('enclosure')[0];
      const audioUrl = enclosure?.getAttribute('url') || '';
      const pub = text(item, 'pubDate');
      return {
        slug: text(item, 'guid'),
        title: plainDashes(text(item, 'title')),
        description: plainDashes(text(item, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
        publishedAt: pub ? new Date(pub).toISOString() : '',
        durationSec: parseDuration(text(item, 'itunes:duration')),
        audioUrl,
        link: text(item, 'link'),
      };
    })
    .filter((e) => e.audioUrl)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  return {
    title: plainDashes(text(channel, 'title')) || 'The Stack Signal',
    description: plainDashes(text(channel, 'description')),
    imageUrl: imageEl?.getAttribute('href') || '',
    episodes,
  };
}

export async function fetchPodcast(signal?: AbortSignal): Promise<PodcastShow> {
  const xml = await getText('/v1/podcast/feed.xml', { signal });
  return parsePodcastFeed(xml);
}
