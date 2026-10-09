import { lazy, Suspense, useMemo, useState } from 'react';
import { useHistory, useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import type { HistoryRange } from '../lib/marketApi';
import { formatDate } from '../lib/text';
import { Card, ErrorNote, LinkButton, PageHeader, Segmented, Skeleton } from '../ui/primitives';
import type { ChartPoint } from '../ui/PriceChart';

const PriceChart = lazy(() => import('../ui/PriceChart'));

type R = Extract<HistoryRange, '1Y' | '5Y' | 'ALL'>;
const RANGE_LABEL: Record<R, string> = { '1Y': 'the past year', '5Y': 'the past five years', ALL: 'the full history, back to 1915' };

export default function ToolRatio() {
  usePageMeta({ ...SEO['/tools/ratio'], canonical: '/tools/ratio' });
  const [range, setRange] = useState<R>('5Y');
  const history = useHistory(range, range === 'ALL' ? 1000 : 400);
  const { data: spot } = useSpotMap();
  const now = spot && spot.prices.silver > 0 ? spot.prices.gold / spot.prices.silver : null;

  const { points, stats } = useMemo(() => {
    const pts: ChartPoint[] = (history.data ?? [])
      .filter((p) => p.gold > 0 && p.silver > 0)
      .map((p) => ({ t: Date.parse(`${p.date}T12:00:00Z`), v: p.gold / p.silver }))
      .filter((p) => Number.isFinite(p.t));
    if (pts.length < 2) return { points: pts, stats: null };
    let hi = pts[0];
    let lo = pts[0];
    let sum = 0;
    for (const p of pts) {
      if (p.v > hi.v) hi = p;
      if (p.v < lo.v) lo = p;
      sum += p.v;
    }
    return { points: pts, stats: { hi, lo, avg: sum / pts.length } };
  }, [history.data]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader
        eyebrow="Tools"
        title="Gold to silver ratio"
        subtitle="How many ounces of silver one ounce of gold buys. A high number means silver is cheap next to gold, and a low one means it's dear."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <Card className="p-5 h-fit">
          <div className="text-[13px] text-fg-3">Right now</div>
          <div className="mt-1 text-[40px] font-semibold tracking-tight text-fg tnum">{now ? now.toFixed(1) : '...'}</div>
          <div className="text-[13px] text-fg-3">ounces of silver per ounce of gold</div>
          {stats && now && (
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">Average</dt>
                <dd className="text-fg tnum">{stats.avg.toFixed(1)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">High</dt>
                <dd className="text-fg tnum">
                  {stats.hi.v.toFixed(1)} <span className="text-fg-3">· {formatDate(stats.hi.t, { month: 'short', year: 'numeric', day: undefined, timeZone: 'UTC' })}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">Low</dt>
                <dd className="text-fg tnum">
                  {stats.lo.v.toFixed(1)} <span className="text-fg-3">· {formatDate(stats.lo.t, { month: 'short', year: 'numeric', day: undefined, timeZone: 'UTC' })}</span>
                </dd>
              </div>
              <p className="pt-2 text-[12px] text-fg-3">
                Over {RANGE_LABEL[range]}, today's ratio is {now > stats.avg ? 'above' : now < stats.avg ? 'below' : 'at'} the average.
              </p>
            </dl>
          )}
        </Card>
        <Card className="p-5">
          <Segmented<R>
            label="Range"
            value={range}
            onChange={setRange}
            size="sm"
            options={[
              { value: '1Y', label: '1Y' },
              { value: '5Y', label: '5Y' },
              { value: 'ALL', label: 'Since 1915' },
            ]}
            className="mb-3"
          />
          {history.isError ? (
            <ErrorNote onRetry={() => history.refetch()}>The history didn't load.</ErrorNote>
          ) : history.isLoading || points.length < 2 ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <Suspense fallback={<Skeleton className="h-[280px] w-full" />}>
              <PriceChart data={points} color="var(--gold)" height={280} granularity={range === 'ALL' ? 'monthly' : 'daily'} formatValue={(v) => v.toFixed(0)} valueLabel="Ratio" />
            </Suspense>
          )}
        </Card>
      </div>
      <Card className="mt-4 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">What does Troy make of it?</h2>
          <p className="mt-1 text-[14px] text-fg-2">Ask him whether the ratio favors adding silver or gold right now.</p>
        </div>
        <LinkButton to={`/troy?q=${encodeURIComponent('What is the gold to silver ratio telling us right now?')}`}>Ask Troy</LinkButton>
      </Card>
    </div>
  );
}
