import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, Share2 } from 'lucide-react';
import { useArticle, usePodcast, useSignalFeed } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import { categoryLabel } from '../lib/signalApi';
import { excerpt, formatDate, formatTimeET } from '../lib/text';
import { money } from '../lib/format';
import { Markdown } from '../lib/markdown';
import { ArticleCard } from '../ui/Signal';
import { EpisodePlayer } from '../ui/Podcast';
import { AppStoreButton } from '../ui/AppStore';
import { Card, EmptyState, ErrorNote, Img, LinkButton, Skeleton } from '../ui/primitives';

function ShareButton({ title, slug }: { title: string; slug: string }) {
  const [copied, setCopied] = useState(false);
  // troystack.com renders each article with its own preview card, so links
  // shared in messages and social posts unfurl properly.
  const url = `https://troystack.com/signal/${slug}`;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // share sheet dismissed
        }
      }}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line text-[13px] font-semibold text-fg-2 hover:text-fg hover:bg-surface-2"
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Share2 size={14} aria-hidden="true" />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}

export default function Article() {
  const { slug } = useParams<{ slug: string }>();
  const article = useArticle(slug);
  const feed = useSignalFeed('');
  const podcast = usePodcast();
  const a = article.data;

  usePageMeta({
    title: a ? a.title : 'The Signal',
    description: a ? excerpt(a.oneLiner || a.commentary, 160) : undefined,
    canonical: slug ? `https://troystack.com/signal/${slug}` : '/signal',
    image: a?.imageUrl || undefined,
  });

  const episode = useMemo(() => podcast.data?.episodes.find((e) => e.slug === slug), [podcast.data, slug]);
  const more = useMemo(() => (feed.data?.pages[0] ?? []).filter((x) => x.slug !== slug && !x.isDigest).slice(0, 4), [feed.data, slug]);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 sm:pt-8">
      <Link to="/signal" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-2 hover:text-fg">
        <ArrowLeft size={14} aria-hidden="true" /> The Signal
      </Link>

      {article.isLoading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-64 w-full mt-6" />
        </div>
      ) : article.isError || !a ? (
        <div className="mt-8">
          {article.error && 'status' in article.error && (article.error as { status: number }).status === 404 ? (
            <EmptyState title="That piece isn't here anymore" body="It may have been replaced by a newer take on the same story." action={<LinkButton to="/signal">Read the latest</LinkButton>} />
          ) : (
            <ErrorNote onRetry={() => article.refetch()}>This piece didn't load.</ErrorNote>
          )}
        </div>
      ) : (
        <article className="mt-5">
          <div className="text-[13px] font-semibold text-gold">{a.isDigest ? 'The Stack Signal' : categoryLabel(a.category)}</div>
          <h1 className="mt-1.5 text-[28px] sm:text-[34px] font-semibold leading-tight tracking-tight text-fg">{a.title}</h1>
          {a.oneLiner && a.isDigest && <p className="mt-2 text-[17px] text-fg-2">{a.oneLiner}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-fg-3">
            <img src="/troy-96.png" alt="" className="h-7 w-7 rounded-full" width={28} height={28} />
            <span>By Troy</span>
            <span aria-hidden="true">·</span>
            <time dateTime={a.publishedAt}>
              {formatDate(a.publishedAt)}, {formatTimeET(a.publishedAt)}
            </time>
            <span className="ml-auto">
              <ShareButton title={a.title} slug={a.slug} />
            </span>
          </div>
          {(a.goldAtPublish || a.silverAtPublish) && (
            <p className="mt-3 text-[13px] text-fg-3">
              When this ran, gold was {a.goldAtPublish ? money(a.goldAtPublish) : 'unavailable'} and silver was {a.silverAtPublish ? money(a.silverAtPublish) : 'unavailable'}.
            </p>
          )}
          {episode && (
            <Card className="mt-5 p-4">
              <EpisodePlayer episode={episode} />
            </Card>
          )}
          {a.imageUrl && !a.isDigest && <Img src={a.imageUrl} className="mt-6 w-full rounded-2xl border border-line aspect-[16/9] object-cover" loading="lazy" />}
          <div className="mt-6 text-[16px] sm:text-[17px] leading-[1.7] text-fg-2">
            <Markdown text={a.commentary} />
          </div>
          <p className="mt-6 text-[12px] text-fg-3">Troy is an AI. This is his analysis and opinion, not financial advice.</p>

          {a.sources.length > 0 && (
            <section className="mt-8" aria-labelledby="sources-heading">
              <h2 id="sources-heading" className="text-[15px] font-semibold text-fg">What Troy read</h2>
              <ul className="mt-3 space-y-2">
                {a.sources.map((s, i) => (
                  <li key={i} className="text-[14px]">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-fg-2 hover:text-gold">
                        <span>{s.title}</span>
                        <ExternalLink size={13} className="mt-1 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-fg-2">{s.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Card className="mt-8 p-5 sm:p-6">
            <h2 className="text-[17px] font-semibold text-fg">Troy writes these all day</h2>
            <p className="mt-1.5 text-[14px] text-fg-2">In the app he knows your stack, so his read on the news comes with what it means for what you hold.</p>
            <div className="mt-4">
              <AppStoreButton campaign="webapp-signal" label="Get TroyStack for iPhone" />
            </div>
          </Card>
        </article>
      )}

      {more.length > 0 && (
        <section className="mt-10" aria-labelledby="more-heading">
          <h2 id="more-heading" className="text-[15px] font-semibold text-fg mb-1">More from the Signal</h2>
          <div>
            {more.map((m) => (
              <ArticleCard key={m.id} article={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
