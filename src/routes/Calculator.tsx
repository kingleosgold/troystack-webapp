import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { money, money0 } from '../lib/format';
import { GAS, OIL_1971, OIL_TODAY, RENT, WAGE, amount, ounces, ratioContext, stackPower } from '../lib/purchasingPower';
import { Button, Card, Field, Input, LinkButton, PageHeader } from '../ui/primitives';
import { SpotNotice } from '../ui/SpotNotice';

function oz(n: number): string {
  if (n >= 10) return `${Math.round(n).toLocaleString('en-US')} oz`;
  return `${n.toFixed(2)} oz`;
}

/**
 * The stack purchasing power calculator that troystack.com served, now the
 * app's own page. It reads the app's live spot prices, so it never shows a
 * value from a price that isn't live. The amounts ride in the address, so a
 * shared link opens on the same stack.
 */
export default function Calculator() {
  usePageMeta({ ...SEO['/calculator'], canonical: '/calculator' });
  const [params, setParams] = useSearchParams();
  // The field shows the amount the address was read as, so a link with
  // 1,000 or 2abc in it doesn't leave a blank field over a value.
  const [gold, setGold] = useState(() => String(ounces(params.get('gold')) || ''));
  const [silver, setSilver] = useState(() => String(ounces(params.get('silver')) || ''));
  const [copied, setCopied] = useState(false);
  const spot = useSpotMap();
  const priced = spot.priced('gold') && spot.priced('silver');
  const goldOz = ounces(gold);
  const silverOz = ounces(silver);
  const r = priced ? stackPower(goldOz, silverOz, spot.prices.gold, spot.prices.silver) : null;

  const keep = (g: string, s: string) => {
    const next = new URLSearchParams();
    if (ounces(g)) next.set('gold', String(ounces(g)));
    if (ounces(s)) next.set('silver', String(ounces(s)));
    setParams(next, { replace: true });
  };

  const shareUrl = () => {
    const q = new URLSearchParams();
    if (goldOz) q.set('gold', String(goldOz));
    if (silverOz) q.set('silver', String(silverOz));
    // The site the page is on, so a link shared before troystack.com moves
    // over opens this page and not the marketing site's old one.
    return `${window.location.origin}/calculator${q.toString() ? `?${q}` : ''}`;
  };
  const shareText = () => {
    if (!r) return '';
    const focus = r.silverOz > 0 ? `${oz(r.silverOz)} silver` : `${oz(r.goldOz)} gold`;
    return `My ${focus} stack buys ${amount(r.barrelsToday)} barrels of oil today. In 1971, the same stack bought ${amount(r.barrels1971)} barrels. Real money holds real value.`;
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl());
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'What my stack buys', text: shareText(), url: shareUrl() });
      } catch {
        // closed without sharing
      }
    } else {
      await copyLink();
    }
  };

  const valueOr = (n: number) => (spot.awaiting ? '...' : r ? money(n) : priced ? money(0) : 'No price');
  const stackDesc = r ? [r.goldOz > 0 && `${oz(r.goldOz)} gold`, r.silverOz > 0 && `${oz(r.silverOz)} silver`].filter(Boolean).join(' and ') : '';
  const oilFactor = r ? r.barrelsToday / r.barrels1971 : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader
        eyebrow="Tools"
        title="What does your stack actually buy?"
        subtitle="Enter your gold and silver. See what it buys today in oil, rent, labor and gas, and how that compares to 1971."
      />
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Gold, troy ounces" htmlFor="calc-gold">
            <Input
              id="calc-gold"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0"
              autoComplete="off"
              value={gold}
              onChange={(e) => {
                setGold(e.target.value);
                keep(e.target.value, silver);
              }}
            />
          </Field>
          <Field label="Silver, troy ounces" htmlFor="calc-silver">
            <Input
              id="calc-silver"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0"
              autoComplete="off"
              value={silver}
              onChange={(e) => {
                setSilver(e.target.value);
                keep(gold, e.target.value);
              }}
            />
          </Field>
        </div>
        <p className="mt-4 text-[13px] text-fg-3 tnum">
          {spot.awaiting
            ? 'Loading live spot prices...'
            : priced
              ? `Live spot. Gold ${money0(spot.prices.gold)}/oz, silver ${money0(spot.prices.silver)}/oz.`
              : null}
        </p>
        <SpotNotice spot={spot} metals={['gold', 'silver']} className="mt-2" />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[13px] font-medium text-fg-3">Total stack value</h2>
          <div className="mt-1 text-[34px] font-semibold tracking-tight text-fg tnum">{valueOr(r?.total ?? 0)}</div>
          {r && (
            <p className="mt-1 text-[13px] text-fg-2 tnum">
              {[r.goldOz > 0 && `${oz(r.goldOz)} gold is ${money(r.goldValue)}`, r.silverOz > 0 && `${oz(r.silverOz)} silver is ${money(r.silverValue)}`]
                .filter(Boolean)
                .join(' and ')}
            </p>
          )}
          {!r && priced && !spot.awaiting && <p className="mt-1 text-[13px] text-fg-3">Enter an amount of gold or silver to start.</p>}
        </Card>
        <Card className="p-5">
          <h2 className="text-[13px] font-medium text-fg-3">Gold to silver ratio</h2>
          <div className="mt-1 text-[34px] font-semibold tracking-tight text-fg tnum">
            {spot.awaiting ? '...' : priced ? amount(spot.prices.gold / spot.prices.silver) : 'No price'}
          </div>
          {priced && <p className="mt-1 text-[13px] text-fg-2">{ratioContext(spot.prices.gold / spot.prices.silver)}</p>}
          <Link to="/tools/ratio" className="mt-2 inline-block text-[13px] font-semibold text-gold hover:text-gold-2">
            See its history
          </Link>
        </Card>
      </div>

      {r && (
        <>
          <Card className="mt-4 p-5">
            <h2 className="text-[15px] font-semibold text-fg">What your stack buys today</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [amount(r.total / OIL_TODAY), 'barrels of oil'],
                [amount(r.total / RENT), 'months of US rent'],
                [amount(r.total / WAGE, 0), 'hours of US labor'],
                [amount(r.total / GAS, 0), 'gallons of gas'],
                ...(r.silverOz > 0 && r.goldOz === 0 ? [[amount(r.silverValue / spot.prices.gold, 2), 'oz of gold, if swapped']] : []),
                ...(r.goldOz > 0 && r.silverOz === 0 ? [[amount(r.goldValue / spot.prices.silver, 0), 'oz of silver, if swapped']] : []),
              ].map(([n, label]) => (
                <div key={label} className="flex flex-col-reverse rounded-xl bg-surface-2 px-3 py-3">
                  <dt className="text-[12px] text-fg-3">{label}</dt>
                  <dd className="text-[22px] font-semibold text-fg tnum">{n}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="mt-4 p-5">
            <h2 className="text-[15px] font-semibold text-fg">The 1971 comparison</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
              In 1971 your {stackDesc} was worth <strong className="text-fg tnum">{money(r.value1971)}</strong>. Today it's worth{' '}
              <strong className="text-fg tnum">{money(r.total)}</strong>.
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
              Oil was ${OIL_1971.toFixed(2)} a barrel then, so it bought <strong className="text-fg tnum">{amount(r.barrels1971)}</strong> barrels. At ${OIL_TODAY} today
              it buys <strong className="text-fg tnum">{amount(r.barrelsToday)}</strong>. That's{' '}
              <strong className="text-fg tnum">
                {amount(oilFactor >= 1 ? oilFactor : 1 / oilFactor)}x {oilFactor >= 1 ? 'more' : 'less'}
              </strong>{' '}
              oil than in 1971.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void share()}>
                Share
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
                {copied ? 'Link copied' : 'Copy link'}
              </Button>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText()} ${shareUrl()}`)}`}
                target="_blank"
                rel="noopener"
                className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-fg-2 hover:text-fg"
              >
                Post on X
              </a>
            </div>
          </Card>
        </>
      )}

      <Card className="mt-4 p-5">
        <h2 className="text-[15px] font-semibold text-fg">Track the whole stack</h2>
        <p className="mt-1 text-[14px] text-fg-2">
          Add your coins and bars once and see them valued live, with a daily brief, price alerts and Troy to ask about the market.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton to="/stack?add=1" size="sm">
            Start your stack
          </LinkButton>
          <LinkButton to="/gold?campaign=site-calculator" variant="secondary" size="sm">
            Try Gold free for 7 days
          </LinkButton>
        </div>
      </Card>

      <footer className="mt-8 border-t border-line pt-4 text-[12px] leading-relaxed text-fg-3">
        <p>
          Values use live spot from TroyStack. Oil at ${OIL_TODAY} a barrel, rent at ${RENT.toLocaleString('en-US')} a month, labor at ${WAGE} an hour and gas at $
          {GAS.toFixed(2)} a gallon are round US figures. Gold was $35 and silver $1.29 an ounce in 1971.
        </p>
        <p className="mt-1">Troy is an AI. Not financial advice.</p>
      </footer>
    </div>
  );
}
