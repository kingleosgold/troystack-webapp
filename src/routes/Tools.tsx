import { Link } from 'react-router-dom';
import { Calculator, Coins, LineChart, Scale, Store, TrendingUp, Warehouse } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { PageHeader } from '../ui/primitives';

const TOOLS = [
  { to: '/tools/melt', title: 'Melt value calculator', body: 'What a coin, round or bar is worth in metal at live spot, from Eagles and Krugerrands to pre-1933 gold.', icon: <Coins size={20} /> },
  { to: '/tools/junk-silver', title: 'Junk silver calculator', body: 'Pre-1965 dimes, quarters and halves, war nickels and Morgan dollars, by the coin or by face value.', icon: <Scale size={20} /> },
  { to: '/tools/what-if', title: 'What if', body: 'Pick prices for each metal and see what your stack, or any amount of metal, would be worth.', icon: <TrendingUp size={20} /> },
  { to: '/tools/stacking-history', title: 'Stacking history', body: 'Put a set amount into gold or silver every month from any year since 1970 and see where it stands today.', icon: <LineChart size={20} /> },
  { to: '/tools/ratio', title: 'Gold/silver ratio', body: 'How many ounces of silver one ounce of gold buys, and where that sits against the record.', icon: <Calculator size={20} /> },
  { to: '/vault', title: 'Vault Watch', body: 'COMEX registered and eligible stocks for all four metals, updated every trading day.', icon: <Warehouse size={20} /> },
  { to: '/dealers', title: 'Where to buy', body: 'Dealers TroyStack links to, and what to check before you order.', icon: <Store size={20} /> },
];

export default function Tools() {
  usePageMeta({ ...SEO['/tools'], canonical: '/tools' });
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 sm:pt-8">
      <PageHeader eyebrow="Tools" title="Calculators for stackers" subtitle="Free, live at spot, and no account needed." />
      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="group flex gap-4 rounded-2xl border border-line bg-surface p-5 hover:border-line-strong hover:bg-surface-2 transition-colors">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold" aria-hidden="true">{t.icon}</span>
            <span>
              <span className="block text-[15px] font-semibold text-fg group-hover:text-gold transition-colors">{t.title}</span>
              <span className="block text-[13px] text-fg-2 mt-1">{t.body}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
