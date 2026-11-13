import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPasswordNote, onPasswordNoteChange, passwordNoteFor, rememberPasswordNote } from './passwordNote';

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
});
