import { beforeEach, describe, expect, it, vi } from 'vitest';

// Catches what a move sends to the holdings table.
const sent = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: async (rows: unknown[]) => {
        sent.rows = rows;
        return { error: null, status: 201 };
      },
    }),
  },
}));

import { uploadLocalHoldings, type HoldingRow } from './supabaseHoldings';
import { parseNotes } from '../lib/holdingNotes';
import { stackTotals } from '../lib/stackMath';
import type { Holding } from '../types/holding';

const USER = 'user-a';
const PRICES = { gold: 4000, silver: 50, platinum: 1500, palladium: 1000 };

function guest(over: Partial<Holding>): Holding {
  return {
    id: 'g1',
    metal: 'gold',
    type: 'Gold Eagle',
    weight: 1,
    weightUnit: 'oz',
    quantity: 1,
    purchasePrice: 4000,
    purchaseDate: '2026-09-01',
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z',
    ...over,
  };
}

describe('moving a guest stack into an account', () => {
  beforeEach(() => {
    sent.rows = [];
  });

  it('turns a fractional count from an older build into one piece with the same ounces, cost and premiums', async () => {
    const half = guest({ quantity: 0.5, taxes: 12, shipping: 8, spotAtPurchase: 3950, premium: 10 });
    const [moved] = await uploadLocalHoldings([half], USER);
    const [row] = sent.rows as HoldingRow[];
    expect(row).toMatchObject({ quantity: 1, weight: 0.5, purchase_price: 2000 });
    const notes = parseNotes(row.notes);
    // Premium is per piece, like the weight and the price. Spot is per ounce,
    // and taxes and shipping are totals for the line.
    expect(notes.premium).toBe(5);
    expect(notes.spotAtPurchase).toBe(3950);
    expect(notes.taxes).toBe(12);
    expect(notes.shipping).toBe(8);
    const before = stackTotals([half], PRICES);
    const after = stackTotals([moved], PRICES);
    expect(after.premiums).toBe(before.premiums);
    expect(after.cost).toBe(before.cost);
    expect(after.value).toBe(before.value);
    expect(moved).toMatchObject({ id: row.id, quantity: 1, weight: 0.5, purchasePrice: 2000, premium: 5 });
  });

  it('leaves whole counts as they are', async () => {
    const ten = guest({ metal: 'silver', type: 'Silver Eagle', quantity: 10, purchasePrice: 55, premium: 6 });
    await uploadLocalHoldings([ten], USER);
    const [row] = sent.rows as HoldingRow[];
    expect(row).toMatchObject({ quantity: 10, weight: 1, purchase_price: 55 });
    expect(parseNotes(row.notes).premium).toBe(6);
  });
});
