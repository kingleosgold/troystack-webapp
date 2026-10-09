import { describe, expect, it, vi } from 'vitest';

// The Supabase client isn't needed for these, only the row mapping.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { HoldingWriteError, holdingAfter, holdingUpdates, newHoldingRow, fromRow } from './supabaseHoldings';
import {
  addRefused,
  adoptLegacyPending,
  canRetry,
  clearRefused,
  dropQueuedChanges,
  readPending,
  readRefused,
  savePending,
  sendBeforeSignOut,
  sendPending,
  withPending,
  type PendingWrite,
} from './pendingWrites';
import { stableUuid } from '../lib/stableId';
import type { HoldingFormData } from '../types/holding';

const USER = 'user-a';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const FORM: HoldingFormData = {
  metal: 'silver',
  type: 'American Silver Eagle',
  weight: 1,
  weightUnit: 'oz',
  quantity: 20,
  purchasePrice: 35,
  purchaseDate: '2026-10-01',
  note: 'From the coin show',
};

function addWrite(over: Partial<HoldingFormData> = {}): PendingWrite & { kind: 'add' } {
  return { wid: crypto.randomUUID(), kind: 'add', row: newHoldingRow({ ...FORM, ...over }, USER) };
}

describe('changes waiting in the browser', () => {
  it('show on top of the account as if saved, in the order they were made', () => {
    const kept = fromRow(newHoldingRow({ ...FORM, type: 'Maple Leaf' }, USER));
    const gone = fromRow(newHoldingRow({ ...FORM, type: 'Junk dimes' }, USER));
    const added = addWrite({ type: 'Buffalo' });
    const edit = holdingUpdates(kept, { ...FORM, type: 'Maple Leaf', quantity: 5 });
    const list = withPending(
      [kept, gone],
      [
        added,
        { wid: 'w2', kind: 'update', id: kept.id, updates: edit, holding: holdingAfter(kept, edit, USER) },
        { wid: 'w3', kind: 'delete', id: gone.id, deletedAt: '2026-10-09T00:00:00Z' },
      ],
    );
    expect(list.map((h) => h.type)).toEqual(['Buffalo', 'Maple Leaf']);
    expect(list[1].quantity).toBe(5);
    expect(list[1].note).toBe('From the coin show');
  });

  it("don't show an add twice once it has reached the account", () => {
    const added = addWrite();
    expect(withPending([fromRow(added.row)], [added])).toHaveLength(1);
  });

  it('are kept per account, and a broken store reads as nothing waiting', () => {
    const store = memoryStore();
    expect(savePending(USER, [addWrite()], store)).toBe(true);
    expect(readPending(USER, store)).toHaveLength(1);
    expect(readPending('user-b', store)).toEqual([]);
    store.setItem('troystack_pending_writes_user-a', 'not json');
    expect(readPending(USER, store)).toEqual([]);
    expect(savePending(USER, [], null)).toBe(false);
  });

  it('go out oldest first, and stop where the connection still fails', async () => {
    const store = memoryStore();
    const writes = [addWrite({ type: 'one' }), addWrite({ type: 'two' }), addWrite({ type: 'three' })];
    savePending(USER, writes, store);
    const seen: string[] = [];
    const result = await sendPending(
      USER,
      async (w) => {
        const type = w.kind === 'add' ? String(w.row.type) : '';
        seen.push(type);
        if (type === 'two') throw new HoldingWriteError("That didn't save. Try again.", true);
      },
      store,
    );
    expect(seen).toEqual(['one', 'two']);
    expect(result).toEqual({ sent: 1, refused: 0, waiting: 2 });
    expect(readPending(USER, store).map((w) => (w.kind === 'add' ? w.row.type : ''))).toEqual(['two', 'three']);
  });

  it('drop a change the account refuses outright, and count it', async () => {
    const store = memoryStore();
    savePending(USER, [addWrite({ type: 'bad' }), addWrite({ type: 'good' })], store);
    const result = await sendPending(
      USER,
      async (w) => {
        if (w.kind === 'add' && w.row.type === 'bad') throw new HoldingWriteError("That didn't save. Try again.", false);
      },
      store,
    );
    expect(result).toEqual({ sent: 1, refused: 1, waiting: 0 });
    expect(readPending(USER, store)).toEqual([]);
    expect(readRefused(USER, store), 'kept for the notice on any page').toBe(1);
    expect(readRefused('user-b', store)).toBe(0);
    clearRefused(USER, store);
    expect(readRefused(USER, store)).toBe(0);
  });

  it("stop rather than loop when the store won't save", async () => {
    const store = memoryStore();
    savePending(USER, [addWrite()], store);
    store.setItem = () => {
      throw new Error('quota');
    };
    store.removeItem = () => {
      throw new Error('quota');
    };
    const send = vi.fn(async () => undefined);
    const result = await sendPending(USER, send, store);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.waiting).toBe(1);
  });

  it('count a dropped connection or a server error as worth retrying, a refusal not', () => {
    expect(canRetry(new HoldingWriteError('x', true))).toBe(true);
    expect(canRetry(new HoldingWriteError('x', false))).toBe(false);
  });
});

describe('changes the old site left in the browser', () => {
  const LEGACY = 'stacktracker_pending_actions';
  const GUEST = 'stacktracker_holdings';
  const U1 = '0b5ad7a0-6f1e-4c55-9b7e-3d1f5e2a9c01';
  const U2 = '0b5ad7a0-6f1e-4c55-9b7e-3d1f5e2a9c02';
  const T = Date.parse('2026-10-08T14:00:00Z');
  const oldForm = (over: Record<string, unknown> = {}) => ({
    metal: 'silver',
    type: 'American Silver Eagle',
    weight: 31.1035,
    weightUnit: 'g',
    quantity: 20,
    purchasePrice: 38,
    purchaseDate: '2026-10-01',
    notes: 'From the coin show',
    ...over,
  });

  it("move into this account's list ahead of newer changes, and the old list goes", () => {
    const store = memoryStore();
    const newer = addWrite({ type: 'Newer' });
    savePending(USER, [newer], store);
    store.setItem(
      LEGACY,
      JSON.stringify([
        { id: 'a1', type: 'add', data: oldForm(), timestamp: T },
        { id: 'a2', type: 'update', holdingId: U1, data: oldForm({ type: 'Gold Maple Leaf', metal: 'gold', weight: 1, weightUnit: 'oz', quantity: 2, purchasePrice: 4100, notes: '' }), timestamp: T + 60_000 },
        { id: 'a3', type: 'delete', holdingId: U2, timestamp: T + 120_000 },
      ]),
    );
    expect(adoptLegacyPending(USER, store)).toBe(3);
    expect(store.getItem(LEGACY)).toBeNull();
    const list = readPending(USER, store);
    expect(list.map((w) => w.kind)).toEqual(['add', 'update', 'delete', 'add']);
    expect(list[3].wid).toBe(newer.wid);
    const add = list[0] as PendingWrite & { kind: 'add' };
    expect(add.row.user_id).toBe(USER);
    expect(add.row.type).toBe('American Silver Eagle');
    expect(Number(add.row.weight)).toBeCloseTo(1, 4);
    expect(add.row.weight_unit).toBe('g');
    expect(add.row.created_at).toBe('2026-10-08T14:00:00.000Z');
    expect(JSON.parse(String(add.row.notes)).note).toBe('From the coin show');
    const edit = list[1] as PendingWrite & { kind: 'update' };
    expect(edit.id).toBe(U1);
    expect(edit.updates.purchase_price).toBe(4100);
    expect(edit.holding.type).toBe('Gold Maple Leaf');
    expect(list[2]).toMatchObject({ kind: 'delete', id: U2, deletedAt: '2026-10-08T14:02:00.000Z' });
  });

  it('take the browser copies of offline adds out of the guest stack, folding edits and deletes of them into the adds', () => {
    const store = memoryStore();
    const T2 = T + 300_000;
    store.setItem(
      GUEST,
      JSON.stringify([
        { id: `${T + 1}-abc1234`, metal: 'silver', type: 'American Silver Eagle', weight: 1, weightUnit: 'g', quantity: 30 },
        { id: `${T2 + 2}-def5678`, metal: 'gold', type: 'Buffalo', weight: 1, weightUnit: 'oz', quantity: 1 },
        { id: `${T - 600_000}-zzz9999`, metal: 'silver', type: 'Added as a guest', weight: 1, weightUnit: 'oz', quantity: 5 },
      ]),
    );
    store.setItem(
      LEGACY,
      JSON.stringify([
        { id: 'b1', type: 'add', data: oldForm(), timestamp: T },
        { id: 'b2', type: 'update', holdingId: `${T + 1}-abc1234`, data: oldForm({ quantity: 30 }), timestamp: T + 1_000 },
        { id: 'b3', type: 'add', data: oldForm({ metal: 'gold', type: 'Buffalo', weight: 1, weightUnit: 'oz', quantity: 1 }), timestamp: T2 },
        { id: 'b4', type: 'delete', holdingId: `${T2 + 2}-def5678`, timestamp: T2 + 5_000 },
        { id: 'b5', type: 'update', holdingId: '1600000000000-nothere', data: oldForm(), timestamp: T2 + 6_000 },
        { id: 'b6', type: 'update', holdingId: U1, data: { metal: 'tin' }, timestamp: T2 + 7_000 },
      ]),
    );
    expect(adoptLegacyPending(USER, store)).toBe(1);
    const [only] = readPending(USER, store) as Array<PendingWrite & { kind: 'add' }>;
    expect(only.kind).toBe('add');
    expect(only.row.quantity, 'the later edit of the copy is in the add').toBe(30);
    const left = JSON.parse(store.getItem(GUEST)!) as Array<{ type: string }>;
    expect(left.map((h) => h.type), "the guest's own holding stays to be offered").toEqual(['Added as a guest']);
  });

  // The old site hid notes holding the app's JSON, so an edit it queued
  // carries at most a typed note and never the app's keys.
  it("leave the row's notes alone for an edit with no note of its own", () => {
    const store = memoryStore();
    store.setItem(LEGACY, JSON.stringify([{ id: 'c1', type: 'update', holdingId: U1, data: oldForm({ notes: '' }), timestamp: T }]));
    adoptLegacyPending(USER, store);
    const [edit] = readPending(USER, store) as Array<PendingWrite & { kind: 'update' }>;
    expect('notes' in edit.updates, 'the update would replace the app keys in the column').toBe(false);
    expect(edit.updates.purchase_price).toBe(38);
  });

  it('send a note typed on the old site', () => {
    const store = memoryStore();
    store.setItem(LEGACY, JSON.stringify([{ id: 'c2', type: 'update', holdingId: U1, data: oldForm({ notes: 'Tube of 20 from the show' }), timestamp: T }]));
    adoptLegacyPending(USER, store);
    const [edit] = readPending(USER, store) as Array<PendingWrite & { kind: 'update' }>;
    expect(JSON.parse(String(edit.updates.notes)).note).toBe('Tube of 20 from the show');
  });

  it("keep what the row's notes hold while an edit that leaves them alone waits", () => {
    const existing = fromRow({
      ...newHoldingRow(FORM, USER),
      notes: JSON.stringify({ local_id: 1700000000001, source: 'APMEX', taxes: 3.5, shipping: 9.95, spot_price: 31.2, premium: 4.5, cost_basis: 500, time_purchased: '10:15', note: 'Tube of 20' }),
    });
    const store = memoryStore();
    store.setItem(LEGACY, JSON.stringify([{ id: 'c3', type: 'update', holdingId: existing.id, data: oldForm({ quantity: 25, notes: '' }), timestamp: T }]));
    adoptLegacyPending(USER, store);
    const [shown] = withPending([existing], readPending(USER, store));
    expect(shown.quantity).toBe(25);
    expect(shown).toMatchObject({ dealer: 'APMEX', taxes: 3.5, shipping: 9.95, spotAtPurchase: 31.2, premium: 4.5, costBasisOverride: 500, timePurchased: '10:15', note: 'Tube of 20' });
    expect(shown.notesMeta?.local_id).toBe(1700000000001);
  });

  it('move nothing twice, even if the old list comes back', () => {
    const store = memoryStore();
    const list = JSON.stringify([{ id: 'd1', type: 'add', data: oldForm(), timestamp: T }]);
    store.setItem(LEGACY, list);
    expect(adoptLegacyPending(USER, store)).toBe(1);
    store.setItem(LEGACY, list);
    expect(adoptLegacyPending(USER, store)).toBe(0);
    expect(readPending(USER, store)).toHaveLength(1);
    expect(store.getItem(LEGACY)).toBeNull();
  });

  it("drop an unreadable old list, and keep a readable one when this browser won't save", () => {
    const store = memoryStore();
    store.setItem(LEGACY, 'not json');
    expect(adoptLegacyPending(USER, store)).toBe(0);
    expect(store.getItem(LEGACY)).toBeNull();

    const full = memoryStore();
    full.setItem(LEGACY, JSON.stringify([{ id: 'e1', type: 'add', data: oldForm(), timestamp: T }]));
    full.setItem = () => {
      throw new Error('quota');
    };
    expect(adoptLegacyPending(USER, full)).toBe(0);
    expect(full.getItem(LEGACY)).not.toBeNull();
    expect(adoptLegacyPending(USER, null)).toBe(0);
  });

  it('go out before anything newer when the list is sent', async () => {
    const store = memoryStore();
    savePending(USER, [addWrite({ type: 'Newer' })], store);
    store.setItem(LEGACY, JSON.stringify([{ id: 'f1', type: 'add', data: oldForm({ type: 'Older' }), timestamp: T }]));
    const seen: string[] = [];
    const result = await sendPending(
      USER,
      async (w) => {
        seen.push(w.kind === 'add' ? String(w.row.type) : w.kind);
      },
      store,
    );
    expect(seen).toEqual(['Older', 'Newer']);
    expect(result).toEqual({ sent: 2, refused: 0, waiting: 0 });
  });

  it('keep the date a holding was added while an edit of it waits', () => {
    const existing = fromRow({ ...newHoldingRow(FORM, USER), created_at: '2026-01-05T00:00:00Z' });
    const store = memoryStore();
    store.setItem(LEGACY, JSON.stringify([{ id: 'g1', type: 'update', holdingId: existing.id, data: oldForm({ quantity: 25 }), timestamp: T }]));
    // newHoldingRow's ids are UUIDs, the way the account's are.
    adoptLegacyPending(USER, store);
    const shown = withPending([existing], readPending(USER, store));
    expect(shown[0].quantity).toBe(25);
    expect(shown[0].createdAt).toBe('2026-01-05T00:00:00Z');
  });
});

describe('edits and ids', () => {
  const existing = fromRow({
    ...newHoldingRow({ ...FORM, quantity: 10 }, USER),
    notes: JSON.stringify({ local_id: 1700000000001, cost_basis: 500, source: 'APMEX' }),
  });

  it("drop the app's cost-basis override once the cost of the line changes", () => {
    const kept = JSON.parse(String(holdingUpdates(existing, { ...FORM, quantity: 10, note: 'Second tube' }).notes));
    expect(kept.cost_basis, 'only the note changed').toBe(500);
    const changed = JSON.parse(String(holdingUpdates(existing, { ...FORM, quantity: 20 }).notes));
    expect(changed.cost_basis).toBeUndefined();
    expect(changed.local_id, 'the app keeps tracking the row').toBe(1700000000001);
  });

  it('make the same id from the same seed, shaped like a UUID', async () => {
    const a = await stableUuid('user-a:guest:h1');
    expect(a).toBe(await stableUuid('user-a:guest:h1'));
    expect(a).not.toBe(await stableUuid('user-b:guest:h1'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('signing out', () => {
  it('drops only that account\'s waiting changes and refused count from the browser', () => {
    const store = memoryStore();
    savePending(USER, [addWrite()], store);
    addRefused(USER, 2, store);
    savePending('user-b', [addWrite()], store);
    dropQueuedChanges(USER, store);
    expect(readPending(USER, store)).toEqual([]);
    expect(readRefused(USER, store)).toBe(0);
    expect([...store.data.keys()].filter((k) => k.includes(USER))).toEqual([]);
    expect(readPending('user-b', store), "another account's changes stay").toHaveLength(1);
  });

  it("doesn't wait when nothing is waiting", async () => {
    const store = memoryStore();
    const send = vi.fn(async () => undefined);
    expect(await sendBeforeSignOut(USER, send, 50, store)).toEqual({ waiting: 0, stillSending: null });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends what is waiting first, and says nothing is left once it has gone', async () => {
    const store = memoryStore();
    savePending(USER, [addWrite(), addWrite()], store);
    const send = vi.fn(async () => {
      savePending(USER, [], store);
    });
    expect(await sendBeforeSignOut(USER, send, 1000, store)).toEqual({ waiting: 0, stillSending: null });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("says how many are still waiting when they can't go", async () => {
    const store = memoryStore();
    savePending(USER, [addWrite(), addWrite(), addWrite()], store);
    // The connection is down: the send gives up and everything stays.
    const result = await sendBeforeSignOut(USER, async () => ({ sent: 0, refused: 0, waiting: 3 }), 1000, store);
    expect(result).toEqual({ waiting: 3, stillSending: null });
  });

  it('stops waiting after a few seconds, and hands back the send still going', async () => {
    const store = memoryStore();
    savePending(USER, [addWrite()], store);
    let finish: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const started = Date.now();
    const result = await sendBeforeSignOut(USER, () => slow, 40, store);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.waiting).toBe(1);
    expect(result.stillSending).not.toBeNull();
    finish();
    await result.stillSending;
  });
});
