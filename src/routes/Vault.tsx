import { lazy, Suspense, useMemo, useState } from 'react';
import { useSubscription } from '../hooks/useSubscription';
import { useVault, useVaultHistory } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { METALS, METAL_LABEL, METAL_VAR } from '../lib/metals';
import { ozCompact } from '../lib/format';
import { formatDate } from '../lib/text';
import type { Metal } from '../types/holding';
import { cx } from '../lib/cx';
import { GoldLock } from '../ui/GoldLock';
import { Card, ErrorNote, PageHeader, Segmented, Skeleton } from '../ui/primitives';
import type { ChartPoint } from '../ui/PriceChart';

const PriceChart = lazy(() => import('../ui/PriceChart'));

function Change({ value }: { value: number }) {
  if (!value) return <span className="text-fg-3">no change</span>;
  const up = value > 0;
  return (
    <span className={cx('font-semibold tnum', up ? 'text-up' : 'text-down')}>
      {up ? '+' : '-'}
      {ozCompact(Math.abs(value))}
    </span>
  );
}

export default function Vault() {
  usePageMeta({ ...SEO['/vault'], canonical: '/vault' });
  const vault = useVault();
  const { isGold } = useSubscription();
  const [metal, setMetal] = useState<Metal>('silver');
  const history = useVaultHistory(30, isGold);

  const chart = useMemo<ChartPoint[]>(() => {
    const rows = history.data?.[metal] ?? [];
    return rows
      .map((r) => ({ t: Date.parse(`${r.date}T12:00:00Z`), v: Number(r.registered_oz) }))
      .filter((p) => Number.isFinite(p.t) && p.v > 0)
      .sort((a, b) => a.t - b.t);
  }, [history.data, metal]);

  const asOf = vault.data?.silver?.date || vault.data?.gold?.date;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader
        eyebrow="Vault Watch"
        title="What's in the COMEX vaults"
        subtitle="Registered metal is warranted and ready to deliver against futures. Eligible metal meets the exchange's standards but sits in storage. When registered stocks fall while demand to take delivery holds up, stackers pay attention."
      />
      {asOf && <p className="-mt-3 mb-4 text-[13px] text-fg-3">CME Group warehouse report for {formatDate(`${asOf}T12:00:00Z`, { timeZone: 'UTC' })}</p>}

      {vault.isError ? (
        <ErrorNote onRetry={() => vault.refetch()}>Vault data didn't load.</ErrorNote>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {METALS.map((m) => {
            const row = vault.data?.[m];
            return (
              <Card key={m} className="p-5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: METAL_VAR[m] }} aria-hidden="true" />
                  <h2 className="text-[15px] font-semibold text-fg">{METAL_LABEL[m]}</h2>
                </div>
                {vault.isLoading ? (
                  <Skeleton className="h-16 w-full mt-3" />
                ) : !row ? (
                  // The API leaves out a metal whose report it couldn't read.
                  <div className="mt-3">
                    <ErrorNote onRetry={() => void vault.refetch()}>There's no {METAL_LABEL[m].toLowerCase()} report right now.</ErrorNote>
                  </div>
                ) : (
                  <>
                    <div className="mt-3">
                      <div className="text-[12px] text-fg-3">Registered</div>
                      <div className="text-[24px] font-semibold tracking-tight text-fg tnum">{ozCompact(row.registered_oz)}</div>
                      <div className="text-[13px]"><Change value={row.registered_change_oz} /> <span className="text-fg-3">on the day</span></div>
                    </div>
                    <GoldLock
                      title="Eligible and combined stocks"
                      reason="Eligible and combined vault stocks are part of Gold."
                      campaign="webapp-vault"
                      className="mt-3"
                    >
                      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                        <div>
                          <dt className="text-[12px] text-fg-3">Eligible</dt>
                          <dd className="text-[15px] font-semibold text-fg tnum">{ozCompact(row.eligible_oz)}</dd>
                          <dd className="text-[12px]"><Change value={row.eligible_change_oz} /></dd>
                        </div>
                        <div>
                          <dt className="text-[12px] text-fg-3">Combined</dt>
                          <dd className="text-[15px] font-semibold text-fg tnum">{ozCompact(row.combined_oz)}</dd>
                          <dd className="text-[12px]"><Change value={row.combined_change_oz ?? row.registered_change_oz + row.eligible_change_oz} /></dd>
                        </div>
                      </dl>
                    </GoldLock>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-semibold text-fg">Registered stocks, last 30 days</h2>
          <Segmented<Metal> label="Metal" value={metal} onChange={setMetal} size="sm" options={METALS.map((m) => ({ value: m, label: METAL_LABEL[m] }))} />
        </div>
        <GoldLock
          title="The 30-day vault trend"
          reason="The 30-day vault trend is part of Gold."
          campaign="webapp-vault"
          teaser={<div className="h-[240px] rounded-xl bg-surface-2" />}
        >
          {history.isLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : history.isError ? (
            <ErrorNote onRetry={() => void history.refetch()}>The 30-day history didn't load.</ErrorNote>
          ) : chart.length < 2 ? (
            <p className="py-10 text-center text-[14px] text-fg-3">There aren't enough days of vault reports for a trend yet.</p>
          ) : (
            <Suspense fallback={<Skeleton className="h-[240px] w-full" />}>
              <PriceChart data={chart} color={METAL_VAR[metal]} height={240} granularity="daily" formatValue={(v) => ozCompact(v)} valueLabel="Registered" />
            </Suspense>
          )}
        </GoldLock>
      </Card>
    </div>
  );
}
