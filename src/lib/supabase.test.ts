import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { authStorageKey } from './supabase';

describe('authStorageKey', () => {
  it("is the key supabase-js itself stores this project's session under", () => {
    for (const url of ['https://abcdefghijklmnop.supabase.co', 'https://e2e.supabase.co', 'http://localhost:54321']) {
      const client = createClient(url, 'anon-key', { auth: { persistSession: false } });
      expect(authStorageKey(url)).toBe((client as unknown as { storageKey: string }).storageKey);
    }
  });

  it("is nothing without a project URL, or with one that doesn't parse", () => {
    expect(authStorageKey('')).toBeUndefined();
    expect(authStorageKey('not a url')).toBeUndefined();
  });
});
