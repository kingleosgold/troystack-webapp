import { describe, expect, it } from 'vitest';
import { buildNotes, parseNotes } from './holdingNotes';
import { lineCostBasis, premiumPerPiece, stackTotals, valueAt } from './stackMath';
import { parseCsvText } from './parseSpreadsheet';
import { holdingsToCSV } from '../services/holdings';
import type { Holding } from '../types/holding';

function holding(over: Partial<Holding>): Holding {
  return {
    id: 'h',
    metal: 'silver',
    type: 'American Silver Eagle',
    weight: 1,
    weightUnit: 'oz',
    quantity: 10,
    purchasePrice: 35,
    purchaseDate: '2026-01-15',
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    ...over,
  };
}

const SPOT = { gold: 4000, silver: 50, platinum: 1600, palladium: 1100 };

describe('notes JSON shared with the app', () => {
  it('reads the keys the app writes', () => {
    const n = parseNotes('{"local_id":1700000000000,"source":"APMEX","taxes":4.5,"shipping":0,"spot_price":31.2,"premium":3.1,"cost_basis":0}');
    expect(n.dealer).toBe('APMEX');
    expect(n.taxes).toBe(4.5);
    expect(n.shipping).toBeUndefined();
    expect(n.spotAtPurchase).toBe(31.2);
    expect(n.premium).toBe(3.1);
    expect(n.costBasisOverride).toBeUndefined();
    expect(n.localId).toBe(1700000000000);
  });

  it('treats plain text as a note', () => {
    expect(parseNotes('bought at the coin show')).toEqual({ note: 'bought at the coin show', meta: {} });
    expect(parseNotes('')).toEqual({ meta: {} });
    expect(parseNotes(null)).toEqual({ meta: {} });
  });

  it('keeps keys it does not edit and drops empty ones on save', () => {
    const before = parseNotes('{"local_id":42,"time_purchased":"10:30","cost_basis":500,"source":"JM"}');
    const saved = JSON.parse(buildNotes(before.meta, { dealer: '', taxes: 2, shipping: 0, note: ' gift ' }));
    expect(saved).toEqual({ local_id: 42, time_purchased: '10:30', cost_basis: 500, taxes: 2, note: 'gift' });
  });

  it('gives a new row a local id in the app format', () => {
    const saved = JSON.parse(buildNotes(undefined, { dealer: 'SD Bullion' }));
    expect(saved.source).toBe('SD Bullion');
    expect(typeof saved.local_id).toBe('number');
    expect(saved.local_id).toBeGreaterThan(1_600_000_000_000);
  });
});

describe('stack math matches the app', () => {
  it('values by ounces and spot, costs with taxes and shipping', () => {
    const t = stackTotals([holding({ taxes: 10, shipping: 5 })], SPOT);
    expect(t.value).toBe(500);
    expect(t.cost).toBe(365);
    expect(t.gain).toBe(135);
    expect(t.byMetal.silver.avgCostPerOz).toBeCloseTo(36.5);
  });

  it('leaves holdings bought today out of the day change', () => {
    const now = new Date('2026-10-08T15:00:00Z');
    const t = stackTotals(
      [holding({ purchaseDate: '2026-10-01' }), holding({ id: 'b', purchaseDate: '2026-10-08' })],
      SPOT,
      { silver: 1 },
      now,
    );
    // 10 oz owned before today, silver up 1%: 500 - 500 / 1.01
    expect(t.dayChange).toBeCloseTo(500 - 500 / 1.01, 6);
  });

  it('shows the override as a line cost basis without changing totals', () => {
    const h = holding({ costBasisOverride: 999 });
    expect(lineCostBasis(h)).toBe(999);
    expect(stackTotals([h], SPOT).cost).toBe(350);
  });

  it('never reports a negative premium', () => {
    expect(premiumPerPiece(30, 31, 1)).toBe(0);
    expect(premiumPerPiece(36, 31, 1)).toBe(5);
  });

  it('values a stack at prices you name', () => {
    expect(valueAt([holding({ quantity: 2 }), holding({ metal: 'gold', weight: 0.1, quantity: 1 })], { ...SPOT, silver: 100, gold: 5000 })).toBe(700);
  });
});

describe('spreadsheet import', () => {
  it('reads common headers and skips nothing it understands', () => {
    const rows = parseCsvText(
      'Product,Metal,Oz per piece,Quantity,Price per piece,Purchase date,Dealer,Tax,Shipping\n' +
        '"Maple Leaf, 2024",Gold,1,2,"$4,050.00",2026-03-01,APMEX,0,12\n' +
        'Junk dimes,Ag,0.0723,50,3.10,03/04/2026,Coin shop,,\n',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ description: 'Maple Leaf, 2024', metal: 'gold', weight: 1, quantity: 2, purchasePrice: 4050, purchaseDate: '2026-03-01', dealer: 'APMEX', shipping: 12 });
    expect(rows[1]).toMatchObject({ metal: 'silver', weight: 0.0723, quantity: 50, purchasePrice: 3.1 });
    expect(rows[1].purchaseDate).toMatch(/^2026-03-0[34]$/);
  });

  it('defaults quantity to one and leaves unknown metals unset', () => {
    const [row] = parseCsvText('name,metal,weight\nMystery bar,copper,1\n');
    expect(row.quantity).toBe(1);
    expect(row.metal).toBeUndefined();
  });

  it('reads back its own export, notes included', () => {
    const csv = holdingsToCSV([
      holding({ type: 'Buffalo "BU", tube of 20', quantity: 20, dealer: 'JM Bullion', taxes: 4.5, shipping: 9, note: 'From the coin show,\nsecond table on the left' }),
      holding({ metal: 'gold', type: '1 g bar', weight: 0.03215, weightUnit: 'g', quantity: 3, purchasePrice: 140, purchaseDate: '' }),
    ]);
    const rows = parseCsvText(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      description: 'Buffalo "BU", tube of 20',
      metal: 'silver',
      weight: 1,
      quantity: 20,
      purchasePrice: 35,
      purchaseDate: '2026-01-15',
      dealer: 'JM Bullion',
      taxes: 4.5,
      shipping: 9,
      note: 'From the coin show,\nsecond table on the left',
    });
    expect(rows[1]).toMatchObject({ description: '1 g bar', metal: 'gold', weight: 0.03215, quantity: 3, purchasePrice: 140 });
    expect(rows[1].note).toBeUndefined();
    expect(rows[1].purchaseDate).toBeUndefined();
  });

  it('handles Windows line endings, a byte order mark and quotes inside a cell', () => {
    const rows = parseCsvText('\uFEFFProduct,Metal,Oz,Notes\r\n5" round,silver,5,\r\n\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ description: '5" round', metal: 'silver', weight: 5 });
  });
});
