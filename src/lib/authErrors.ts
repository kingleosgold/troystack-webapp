export type AuthErr = { code?: string; message: string; status?: number; name?: string; reasons?: unknown };

/** What a form says when Supabase turns a password away because it shows up in leaked password lists. */
export const LEAKED_PASSWORD =
  "That password shows up in lists of leaked passwords, so it isn't safe to use. Pick a longer one you don't use anywhere else.";

/** Supabase turned the password away, whether for its length, its characters or a leak. */
export function isWeakPassword(err: AuthErr): boolean {
  return err.code === 'weak_password' || err.name === 'AuthWeakPasswordError';
}

/**
 * Supabase's leaked password check sends weak_password with the reason pwned and
 * the words "known to be weak and easy to guess". Those words read like a typo
 * in the password, so the form says what happened instead. A short password or
 * a missing kind of character keeps Supabase's words, which already say what to fix.
 */
export function isLeakedPassword(err: AuthErr): boolean {
  if (!isWeakPassword(err)) return false;
  if (Array.isArray(err.reasons) && err.reasons.includes('pwned')) return true;
  return /known to be weak|easy to guess|pwned|leaked/i.test(err.message ?? '');
}

/** The account is there and the password matched, but its email was never confirmed. Older GoTrue sends only the words. */
export function isUnconfirmed(err: AuthErr): boolean {
  return err.code === 'email_not_confirmed' || /email not confirmed/i.test(err.message ?? '');
}

/** What a form says when the auth call threw instead of answering. Matches the helper's own fault line. */
export const AUTH_THREW = 'Something went wrong on our side. Try again in a minute.';

/** Says AUTH_THREW and logs what threw, so a catch block never hides the reason. */
export function authThrew(e: unknown): string {
  console.error('Auth call threw', e);
  return AUTH_THREW;
}

/**
 * Plain words for an auth call that failed for a reason other than the
 * password. supabase-js reports an outage as "{}" and a dropped connection as
 * "Failed to fetch", both with no status. A 429 that comes back without CORS
 * headers looks the same, so that line holds for a rate limit too. A reply that
 * reached the page but isn't JSON (an HTML 500 page, or a plain text 429 from a
 * proxy) comes back as AuthUnknownError with no status. The page can't tell
 * which, so it says the fault is ours, asks for a minute and logs it.
 */
export function authTrouble(err: AuthErr, then: 'sign in' | 'try again'): string {
  if (isLeakedPassword(err)) return LEAKED_PASSWORD;
  // Checked before the status, since Supabase sends this one as a 429 too.
  // GoTrue also sends this for its project-wide email cap and its resend guard,
  // so the words don't promise anything about this one address.
  if (err.code === 'over_email_send_rate_limit') return "We've sent a lot of emails just now. Wait a few minutes, then try again.";
  if (isUnconfirmed(err)) return 'Confirm your email first. Tap the link we sent you, then sign in.';
  // Supabase asks for a fresh sign-in before a password change when the session is old.
  if (err.code === 'reauthentication_needed') return 'Sign out and back in, then change your password.';
  if (err.code === 'email_exists') return 'Another account already uses that email.';
  if (err.status === 429 || err.code === 'over_request_rate_limit') return `Too many tries just now. Wait a minute, then ${then}.`;
  if (err.name === 'AuthUnknownError') {
    console.error('Auth failed on the server', err.name, err.status, err.code, err.message);
    return 'Something went wrong on our side. Try again in a minute.';
  }
  if (err.status !== undefined && err.status >= 500 && ![502, 503, 504].includes(err.status)) {
    // A fault that won't clear on a retry, so keep the real reason where we can find it.
    console.error('Auth failed on the server', err.name, err.status, err.code, err.message);
    return 'Something went wrong on our side. Try again later.';
  }
  // A 401 with no code comes from the gateway in front of Supabase Auth, as with a bad or
  // rotated API key. Hosted Supabase Auth sends a code on its own 401s, and supabase-js turns
  // a lost session into a 400 AuthSessionMissingError, so neither lands here. An older
  // self-hosted Auth that leaves the code off would read as our fault, which we accept.
  if (err.status === 401 && !err.code) {
    console.error('Auth failed on the server', err.name, err.status, err.code, err.message);
    return 'Something went wrong on our side. Try again later.';
  }
  if (!err.status || err.status === 502 || err.status === 503 || err.status === 504) {
    return "Couldn't reach TroyStack. Check your connection and try again in a minute.";
  }
  // A fallback. Settings and the reset page usually see the sign-out first and show nothing,
  // since supabase-js drops the session before it hands back this error.
  if (
    err.name === 'AuthSessionMissingError' ||
    err.code === 'session_not_found' ||
    err.code === 'refresh_token_not_found' ||
    err.code === 'session_expired'
  ) {
    return "You've been signed out. Sign in again, then try again.";
  }
  // supabase-js turns a JSON body with no message into "{}", which reads as nothing.
  const words = err.message?.trim() ?? '';
  if (!words || words === '{}' || words === '""') {
    console.error('Auth failed with no message', err.name, err.status, err.code);
    return AUTH_THREW;
  }
  return err.message;
}
