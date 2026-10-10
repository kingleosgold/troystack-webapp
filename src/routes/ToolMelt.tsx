import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { METALS, METAL_LABEL, OZT_PER_GRAM, OZT_PER_KG } from '../lib/metals';
import { money, num } from '../lib/format';
import type { Metal } from '../types/holding';
import { Card, Field, Input, PageHeader, Segmented, Select } from '../ui/primitives';
import { SpotNotice } from '../ui/SpotNotice';
import { cx } from '../lib/cx';
import { AppStoreButton } from '../ui/AppStore';

/** Fine metal per piece, in troy ounces. Standard published specifications. */
const PRESETS: Record<Metal, Array<{ id: string; name: string; fine: number }>> = {
  gold: [
    { id: 'age1', name: 'American Gold Eagle, 1 oz', fine: 1 },
    { id: 'age12', name: 'American Gold Eagle, 1/2 oz', fine: 0.5 },
    { id: 'age14', name: 'American Gold Eagle, 1/4 oz', fine: 0.25 },
    { id: 'age110', name: 'American Gold Eagle, 1/10 oz', fine: 0.1 },
    { id: 'buffalo', name: 'American Gold Buffalo, 1 oz', fine: 1 },
    { id: 'krug', name: 'South African Krugerrand, 1 oz', fine: 1 },
    { id: 'maple', name: 'Canadian Gold Maple Leaf, 1 oz', fine: 1 },
    { id: 'phil', name: 'Austrian Gold Philharmonic, 1 oz', fine: 1 },
    { id: 'sov', name: 'British Sovereign', fine: 0.2354 },
    { id: 'peso50', name: 'Mexican 50 Pesos', fine: 1.2057 },
    { id: 'de20', name: 'US $20 Double Eagle (pre-1933)', fine: 0.9675 },
    { id: 'e10', name: 'US $10 Eagle (pre-1933)', fine: 0.48375 },
    { id: 'he5', name: 'US $5 Half Eagle (pre-1933)', fine: 0.24187 },
    { id: 'fr20', name: 'Swiss 20 Francs', fine: 0.1867 },
  ],
  silver: [
    { id: 'ase', name: 'American Silver Eagle, 1 oz', fine: 1 },
    { id: 'smaple', name: 'Canadian Silver Maple Leaf, 1 oz', fine: 1 },
    { id: 'brit', name: 'British Silver Britannia, 1 oz', fine: 1 },
    { id: 'round', name: 'Silver round, 1 oz', fine: 1 },
    { id: 'bar10', name: 'Silver bar, 10 oz', fine: 10 },
    { id: 'bar100', name: 'Silver bar, 100 oz', fine: 100 },
    { id: 'kilo', name: 'Silver bar, 1 kilo', fine: OZT_PER_KG },
    { id: 'morgan', name: 'Morgan or Peace dollar', fine: 0.77344 },
    { id: 'half90', name: '90% half dollar (pre-1965)', fine: 0.36169 },
    { id: 'quarter90', name: '90% quarter (pre-1965)', fine: 0.18084 },
    { id: 'dime90', name: '90% dime (pre-1965)', fine: 0.07234 },
    { id: 'kennedy40', name: '40% Kennedy half (1965 to 1970)', fine: 0.14792 },
    { id: 'warnickel', name: 'War nickel (1942 to 1945)', fine: 0.05626 },
  ],
  platinum: [
    { id: 'ape', name: 'American Platinum Eagle, 1 oz', fine: 1 },
    { id: 'pmaple', name: 'Canadian Platinum Maple Leaf, 1 oz', fine: 1 },
    { id: 'pbar', name: 'Platinum bar, 1 oz', fine: 1 },
  ],
  palladium: [
    { id: 'pdmaple', name: 'Canadian Palladium Maple Leaf, 1 oz', fine: 1 },
    { id: 'apde', name: 'American Palladium Eagle, 1 oz', fine: 1 },
    { id: 'pdbar', name: 'Palladium bar, 1 oz', fine: 1 },
  ],
};

type Unit = 'oz' | 'g' | 'kg';
const UNIT_TO_OZT: Record<Unit, number> = { oz: 1, g: OZT_PER_GRAM, kg: OZT_PER_KG };

export default function ToolMelt() {
  usePageMeta({ ...SEO['/tools/melt'], canonical: '/tools/melt' });
  const spotMap = useSpotMap();
  const { prices, awaiting } = spotMap;
  const [metal, setMetal] = useState<Metal>('gold');
  const [preset, setPreset] = useState<string>(PRESETS.gold[0].id);
  const [qty, setQty] = useState('1');
  const [weight, setWeight] = useState('1');
  const [unit, setUnit] = useState<Unit>('oz');
  const [purity, setPurity] = useState('99.9');

  const custom = preset === 'custom';
  const finePerPiece = useMemo(() => {
    if (!custom) return PRESETS[metal].find((p) => p.id === preset)?.fine ?? 0;
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
  const shown = (n: number) => (awaiting ? '...' : hasPrice ? money(n) : 'No price');

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
              setPreset(PRESETS[m][0].id);
            }}
            options={METALS.map((m) => ({ value: m, label: METAL_LABEL[m] }))}
          />
          <Field label="Coin or bar" htmlFor="melt-preset">
            <Select id="melt-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS[metal].map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
          <Field label="How many" htmlFor="melt-qty">
            <Input id="melt-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] text-fg-3">Melt value</div>
          <div className={cx('mt-1 font-semibold tracking-tight tnum', hasPrice || awaiting ? 'text-[34px] text-fg' : 'text-[22px] text-fg-3')}>{shown(value)}</div>
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
