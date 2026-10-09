import { ExternalLink } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { postJson } from '../lib/apiClient';
import { Card, PageHeader } from '../ui/primitives';

interface Dealer {
  name: string;
  blurb: string;
  homepage: string;
  links: Array<{ label: string; url: string; metal?: 'gold' | 'silver' }>;
}

/** The same affiliate links the iPhone app's Compare Dealers screen uses. */
const DEALERS: Dealer[] = [
  {
    name: 'APMEX',
    blurb: 'One of the largest online bullion dealers, with a deep catalog of coins, rounds and bars.',
    homepage: 'https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1099573&trid=1546671.246173&foc=16&fot=9999&fos=6',
    links: [
      { label: 'Silver Eagles', metal: 'silver', url: 'https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055589&trid=1546671.246173&foc=16&fot=9999&fos=6' },
      { label: 'Gold Eagles', metal: 'gold', url: 'https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055590&trid=1546671.246173&foc=16&fot=9999&fos=6' },
      { label: 'Best sellers', url: 'https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055574&trid=1546671.246173&foc=16&fot=9999&fos=6' },
    ],
  },
  {
    name: 'SD Bullion',
    blurb: 'Known for low premiums on common bullion, with regular deals on silver.',
    homepage: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com',
    links: [
      { label: 'Silver Eagles', metal: 'silver', url: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fsilver%2Fus-mint-american-silver-eagle-coins%2Fsilver-american-eagles-1-ounce' },
      { label: 'Gold Eagles', metal: 'gold', url: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fgold%2Famerican-gold-eagle-coins' },
      { label: 'Gold coins', metal: 'gold', url: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fgold%2Fgold-coins' },
      { label: 'Deals', url: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fdeals' },
    ],
  },
];

const CHECKS = [
  { title: 'The premium per ounce', body: 'Compare what you pay over spot, per ounce, not the sticker price. Silver premiums vary a lot more than gold.' },
  { title: 'How you pay', body: 'Most dealers charge a few percent more for a card than for a bank wire, ACH or check.' },
  { title: 'Shipping', body: 'Free shipping usually starts at an order minimum. Under it, shipping can wipe out a low premium.' },
  { title: 'Selling back', body: 'Check what the dealer pays to buy it back. A local coin shop is often the easiest place to sell.' },
];

function logClick(dealer: string, product: string, metal?: string) {
  postJson('/v1/dealer-prices/click', { dealer, product_name: product, metal: metal ?? null }).catch(() => undefined);
}

export default function Dealers() {
  usePageMeta({ ...SEO['/dealers'], canonical: '/dealers' });
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader eyebrow="Where to buy" title="Buying gold and silver online" subtitle="Dealers TroyStack links to, and what to compare before you order." />
      <div className="grid gap-4 sm:grid-cols-2">
        {DEALERS.map((d) => (
          <Card key={d.name} className="p-5 flex flex-col">
            <h2 className="text-[17px] font-semibold text-fg">{d.name}</h2>
            <p className="mt-1 text-[14px] text-fg-2 flex-1">{d.blurb}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {d.links.map((l) => (
                <a
                  key={l.label}
                  href={l.url}
                  target="_blank"
                  rel="noopener sponsored"
                  onClick={() => logClick(d.name, l.label, l.metal)}
                  className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[13px] font-medium text-fg-2 hover:border-gold hover:text-gold"
                >
                  {l.label}
                </a>
              ))}
            </div>
            <a
              href={d.homepage}
              target="_blank"
              rel="noopener sponsored"
              onClick={() => logClick(d.name, 'Homepage')}
              className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover"
            >
              Visit {d.name}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-fg-3">These are affiliate links. TroyStack may earn a commission when you buy, at no extra cost to you.</p>

      <section className="mt-8" aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="text-[15px] font-semibold text-fg mb-3">Before you order</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHECKS.map((c) => (
            <Card key={c.title} className="p-5">
              <h3 className="text-[14px] font-semibold text-fg">{c.title}</h3>
              <p className="mt-1 text-[14px] text-fg-2">{c.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
