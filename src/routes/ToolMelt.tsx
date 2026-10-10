import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { METALS, METAL_LABEL, OZT_PER_GRAM, OZT_PER_KG } from '../lib/metals';
import { COINS, type Coin } from '../lib/coins';
import { PURITIES, purityPercent } from '../lib/purity';
import { money, num } from '../lib/format';
import type { Metal } from '../types/holding';
import { Card, Field, Input, PageHeader, Segmented, Select } from '../ui/primitives';
import { SpotNotice } from '../ui/SpotNotice';
import { cx } from '../lib/cx';
import { AppStoreButton } from '../ui/AppStore';

/** Every coin and bar with a page of its own, grouped by metal. */
const PRESETS = Object.fromEntries(METALS.map((m) => [m, COINS.filter((c) => c.metal === m)])) as Record<Metal, Coin[]>;

type Unit = 'oz' | 'g' | 'kg';
const UNIT_TO_OZT: Record<Unit, number> = { oz: 1, g: OZT_PER_GRAM, kg: OZT_PER_KG };

export default function ToolMelt() {
  usePageMeta({ ...SEO['/tools/melt'], canonical: '/tools/melt' });
  const spotMap = useSpotMap();
  const { prices, isLoading } = spotMap;
  const [metal, setMetal] = useState<Metal>('gold');
  const [preset, setPreset] = useState<string>(PRESETS.gold[0].slug);
  const [qty, setQty] = useState('1');
  const [weight, setWeight] = useState('1');
  const [unit, setUnit] = useState<Unit>('oz');
  const [purity, setPurity] = useState('99.9');

  const custom = preset === 'custom';
  const finePerPiece = useMemo(() => {
    if (!custom) return PRESETS[metal].find((p) => p.slug === preset)?.fineOzt ?? 0;
    const w = parseFloat(weight) || 0;
    const p = Math.min(100, Math.max(0, parseFloat(purity) || 0)) / 100;
    return w * UNIT_TO_OZT[unit] * p;
  }, [custom, metal, preset, weight, unit, purity]);

  const pieces = Math.max(0, parseFloat(qty) || 0);
  const fine = finePerPiece * pieces;
  const spot = prices[metal] || 0;
  const value = fine * spot;
  // Without a live price the answer would read $0.00, so it says so instead.
  const hasPrice = spotMap.priced(metal);
  const shown = (n: number) => (isLoading ? '...' : hasPrice ? money(n) : 'No price');

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader eyebrow="Tools" title="Melt value calculator" subtitle="What the metal in a coin, round or bar is worth at live spot." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        <Card className="p-5 space-y-4">
          <Segmented<Metal>
            label="Metal"
            value={metal}
            onChange={(m) => {
              setMetal(m);
              setPreset(PRESETS[m][0].slug);
            }}
            options={METALS.map((m) => ({ value: m, label: METAL_LABEL[m] }))}
          />
          <Field label="Coin or bar" htmlFor="melt-preset">
            <Select id="melt-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS[metal].map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
              <option value="custom">Something else, by weight and purity</option>
            </Select>
          </Field>
          {custom && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Weight" htmlFor="melt-weight">
                <Input id="melt-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </Field>
              <Field label="Unit" htmlFor="melt-unit">
                <Select id="melt-unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                  <option value="oz">troy oz</option>
                  <option value="g">grams</option>
                  <option value="kg">kilograms</option>
                </Select>
              </Field>
              <Field label="Purity %" htmlFor="melt-purity">
                <Input id="melt-purity" inputMode="decimal" value={purity} onChange={(e) => setPurity(e.target.value)} />
              </Field>
            </div>
          )}
          {custom && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Common purities">
              {PURITIES[metal].map((p) => {
                const value = purityPercent(p.fineness);
                return (
                  <button
                    key={p.short}
                    type="button"
                    onClick={() => setPurity(value)}
                    aria-pressed={purity === value}
                    title={p.label}
                    className={
                      purity === value
                        ? 'h-8 rounded-lg border border-gold bg-gold-soft px-3 text-[13px] font-semibold text-fg'
                        : 'h-8 rounded-lg border border-line px-3 text-[13px] font-semibold text-fg-2 hover:bg-surface-2 hover:text-fg'
                    }
                  >
                    {p.short}
                  </button>
                );
              })}
            </div>
          )}
          <Field label="How many" htmlFor="melt-qty">
            <Input id="melt-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] text-fg-3">Melt value</div>
          <div className={cx('mt-1 font-semibold tracking-tight tnum', hasPrice || isLoading ? 'text-[34px] text-fg' : 'text-[22px] text-fg-3')}>{shown(value)}</div>
          <dl className="mt-4 space-y-2 text-[14px]">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">Pure {METAL_LABEL[metal].toLowerCase()}</dt>
              <dd className="text-fg tnum">{num(fine, 4)} oz</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">Per piece</dt>
              <dd className="text-fg tnum">{shown(finePerPiece * spot)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">{METAL_LABEL[metal]} spot</dt>
              <dd className="text-fg tnum">{shown(spot)}</dd>
            </div>
          </dl>
          <SpotNotice spot={spotMap} metals={[metal]} className="mt-4" />
          <p className="mt-4 text-[12px] text-fg-3">Dealers sell above melt and usually buy back near it. Collectible coins can be worth well over melt.</p>
          {!custom && (
            <Link to={`/coins/${preset}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-gold hover:underline">
              Weight, purity and what to know <ArrowRight size={13} aria-hidden="true" />
            </Link>
          )}
        </Card>
      </div>
      <Card className="mt-4 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Track what you own, not just one coin</h2>
          <p className="mt-1 text-[14px] text-fg-2">Add your stack and it's valued at live spot every time you look, here and in the app.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link to="/stack?add=1" className="inline-flex h-10 items-center rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">Add to my stack</Link>
          <AppStoreButton campaign="webapp-tools" variant="dark" label="Get the app" />
        </div>
      </Card>
    </div>
  );
}
