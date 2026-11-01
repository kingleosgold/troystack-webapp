/**
 * Told only to screen readers, since a link with target="_blank" opens a new
 * tab and a sighted reader sees the tab appear. Every new-tab link carries it.
 */
export function NewTabNote() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}
