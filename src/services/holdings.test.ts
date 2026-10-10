import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalHoldings, removeLocalHoldings } from './holdings';

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

const guest = (id: string, type: string) => ({ id, metal: 'gold', type, weight: 1, weightUnit: 'oz', quantity: 1, purchasePrice: 4100, purchaseDate: '2026-10-01' });

describe('the guest stack', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lets go of just the holdings an account took, and is gone once none are left', () => {
    localStorage.setItem('stacktracker_holdings', JSON.stringify([guest('g1', 'Gold Buffalo'), guest('g2', 'Gold Eagle')]));
    removeLocalHoldings(new Set(['g1']));
    expect(getLocalHoldings().map((h) => h.type)).toEqual(['Gold Eagle']);
    removeLocalHoldings(new Set(['g2', 'g3']));
    expect(localStorage.getItem('stacktracker_holdings')).toBeNull();
  });
});
