import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { money, num } from '../lib/format';
import { coinsInGroup } from '../lib/coins';
import { Card, Field, Input, PageHeader, Segmented } from '../ui/primitives';
import { AppStoreButton } from '../ui/AppStore';

/** Silver per coin in troy ounces, the same figures the API's calculator uses. */
const COINS = [
  { id: 'dimes', name: 'Dimes', detail: 'Roosevelt and Mercury, 1964 and earlier', oz: 0.07234, face: 0.1 },
  { id: 'quarters', name: 'Quarters', detail: 'Washington, 1964 and earlier', oz: 0.18084, face: 0.25 },
  { id: 'halves', name: 'Half dollars', detail: 'Walking Liberty, Franklin, 1964 Kennedy', oz: 0.36169, face: 0.5 },
  { id: 'kennedy40', name: '40% Kennedy halves', detail: '1965 to 1970', oz: 0.14792, face: 0.5 },
  { id: 'dollars', name: 'Silver dollars', detail: 'Morgan and Peace', oz: 0.77344, face: 1 },
  { id: 'nickels', name: 'War nickels', detail: 'Jefferson, 1942 to 1945', oz: 0.05626, face: 0.05 },
] as const;

/** Silver in $1 face value of 90% dimes, quarters or halves, the figure dealers quote. */
const OZ_PER_DOLLAR_FACE = 0.715;

type Mode = 'coins' | 'face';

export default function ToolJunkSilver() {
  usePageMeta({ ...SEO['/tools/junk-silver'], canonical: '/tools/junk-silver' });
  const { prices } = useSpotMap();
  const [mode, setMode] = useState<Mode>('coins');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [face, setFace] = useState('10');
  const spot = prices.silver || 0;

  const oz =
    mode === 'face'
      ? (parseFloat(face) || 0) * OZ_PER_DOLLAR_FACE
      : COINS.reduce((sum, c) => sum + (parseFloat(counts[c.id] || '') || 0) * c.oz, 0);
  const faceTotal =
    mode === 'face' ? parseFloat(face) || 0 : COINS.reduce((sum, c) => sum + (parseFloat(counts[c.id] || '') || 0) * c.face, 0);
  const value = oz * spot;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader eyebrow="Tools" title="Junk silver calculator" subtitle="US dimes, quarters and halves from 1964 and earlier are 90% silver. Here's what they're worth at today's spot." />
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <Segmented<Mode>
            label="How to count"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'coins', label: 'By the coin' },
              { value: 'face', label: 'By face value' },
            ]}
          />
          {mode === 'coins' ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {COINS.map((c) => (
                <Field key={c.id} label={c.name} hint={c.detail} htmlFor={`junk-${c.id}`}>
                  <Input
                    id={`junk-${c.id}`}
                    inputMode="numeric"
                    placeholder="0"
                    value={counts[c.id] ?? ''}
                    onChange={(e) => setCounts((prev) => ({ ...prev, [c.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                  />
                </Field>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <Field label="Face value of 90% dimes, quarters or halves" hint="$10 face of 90% coins holds about 7.15 oz of silver." htmlFor="junk-face">
                <Input id="junk-face" inputMode="decimal" value={face} onChange={(e) => setFace(e.target.value)} />
              </Field>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="text-[13px] text-fg-3">Melt value</div>
          <div className="mt-1 text-[34px] font-semibold tracking-tight text-fg tnum">{money(value)}</div>
          <dl className="mt-4 space-y-2 text-[14px]">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">Silver</dt>
              <dd className="text-fg tnum">{num(oz, 3)} oz</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">Face value</dt>
              <dd className="text-fg tnum">{money(faceTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">Per $1 face (90%)</dt>
              <dd className="text-fg tnum">{money(OZ_PER_DOLLAR_FACE * spot)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-3">Silver spot</dt>
              <dd className="text-fg tnum">{money(spot)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[12px] text-fg-3">Worn coins can come in a little under these figures. Dealers often quote junk silver as a multiple of face value.</p>
        </Card>
      </div>
      <Card className="mt-4 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Bought some at a coin shop?</h2>
          <p className="mt-1 text-[14px] text-fg-2">In the app, snap the receipt and Troy adds every coin to your stack.</p>
        </div>
        <AppStoreButton campaign="webapp-tools" label="Get the app" />
      </Card>
      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-fg">Coin by coin</h2>
        <p className="mt-1 text-[13px] text-fg-3">Which years are silver, how much each one holds, and when a coin is worth more than its melt.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {coinsInGroup('us-silver').map((c) => (
            <Link
              key={c.slug}
              to={`/coins/${c.slug}`}
              className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-fg-2 hover:bg-surface-2 hover:text-fg"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
