import { lazy, Suspense, useMemo, useState } from 'react';
import { useHistory, useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { money, money0, num, signedMoney, signedPercent } from '../lib/format';
import { runPlan, type PlanMetal } from '../lib/stackingPlan';
import { cx } from '../lib/cx';
import { Card, ErrorNote, Field, Input, PageHeader, Segmented, Select, Skeleton } from '../ui/primitives';
import { AppStoreButton } from '../ui/AppStore';
import { SpotNotice } from '../ui/SpotNotice';

const PriceChart = lazy(() => import('../ui/PriceChart'));

type DcaMetal = PlanMetal;
const FIRST_YEAR = 1970;

export default function ToolStackingHistory() {
  usePageMeta({ ...SEO['/tools/stacking-history'], canonical: '/tools/stacking-history' });
  const history = useHistory('ALL', 1000);
  const spotMap = useSpotMap();
  const thisYear = new Date().getUTCFullYear();
  const [metal, setMetal] = useState<DcaMetal>('silver');
  const [amount, setAmount] = useState('100');
  const [start, setStart] = useState(String(thisYear - 10));
  const [premium, setPremium] = useState('0');
  // Today's value needs a live price for the metal. Without one there's no
  // figure for today, the same as the other calculators.
  const spotNow = spotMap.priced(metal) ? spotMap.prices[metal] : null;

  const result = useMemo(
    () => runPlan(history.data ?? [], metal, parseFloat(amount) || 0, parseInt(start, 10) || thisYear - 10, Math.max(0, parseFloat(premium) || 0), spotNow),
    [history.data, metal, amount, start, premium, spotNow, thisYear],
  );

  const years = useMemo(() => Array.from({ length: thisYear - FIRST_YEAR }, (_, i) => String(thisYear - 1 - i)), [thisYear]);
  const value = result?.value ?? null;
  const gain = result && value !== null ? value - result.invested : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader eyebrow="Tools" title="Stacking history" subtitle="Buy the same dollar amount every month, starting any year since 1970. Here's where it would stand at today's spot." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <Card className="p-5 space-y-4 h-fit">
          <Segmented<DcaMetal>
            label="Metal"
            value={metal}
            onChange={setMetal}
            options={[
              { value: 'silver', label: 'Silver' },
              { value: 'gold', label: 'Gold' },
            ]}
          />
          <Field label="Every month" htmlFor="dca-amount">
            <Input id="dca-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Starting in" htmlFor="dca-start">
            <Select id="dca-start" value={start} onChange={(e) => setStart(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Field>
          <Field label="Premium over spot, %" hint="Coins usually cost a few percent over spot for gold and more for silver." htmlFor="dca-premium">
            <Input id="dca-premium" inputMode="decimal" value={premium} onChange={(e) => setPremium(e.target.value)} />
          </Field>
        </Card>
        <Card className="p-5">
          {history.isError ? (
            <ErrorNote onRetry={() => history.refetch()}>Price history didn't load.</ErrorNote>
          ) : history.isLoading ? (
            <>
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-[260px] w-full mt-4" />
            </>
          ) : !result ? (
            // Nothing to show isn't the same as still loading.
            <p className="py-16 text-center text-[14px] text-fg-3">
              {(parseFloat(amount) || 0) > 0 ? "There's no price history to run this on." : "Enter how much you'd buy each month."}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[13px] text-fg-3">Worth today</div>
                  {value !== null ? (
                    <>
                      <div className="text-[32px] font-semibold tracking-tight text-fg tnum">{money0(value)}</div>
                      <div className={cx('text-[14px] font-semibold tnum', gain > 0 ? 'text-up' : gain < 0 ? 'text-down' : 'text-fg-3')}>
                        {signedMoney(gain)} ({signedPercent(result.invested > 0 ? (gain / result.invested) * 100 : 0, 1)}) on {money0(result.invested)} put in
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[22px] font-semibold tracking-tight text-fg-3 tnum">{spotMap.isLoading ? '...' : 'No price'}</div>
                      <div className="text-[14px] text-fg-3 tnum">{money0(result.invested)} put in</div>
                    </>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
                  <dt className="text-fg-3">Ounces</dt>
                  <dd className="text-fg tnum text-right">{num(result.ounces, 2)}</dd>
                  <dt className="text-fg-3">Average cost</dt>
                  <dd className="text-fg tnum text-right">{money(result.invested / result.ounces)}/oz</dd>
                  <dt className="text-fg-3">Months</dt>
                  <dd className="text-fg tnum text-right">{result.months}</dd>
                </dl>
              </div>
              <div className="mt-4">
                <Suspense fallback={<Skeleton className="h-[260px] w-full" />}>
                  <PriceChart
                    data={result.series}
                    compare={result.investedSeries}
                    compareLabel="Put in"
                    valueLabel="Worth"
                    color={metal === 'gold' ? 'var(--m-gold)' : 'var(--m-silver)'}
                    height={260}
                    granularity="monthly"
                    formatValue={(v) => money0(v)}
                  />
                </Suspense>
              </div>
              <SpotNotice spot={spotMap} metals={[metal]} className="mt-4" />
              <p className="mt-3 text-[12px] text-fg-3">
                {value !== null
                  ? "Uses one spot price per month from the long-run history and today's live spot for the last point."
                  : 'Uses one spot price per month from the long-run history, through the first of this month.'}{' '}
                It leaves out taxes, shipping and storage.
              </p>
            </>
          )}
        </Card>
      </div>
      <Card className="mt-4 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Stacking every month already?</h2>
          <p className="mt-1 text-[14px] text-fg-2">Track the real thing. Snap each receipt in the app and Troy keeps your cost basis straight.</p>
        </div>
        <AppStoreButton campaign="webapp-tools" label="Get the app" />
      </Card>
    </div>
  );
}
