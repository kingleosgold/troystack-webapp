import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { money, money0 } from '../lib/format';
import { cx } from '../lib/cx';
import type { Metal } from '../types/holding';
import { GAS, OIL_TODAY, RENT, WAGE, amount, ounces } from '../lib/purchasingPower';
import { GOLD_PRESETS, SILVER_PRESETS, scenario, targetContext } from '../lib/speculation';
import { Button, Card, Field, Input, LinkButton, PageHeader } from '../ui/primitives';
import { SpotNotice } from '../ui/SpotNotice';
import { NewTabNote } from '../ui/NewTabNote';

type Key = 'gold' | 'silver' | 'goldTarget' | 'silverTarget';
const KEYS: Key[] = ['gold', 'silver', 'goldTarget', 'silverTarget'];

/**
 * The what-if price scenario troystack.com served at /speculation, now the
 * app's own page. Targets value the stack against live spot, and nothing is
 * valued from a price that isn't live. Amounts and targets ride in the
 * address, so a shared link opens the same scenario.
 */
export default function Speculation() {
  usePageMeta({ ...SEO['/speculation'], canonical: '/speculation' });
  const [params, setParams] = useSearchParams();
  // Each field shows the amount the address was read as.
  const [vals, setVals] = useState<Record<Key, string>>(() => {
    const v = {} as Record<Key, string>;
    for (const k of KEYS) v[k] = String(ounces(params.get(k)) || '');
    return v;
  });
  const [copied, setCopied] = useState(false);
  const spot = useSpotMap();
  const n = (k: Key) => ounces(vals[k]);
  const r = spot.awaiting ? null : scenario(n('gold'), n('silver'), n('goldTarget'), n('silverTarget'), spot.priced('gold') ? spot.prices.gold : 0, spot.priced('silver') ? spot.prices.silver : 0);

  const query = (v: Record<Key, string>) => {
    const q = new URLSearchParams();
    for (const k of KEYS) if (ounces(v[k])) q.set(k, String(ounces(v[k])));
    return q;
  };
  const set = (k: Key, value: string) => {
    const next = { ...vals, [k]: value };
    setVals(next);
    setParams(query(next), { replace: true });
  };

  const shareUrl = () => {
    const q = query(vals).toString();
    // The site the page is on, so a link shared before troystack.com moves
    // over opens this page and not the marketing site's old one.
    return `${window.location.origin}/speculation${q ? `?${q}` : ''}`;
  };
  const shareText = () => {
    if (!r) return '';
    const hits = [r.goldOz > 0 && n('goldTarget') > 0 && `gold hits ${money0(r.goldAt)}`, r.silverOz > 0 && n('silverTarget') > 0 && `silver hits ${money0(r.silverAt)}`].filter(Boolean).join(' and ');
    return `If ${hits}, my stack would be worth ${money0(r.projected)}. What would yours be worth?`;
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
        await navigator.share({ title: 'What if my stack was worth more?', text: shareText(), url: shareUrl() });
      } catch {
        // closed without sharing
      }
    } else {
      await copyLink();
    }
  };

  const held = n('gold') > 0 || n('silver') > 0;
  const targeted = (n('gold') > 0 && n('goldTarget') > 0) || (n('silver') > 0 && n('silverTarget') > 0);
  const hint = spot.awaiting ? null : !held ? 'Enter your gold or silver to start.' : !targeted ? 'Set a target price for a metal you hold.' : null;
  // A price that's missing only matters for a metal held.
  const noticeFor: Metal[] = (['gold', 'silver'] as const).filter((m) => !held || n(m) > 0);
  // A gain that rounds to $0.00 gets no sign and no color.
  const flat = r ? Math.abs(r.gain) < 0.005 : true;
  const loss = r ? r.gain < 0 && !flat : false;
  const sign = flat ? '' : loss ? '-' : '+';
  const spotLine = [spot.priced('gold') && `gold ${money0(spot.prices.gold)}/oz`, spot.priced('silver') && `silver ${money0(spot.prices.silver)}/oz`].filter(Boolean).join(', ');

  const input = (k: Key, label: string, placeholder: string, step: string, presets?: number[]) => (
    <div>
      <Field label={label} htmlFor={`spec-${k}`}>
      <Input
        id={`spec-${k}`}
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        placeholder={placeholder}
        autoComplete="off"
        value={vals[k]}
        onChange={(e) => set(k, e.target.value)}
      />
      </Field>
      {/* Outside the label, so the field's name is just its label. */}
      {presets && (
        <div role="group" aria-label={`${label}, quick picks`} className="mt-2 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={n(k) === p}
              onClick={() => set(k, String(p))}
              className={cx(
                'h-8 rounded-full border px-3 text-[13px] font-semibold tnum',
                n(k) === p ? 'border-gold text-gold' : 'border-line text-fg-2 hover:border-gold hover:text-gold',
              )}
            >
              {money0(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader eyebrow="Tools" title="What if your stack was worth more?" subtitle="Set target prices for gold and silver. See what your stack could be worth and what it would buy." />
      <Card className="p-5">
        <h2 className="text-[13px] font-medium text-fg-3">Your stack</h2>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {input('gold', 'Gold, troy ounces', '0', '0.01')}
          {input('silver', 'Silver, troy ounces', '0', '0.01')}
        </div>
        <h2 className="mt-5 text-[13px] font-medium text-fg-3">Target prices</h2>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {input('goldTarget', 'Gold target, USD per oz', '10000', 'any', GOLD_PRESETS)}
          {input('silverTarget', 'Silver target, USD per oz', '250', 'any', SILVER_PRESETS)}
        </div>
        <p className="mt-4 text-[13px] text-fg-3 tnum">
          {spot.awaiting
            ? 'Loading live spot prices...'
            : spotLine
              ? `Live spot. ${spotLine.charAt(0).toUpperCase()}${spotLine.slice(1)}.`
              : null}
        </p>
        <SpotNotice spot={spot} metals={noticeFor} className="mt-2" />
        {hint && <p className="mt-2 text-[13px] text-fg-2">{hint}</p>}
      </Card>

      {r && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-[13px] font-medium text-fg-3">Value today</h2>
              <div className="mt-1 text-[34px] font-semibold tracking-tight text-fg tnum">{money(r.current)}</div>
            </Card>
            <Card className="p-5">
              <h2 className="text-[13px] font-medium text-fg-3">Value at your targets</h2>
              <div className="mt-1 text-[34px] font-semibold tracking-tight text-gold tnum">{money(r.projected)}</div>
              <p className={cx('mt-1 text-[15px] font-semibold tnum', flat ? 'text-fg-2' : loss ? 'text-down' : 'text-up')}>
                {sign}
                {money(flat ? 0 : Math.abs(r.gain))} ({sign}
                {Math.abs(flat ? 0 : r.gainPct).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
              </p>
            </Card>
          </div>

          <Card className="mt-4 p-5">
            <h2 className="text-[15px] font-semibold text-fg">Against today's spot</h2>
            <ul className="mt-2 space-y-1 text-[15px] leading-relaxed text-fg-2 tnum">
              {r.goldOz > 0 && (
                <li>
                  Gold {money0(spot.prices.gold)} to {money0(r.goldAt)}/oz.{' '}
                  {n('goldTarget') > 0 ? targetContext('Gold', r.goldAt, spot.prices.gold) : 'No target, so it stays at spot.'}
                </li>
              )}
              {r.silverOz > 0 && (
                <li>
                  Silver {money0(spot.prices.silver)} to {money0(r.silverAt)}/oz.{' '}
                  {n('silverTarget') > 0 ? targetContext('Silver', r.silverAt, spot.prices.silver) : 'No target, so it stays at spot.'}
                </li>
              )}
            </ul>
          </Card>

          <Card className="mt-4 p-5">
            <h2 className="text-[15px] font-semibold text-fg">What it would buy</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [amount(r.projected / OIL_TODAY), 'barrels of oil'],
                [amount(r.projected / RENT), 'months of US rent'],
                [amount(r.projected / WAGE, 0), 'hours of US labor'],
                [amount(r.projected / GAS, 0), 'gallons of gas'],
              ].map(([v, label]) => (
                <div key={label} className="flex flex-col-reverse rounded-xl bg-surface-2 px-3 py-3">
                  <dt className="text-[12px] text-fg-3">{label}</dt>
                  <dd className="text-[22px] font-semibold text-fg tnum">{v}</dd>
                </div>
              ))}
            </dl>
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
                <NewTabNote />
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
          <LinkButton to="/gold?campaign=site-what-if" variant="secondary" size="sm">
            Try Gold free for 7 days
          </LinkButton>
        </div>
        <p className="mt-3 text-[13px] text-fg-3">
          Also try <Link to="/calculator" className="font-semibold text-fg-2 hover:text-fg">what your stack buys</Link> and the{' '}
          <Link to="/tools/junk-silver" className="font-semibold text-fg-2 hover:text-fg">junk silver calculator</Link>.
        </p>
      </Card>

      <footer className="mt-8 border-t border-line pt-4 text-[12px] leading-relaxed text-fg-3">
        <p>
          Today's value uses live spot from TroyStack. Oil at ${OIL_TODAY} a barrel, rent at ${RENT.toLocaleString('en-US')} a month, labor at ${WAGE} an hour and gas at $
          {GAS.toFixed(2)} a gallon are round US figures. Scenarios are hypothetical, not predictions.
        </p>
        <p className="mt-1">Troy is an AI. Not financial advice.</p>
      </footer>
    </div>
  );
}
