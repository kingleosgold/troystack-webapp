/**
 * Brings the element a #fragment names into view. A lazy page may not have
 * drawn it yet, so this keeps looking for a couple of seconds and then gives
 * up quietly. Returns a cleanup that stops looking.
 */
export function scrollToHash(hash: string, timeoutMs = 2000): () => void {
  const raw = hash.replace(/^#/, '');
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // A malformed escape stays as typed.
  }
  if (!id) return () => {};
  const started = Date.now();
  let frame = 0;
  let stopped = false;
  const look = () => {
    if (stopped) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      return;
    }
    if (Date.now() - started < timeoutMs) frame = requestAnimationFrame(look);
  };
  look();
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
