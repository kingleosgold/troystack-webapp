import { describe, expect, it, vi } from 'vitest';

// The Supabase client isn't needed for these, only the row mapping.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { HoldingWriteError, holdingAfter, holdingUpdates, newHoldingRow, fromRow } from './supabaseHoldings';
import { canRetry, clearRefused, readPending, readRefused, savePending, sendPending, withPending, type PendingWrite } from './pendingWrites';
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

describe('edits and ids', () => {
  const existing = fromRow({
    ...newHoldingRow({ ...FORM, quantity: 10 }, USER),
    notes: JSON.stringify({ local_id: 1700000000001, cost_basis: 500, source: 'APMEX' }),
  });

  it("drop the app's cost-basis override once the cost of the line changes", () => {
    const kept = JSON.parse(holdingUpdates(existing, { ...FORM, quantity: 10, note: 'Second tube' }).notes);
    expect(kept.cost_basis, 'only the note changed').toBe(500);
    const changed = JSON.parse(holdingUpdates(existing, { ...FORM, quantity: 20 }).notes);
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
