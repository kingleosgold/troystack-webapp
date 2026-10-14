import { afterEach, describe, expect, it, vi } from 'vitest';

// A fresh copy each time, so an acceptance from one test doesn't carry over.
async function consent() {
  vi.resetModules();
  return import('./consent');
}

describe('the notice before the first question to Troy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still shows when storage is blocked, until it is accepted in this tab', async () => {
    const blocked = () => {
      throw new Error('storage blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    const { hasTroyConsent, saveTroyConsent } = await consent();
    expect(hasTroyConsent()).toBe(false);
    saveTroyConsent();
    expect(hasTroyConsent()).toBe(true);
  });

  it('is remembered on the next visit when storage works', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    const first = await consent();
    expect(first.hasTroyConsent()).toBe(false);
    first.saveTroyConsent();
    const next = await consent();
    expect(next.hasTroyConsent()).toBe(true);
  });
});
