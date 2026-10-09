import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useHistory, useSparklines, useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { isMetal, METALS, METAL_LABEL, METAL_SYMBOL, METAL_VAR } from '../lib/metals';
import { money, signedMoney, signedPercent } from '../lib/format';
import { formatTimeET } from '../lib/text';
import type { HistoryRange } from '../lib/marketApi';
import type { Metal } from '../types/holding';
import { cx } from '../lib/cx';
import { ChangeBadge, MarketStatus } from '../ui/Market';
import { AppStoreButton } from '../ui/AppStore';
import { Card, ErrorNote, Segmented, Skeleton } from '../ui/primitives';
import type { ChartPoint } from '../ui/PriceChart';

const PriceChart = lazy(() => import('../ui/PriceChart'));

type Range = '24H' | HistoryRange;
const RANGES: Array<{ value: Range; label: string }> = [
  { value: '24H', label: '24H' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: '5Y', label: '5Y' },
  { value: 'ALL', label: 'All' },
];

const ABOUT: Record<Metal, string> = {
  gold: 'Spot is the price for one troy ounce of gold for immediate delivery, set by trading in the futures and wholesale markets. Coins and bars sell above spot, and that extra is the premium. A troy ounce is 31.1 grams, a little heavier than the ounce on a kitchen scale.',
  silver: 'Spot is the price for one troy ounce of silver for immediate delivery. Physical silver carries a bigger premium than gold, often several dollars an ounce on coins, because it costs about as much to mint and ship as gold does for far less value.',
  platinum: 'Spot is the price for one troy ounce of platinum for immediate delivery. Most platinum goes into catalytic converters and industry, so it moves with car sales and mining supply out of South Africa as much as with gold.',
  palladium: 'Spot is the price for one troy ounce of palladium for immediate delivery. Most of it goes into catalysts for gasoline cars, and most of the supply comes from Russia and South Africa, so the price can swing hard on news from either.',
};

function useChartData(metal: Metal, range: Range) {
  const sparks = useSparklines();
  const history = useHistory(range === '24H' ? '1M' : range, range === 'ALL' || range === '5Y' ? 600 : 260, range !== '24H');
  return useMemo(() => {
    if (range === '24H') {
      const values = sparks.data?.series[metal] ?? [];
      const times = sparks.data?.timestamps ?? [];
      // Without per-point times, space the points over the 24 hours before the fetch.
      const now = sparks.dataUpdatedAt;
      const aligned = values.length === times.length;
      const points: ChartPoint[] = values.map((v, i) => ({
        t: aligned ? Date.parse(times[i]) : now - (values.length - 1 - i) * ((24 * 3600_000) / Math.max(1, values.length - 1)),
        v,
      }));
      return { points: points.filter((p) => Number.isFinite(p.t)), loading: sparks.isLoading, error: sparks.isError, refetch: sparks.refetch };
    }
    const points: ChartPoint[] = (history.data ?? [])
      .map((p) => ({ t: Date.parse(`${p.date}T12:00:00Z`), v: p[metal] }))
      .filter((p) => Number.isFinite(p.t) && p.v > 0);
    return { points, loading: history.isLoading, error: history.isError, refetch: history.refetch };
  }, [range, metal, sparks.data, sparks.dataUpdatedAt, sparks.isLoading, sparks.isError, sparks.refetch, history.data, history.isLoading, history.isError, history.refetch]);
}

export default function Prices() {
  const params = useParams<{ metal?: string }>();
  const metal: Metal = isMetal(params.metal) ? params.metal : 'gold';
  const [range, setRange] = useState<Range>('1M');
  const spot = useSpotMap();
  const chart = useChartData(metal, range);

  const label = METAL_LABEL[metal];
  usePageMeta({ ...SEO[`/prices/${metal}` as keyof typeof SEO], canonical: `/prices/${metal}` });

  const stats = useMemo(() => {
    const pts = chart.points;
    if (pts.length < 2) return null;
    const first = pts[0].v;
    const last = pts[pts.length - 1].v;
    const high = Math.max(...pts.map((p) => p.v));
    const low = Math.min(...pts.map((p) => p.v));
    return { change: last - first, pct: first > 0 ? ((last - first) / first) * 100 : 0, high, low };
  }, [chart.points]);

  if (params.metal && !isMetal(params.metal)) return <Navigate to="/prices" replace />;

  const price = spot.data?.prices[metal];
  const ratio = spot.data && spot.data.prices.silver > 0 ? spot.data.prices.gold / spot.data.prices.silver : null;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {METALS.map((m) => (
          <Link
            key={m}
            to={`/prices/${m}`}
            aria-current={m === metal ? 'page' : undefined}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-full border px-3.5 h-9 text-[13px] font-semibold transition-colors',
              m === metal ? 'border-transparent bg-gold-soft text-gold' : 'border-line text-fg-2 hover:text-fg hover:bg-surface-2',
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: METAL_VAR[m] }} aria-hidden="true" />
            {METAL_LABEL[m]}
          </Link>
        ))}
      </div>

      <header className="mt-5 flex flex-col gap-1">
        <h1 className="text-[15px] font-semibold text-fg-2">
          {label} spot price <span className="text-fg-3 font-medium">· {METAL_SYMBOL[metal]} · USD per troy ounce</span>
        </h1>
        {price == null ? (
          <Skeleton className="h-11 w-56" />
        ) : (
          <div className="text-[40px] sm:text-[48px] font-semibold tracking-tight text-fg tnum leading-none">{money(price)}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
          {spot.data && <ChangeBadge pct={spot.data.changePct[metal]} amount={spot.data.changeAmt[metal]} />}
          <span className="text-[13px] text-fg-3">since the last close</span>
          <MarketStatus closed={spot.marketsClosed} />
          {spot.data && <span className="text-[12px] text-fg-3">Updated {formatTimeET(spot.data.timestamp)}</span>}
        </div>
      </header>

      <Card className="mt-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <Segmented<Range> label="Chart range" value={range} options={RANGES} onChange={setRange} size="sm" />
          {stats && (
            <div className="text-[13px] tnum">
              <span className={cx('font-semibold', stats.change > 0 ? 'text-up' : stats.change < 0 ? 'text-down' : 'text-fg-3')}>
                {signedMoney(stats.change)} ({signedPercent(stats.pct)})
              </span>
              <span className="text-fg-3"> over {range === 'ALL' ? 'the full history' : range === '24H' ? '24 hours' : range}</span>
            </div>
          )}
        </div>
        {chart.error ? (
          <ErrorNote onRetry={() => chart.refetch()}>The chart didn't load.</ErrorNote>
        ) : chart.loading || chart.points.length < 2 ? (
          <Skeleton className="h-[280px] w-full" />
        ) : (
          <Suspense fallback={<Skeleton className="h-[280px] w-full" />}>
            <PriceChart data={chart.points} color={METAL_VAR[metal]} height={280} granularity={range === '24H' ? 'intraday' : 'daily'} valueLabel={label} />
          </Suspense>
        )}
        {(metal === 'platinum' || metal === 'palladium') && (range === '5Y' || range === 'ALL') && chart.points.length > 1 && (
          <p className="mt-2 text-[12px] text-fg-3">
            {label} prices on TroyStack go back to {new Date(chart.points[0].t).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}.
          </p>
        )}
        {stats && (
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-line pt-4">
            <div>
              <dt className="text-[12px] text-fg-3">High in range</dt>
              <dd className="text-[15px] font-semibold text-fg tnum">{money(stats.high)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-fg-3">Low in range</dt>
              <dd className="text-[15px] font-semibold text-fg tnum">{money(stats.low)}</dd>
            </div>
            {ratio && (
              <div>
                <dt className="text-[12px] text-fg-3">Gold/silver ratio</dt>
                <dd className="text-[15px] font-semibold text-fg tnum">
                  <Link to="/tools/ratio" className="hover:text-gold">{ratio.toFixed(1)}</Link>
                </dd>
              </div>
            )}
            {spot.data && (
              <div>
                <dt className="text-[12px] text-fg-3">Per gram</dt>
                <dd className="text-[15px] font-semibold text-fg tnum">{money((spot.data.prices[metal] || 0) * 0.0321507466)}</dd>
              </div>
            )}
          </dl>
        )}
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
              <Bell size={16} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-fg">Get a push when {label.toLowerCase()} hits your number</h2>
              <p className="mt-1 text-[14px] text-fg-2">Price alerts live in the iPhone app. Set a price above or below spot and your phone buzzes when it crosses. Alerts are free.</p>
              <div className="mt-3">
                <AppStoreButton campaign="webapp-alerts" size="sm" label="Set an alert in the app" />
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-fg">What spot means</h2>
          <p className="mt-1.5 text-[14px] text-fg-2 leading-relaxed">{ABOUT[metal]}</p>
          <Link to="/tools/melt" className="mt-3 inline-block text-[13px] font-semibold text-gold hover:text-gold-2">Work out what a coin or bar is worth</Link>
        </Card>
      </div>
    </div>
  );
}
