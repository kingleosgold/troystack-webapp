import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useHoldings } from '../hooks/useHoldings';
import { useSpotMap, type SpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { useSubscription } from '../hooks/useSubscription';
import { METALS, METAL_LABEL, METAL_VAR, OZT_PER_GRAM, OZT_PER_KG } from '../lib/metals';
import { lineCostBasis, lineOz, lineValue, stackTotals } from '../lib/stackMath';
import { money, num, oz as fmtOz, signedMoney, signedPercent } from '../lib/format';
import { getJson, postJson } from '../lib/apiClient';
import { parseSpreadsheet } from '../lib/parseSpreadsheet';
import { holdingsToCSV } from '../services/holdings';
import type { Holding, HoldingFormData, Metal } from '../types/holding';
import { cx } from '../lib/cx';
import { downloadText } from '../lib/download';
import { formatDate, formatTimeET, todayET } from '../lib/text';
import { HoldingEditor } from '../ui/HoldingEditor';
import { ImportSheet, type ImportRow } from '../ui/ImportSheet';
import { GoldLock } from '../ui/GoldLock';
import { AppStoreButton } from '../ui/AppStore';
import { Button, Card, EmptyState, ErrorNote, PageHeader, Segmented, Skeleton } from '../ui/primitives';
import { SpotNotice } from '../ui/SpotNotice';
import type { ChartPoint } from '../ui/PriceChart';

const PriceChart = lazy(() => import('../ui/PriceChart'));

type HistRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

interface Snapshot {
  snapshot_date?: string;
  date?: string;
  total_value: number;
}

function StackHistory({ userId }: { userId: string }) {
  const [range, setRange] = useState<HistRange>('3M');
  const { isGold } = useSubscription();
  const q = useQuery({
    queryKey: ['snapshots', userId, range],
    queryFn: ({ signal }) => getJson<{ snapshots?: Snapshot[] }>(`/v1/snapshots/${userId}?range=${range}`, { signal }),
    enabled: isGold,
    staleTime: 10 * 60_000,
  });
  const points: ChartPoint[] = useMemo(
    () =>
      (q.data?.snapshots ?? [])
        .map((s) => ({ t: Date.parse(`${(s.snapshot_date || s.date || '').slice(0, 10)}T12:00:00Z`), v: Number(s.total_value) }))
        .filter((p) => Number.isFinite(p.t) && p.v > 0)
        .sort((a, b) => a.t - b.t),
    [q.data],
  );
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-[15px] font-semibold text-fg">Your stack over time</h2>
        {isGold && (
          <Segmented<HistRange>
            label="Range"
            size="sm"
            value={range}
            onChange={setRange}
            options={(['1M', '3M', '6M', '1Y', 'ALL'] as HistRange[]).map((r) => ({ value: r, label: r === 'ALL' ? 'All' : r }))}
          />
        )}
      </div>
      <GoldLock title="Your stack's value history" reason="Your stack's value over time is part of Gold." campaign="webapp-stack" teaser={<div className="h-[220px] rounded-xl bg-surface-2" />}>
        {q.isLoading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : q.isError ? (
          <ErrorNote onRetry={() => void q.refetch()}>Your stack's history didn't load.</ErrorNote>
        ) : points.length < 2 ? (
          <p className="py-10 text-center text-[14px] text-fg-3">Your history fills in a day at a time from when you start tracking.</p>
        ) : (
          <Suspense fallback={<Skeleton className="h-[220px] w-full" />}>
            <PriceChart data={points} color="var(--gold)" height={220} granularity="daily" valueLabel="Stack value" />
          </Suspense>
        )}
      </GoldLock>
    </Card>
  );
}

/**
 * The day a snapshot is filed under. The API files each one under the UTC
 * date, and the app checks the same date before it sends, so the site does
 * too and every day the API keeps gets one.
 */
function snapshotDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** That day, kept current while the page stays open. */
function useSnapshotDay(): string {
  const [day, setDay] = useState(() => snapshotDay());
  useEffect(() => {
    const check = () => setDay(snapshotDay());
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return day;
}

/** How recent prices have to be for a snapshot. In view, they're read every minute. */
const SNAPSHOT_PRICES_MS = 5 * 60_000;

/**
 * Record today's value once a day, the way the app does, so history fills in
 * for web users too. It goes from a live read of the stack, not the copy
 * shown while the account can't be reached, and from prices read in the last
 * few minutes of the same day. A tab in the background or a laptop asleep
 * past midnight still holds the day before's prices, so the new day's waits
 * for fresh ones.
 */
function useDailySnapshot(userId: string | undefined, holdings: Holding[], spot: SpotMap, live: boolean) {
  const day = useSnapshotDay();
  // The account and day the last snapshot went for, so a page left open
  // overnight sends the new day's.
  const sentFor = useRef<string | null>(null);
  const { prices, dataUpdatedAt, isFetching } = spot;
  const hasPrices = Boolean(spot.data);
  useEffect(() => {
    // Every metal in the stack needs a price. One missing from the prices
    // read would go into history at zero. Gold and silver also go in as the
    // day's spot.
    const priced = (m: Metal) => prices[m] > 0;
    if (!userId || !live || holdings.length === 0 || !priced('gold') || !priced('silver') || holdings.some((h) => !priced(h.metal))) return;
    const now = new Date();
    const fresh = hasPrices && !isFetching && now.getTime() - dataUpdatedAt < SNAPSHOT_PRICES_MS && snapshotDay(new Date(dataUpdatedAt)) === day && snapshotDay(now) === day;
    if (!fresh) return;
    const mark = `${userId}:${day}`;
    if (sentFor.current === mark) return;
    const key = `troystack_snapshot_${userId}`;
    try {
      if (localStorage.getItem(key) === day) return;
    } catch {
      // Storage is blocked. The stack lives in the account, so the snapshot
      // still goes, and the ref keeps it to one post a day.
    }
    sentFor.current = mark;
    const totals = stackTotals(holdings, prices);
    postJson('/v1/snapshots', {
      userId,
      totalValue: totals.value,
      goldValue: totals.byMetal.gold.value,
      silverValue: totals.byMetal.silver.value,
      platinumValue: totals.byMetal.platinum.value,
      palladiumValue: totals.byMetal.palladium.value,
      goldOz: totals.byMetal.gold.oz,
      silverOz: totals.byMetal.silver.oz,
      platinumOz: totals.byMetal.platinum.oz,
      palladiumOz: totals.byMetal.palladium.oz,
      goldSpot: prices.gold,
      silverSpot: prices.silver,
      platinumSpot: prices.platinum,
      palladiumSpot: prices.palladium,
    })
      .then(() => {
        try {
          localStorage.setItem(key, day);
        } catch {
          // fine, it will just send again next visit
        }
      })
      .catch(() => {
        if (sentFor.current === mark) sentFor.current = null;
      });
  }, [userId, holdings, prices, live, day, hasPrices, isFetching, dataUpdatedAt]);
}

function rowToForm(r: ImportRow): HoldingFormData | null {
  if (!r.metal || !r.weight || !(r.weight > 0)) return null;
  return {
    metal: r.metal,
    type: r.description || `${METAL_LABEL[r.metal]} ${r.weight} oz`,
    weight: r.weight,
    weightUnit: 'oz',
    quantity: r.quantity && r.quantity > 0 ? r.quantity : 1,
    purchasePrice: r.purchasePrice && r.purchasePrice > 0 ? r.purchasePrice : 0,
    purchaseDate: r.purchaseDate || '',
    dealer: r.dealer,
    taxes: r.taxes,
    shipping: r.shipping,
    note: r.note,
  };
}

/** "20 × 1 oz · APMEX · Feb 11, 2026", with the total ounces when it isn't obvious. */
function holdingDetail(h: Holding): string {
  const shown = h.weightUnit === 'oz' ? h.weight : h.weight / (h.weightUnit === 'g' ? OZT_PER_GRAM : OZT_PER_KG);
  const unit = h.weightUnit === 'oz' ? 'oz' : h.weightUnit;
  const parts = [`${num(h.quantity, 2)} × ${num(shown, 4)} ${unit}`];
  if (h.quantity !== 1 || h.weightUnit !== 'oz') parts.push(fmtOz(lineOz(h)));
  if (h.dealer) parts.push(h.dealer);
  if (h.purchaseDate) parts.push(formatDate(`${h.purchaseDate}T12:00:00Z`, { month: 'short', day: 'numeric', year: 'numeric' }));
  return parts.join(' · ');
}

export default function Stack() {
  usePageMeta({ ...SEO['/stack'], canonical: '/stack' });
  const { user, isConfigured } = useAuth();
  const { holdings, loading, error, isGuest, add, addMany, update, remove, refresh, leftInBrowser, moveBrowserStackIn, clearBrowserStack, pendingCount, offlineSince, refused, dismissRefused } = useHoldings();
  const spot = useSpotMap();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Holding | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | Metal>('all');
  const [importRows, setImportRows] = useState<{ rows: ImportRow[]; source: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => stackTotals(holdings, spot.prices, spot.changePct), [holdings, spot.prices, spot.changePct]);
  useDailySnapshot(user?.id, holdings, spot, !loading && !offlineSince);

  // Links from elsewhere on the site: /stack?add=1 and /stack?import=1
  useEffect(() => {
    if (params.get('add') === '1') {
      setEditing(null);
      setEditorOpen(true);
      params.delete('add');
      setParams(params, { replace: true });
    } else if (params.get('import') === '1') {
      params.delete('import');
      setParams(params, { replace: true });
      setTimeout(() => fileRef.current?.click(), 50);
    }
  }, [params, setParams]);

  const visible = useMemo(() => {
    const list = filter === 'all' ? holdings : holdings.filter((h) => h.metal === filter);
    return [...list].sort((a, b) => lineValue(b, spot.prices) - lineValue(a, spot.prices));
  }, [holdings, filter, spot.prices]);

  const metalsHeld = METALS.filter((m) => totals.byMetal[m].count > 0);
  // A metal with no live price would count at zero and read as a loss of
  // everything paid for it, so totals wait until every metal held has one.
  const valuesReady = Boolean(spot.data) && metalsHeld.every((m) => spot.priced(m));
  const waiting = <span className="text-[14px] text-fg-3">Waiting for prices</span>;

  const onFile = async (file: File) => {
    setImportError(null);
    try {
      const rows = await parseSpreadsheet(file);
      setImportRows({ rows, source: file.name });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  };

  const exportCsv = () => downloadText(`troystack-stack-${new Date().toISOString().slice(0, 10)}.csv`, holdingsToCSV(holdings), 'text/csv');

  const gainTone = totals.gain > 0 ? 'text-up' : totals.gain < 0 ? 'text-down' : 'text-fg-3';
  const dayTone = totals.dayChange > 0 ? 'text-up' : totals.dayChange < 0 ? 'text-down' : 'text-fg-3';

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader
        eyebrow="My Stack"
        title="Your stack at live spot"
        subtitle={isGuest ? 'Add what you own. It stays in this browser until you sign in.' : 'The same stack you see in the TroyStack app.'}
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
              <Plus size={16} aria-hidden="true" /> Add a holding
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet size={16} aria-hidden="true" /> Import
            </Button>
            {holdings.length > 0 && (
              <Button variant="ghost" onClick={exportCsv} aria-label="Export CSV">
                <Download size={16} aria-hidden="true" /> CSV
              </Button>
            )}
          </div>
        }
      />
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />

      {isGuest && isConfigured && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-line bg-gold-soft px-4 py-3">
          <p className="text-[14px] text-fg">Saved in this browser only. Sign in and it moves to your account, where the TroyStack app sees it too.</p>
          <Link to="/auth" className="shrink-0 inline-flex h-9 items-center justify-center rounded-lg bg-btn px-4 text-[13px] font-semibold text-btn-fg hover:bg-btn-hover">Sign in or sign up</Link>
        </div>
      )}
      {!isGuest && leftInBrowser.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
          <p className="text-[14px] text-fg">
            This browser still has {leftInBrowser.length} {leftInBrowser.length === 1 ? 'holding' : 'holdings'} you added before signing in.
          </p>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              disabled={moving}
              onClick={async () => {
                setMoving(true);
                setMoveError(null);
                try {
                  await moveBrowserStackIn();
                } catch (e) {
                  setMoveError(e instanceof Error ? e.message : "The holdings in this browser didn't move into your account. Try again.");
                } finally {
                  setMoving(false);
                }
              }}
            >
              Add them to my account
            </Button>
            <Button size="sm" variant="ghost" onClick={clearBrowserStack}>Clear them</Button>
          </div>
        </div>
      )}
      {moveError && <div className="mb-4"><ErrorNote>{moveError}</ErrorNote></div>}
      {!isGuest && offlineSince && (
        <div role="status" className="mb-4 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-fg">
          Your account can't be reached right now, so this is your stack as of{' '}
          {todayET(new Date(offlineSince)) === todayET() ? formatTimeET(offlineSince) : `${formatDate(offlineSince, { month: 'short', year: undefined })}, ${formatTimeET(offlineSince)}`}, with any changes you've made since on top.
        </div>
      )}
      {!isGuest && pendingCount > 0 && (
        <div role="status" className="mb-4 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-fg">
          {pendingCount === 1 ? 'One change is' : `${pendingCount} changes are`} saved in this browser and will reach your account when you're back online.
        </div>
      )}
      {refused > 0 && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-fg">
          <span>{refused === 1 ? "A change you made offline couldn't" : `${refused} changes you made offline couldn't`} be saved to your account. Check your stack and make {refused === 1 ? 'it' : 'them'} again.</span>
          <Button size="sm" variant="ghost" onClick={dismissRefused}>OK</Button>
        </div>
      )}
      {importError && <div className="mb-4"><ErrorNote>{importError}</ErrorNote></div>}
      {error && <div className="mb-4"><ErrorNote onRetry={() => refresh()}>Your stack didn't load.</ErrorNote></div>}
      {!loading && <SpotNotice spot={spot} metals={metalsHeld} className="mb-4" />}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-44 lg:col-span-2 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : holdings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<img src="/troy-96.png" alt="" className="h-14 w-14 rounded-full" />}
            title="Nothing in your stack yet"
            body="Add a coin or bar and TroyStack values it at live spot, with what you paid and what you've gained. Or import a spreadsheet you already keep."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>Add a holding</Button>
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>Import a spreadsheet</Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 sm:p-6 lg:col-span-2">
              <div className="text-[13px] text-fg-3">Total value</div>
              <div className="mt-1 text-[36px] sm:text-[42px] font-semibold tracking-tight text-fg tnum leading-tight">
                {valuesReady ? money(totals.value) : spot.isLoading ? <Skeleton className="h-11 w-56" /> : <span className="text-[20px] text-fg-3">Waiting for prices</span>}
              </div>
              {valuesReady && (
                <div className={cx('mt-1 text-[14px] font-semibold tnum', dayTone)}>
                  {signedMoney(totals.dayChange)} ({signedPercent(totals.dayChangePct)}) today
                </div>
              )}
              <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-line pt-4">
                <div>
                  <dt className="text-[12px] text-fg-3">Paid</dt>
                  <dd className="text-[16px] font-semibold text-fg tnum">{money(totals.cost)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-fg-3">Gain</dt>
                  {valuesReady ? (
                    <>
                      <dd className={cx('text-[16px] font-semibold tnum', gainTone)}>{signedMoney(totals.gain)}</dd>
                      <dd className={cx('text-[12px] tnum', gainTone)}>{signedPercent(totals.gainPct)}</dd>
                    </>
                  ) : (
                    <dd className="pt-0.5">{waiting}</dd>
                  )}
                </div>
                <div>
                  <dt className="text-[12px] text-fg-3">Premiums paid</dt>
                  {totals.premiums > 0 ? (
                    <>
                      <dd className="text-[16px] font-semibold text-fg tnum">{money(totals.premiums)}</dd>
                      <dd className="text-[12px] text-fg-3 tnum">{num(totals.premiumsPct, 1)}% of cost</dd>
                    </>
                  ) : (
                    <dd className="text-[14px] text-fg-3 pt-0.5">Not recorded</dd>
                  )}
                </div>
                <div>
                  <dt className="text-[12px] text-fg-3">Holdings</dt>
                  <dd className="text-[16px] font-semibold text-fg tnum">{holdings.length}</dd>
                </div>
              </dl>
            </Card>
            <Card className="p-5">
              <h2 className="text-[15px] font-semibold text-fg">By metal</h2>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                {valuesReady && metalsHeld.map((m) => (
                  <div key={m} style={{ width: `${totals.value > 0 ? (totals.byMetal[m].value / totals.value) * 100 : 0}%`, background: METAL_VAR[m] }} />
                ))}
              </div>
              <ul className="mt-4 space-y-3">
                {metalsHeld.map((m) => {
                  const t = totals.byMetal[m];
                  return (
                    <li key={m} className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: METAL_VAR[m] }} aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium text-fg">{METAL_LABEL[m]}</div>
                          <div className="text-[12px] text-fg-3 tnum">{fmtOz(t.oz)} · avg {money(t.avgCostPerOz)}/oz</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {spot.priced(m) ? (
                          <>
                            <div className="text-[14px] font-semibold text-fg tnum">{money(t.value)}</div>
                            <div className={cx('text-[12px] tnum', t.gain > 0 ? 'text-up' : t.gain < 0 ? 'text-down' : 'text-fg-3')}>{signedPercent(t.gainPct, 1)}</div>
                          </>
                        ) : spot.isLoading ? (
                          <Skeleton className="h-4 w-16" />
                        ) : (
                          <div className="text-[13px] text-fg-3">No price</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <Card className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
              <h2 className="text-[15px] font-semibold text-fg">Holdings</h2>
              <Segmented<'all' | Metal>
                label="Filter by metal"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[{ value: 'all', label: 'All' }, ...metalsHeld.map((m) => ({ value: m, label: METAL_LABEL[m] }))]}
              />
            </div>
            <ul>
              {visible.map((h) => {
                const value = lineValue(h, spot.prices);
                const cost = lineCostBasis(h);
                const gain = value - cost;
                return (
                  <li key={h.id} className="border-b border-line last:border-b-0">
                    <button type="button" onClick={() => { setEditing(h); setEditorOpen(true); }} className="w-full text-left flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2 transition-colors">
                      <span className="h-8 w-1 rounded-full shrink-0" style={{ background: METAL_VAR[h.metal] }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium text-fg truncate">{h.type}</span>
                        <span className="block text-[12px] text-fg-3 truncate tnum">{holdingDetail(h)}</span>
                      </span>
                      <span className="text-right shrink-0">
                        {spot.priced(h.metal) ? (
                          <>
                            <span className="block text-[14px] font-semibold text-fg tnum">{money(value)}</span>
                            {cost > 0 && <span className={cx('block text-[12px] tnum', gain > 0 ? 'text-up' : gain < 0 ? 'text-down' : 'text-fg-3')}>{signedMoney(gain)}</span>}
                          </>
                        ) : spot.isLoading ? (
                          <Skeleton className="h-4 w-16" />
                        ) : (
                          <span className="block text-[13px] text-fg-3">No price</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {user && (
            <div className="mt-4">
              <StackHistory userId={user.id} />
            </div>
          )}
        </>
      )}

      <Card className="mt-4 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Your stack on your phone</h2>
          <p className="mt-1 text-[14px] text-fg-2">Sign in to the app with the same account and it's all there, plus price alerts and receipt scanning.</p>
        </div>
        <AppStoreButton campaign="webapp-stack" label="Get the app" />
      </Card>

      {editorOpen && (
        <HoldingEditor
          key={editing?.id ?? 'new'}
          open={editorOpen}
          holding={editing}
          onClose={() => setEditorOpen(false)}
          onSave={async (form) => {
            if (editing) await update(editing, form);
            else await add(form);
          }}
          onDelete={editing ? () => remove(editing.id) : undefined}
        />
      )}
      {importRows && (
        <ImportSheet
          rows={importRows.rows}
          source={importRows.source}
          onClose={() => setImportRows(null)}
          onConfirm={async (rows, batchId) => {
            const forms = rows.map(rowToForm).filter((f): f is HoldingFormData => f !== null);
            await addMany(forms, batchId);
          }}
        />
      )}
    </div>
  );
}
