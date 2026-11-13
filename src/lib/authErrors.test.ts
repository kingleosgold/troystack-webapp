import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_THREW, LEAKED_PASSWORD, authThrew, authTrouble, isWeakPassword } from './authErrors';

const OUTAGE = "Couldn't reach TroyStack. Check your connection and try again in a minute.";
const OURS = 'Something went wrong on our side. Try again later.';

describe('authTrouble', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads a dropped connection as a connection problem', () => {
    expect(authTrouble({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }, 'sign in')).toBe(OUTAGE);
    expect(authTrouble({ name: 'AuthRetryableFetchError', message: '{}', status: 503 }, 'sign in')).toBe(OUTAGE);
  });

  it('reads a reply that is not JSON as a fault on our side, asks for a minute and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(authTrouble({ name: 'AuthUnknownError', message: 'Unexpected token <' }, 'try again')).toBe('Something went wrong on our side. Try again in a minute.');
    expect(log).toHaveBeenCalledWith('Auth failed on the server', 'AuthUnknownError', undefined, undefined, 'Unexpected token <');
  });

  it('reads a JSON 500 as a fault on our side and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(authTrouble({ name: 'AuthApiError', message: 'Database error', status: 500, code: 'unexpected_failure' }, 'try again')).toBe(OURS);
    expect(log).toHaveBeenCalledWith('Auth failed on the server', 'AuthApiError', 500, 'unexpected_failure', 'Database error');
  });

  it('says a lost session means signing in again', () => {
    const out = "You've been signed out. Sign in again, then try again.";
    expect(authTrouble({ name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 }, 'try again')).toBe(out);
    expect(authTrouble({ message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400, code: 'refresh_token_not_found' }, 'try again')).toBe(out);
  });

  it('never shows "{}" or nothing for a 4xx with no message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = 'Something went wrong on our side. Try again in a minute.';
    expect(authTrouble({ message: '{}', status: 400 }, 'try again')).toBe(out);
    expect(authTrouble({ message: '', status: 403 }, 'try again')).toBe(out);
  });

  it('keeps the email limit and rate limit words, with the right next step', () => {
    expect(authTrouble({ message: 'x', status: 429, code: 'over_email_send_rate_limit' }, 'sign in')).toMatch(/^We've sent a lot of emails/);
    expect(authTrouble({ message: 'x', status: 429 }, 'sign in')).toBe('Too many tries just now. Wait a minute, then sign in.');
    expect(authTrouble({ message: 'x', status: 429 }, 'try again')).toBe('Too many tries just now. Wait a minute, then try again.');
  });

  it("keeps Supabase's own words for a 4xx like a weak password", () => {
    expect(authTrouble({ message: 'Password should be at least 8 characters.', status: 422, code: 'weak_password' }, 'try again')).toBe(
      'Password should be at least 8 characters.',
    );
  });

  it('says a session that ran out means signing in again', () => {
    expect(authTrouble({ message: 'Session expired', status: 403, code: 'session_expired' }, 'try again')).toBe(
      "You've been signed out. Sign in again, then try again.",
    );
  });

  it('asks for a fresh sign-in when Supabase wants one before a password change', () => {
    const out = 'Sign out and back in, then change your password.';
    expect(authTrouble({ message: 'Password update requires reauthentication.', status: 400, code: 'reauthentication_needed' }, 'try again')).toBe(out);
  });

  it('says plainly when the new email is taken', () => {
    expect(authTrouble({ message: 'A user with this email address has already been registered', status: 422, code: 'email_exists' }, 'try again')).toBe(
      'Another account already uses that email.',
    );
  });

  it('reads a 401 with no code as our fault and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(authTrouble({ name: 'AuthApiError', message: 'Invalid API key', status: 401 }, 'sign in')).toBe(OURS);
    expect(log).toHaveBeenCalledWith('Auth failed on the server', 'AuthApiError', 401, undefined, 'Invalid API key');
  });

  it('leaves a 401 that Supabase Auth coded to its own words', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(authTrouble({ name: 'AuthApiError', message: 'This endpoint requires a Bearer token', status: 401, code: 'no_authorization' }, 'try again')).toBe(
      'This endpoint requires a Bearer token',
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('says one fault line for a throw and logs what threw', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new TypeError('x is undefined');
    expect(authThrew(boom)).toBe(AUTH_THREW);
    expect(AUTH_THREW).toBe('Something went wrong on our side. Try again in a minute.');
    expect(log).toHaveBeenCalledWith('Auth call threw', boom);
  });
});

describe('weak passwords', () => {
  const leaked = {
    name: 'AuthWeakPasswordError',
    code: 'weak_password',
    status: 422,
    message: 'Password is known to be weak and easy to guess, please choose a different one.',
    reasons: ['pwned'],
  };

  it('says a leaked password is leaked, in plain words', () => {
    expect(authTrouble(leaked, 'try again')).toBe(LEAKED_PASSWORD);
    expect(authTrouble({ ...leaked, reasons: undefined }, 'try again')).toBe(LEAKED_PASSWORD);
  });

  it("keeps Supabase's words for a short password, which already say what to fix", () => {
    const short = { name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, message: 'Password should be at least 8 characters.', reasons: ['length'] };
    expect(authTrouble(short, 'try again')).toBe('Password should be at least 8 characters.');
  });

  it('knows a weak password by its code or its name', () => {
    expect(isWeakPassword(leaked)).toBe(true);
    expect(isWeakPassword({ code: 'weak_password', message: 'x' })).toBe(true);
    expect(isWeakPassword({ name: 'AuthWeakPasswordError', message: 'x' })).toBe(true);
    expect(isWeakPassword({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(false);
  });

  it('never calls a leak anything but weak_password', () => {
    expect(authTrouble({ code: 'validation_failed', status: 422, message: 'Password is known to be weak and easy to guess, please choose a different one.' }, 'try again')).not.toBe(LEAKED_PASSWORD);
  });
});
