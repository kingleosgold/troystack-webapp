import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useLatestDigest, useSignalFeed } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import { useWebGoldOffer } from '../hooks/useWebGoldOffer';
import { useTrial } from '../contexts/TrialContext';
import SEO from '../lib/seo.json';
import { SIGNAL_CATEGORIES } from '../lib/signalApi';
import { excerpt, formatDate, formatTimeET } from '../lib/text';
import { cx } from '../lib/cx';
import { ArticleCard, ArticleRowSkeleton } from '../ui/Signal';
import { AppStoreButton } from '../ui/AppStore';
import { appStoreUrl } from '../lib/appStore';
import { Button, Card, ErrorNote, PageHeader, Skeleton } from '../ui/primitives';

function DigestFeature() {
  const digest = useLatestDigest();
  if (digest.isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const d = digest.data;
  if (!d) return null;
  return (
    <Link to={`/signal/${d.slug}`} className="group block rounded-2xl border border-line bg-surface p-5 sm:p-6 hover:border-line-strong transition-colors">
      <div className="flex items-center gap-3">
        <img src="/troy-96.png" alt="Troy" className="h-9 w-9 rounded-full" width={36} height={36} />
        <div>
          <div className="text-[13px] font-semibold text-gold">The Stack Signal</div>
          <div className="text-[12px] text-fg-3">
            {formatDate(d.publishedAt, { weekday: 'long', month: 'long', day: 'numeric', year: undefined })}, {formatTimeET(d.publishedAt)}
          </div>
        </div>
      </div>
      <h2 className="mt-3 text-[20px] font-semibold leading-snug tracking-tight text-fg group-hover:text-gold transition-colors">{d.oneLiner || d.title}</h2>
      <p className="mt-2 text-[14px] text-fg-2">{excerpt(d.commentary, 260)}</p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gold">
        Read Troy's full take <ArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * The side card on the Signal list. An iPhone keeps the App Store. Anyone else
 * without Gold gets the web free week, and a computer keeps the App Store as a
 * second, smaller door. Android without the free week gets no card, since the
 * App Store can't open there. Its token is its own, so its checkouts and
 * installs can be told apart from a Signal piece's.
 */
function ReadOnCard() {
  const { openTrial } = useTrial();
  const { webGold, showAppStore, pending } = useWebGoldOffer();
  if (pending) {
    return (
      <div aria-hidden="true" data-testid="read-on-pending">
        <Card className="p-5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-2.5 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-5/6" />
          <Skeleton className="mt-4 h-8 w-40" />
        </Card>
      </div>
    );
  }
  if (!webGold && !showAppStore) return null;
  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold text-fg">{webGold ? "Troy's read on your own stack" : 'Get it on your phone'}</h2>
      <p className="mt-1.5 text-[14px] text-fg-2">
        {webGold
          ? "Gold adds a brief he writes around your stack each morning and 30 questions a day with him. The first week is free if you're new to Gold."
          : "The app can send you a push when Troy flags big news. It's capped, so it won't nag."}
      </p>
      {webGold ? (
        <>
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => openTrial({ reason: 'Gold adds a morning brief from Troy written around your stack.', campaign: 'webapp-signal-list' })}
          >
            Try Gold free for a week
          </Button>
          {/* On a computer the App Store is the quieter second door, with a line saying who it's for. */}
          {showAppStore && (
            <p className="mt-2.5 text-center text-[13px] text-fg-3">
              Have an iPhone?{' '}
              <a href={appStoreUrl('webapp-signal-list')} target="_blank" rel="noopener" className="font-semibold text-gold underline underline-offset-2 hover:text-gold-2">
                Get the app
              </a>
            </p>
          )}
        </>
      ) : (
        <AppStoreButton campaign="webapp-signal-list" size="sm" label="Get the app" className="mt-3" />
      )}
    </Card>
  );
}

export default function Signal() {
  usePageMeta({ ...SEO['/signal'], canonical: '/signal' });
  const [category, setCategory] = useState('');
  const feed = useSignalFeed(category);
  const articles = useMemo(() => (feed.data?.pages.flat() ?? []).filter((a) => !a.isDigest), [feed.data]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader
        eyebrow="The Signal"
        title="Metals news, with Troy's read"
        subtitle="Troy reads the gold and silver news all day and writes what each story means for people who hold physical metal."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <DigestFeature />
          <div className="mt-6 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 [mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]" role="tablist" aria-label="Topics">
            {SIGNAL_CATEGORIES.map((c) => (
              <button
                key={c.id || 'all'}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cx(
                  'shrink-0 rounded-full border px-3.5 h-8 text-[13px] font-semibold transition-colors',
                  category === c.id ? 'border-transparent bg-gold-soft text-gold' : 'border-line text-fg-2 hover:text-fg hover:bg-surface-2',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <Card className="mt-3 px-5">
            {feed.isLoading ? (
              Array.from({ length: 5 }, (_, i) => <ArticleRowSkeleton key={i} />)
            ) : feed.isError ? (
              <div className="py-5">
                <ErrorNote onRetry={() => feed.refetch()}>The Signal didn't load.</ErrorNote>
              </div>
            ) : articles.length === 0 ? (
              <p className="py-8 text-center text-[14px] text-fg-3">Nothing in this topic yet. Troy writes new pieces through the day.</p>
            ) : (
              articles.map((a) => <ArticleCard key={a.id} article={a} />)
            )}
          </Card>
          {feed.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
                {feed.isFetchingNextPage ? 'Loading' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <ReadOnCard />
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-fg">Hear it instead</h2>
            <p className="mt-1.5 text-[14px] text-fg-2">The Stack Signal podcast is Troy's morning brief, a few minutes long, every day.</p>
            <Link to="/podcast" className="mt-3 inline-block text-[13px] font-semibold text-gold hover:text-gold-2">Listen to today's episode</Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
