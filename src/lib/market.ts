/**
 * Metals trade nearly around the clock from Sunday 6 PM to Friday 5 PM
 * New York time. The app treats the weekend gap as closed, and so does the
 * site, so the two always agree on "Markets closed".
 */
export function marketsClosedET(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  if (weekday === 'Sat') return true;
  if (weekday === 'Sun' && hour < 18) return true;
  if (weekday === 'Fri' && hour >= 17) return true;
  return false;
}
