import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Rss } from 'lucide-react';
import { usePodcast } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { PODCAST_APPLE_URL, PODCAST_RSS_URL } from '../lib/appStore';
import { excerpt } from '../lib/text';
import { EpisodeMeta, EpisodePlayer } from '../ui/Podcast';
import { Button, Card, ErrorNote, Img, PageHeader, Skeleton } from '../ui/primitives';

export default function Podcast() {
  usePageMeta({ ...SEO['/podcast'], canonical: '/podcast' });
  const podcast = usePodcast();
  const [shown, setShown] = useState(10);
  const show = podcast.data;
  const [latest, ...rest] = show?.episodes ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader eyebrow="Podcast" title="The Stack Signal" subtitle="Troy's morning brief on gold and silver. A few minutes long, out every day before the US open." />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-5">
          {show ? (
            <Img src={show.imageUrl} alt="The Stack Signal artwork" className="h-36 w-36 rounded-2xl object-cover shrink-0" />
          ) : (
            <Skeleton className="h-36 w-36 rounded-2xl" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold">Latest episode</div>
            {podcast.isLoading ? (
              <Skeleton className="h-6 w-2/3 mt-2" />
            ) : latest ? (
              <>
                <h2 className="mt-1 text-[19px] font-semibold text-fg leading-snug">{latest.title}</h2>
                <EpisodeMeta episode={latest} />
                <p className="mt-2 text-[14px] text-fg-2">{excerpt(latest.description, 220)}</p>
                <EpisodePlayer episode={latest} className="mt-4" />
                {latest.slug && (
                  <Link to={`/signal/${latest.slug}`} className="mt-3 inline-block text-[13px] font-semibold text-gold hover:text-gold-2">
                    Read it instead
                  </Link>
                )}
              </>
            ) : podcast.isError ? (
              <div className="mt-3">
                <ErrorNote onRetry={() => podcast.refetch()}>Episodes didn't load.</ErrorNote>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
          <a href={PODCAST_APPLE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-lg bg-fg px-3.5 text-[13px] font-semibold text-bg hover:opacity-90">
            Follow on Apple Podcasts
          </a>
          <a href={PODCAST_RSS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[13px] font-semibold text-fg-2 hover:text-fg">
            <Rss size={14} aria-hidden="true" /> RSS feed
          </a>
        </div>
      </Card>

      {rest.length > 0 && (
        <section className="mt-6" aria-labelledby="episodes-heading">
          <h2 id="episodes-heading" className="text-[15px] font-semibold text-fg mb-3">Earlier episodes</h2>
          <Card>
            <ul>
              {rest.slice(0, shown).map((ep) => (
                <li key={ep.audioUrl} className="border-b border-line last:border-b-0 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="text-[15px] font-semibold text-fg">{ep.title}</h3>
                    <EpisodeMeta episode={ep} />
                  </div>
                  <p className="mt-1 text-[13px] text-fg-2">{excerpt(ep.description, 180)}</p>
                  <EpisodePlayer episode={ep} compact className="mt-3" />
                </li>
              ))}
            </ul>
          </Card>
          {rest.length > shown && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => setShown((n) => n + 10)}>
                Show more
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
