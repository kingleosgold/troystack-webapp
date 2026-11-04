/**
 * Addresses people type to sign up or sign in. Each one lands on /auth with
 * the matching form open. vercel.json carries the same list as redirects, and
 * a test keeps the two in step.
 */
export const AUTH_ALIASES: ReadonlyArray<{ path: string; mode: 'signup' | 'signin' }> = [
  { path: '/signup', mode: 'signup' },
  { path: '/sign-up', mode: 'signup' },
  { path: '/register', mode: 'signup' },
  { path: '/login', mode: 'signin' },
  { path: '/log-in', mode: 'signin' },
  { path: '/signin', mode: 'signin' },
  { path: '/sign-in', mode: 'signin' },
];

/** /auth with the alias's form open, keeping every other query value. */
export function authAliasTarget(mode: 'signup' | 'signin', search: string): string {
  const params = new URLSearchParams(search);
  params.set('mode', mode);
  return `/auth?${params.toString()}`;
}
