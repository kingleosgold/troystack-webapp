import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPasswordNote,
  dropPasswordNoteEverywhere,
  listenForPasswordNoteDrops,
  onPasswordNoteChange,
  passwordNoteFor,
  rememberPasswordNote,
} from './passwordNote';

describe('the note about a password the sign-up form turned away', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('belongs to the account that signed in, and no other', () => {
    rememberPasswordNote('user-a', 'leaked');
    expect(passwordNoteFor('user-a')).toBe('leaked');
    expect(passwordNoteFor('user-b')).toBeNull();
    expect(passwordNoteFor(null)).toBeNull();
    expect(passwordNoteFor(undefined)).toBeNull();
  });

  it('keeps which kind it is', () => {
    rememberPasswordNote('user-a', 'weak');
    expect(passwordNoteFor('user-a')).toBe('weak');
  });

  it('goes when cleared', () => {
    rememberPasswordNote('user-a', 'leaked');
    clearPasswordNote();
    expect(passwordNoteFor('user-a')).toBeNull();
  });

  it('tells the page when it is kept or dropped', () => {
    const seen = vi.fn();
    const stop = onPasswordNoteChange(seen);
    rememberPasswordNote('user-a', 'leaked');
    clearPasswordNote();
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
    rememberPasswordNote('user-a', 'leaked');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('keeps nothing for a missing account', () => {
    rememberPasswordNote('', 'leaked');
    expect(store.size).toBe(0);
  });

  it('reads nothing from a value it does not know', () => {
    store.set('ts_password_note', 'not json');
    expect(passwordNoteFor('user-a')).toBeNull();
    store.set('ts_password_note', JSON.stringify({ userId: 'user-a', kind: 'other' }));
    expect(passwordNoteFor('user-a')).toBeNull();
    store.set('ts_password_note', 'null');
    expect(passwordNoteFor('user-a')).toBeNull();
  });

  it('shows nothing and throws nothing when storage is blocked', () => {
    const blocked = () => {
      throw new Error('storage blocked');
    };
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(() => rememberPasswordNote('user-a', 'leaked')).not.toThrow();
    expect(passwordNoteFor('user-a')).toBeNull();
    expect(() => clearPasswordNote()).not.toThrow();
  });

  describe('across tabs', () => {
    // A stand-in for BroadcastChannel that hands each message to every other
    // open channel of the same name, as browsers do between tabs.
    let open: Set<{ name: string; onmessage: ((e: MessageEvent) => void) | null }>;
    beforeEach(() => {
      open = new Set();
      class FakeChannel {
        onmessage: ((e: MessageEvent) => void) | null = null;
        name: string;
        constructor(name: string) {
          this.name = name;
          open.add(this);
        }
        postMessage(data: unknown) {
          for (const ch of open) if (ch !== this && ch.name === this.name) ch.onmessage?.({ data } as MessageEvent);
        }
        close() {
          open.delete(this);
        }
      }
      vi.stubGlobal('BroadcastChannel', FakeChannel);
    });

    it('drops the note in another tab for the same account', () => {
      const stop = listenForPasswordNoteDrops();
      rememberPasswordNote('user-a', 'leaked');
      const ch = new BroadcastChannel('ts-password-note');
      ch.postMessage({ drop: 'user-a' });
      ch.close();
      expect(passwordNoteFor('user-a')).toBeNull();
      stop();
    });

    it('keeps another account\'s note', () => {
      const stop = listenForPasswordNoteDrops();
      rememberPasswordNote('user-b', 'leaked');
      dropPasswordNoteEverywhere('user-a');
      // The local clear drops it here, as Sign out in this tab should.
      expect(passwordNoteFor('user-b')).toBeNull();
      rememberPasswordNote('user-b', 'leaked');
      const ch = new BroadcastChannel('ts-password-note');
      ch.postMessage({ drop: 'user-a' });
      ch.postMessage({ drop: 42 });
      ch.postMessage(null);
      ch.close();
      expect(passwordNoteFor('user-b')).toBe('leaked');
      stop();
    });

    it('closes its channel once sent and stops listening when asked', () => {
      const stop = listenForPasswordNoteDrops();
      expect(open.size).toBe(1);
      dropPasswordNoteEverywhere('user-a');
      expect(open.size).toBe(1);
      stop();
      expect(open.size).toBe(0);
    });

    it('still drops the note here without BroadcastChannel', () => {
      vi.stubGlobal('BroadcastChannel', undefined);
      rememberPasswordNote('user-a', 'leaked');
      expect(() => dropPasswordNoteEverywhere('user-a')).not.toThrow();
      expect(passwordNoteFor('user-a')).toBeNull();
      expect(listenForPasswordNoteDrops()).toBeTypeOf('function');
    });
  });
});
