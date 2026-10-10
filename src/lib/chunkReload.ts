const RELOAD_KEY = 'troystack_chunk_reload';

/**
 * Whether to reload for page code that's gone after a deploy. It's tried
 * once per build, so a tab whose reload brought in the new build can reload
 * again when a later deploy catches it, and a build that keeps failing shows
 * the error instead of reloading forever.
 */
export function reloadForStaleChunk(storage: Pick<Storage, 'getItem' | 'setItem'>, build: string): boolean {
  if (storage.getItem(RELOAD_KEY) === build) return false;
  storage.setItem(RELOAD_KEY, build);
  return true;
}
