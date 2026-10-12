import { beforeEach, describe, expect, it, vi } from 'vitest';

// The module keeps the account for the whole page, so each case loads it fresh.
async function fresh() {
  vi.resetModules();
  return import('./account');
}

describe('the account signed in', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('is nobody until sign-in has loaded, and something picked before then waits for the account it finds', async () => {
    const a = await fresh();
    let found: string | null | undefined;
    void a.signedInOnceLoaded().then((id) => {
      found = id;
    });
    await Promise.resolve();
    expect(found).toBeUndefined();
    a.setSignedInAs('account-a');
    await Promise.resolve();
    expect(found).toBe('account-a');
    expect(a.stillSignedInAs('account-a')).toBe(true);
  });

  it('once loaded, answers with whoever is signed in now', async () => {
    const a = await fresh();
    a.setSignedInAs(null);
    a.setSignedInAs('account-b');
    await expect(a.signedInOnceLoaded()).resolves.toBe('account-b');
    expect(a.signedInAs()).toBe('account-b');
    expect(a.stillSignedInAs(null)).toBe(false);
  });
});
