import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Calculator, Camera, Coins, Headphones, LineChart, Scale, Smartphone, TrendingUp, Warehouse } from 'lucide-react';
import { useLatestDigest, usePodcast, useSignalFeed, useSparklines, useSpotMap } from '../hooks/queries';
import { useHoldings } from '../hooks/useHoldings';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { useSubscription } from '../hooks/useSubscription';
import { METALS } from '../lib/metals';
import { stackTotals } from '../lib/stackMath';
import { money, signedMoney, signedPercent } from '../lib/format';
import { formatDate, formatShortDate, formatTimeET, greeting, leadParagraphs, minutesLabel } from '../lib/text';
import { Markdown } from '../lib/markdown';
import { GOLD, PODCAST_APPLE_URL } from '../lib/appStore';
import { cx } from '../lib/cx';
import { MetalTile } from '../ui/Market';
import { ArticleCard, ArticleRowSkeleton } from '../ui/Signal';
import { EpisodePlayer, EpisodeMeta } from '../ui/Podcast';
import { InstallPath } from '../ui/AppStore';
import { Card, ErrorNote, Img, LinkButton, SectionHeader, Skeleton } from '../ui/primitives';

const ASK_CHIPS = [
  { label: 'What moved metals today?', q: 'What moved gold and silver today?' },
  { label: 'Gold/silver ratio', q: 'What is the gold to silver ratio telling us right now?' },
  { label: 'Junk silver value', q: 'What is pre-1965 junk silver worth at today\'s spot?' },
];

const STACK_CHIPS = [
  { label: "How's my stack?", q: "How's my stack performing?" },
  { label: 'Gold/silver ratio', q: 'Analyze my gold-to-silver ratio' },
  { label: 'Purchasing power', q: 'What can my stack buy in real terms? Show me purchasing power.' },
];

function TroysTake() {
  const digest = useLatestDigest();
  const podcast = usePodcast();
  const episode = podcast.data?.episodes[0];

  if (digest.isLoading) {
    return (
      <Card className="p-5 sm:p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-full mt-4" />
        <Skeleton className="h-6 w-4/5 mt-2" />
        <Skeleton className="h-4 w-full mt-5" />
        <Skeleton className="h-4 w-full mt-2" />
        <Skeleton className="h-4 w-2/3 mt-2" />
      </Card>
    );
  }
  const d = digest.data;
  if (!d) {
    return (
      <Card className="p-5 sm:p-6">
        <ErrorNote onRetry={() => digest.refetch()}>Troy's latest take didn't load.</ErrorNote>
      </Card>
    );
  }
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <img src="/troy-96.png" alt="" className="h-10 w-10 rounded-full" width={40} height={40} />
        <div>
          <div className="text-[13px] font-semibold text-gold">Troy's take</div>
          <div className="text-[12px] text-fg-3">
            {formatDate(d.publishedAt, { weekday: 'long', month: 'long', day: 'numeric', year: undefined })}, {formatTimeET(d.publishedAt)}
          </div>
        </div>
      </div>
      {d.oneLiner && <h2 className="mt-4 text-[20px] sm:text-[22px] font-semibold leading-snug tracking-tight text-fg">{d.oneLiner}</h2>}
      <div className="mt-3 text-[15px] leading-relaxed text-fg-2">
        <Markdown text={leadParagraphs(d.commentary, 650)} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <LinkButton to={`/signal/${d.slug}`} variant="secondary" size="md">
          Read all of it
          <ArrowRight size={15} aria-hidden="true" />
        </LinkButton>
        <Link to="/signal" className="text-[14px] font-semibold text-gold hover:text-gold-2">
          More from the Signal
        </Link>
      </div>
      {episode && (
        <div className="mt-5 rounded-xl border border-line bg-surface-2 p-3.5">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg-3">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Headphones size={14} className="text-gold" aria-hidden="true" />
              Troy reads the morning brief
            </span>
            <span className="whitespace-nowrap">
              <EpisodeMeta episode={episode} />
            </span>
          </div>
          <EpisodePlayer episode={episode} compact />
        </div>
      )}
    </Card>
  );
}

function AskTroyCard({ hasStack }: { hasStack: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const chips = hasStack ? STACK_CHIPS : ASK_CHIPS;
  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    navigate(`/troy?q=${encodeURIComponent(t)}`);
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <img src="/troy-96.png" alt="" className="h-8 w-8 rounded-full" width={32} height={32} />
        <h2 className="text-[15px] font-semibold text-fg">Ask Troy</h2>
      </div>
      <p className="mt-2 text-[14px] text-fg-2">He follows the metals all day. Ask what moved, what a coin is worth, or how your stack is doing.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about metals"
          aria-label="Ask Troy"
          maxLength={500}
          className="min-w-0 flex-1 h-10 rounded-xl border border-line-strong bg-surface-2 px-3 text-[14px] text-fg placeholder:text-fg-3 outline-none focus:border-gold"
        />
        <button type="submit" className="h-10 w-10 shrink-0 rounded-xl bg-btn text-btn-fg flex items-center justify-center hover:bg-btn-hover" aria-label="Ask">
          <ArrowRight size={17} />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.label} type="button" onClick={() => go(c.q)} className="rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-fg-2 hover:border-gold hover:text-gold">
            {c.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function StackCard() {
  const { holdings, loading, isGuest } = useHoldings();
  const { prices, changePct, data } = useSpotMap();
  const totals = useMemo(() => stackTotals(holdings, prices, changePct), [holdings, prices, changePct]);

  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-40 mt-3" />
      </Card>
    );
  }
  if (holdings.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-fg">Start your stack</h2>
        <p className="mt-1.5 text-[14px] text-fg-2">Add what you own and see it at live spot. No account needed to try it.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton to="/stack?add=1" size="sm">Add a holding</LinkButton>
          <LinkButton to="/stack?import=1" size="sm" variant="secondary">Import a spreadsheet</LinkButton>
        </div>
      </Card>
    );
  }
  const dayTone = totals.dayChange > 0 ? 'text-up' : totals.dayChange < 0 ? 'text-down' : 'text-fg-3';
  const gainTone = totals.gain > 0 ? 'text-up' : totals.gain < 0 ? 'text-down' : 'text-fg-3';
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-fg">Your stack</h2>
        <Link to="/stack" className="text-[13px] font-semibold text-gold hover:text-gold-2">Open</Link>
      </div>
      <div className="mt-2 text-[28px] font-semibold tracking-tight text-fg tnum">{data ? money(totals.value) : <Skeleton className="h-8 w-40" />}</div>
      <div className="mt-1 space-y-0.5 text-[13px]">
        <div className={cx('tnum font-semibold', dayTone)}>
          {signedMoney(totals.dayChange)} ({signedPercent(totals.dayChangePct)}) today
        </div>
        <div className="text-fg-3">
          <span className={cx('tnum font-semibold', gainTone)}>{signedMoney(totals.gain)}</span> on what you paid
        </div>
      </div>
      {isGuest && <p className="mt-3 text-[12px] text-fg-3">Saved in this browser. <Link to="/auth" className="font-semibold text-gold">Sign in</Link> to keep it with your account and the app.</p>}
    </Card>
  );
}

function SignalList() {
  const feed = useSignalFeed('');
  const items = useMemo(() => (feed.data?.pages[0] ?? []).filter((a) => !a.isDigest).slice(0, 5), [feed.data]);
  return (
    <Card className="px-5 pt-5 pb-1">
      <SectionHeader title="Latest from the Signal" subtitle="News that moves metals, with Troy's read on each" action={<Link to="/signal" className="text-[13px] font-semibold text-gold hover:text-gold-2">See all</Link>} />
      {feed.isLoading ? (
        <>
          <ArticleRowSkeleton />
          <ArticleRowSkeleton />
          <ArticleRowSkeleton />
        </>
      ) : feed.isError ? (
        <div className="pb-4">
          <ErrorNote onRetry={() => feed.refetch()}>The Signal didn't load.</ErrorNote>
        </div>
      ) : (
        items.map((a) => <ArticleCard key={a.id} article={a} />)
      )}
    </Card>
  );
}

function PodcastCard() {
  const podcast = usePodcast();
  const ep = podcast.data?.episodes[0];
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        {podcast.data ? (
          <Img src={podcast.data.imageUrl} alt="The Stack Signal podcast artwork" className="h-20 w-20 rounded-xl object-cover shrink-0" loading="lazy" />
        ) : (
          <Skeleton className="h-20 w-20 rounded-xl" />
        )}
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold">Podcast</div>
          <h2 className="text-[16px] font-semibold text-fg leading-snug">The Stack Signal</h2>
          <p className="text-[13px] text-fg-2 mt-0.5">Troy's gold and silver brief, a few minutes long, every morning before the open.</p>
        </div>
      </div>
      {ep ? (
        <div className="mt-4">
          <EpisodePlayer episode={ep} />
        </div>
      ) : podcast.isLoading ? (
        <Skeleton className="h-12 w-full mt-4" />
      ) : null}
      {(podcast.data?.episodes.length ?? 0) > 1 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {podcast.data!.episodes.slice(1, 4).map((e) => (
            <li key={e.slug} className="py-2.5">
              <Link to={`/signal/${e.slug}`} className="group block">
                <span className="block truncate text-[13px] font-medium text-fg group-hover:text-gold">{e.title}</span>
                <span className="text-[12px] text-fg-3">{formatShortDate(e.publishedAt)} · {minutesLabel(e.durationSec)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-semibold">
        <Link to="/podcast" className="text-gold hover:text-gold-2">All episodes</Link>
        <a href={PODCAST_APPLE_URL} target="_blank" rel="noopener noreferrer" className="text-fg-2 hover:text-fg">Apple Podcasts</a>
      </div>
    </Card>
  );
}

const TOOLS = [
  { to: '/tools/melt', title: 'Melt value', body: 'What any coin or bar is worth at spot', icon: <Coins size={18} /> },
  { to: '/tools/junk-silver', title: 'Junk silver', body: 'Pre-1965 dimes, quarters and halves', icon: <Scale size={18} /> },
  { to: '/tools/what-if', title: 'What if', body: 'Your stack at the prices you pick', icon: <TrendingUp size={18} /> },
  { to: '/tools/stacking-history', title: 'Stacking history', body: 'Monthly buying, back to the 1970s', icon: <LineChart size={18} /> },
  { to: '/tools/ratio', title: 'Gold/silver ratio', body: 'Where it sits against history', icon: <Calculator size={18} /> },
  { to: '/vault', title: 'Vault Watch', body: 'COMEX registered and eligible metal', icon: <Warehouse size={18} /> },
];

function GetAppSection() {
  const { isGold } = useSubscription();
  const features = [
    { icon: <Bell size={17} />, text: 'Price alerts the minute metal crosses your number' },
    { icon: <Camera size={17} />, text: 'Snap a dealer receipt and it lands in your stack' },
    { icon: <Headphones size={17} />, text: "Talk to Troy out loud and hear him answer, even with the screen locked, on Gold" },
    { icon: <Smartphone size={17} />, text: 'Home screen widgets and a daily brief built on your stack, on Gold' },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
        <div className="p-6 sm:p-8">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold">TroyStack for iPhone</div>
          <h2 className="mt-2 text-[24px] sm:text-[28px] font-semibold tracking-tight text-fg leading-tight">Your stack and Troy, in your pocket</h2>
          <p className="mt-2 text-[15px] text-fg-2 max-w-lg">Same account as the site, so your stack and your chats with Troy are there when you sign in.</p>
          <ul className="mt-5 space-y-3">
            {features.map((f) => (
              <li key={f.text} className="flex items-start gap-3 text-[14px] text-fg-2">
                <span className="mt-0.5 text-gold" aria-hidden="true">{f.icon}</span>
                {f.text}
              </li>
            ))}
          </ul>
          {!isGold && (
            <p className="mt-5 text-[13px] text-fg-3">
              Gold starts with a free week, then {GOLD.monthly} a month or {GOLD.yearly} a year.
            </p>
          )}
        </div>
        <div className="flex items-center justify-center bg-surface-2 p-6 sm:p-8 border-t lg:border-t-0 lg:border-l border-line">
          <InstallPath campaign="webapp-home" />
        </div>
      </div>
    </Card>
  );
}

export default function Home() {
  usePageMeta({ ...SEO['/'], canonical: '/' });
  const spot = useSpotMap();
  const sparks = useSparklines();
  const { holdings } = useHoldings();

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
      <header className="mb-6">
        <div className="text-[13px] text-fg-3">
          {greeting()} · {formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric', year: undefined })}
        </div>
        <h1 className="mt-1 text-[28px] sm:text-[34px] font-semibold tracking-tight text-fg leading-tight">Gold and silver today</h1>
        <p className="mt-1.5 text-[15px] text-fg-2 max-w-2xl">Live spot for all four metals, Troy's read on what moved them, and your stack at today's prices.</p>
      </header>

      {spot.isError && !spot.data ? (
        <ErrorNote onRetry={() => spot.refetch()}>Live prices didn't load.</ErrorNote>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {METALS.map((m) => (
            <MetalTile
              key={m}
              metal={m}
              price={spot.data?.prices[m]}
              pct={spot.data?.changePct[m]}
              amount={spot.data?.changeAmt[m]}
              spark={sparks.data?.series[m]}
              loading={spot.isLoading}
              to={`/prices/${m}`}
            />
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TroysTake />
        </div>
        <div className="flex flex-col gap-4">
          <AskTroyCard hasStack={holdings.length > 0} />
          <StackCard />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SignalList />
        </div>
        <PodcastCard />
      </div>

      <section className="mt-8" aria-labelledby="tools-heading">
        <div className="flex items-end justify-between mb-3">
          <h2 id="tools-heading" className="text-[15px] font-semibold text-fg">Tools</h2>
          <Link to="/tools" className="text-[13px] font-semibold text-gold hover:text-gold-2">All tools</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TOOLS.map((t) => (
            <Link key={t.to} to={t.to} className="group rounded-2xl border border-line bg-surface p-4 hover:border-line-strong hover:bg-surface-2 transition-colors">
              <span className="text-gold" aria-hidden="true">{t.icon}</span>
              <div className="mt-2 text-[14px] font-semibold text-fg group-hover:text-gold transition-colors">{t.title}</div>
              <div className="text-[12px] text-fg-3 mt-0.5">{t.body}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <GetAppSection />
      </section>
    </div>
  );
}
