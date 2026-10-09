import { describe, expect, it } from 'vitest';
import { reloadForStaleChunk } from './chunkReload';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('reloading for page code a deploy removed', () => {
  it('reloads once per build', () => {
    const s = memory();
    expect(reloadForStaleChunk(s, 'build-a')).toBe(true);
    expect(reloadForStaleChunk(s, 'build-a')).toBe(false);
  });

  it('reloads again when a later deploy catches the same tab', () => {
    const s = memory();
    expect(reloadForStaleChunk(s, 'build-a')).toBe(true);
    // The reload brought in build b, and another deploy follows.
    expect(reloadForStaleChunk(s, 'build-b')).toBe(true);
    expect(reloadForStaleChunk(s, 'build-b')).toBe(false);
  });
});
