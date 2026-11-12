import { afterEach, describe, expect, it, vi } from 'vitest';
import { authTrouble } from './authErrors';

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
});
