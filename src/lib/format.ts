const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** $1,234.56 */
export function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '$0.00';
  return usd2.format(value);
}

/** $1,235 */
export function money0(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '$0';
  return usd0.format(value);
}

/** $1.2K, $3.45M, or full dollars under $10K */
export function moneyCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return usd0.format(value);
}

/** +$12.34 or -$12.34 */
export function signedMoney(value: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  const s = usd2.format(Math.abs(value));
  if (value > 0) return `+${s}`;
  if (value < 0) return `-${s}`;
  return s;
}

/** +1.23% */
export function signedPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0.00%';
  const fixed = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${fixed}%`;
  if (value < 0) return `-${fixed}%`;
  return `${fixed}%`;
}

/** 1,234.5 with up to `digits` decimals */
export function num(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** Troy ounces, 3 decimals under 100 oz, 1 above */
export function oz(value: number): string {
  if (!Number.isFinite(value)) return '0 oz';
  const digits = Math.abs(value) >= 100 ? 1 : 3;
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits })} oz`;
}

/** 15.07M oz style for big vault numbers */
export function ozCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M oz`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K oz`;
  return `${Math.round(value).toLocaleString('en-US')} oz`;
}

export function changeTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value == null || !Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}
