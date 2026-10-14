import { describe, expect, it } from 'vitest';
import { SPOT_LIVE_MS, SPOT_REFRESH_MS, spotIsLive } from './queries';

describe('live spot', () => {
  it('stays live through a refresh or two that fails, and is out of date after that', () => {
    const readAt = Date.parse('2026-10-09T14:00:00Z');
    expect(spotIsLive(readAt, readAt)).toBe(true);
    expect(spotIsLive(readAt, readAt + SPOT_REFRESH_MS + 1_000)).toBe(true);
    expect(spotIsLive(readAt, readAt + 2 * SPOT_REFRESH_MS + 1_000)).toBe(true);
    expect(spotIsLive(readAt, readAt + SPOT_LIVE_MS + 1)).toBe(false);
    // No good read yet.
    expect(spotIsLive(0, readAt)).toBe(false);
  });
});
