import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSparklines } from './marketApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
}

describe('the 24-hour sparklines', () => {
  it('keep each price with the time it was taken when some are missing', async () => {
    const stamps = ['2026-10-08T01:00:00Z', '2026-10-08T07:00:00Z', '2026-10-08T13:00:00Z', '2026-10-08T19:00:00Z', '2026-10-09T01:00:00Z'];
    answer({
      sparklines: { gold: [4100, 0, 4120, null, 4130], silver: [60, 60.1, 60.2, 60.3, 60.4], platinum: [], palladium: [1100, Number.NaN, 1110, 1120, 1130] },
      timestamps: stamps,
    });
    const s = await fetchSparklines();
    expect(s.series.gold).toEqual([4100, 4120, 4130]);
    expect(s.times.gold).toEqual([Date.parse(stamps[0]), Date.parse(stamps[2]), Date.parse(stamps[4])]);
    expect(s.times.silver).toEqual(stamps.map((t) => Date.parse(t)));
    expect(s.series.platinum).toEqual([]);
    expect(s.times.platinum).toEqual([]);
    expect(s.series.palladium).toHaveLength(4);
    expect(s.times.palladium).toEqual([stamps[0], stamps[2], stamps[3], stamps[4]].map((t) => Date.parse(t)));
  });

  it('without a time for every price, space them over the day before the read, counting the missing ones', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
    try {
      answer({ sparklines: { gold: [4100, 0, 0, 4130, 4140], silver: [], platinum: [], palladium: [] }, timestamps: [] });
      const s = await fetchSparklines();
      const now = Date.parse('2026-10-09T12:00:00Z');
      const step = (24 * 3600_000) / 4;
      expect(s.series.gold).toEqual([4100, 4130, 4140]);
      expect(s.times.gold).toEqual([now - 4 * step, now - step, now]);
    } finally {
      vi.useRealTimers();
    }
  });
});
