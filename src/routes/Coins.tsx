import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSpotMap } from '../hooks/queries';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { COINS, COIN_GROUPS, coinsInGroup, ounces } from '../lib/coins';
import { money } from '../lib/format';
import { METALS } from '../lib/metals';
import { Card, EmptyState, Input, LinkButton, PageHeader } from '../ui/primitives';
import { AppStoreButton } from '../ui/AppStore';
import { SpotNotice } from '../ui/SpotNotice';

export default function Coins() {
  usePageMeta({ ...SEO['/coins'], canonical: '/coins' });
  const spot = useSpotMap();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return COIN_GROUPS.map((g) => ({
      ...g,
      coins: coinsInGroup(g.id).filter((c) => {
        const text = `${c.name} ${c.metal} ${c.mint ?? ''} ${c.years ?? ''}`.toLowerCase();
        return words.every((w) => text.includes(w));
      }),
    })).filter((g) => g.coins.length > 0);
  }, [query]);

  // A metal the feed leaves out, or prices too old to count as live, leave
  // those rows at No price, and the notice says which and offers to try again.
  const shownMetals = METALS.filter((m) => groups.some((g) => g.metal === m));

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader
        eyebrow="Tools"
        title="Coin and bar values"
        subtitle={`What the metal in ${COINS.length} popular coins and bars is worth at live spot. Open one for its weight, purity and what to know before you buy or sell.`}
      />

      <div className="relative max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a coin or bar"
          aria-label="Find a coin or bar"
          className="pl-9"
        />
      </div>

      <SpotNotice spot={spot} metals={shownMetals} className="mt-4" />

      {groups.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing by that name"
            body="Try fewer words, or work out any piece by its weight and purity."
            action={<LinkButton to="/tools/melt">Melt value calculator</LinkButton>}
          />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id} className="overflow-hidden">
              <h2 className="px-5 pt-4 pb-2 text-[15px] font-semibold text-fg">{g.label}</h2>
              <ul className="divide-y divide-line border-t border-line">
                {g.coins.map((c) => (
                  <li key={c.slug}>
                    <Link to={`/coins/${c.slug}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-fg">{c.name}</span>
                        <span className="block text-[12px] text-fg-3">
                          {ounces(c.fineOzt)} oz {c.metal}, {c.purity}
                        </span>
                      </span>
                      {spot.priced(c.metal) ? (
                        <span className="shrink-0 text-[14px] font-semibold text-fg tnum">{money(c.fineOzt * spot.prices[c.metal])}</span>
                      ) : (
                        <span className="shrink-0 text-[13px] text-fg-3">{spot.isLoading ? '...' : 'No price'}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-4 p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Own some of these?</h2>
          <p className="mt-1 text-[14px] text-fg-2">Add them to a stack and see the whole thing at live spot, here and in the iPhone app. In the app you can snap a dealer receipt and Troy adds every line.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <LinkButton to="/stack?add=1">Add to my stack</LinkButton>
          <AppStoreButton campaign="webapp-coins" variant="dark" label="Get the app" />
        </div>
      </Card>
    </div>
  );
}
