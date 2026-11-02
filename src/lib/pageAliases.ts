/**
 * Addresses people type looking for the plans or the app. Each one lands on
 * the page that answers it, keeping every query value, so a campaign token
 * still reaches /gold. vercel.json carries the same list as redirects, and a
 * test keeps the two in step.
 */
export const PAGE_ALIASES: ReadonlyArray<{ path: string; to: '/gold' | '/app' }> = [
  { path: '/pricing', to: '/gold' },
  { path: '/plans', to: '/gold' },
  { path: '/premium', to: '/gold' },
  { path: '/upgrade', to: '/gold' },
  { path: '/subscribe', to: '/gold' },
  { path: '/download', to: '/app' },
];

/** The alias's page with the visitor's query kept as it came. */
export function pageAliasTarget(to: string, search: string): string {
  return search && search !== '?' ? `${to}${search.startsWith('?') ? search : `?${search}`}` : to;
}
