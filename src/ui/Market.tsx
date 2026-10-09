import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { Metal } from '../types/holding';
import { METAL_LABEL, METAL_SYMBOL, METAL_VAR } from '../lib/metals';
import { changeTone, money, signedMoney, signedPercent } from '../lib/format';
import { cx } from '../lib/cx';
import { Skeleton } from './primitives';

/** A small line with a soft fill, drawn in SVG so it costs nothing to render. */
export function Sparkline({ values, color, className, height = 40 }: { values: number[]; color: string; className?: string; height?: number }) {
  const gid = useId();
  const shape = useMemo(() => {
    const pts = values.filter((v) => Number.isFinite(v) && v > 0);
    if (pts.length < 2) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || max * 0.001 || 1;
    const w = 100;
    const h = height;
    const step = w / (pts.length - 1);
    const coords = pts.map((v, i) => [i * step, h - 2 - ((v - min) / span) * (h - 4)] as const);
    const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const area = `${line} L${w} ${h} L0 ${h} Z`;
    return { line, area, w, h };
  }, [values, height]);

  if (!shape) return <div className={cx('w-full', className)} style={{ height }} aria-hidden="true" />;
  return (
    <svg viewBox={`0 0 ${shape.w} ${shape.h}`} preserveAspectRatio="none" className={cx('w-full overflow-visible', className)} style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={shape.area} fill={`url(#${gid})`} />
      <path d={shape.line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ChangeBadge({ pct, amount, size = 'md', showIcon = true }: { pct: number; amount?: number; size?: 'sm' | 'md'; showIcon?: boolean }) {
  const tone = changeTone(pct);
  const Icon = tone === 'up' ? ArrowUpRight : tone === 'down' ? ArrowDownRight : Minus;
  const colors = { up: 'text-up', down: 'text-down', flat: 'text-fg-3' };
  return (
    <span className={cx('inline-flex items-center gap-1 font-semibold tnum', colors[tone], size === 'sm' ? 'text-[12px]' : 'text-[13px]')}>
      {showIcon && <Icon size={size === 'sm' ? 13 : 15} aria-hidden="true" />}
      {amount != null && <span>{signedMoney(amount)}</span>}
      <span>{amount != null ? `(${signedPercent(pct)})` : signedPercent(pct)}</span>
    </span>
  );
}

interface MetalTileProps {
  metal: Metal;
  price?: number;
  pct?: number;
  amount?: number;
  spark?: number[];
  loading?: boolean;
  to?: string;
}

/** One metal's spot, move and 24-hour line. */
export function MetalTile({ metal, price, pct = 0, amount, spark = [], loading, to }: MetalTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: METAL_VAR[metal] }} aria-hidden="true" />
        <span className="text-[13px] font-semibold text-fg">{METAL_LABEL[metal]}</span>
        <span className="hidden text-[11px] font-medium text-fg-3 sm:inline">{METAL_SYMBOL[metal]}</span>
        {!loading && (
          <span className="ml-auto hidden sm:inline-flex">
            <ChangeBadge pct={pct} size="sm" />
          </span>
        )}
      </div>
      {loading || price == null ? (
        <Skeleton className="h-7 w-28 mt-2" />
      ) : (
        <div className="mt-1.5 text-[21px] sm:text-[24px] font-semibold tracking-tight text-fg tnum">{money(price)}</div>
      )}
      <div className="mt-0.5 h-4 text-[12px] text-fg-3 tnum">
        {!loading && amount != null && <span className="hidden sm:inline">{`${signedMoney(amount)} today`}</span>}
        {!loading && (
          <span className="sm:hidden">
            <ChangeBadge pct={pct} amount={amount} size="sm" showIcon={false} />
          </span>
        )}
      </div>
      <Sparkline values={spark} color={METAL_VAR[metal]} className="mt-2" height={36} />
    </>
  );
  const cls = 'block rounded-2xl border border-line bg-surface p-4 transition-colors';
  if (to) {
    return (
      <Link to={to} className={cx(cls, 'hover:border-line-strong hover:bg-surface-2')} aria-label={`${METAL_LABEL[metal]} price${price ? `, ${money(price)}` : ''}`}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function MarketStatus({ closed, className }: { closed: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[12px] font-medium', closed ? 'text-fg-3' : 'text-up', className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', closed ? 'bg-fg-3' : 'bg-up animate-pulse-dot')} aria-hidden="true" />
      {closed ? 'Markets closed' : 'Markets open'}
    </span>
  );
}
