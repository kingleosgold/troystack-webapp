import { describe, expect, it, vi } from 'vitest';
import { clearStackCopies, copyShownSince, markCopyShown, readStackCopy, saveStackCopy, subscribeStackCopy, updateStackCopy } from './stackCopy';
import type { Holding } from '../types/holding';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const HOLDING = { id: 'h1', metal: 'gold', type: 'Gold Maple Leaf', weight: 1, weightUnit: 'oz', quantity: 1, purchasePrice: 3480, purchaseDate: '2026-01-05', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-01-05T00:00:00Z' } as Holding;

describe("the stack copy for reading offline", () => {
  it('keeps each account its own copy with the time it was read', () => {
    const store = memoryStore();
    saveStackCopy('user-a', [HOLDING], store, new Date('2026-10-09T18:00:00Z'));
    expect(readStackCopy('user-a', store)).toEqual({ savedAt: '2026-10-09T18:00:00.000Z', holdings: [HOLDING] });
    expect(readStackCopy('user-b', store)).toBeNull();
  });

  it('takes a change the account has saved, keeping the time of the read it came from', () => {
    const store = memoryStore();
    const added = { ...HOLDING, id: 'h2', type: 'Gold Buffalo' };
    // With no copy there's nothing to change, and none is made from a change alone.
    updateStackCopy('user-a', (list) => [added, ...list], store);
    expect(readStackCopy('user-a', store)).toBeNull();
    saveStackCopy('user-a', [HOLDING], store, new Date('2026-10-09T18:00:00Z'));
    updateStackCopy('user-a', (list) => [added, ...list], store);
    updateStackCopy('user-a', (list) => list.filter((h) => h.id !== 'h1'), store);
    expect(readStackCopy('user-a', store)).toEqual({ savedAt: '2026-10-09T18:00:00.000Z', holdings: [added] });
    expect(readStackCopy('user-b', store)).toBeNull();
    const full = { getItem: store.getItem, setItem: () => { throw new Error('quota'); } };
    expect(() => updateStackCopy('user-a', (list) => list, full)).not.toThrow();
  });

  it('reads a broken or missing copy, or blocked storage, as no copy', () => {
    const store = memoryStore();
    store.setItem('troystack_stack_copy_user-a', 'not json');
    expect(readStackCopy('user-a', store)).toBeNull();
    store.setItem('troystack_stack_copy_user-a', JSON.stringify({ savedAt: 5, holdings: 'x' }));
    expect(readStackCopy('user-a', store)).toBeNull();
    expect(readStackCopy('user-a', null)).toBeNull();
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveStackCopy('user-a', [HOLDING], full)).not.toThrow();
  });

  it('says which account is showing its copy, and tells listeners when that changes', () => {
    // Unit tests run without a window, so the page's events get one to use.
    const target = new EventTarget();
    vi.stubGlobal('addEventListener', target.addEventListener.bind(target));
    vi.stubGlobal('removeEventListener', target.removeEventListener.bind(target));
    vi.stubGlobal('dispatchEvent', target.dispatchEvent.bind(target));
    const seen = vi.fn();
    const stop = subscribeStackCopy(seen);
    markCopyShown('user-a', '2026-10-09T18:00:00.000Z');
    expect(copyShownSince('user-a')).toBe('2026-10-09T18:00:00.000Z');
    expect(copyShownSince('user-b')).toBeNull();
    markCopyShown('user-a', '2026-10-09T18:00:00.000Z');
    markCopyShown('user-a', null);
    expect(copyShownSince('user-a')).toBeNull();
    expect(copyShownSince(undefined)).toBeNull();
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
    vi.unstubAllGlobals();
  });

  it('clears every account at once', () => {
    // A browser-like storage, whose keys are the only things Object.keys sees.
    class MemoryStorage {
      [key: string]: unknown;
      getItem(k: string) {
        return Object.prototype.hasOwnProperty.call(this, k) ? String(this[k]) : null;
      }
      setItem(k: string, v: string) {
        this[k] = String(v);
      }
      removeItem(k: string) {
        delete this[k];
      }
    }
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.setItem('troystack_stack_copy_user-a', '{}');
    localStorage.setItem('troystack_stack_copy_user-b', '{}');
    localStorage.setItem('stacktracker_theme', 'dark');
    clearStackCopies();
    expect(localStorage.getItem('troystack_stack_copy_user-a')).toBeNull();
    expect(localStorage.getItem('troystack_stack_copy_user-b')).toBeNull();
    expect(localStorage.getItem('stacktracker_theme')).toBe('dark');
    vi.unstubAllGlobals();
  });
});
