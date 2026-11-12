export type AuthErr = { code?: string; message: string; status?: number; name?: string };

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
  // Checked before the status, since Supabase sends this one as a 429 too.
  // GoTrue also sends this for its project-wide email cap and its resend guard,
  // so the words don't promise anything about this one address.
  if (err.code === 'over_email_send_rate_limit') return "We've sent a lot of emails just now. Wait a few minutes, then try again.";
  if (err.code === 'email_not_confirmed') return 'Confirm your email first. Tap the link we sent you, then sign in.';
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
  if (!err.status || err.status === 502 || err.status === 503 || err.status === 504) {
    return "Couldn't reach TroyStack. Check your connection and try again in a minute.";
  }
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
    return 'Something went wrong on our side. Try again in a minute.';
  }
  return err.message;
}
