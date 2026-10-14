import { useId, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ChartPoint {
  /** Milliseconds since 1970 */
  t: number;
  v: number;
}

interface Props {
  data: ChartPoint[];
  color: string;
  height?: number;
  /** How to label the time axis and the tooltip */
  granularity: 'intraday' | 'daily' | 'monthly';
  formatValue?: (v: number) => string;
  /** A second series drawn as a dashed line, such as money put in */
  compare?: ChartPoint[];
  compareLabel?: string;
  valueLabel?: string;
}

const NY = 'America/New_York';

function axisLabel(t: number, granularity: Props['granularity'], spanDays: number): string {
  const d = new Date(t);
  if (granularity === 'intraday') return d.toLocaleTimeString('en-US', { timeZone: NY, hour: 'numeric' });
  if (spanDays > 800) return d.toLocaleDateString('en-US', { timeZone: NY, year: 'numeric' });
  if (spanDays > 120) return d.toLocaleDateString('en-US', { timeZone: NY, month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { timeZone: NY, month: 'short', day: 'numeric' });
}

function tooltipLabel(t: number, granularity: Props['granularity']): string {
  const d = new Date(t);
  if (granularity === 'intraday') {
    return d.toLocaleString('en-US', { timeZone: NY, weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET';
  }
  if (granularity === 'monthly') return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

const defaultFormat = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v >= 1000 ? 0 : 2 });

export default function PriceChart({ data, color, height = 260, granularity, formatValue = defaultFormat, compare, compareLabel, valueLabel }: Props) {
  const gid = useId().replace(/:/g, '');
  const merged = useMemo(() => {
    if (!compare?.length) return data.map((p) => ({ t: p.t, v: p.v }));
    const byT = new Map<number, number>(compare.map((p) => [p.t, p.v]));
    return data.map((p) => ({ t: p.t, v: p.v, c: byT.get(p.t) }));
  }, [data, compare]);

  const spanDays = data.length > 1 ? (data[data.length - 1].t - data[0].t) / 86400000 : 0;

  const [min, max] = useMemo(() => {
    const vals = merged.flatMap((p) => ('c' in p && p.c != null ? [p.v, p.c as number] : [p.v])).filter((v) => Number.isFinite(v));
    if (!vals.length) return [0, 1];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || hi * 0.01 || 1;
    return [Math.max(0, lo - pad), hi + pad];
  }, [merged]);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={merged} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => axisLabel(t, granularity, spanDays)}
            tick={{ fill: 'var(--fg-3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={36}
          />
          <YAxis
            domain={[min, max]}
            tickFormatter={(v: number) => formatValue(v)}
            tick={{ fill: 'var(--fg-3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={68}
            orientation="right"
          />
          <Tooltip
            cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line-strong)',
              borderRadius: 12,
              boxShadow: 'var(--shadow)',
              color: 'var(--fg)',
              fontSize: 13,
            }}
            labelStyle={{ color: 'var(--fg-3)', marginBottom: 4 }}
            labelFormatter={(t) => tooltipLabel(Number(t), granularity)}
            formatter={(value, name) => [formatValue(Number(value)), name === 'c' ? compareLabel ?? 'Compare' : valueLabel ?? 'Price']}
          />
          {compare?.length ? (
            <Area type="monotone" dataKey="c" stroke="var(--fg-3)" strokeWidth={1.5} strokeDasharray="4 4" fill="none" isAnimationActive={false} connectNulls />
          ) : null}
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#fill-${gid})`} isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: color, stroke: 'var(--surface)', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
