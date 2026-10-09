import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Plus, Store } from 'lucide-react';
import { useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import { COIN_GROUPS, aOrAn, coinBySlug, inSentence, isBar, isCollectible, ounces, relatedCoins, type Coin } from '../lib/coins';
import { METAL_LABEL, OZT_PER_GRAM } from '../lib/metals';
import { money } from '../lib/format';
import { Card, ErrorNote, Field, Input, LinkButton, PageHeader } from '../ui/primitives';
import { AppStoreButton } from '../ui/AppStore';

const QUICK = [1, 10, 20, 100];

function troyQuestion(coin: Coin): string {
  const name = inSentence(coin);
  return isCollectible(coin)
    ? `Is ${aOrAn(name)} ${name} worth more than its melt value?`
    : `What's a fair price over spot for ${aOrAn(name)} ${name} right now?`;
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-fg-3">{label}</dt>
      <dd className="text-right text-fg tnum">{value}</dd>
    </div>
  );
}

export default function CoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const coin = coinBySlug(slug);
  usePageMeta(
    coin
      ? { title: coin.title, description: coin.description, canonical: `/coins/${coin.slug}` }
      : { title: "That coin isn't here", noindex: true },
  );
  const spot = useSpotMap();
  const [qty, setQty] = useState('1');

  if (!coin) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-[24px] font-semibold tracking-tight text-fg">That coin isn't here</h1>
        <p className="mt-2 text-[15px] text-fg-2">Every coin and bar TroyStack covers is on the coin values page, and the melt calculator works out anything else by weight and purity.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <LinkButton to="/coins">See all coins and bars</LinkButton>
          <LinkButton to="/tools/melt" variant="secondary">Melt value calculator</LinkButton>
        </div>
      </div>
    );
  }

  const group = COIN_GROUPS.find((g) => g.id === coin.group);
  const metal = METAL_LABEL[coin.metal];
  const perOz = spot.prices[coin.metal] || 0;
  const ready = perOz > 0;
  const pieces = Math.max(0, Math.floor(Number(qty.replace(/,/g, '')) || 0));
  const unit = isBar(coin) ? 'piece' : 'coin';
  const show = (value: number) => (ready ? money(value) : spot.isLoading ? '...' : 'Not available');

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8">
      <Link to="/coins" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-2 hover:text-fg">
        <ArrowLeft size={14} aria-hidden="true" /> Coin and bar values
      </Link>
      <PageHeader eyebrow={group?.label} title={coin.name} subtitle={`Each ${unit} holds ${ounces(coin.fineOzt)} troy oz of ${coin.metal}.${coin.years ? ` Struck ${coin.years}.` : ''}`} />

      {!ready && !spot.isLoading && (
        <div className="mb-4">
          <ErrorNote onRetry={() => spot.refetch()}>Live spot didn't load, so the values are missing for now.</ErrorNote>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <Card className="p-5">
          <div className="text-[13px] text-fg-3">Melt value of one {unit}</div>
          <div className="mt-1 text-[38px] font-semibold tracking-tight text-fg tnum" data-testid="coin-melt">
            {show(coin.fineOzt * perOz)}
          </div>
          <p className="text-[13px] text-fg-3">
            {metal} spot is {show(perOz)} an ounce, updated live.
          </p>

          <div className="mt-5 border-t border-line pt-4">
            <Field label="How many" htmlFor="coin-qty">
              <Input id="coin-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9,]/g, ''))} />
            </Field>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
              {QUICK.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQty(String(n))}
                  aria-pressed={pieces === n}
                  className={
                    pieces === n
                      ? 'h-8 rounded-lg border border-gold bg-gold-soft px-3 text-[13px] font-semibold text-fg'
                      : 'h-8 rounded-lg border border-line px-3 text-[13px] font-semibold text-fg-2 hover:bg-surface-2 hover:text-fg'
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <span className="text-[14px] text-fg-2">
                {pieces.toLocaleString('en-US')} {pieces === 1 ? unit : `${unit}s`}, {ounces(coin.fineOzt * pieces)} oz of {coin.metal}
              </span>
              <span className="text-[20px] font-semibold text-fg tnum" data-testid="coin-total">
                {show(coin.fineOzt * pieces * perOz)}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-fg">Specifications</h2>
          <dl className="mt-2 divide-y divide-line text-[14px]">
            <Spec label={`${metal} content`} value={`${ounces(coin.fineOzt)} oz, ${+(coin.fineOzt / OZT_PER_GRAM).toFixed(2)} g`} />
            <Spec label="Purity" value={coin.purity} />
            {coin.grossGrams != null && <Spec label="Total weight" value={`${coin.grossGrams.toLocaleString('en-US', { maximumFractionDigits: 4 })} g`} />}
            {coin.face && <Spec label="Face value" value={coin.face} />}
            {coin.mint && <Spec label="Issued by" value={coin.mint} />}
            {coin.years && <Spec label="Years" value={coin.years} />}
          </dl>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="text-[15px] font-semibold text-fg">What to know</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{coin.about}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
          {isCollectible(coin)
            ? "Melt is the floor for coins like this. Worn common dates trade near it, but key dates, scarce mint marks and coins in high grades are worth more than their metal, so look yours up in a price guide or show it to a coin dealer before you sell."
            : "Dealers sell above melt and buy back near it. The gap is the premium, and it's smaller on bars and common coins than on small sizes and special issues. Compare a few dealers, and check what they pay as well as what they charge."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton to={`/troy?q=${encodeURIComponent(troyQuestion(coin))}`} variant="secondary" size="sm">
            <MessageCircle size={14} aria-hidden="true" /> Ask Troy about it
          </LinkButton>
          <LinkButton to="/dealers" variant="secondary" size="sm">
            <Store size={14} aria-hidden="true" /> Where to buy
          </LinkButton>
        </div>
      </Card>

      <Card className="mt-4 p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Track what you own</h2>
          <p className="mt-1 text-[14px] text-fg-2">Add yours to a stack and it's valued at live spot every time you look, here and in the iPhone app. Free, no account needed to start.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <LinkButton to={`/stack?add=1&coin=${coin.slug}`}>
            <Plus size={15} aria-hidden="true" /> Add to my stack
          </LinkButton>
          <AppStoreButton campaign="webapp-coins" variant="dark" label="Get the app" />
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-fg">More {coin.metal}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {relatedCoins(coin).map((c) => (
            <Link
              key={c.slug}
              to={`/coins/${c.slug}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-line-strong hover:bg-surface-2"
            >
              <span className="min-w-0 truncate text-[14px] font-medium text-fg">{c.name}</span>
              <span className="shrink-0 text-[14px] text-fg-2 tnum">{ready ? money(c.fineOzt * perOz) : ''}</span>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-fg-3">
          Something else? The <Link to="/tools/melt" className="font-semibold text-fg-2 hover:text-fg">melt value calculator</Link> works out any coin, round or bar by weight and purity.
        </p>
      </section>
    </div>
  );
}
