import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSpotMap } from '../hooks/queries';
import { useHoldings } from '../hooks/useHoldings';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { METALS, METAL_LABEL, METAL_VAR } from '../lib/metals';
import { lineOz, valueAt, type SpotMap } from '../lib/stackMath';
import { money, num, signedMoney, signedPercent } from '../lib/format';
import type { Metal } from '../types/holding';
import { cx } from '../lib/cx';
import { Card, ErrorNote, Field, Input, PageHeader } from '../ui/primitives';
import { SpotNotice } from '../ui/SpotNotice';
import { AppStoreButton } from '../ui/AppStore';

const MOVES = [
  { label: '-20%', f: 0.8 },
  { label: 'Today', f: 1 },
  { label: '+25%', f: 1.25 },
  { label: '+50%', f: 1.5 },
  { label: '2x', f: 2 },
];

export default function ToolWhatIf() {
  usePageMeta({ ...SEO['/tools/what-if'], canonical: '/tools/what-if' });
  const spotMap = useSpotMap();
  const { prices, data } = spotMap;
  const { holdings, error: stackError, refresh: reloadStack } = useHoldings();
  const hasStack = holdings.length > 0;
  // A stack that didn't load isn't an empty one. The amounts below stand in until it does.
  const stackFailed = Boolean(stackError) && !hasStack;
  // A metal with no price typed in follows live spot.
  const [targets, setTargets] = useState<Partial<Record<Metal, string>>>({});
  const [manualOz, setManualOz] = useState<Record<Metal, string>>({ gold: '1', silver: '100', platinum: '', palladium: '' });

  // A metal with no live price leaves its box empty for a price to be typed, rather than showing 0.
  const shown = (m: Metal) => targets[m] ?? (spotMap.priced(m) ? String(Math.round(prices[m])) : '');

  const target: SpotMap = useMemo(() => {
    const t = {} as SpotMap;
    for (const m of METALS) t[m] = parseFloat(targets[m] ?? '') || prices[m] || 0;
    return t;
  }, [targets, prices]);

  const ounces = useMemo(() => {
    const o = { gold: 0, silver: 0, platinum: 0, palladium: 0 } as Record<Metal, number>;
    if (hasStack) for (const h of holdings) o[h.metal] += lineOz(h);
    else for (const m of METALS) o[m] = parseFloat(manualOz[m]) || 0;
    return o;
  }, [hasStack, holdings, manualOz]);

  const nowValue = METALS.reduce((s, m) => s + ounces[m] * (prices[m] || 0), 0);
  const thenValue = hasStack ? valueAt(holdings, target) : METALS.reduce((s, m) => s + ounces[m] * target[m], 0);
  // A metal in play with no live price would count at zero today, and with
  // no price typed in, at zero in the what-if too.
  const inPlay = METALS.filter((m) => ounces[m] > 0);
  const todayKnown = Boolean(data) && inPlay.every((m) => spotMap.priced(m));
  const thenKnown = inPlay.every((m) => target[m] > 0);
  const diff = thenValue - nowValue;
  const ratio = target.silver > 0 ? target.gold / target.silver : 0;

  const applyMove = (f: number) => {
    if (f === 1) {
      setTargets({});
      return;
    }
    const next: Partial<Record<Metal, string>> = {};
    for (const m of METALS) next[m] = spotMap.priced(m) ? String(Math.round(prices[m] * f)) : '';
    setTargets(next);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader eyebrow="Tools" title="What if" subtitle={hasStack ? 'Pick prices and see what your stack would be worth.' : 'Pick prices and see what an amount of metal would be worth. Add your stack and this uses it.'} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <div className="flex flex-wrap gap-2 mb-4" aria-label="Quick moves">
            {MOVES.map((mv) => (
              <button key={mv.label} type="button" onClick={() => applyMove(mv.f)} className="rounded-full border border-line px-3 h-8 text-[13px] font-semibold text-fg-2 hover:border-gold hover:text-gold">
                {mv.label}
              </button>
            ))}
          </div>
          <div className="space-y-4">
            {METALS.map((m) => (
              <div key={m} className="grid grid-cols-[1fr_1fr] gap-3 items-end">
                <Field label={`${METAL_LABEL[m]} price`} hint={spotMap.priced(m) ? `Spot ${money(prices[m])}` : spotMap.isLoading ? 'Spot loading' : 'No live price right now'} htmlFor={`wi-${m}`}>
                  <Input id={`wi-${m}`} inputMode="decimal" value={shown(m)} onChange={(e) => setTargets((p) => ({ ...p, [m]: e.target.value }))} />
                </Field>
                {hasStack ? (
                  <div className="pb-6 text-[13px] text-fg-3">
                    <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: METAL_VAR[m] }} aria-hidden="true" />
                    You hold {num(ounces[m], 2)} oz
                  </div>
                ) : (
                  <Field label="Ounces" htmlFor={`wi-oz-${m}`}>
                    <Input id={`wi-oz-${m}`} inputMode="decimal" placeholder="0" value={manualOz[m]} onChange={(e) => setManualOz((p) => ({ ...p, [m]: e.target.value }))} />
                  </Field>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5 h-fit">
          <div className="text-[13px] text-fg-3">{hasStack ? 'Your stack at these prices' : 'Worth at these prices'}</div>
          <div className={cx('mt-1 font-semibold tracking-tight tnum', thenKnown ? 'text-[32px] text-fg' : 'text-[20px] text-fg-3')}>{thenKnown ? money(thenValue) : 'Type a price for each metal'}</div>
          {thenKnown && todayKnown && (
            <div className={cx('text-[14px] font-semibold tnum', diff > 0 ? 'text-up' : diff < 0 ? 'text-down' : 'text-fg-3')}>
              {signedMoney(diff)} ({signedPercent(nowValue > 0 ? (diff / nowValue) * 100 : 0)}) from today
            </div>
          )}
          <dl className="mt-4 space-y-2 text-[14px]">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">Worth today</dt>
              <dd className="text-fg tnum">{todayKnown ? money(nowValue) : spotMap.isLoading ? '...' : 'No price'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">Gold/silver ratio</dt>
              <dd className="text-fg tnum">{ratio ? ratio.toFixed(1) : spotMap.isLoading ? '...' : 'No price'}</dd>
            </div>
          </dl>
          <SpotNotice spot={spotMap} metals={inPlay} className="mt-4" />
          {stackFailed && (
            <div className="mt-4">
              <ErrorNote onRetry={() => void reloadStack()}>Your stack didn't load, so this uses the amounts you type.</ErrorNote>
            </div>
          )}
          {!hasStack && !stackFailed && (
            <Link to="/stack?add=1" className="mt-4 inline-block text-[13px] font-semibold text-gold hover:text-gold-2">
              Add your stack
            </Link>
          )}
        </Card>
      </div>
      <Card className="mt-4 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Want to know the moment it gets there?</h2>
          <p className="mt-1 text-[14px] text-fg-2">Set a price alert in the iPhone app and it pushes you when spot crosses your number.</p>
        </div>
        <AppStoreButton campaign="webapp-alerts" label="Set an alert" />
      </Card>
    </div>
  );
}
