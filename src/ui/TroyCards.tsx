import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { TroyPreview } from '../services/troy';
import { money, money0, num, signedMoney } from '../lib/format';

/** The data card Troy's reply can carry, matching the app's inline cards. */

function n(value: unknown): number {
  const v = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(v) ? v : 0;
}

interface HoldingLine {
  metal?: string;
  type?: string;
  qty?: number | string;
  totalOz?: number | string;
  totalCost?: number | string;
  currentValue?: number | string;
  gainLoss?: number | string;
  gainLossPct?: number | string;
}

function Frame({ title, children, link }: { title: string; children: React.ReactNode; link?: { to: string; label: string } }) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{title}</span>
        {link && (
          <Link to={link.to} className="text-[12px] font-semibold text-gold hover:text-gold-2">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function Gain({ value, pct }: { value: number; pct?: number }) {
  const cls = value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-fg-3';
  return (
    <span className={`tnum font-semibold ${cls}`}>
      {signedMoney(value)}
      {pct != null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}
    </span>
  );
}

function PortfolioCard({ data }: { data: Record<string, unknown> }) {
  const holdings = (Array.isArray(data.holdings) ? data.holdings : []) as HoldingLine[];
  const total = n(data.totalValue);
  const gain = n(data.totalGain);
  const pct = n(data.totalGainPercent);
  const top = [...holdings].sort((a, b) => n(b.currentValue) - n(a.currentValue)).slice(0, 3);
  return (
    <Frame title="Your stack" link={{ to: '/stack', label: 'Open' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[20px] font-semibold text-fg tnum">{money(total)}</span>
        <Gain value={gain} pct={pct} />
      </div>
      {top.length > 0 && (
        <ul className="mt-2 space-y-1">
          {top.map((h, i) => (
            <li key={i} className="flex justify-between gap-3 text-[13px]">
              <span className="text-fg-2 truncate">{h.type || h.metal}</span>
              <span className="text-fg tnum">{money(n(h.currentValue))}</span>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function CostBasisCard({ data }: { data: Record<string, unknown> }) {
  const holdings = (Array.isArray(data.holdings) ? data.holdings : []) as HoldingLine[];
  const byMetal = new Map<string, { cost: number; value: number; oz: number }>();
  for (const h of holdings) {
    const m = h.metal || 'other';
    const row = byMetal.get(m) ?? { cost: 0, value: 0, oz: 0 };
    row.cost += n(h.totalCost);
    row.value += n(h.currentValue);
    row.oz += n(h.totalOz);
    byMetal.set(m, row);
  }
  return (
    <Frame title="Cost basis" link={{ to: '/stack', label: 'Open' }}>
      <ul className="space-y-1.5">
        {[...byMetal.entries()].map(([metal, r]) => (
          <li key={metal} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="capitalize text-fg-2">
              {metal} <span className="text-fg-3">· {num(r.oz, 2)} oz</span>
            </span>
            <span className="text-right">
              <span className="text-fg-3 tnum">{money0(r.cost)} in, </span>
              <Gain value={r.value - r.cost} />
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function RatioCard({ data }: { data: Record<string, unknown> }) {
  const ratio = n(data.ratio);
  if (!ratio) return null;
  return (
    <Frame title="Gold to silver" link={{ to: '/tools/ratio', label: 'History' }}>
      <div className="text-[20px] font-semibold text-fg tnum">{ratio.toFixed(1)} to 1</div>
      <p className="text-[12px] text-fg-3 mt-1">Ounces of silver one ounce of gold buys at spot.</p>
    </Frame>
  );
}

function SpotCard({ data }: { data: Record<string, unknown> }) {
  return (
    <Frame title="Spot" link={{ to: '/prices', label: 'Charts' }}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[12px] text-fg-3">Gold</div>
          <div className="text-[17px] font-semibold text-fg tnum">{money(n(data.goldPrice))}</div>
        </div>
        <div>
          <div className="text-[12px] text-fg-3">Silver</div>
          <div className="text-[17px] font-semibold text-fg tnum">{money(n(data.silverPrice))}</div>
        </div>
      </div>
    </Frame>
  );
}

function PurchasingPowerCard({ data }: { data: Record<string, unknown> }) {
  const rows = [
    { label: 'Barrels of oil', value: n(data.stackBarrelsOfOil) },
    { label: 'Months of rent', value: n(data.stackMonthsOfRent) },
    { label: 'Hours of labor', value: n(data.stackHoursOfLabor) },
  ].filter((r) => r.value > 0);
  if (rows.length === 0) return null;
  return (
    <Frame title="What your stack buys">
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="text-[17px] font-semibold text-fg tnum">{num(r.value, 1)}</div>
            <div className="text-[11px] text-fg-3">{r.label}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function DealerCard({ data }: { data: Record<string, unknown> }) {
  const url = typeof data.url === 'string' ? data.url : '';
  const label = typeof data.label === 'string' ? data.label : 'Shop this';
  if (!/^https:\/\//.test(url)) return null;
  return (
    <Frame title="Where to buy">
      <a href={url} target="_blank" rel="noopener sponsored" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-btn text-btn-fg text-[13px] font-semibold hover:bg-btn-hover">
        {label}
        <ExternalLink size={13} aria-hidden="true" />
      </a>
      <p className="text-[11px] text-fg-3 mt-2">An affiliate link. TroyStack may earn a commission at no cost to you.</p>
    </Frame>
  );
}

export function TroyCard({ preview }: { preview: TroyPreview }) {
  const data = (preview.data ?? {}) as Record<string, unknown>;
  switch (preview.type) {
    case 'portfolio':
      return <PortfolioCard data={data} />;
    case 'cost_basis':
      return <CostBasisCard data={data} />;
    case 'chart':
      return preview.chartType === 'ratio' ? <RatioCard data={data} /> : <SpotCard data={data} />;
    case 'purchasing_power':
      return <PurchasingPowerCard data={data} />;
    case 'dealer_link':
      return <DealerCard data={data} />;
    default:
      return null;
  }
}
