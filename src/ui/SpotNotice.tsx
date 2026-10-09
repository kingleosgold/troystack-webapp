import type { SpotMap } from '../hooks/queries';
import { METAL_LABEL } from '../lib/metals';
import type { Metal } from '../types/holding';
import { ErrorNote } from './primitives';

/**
 * Says why a value isn't shown when it needs a price there isn't, and offers
 * to try again. Nothing while prices load, or when every metal here has one.
 */
export function SpotNotice({ spot, metals, className }: { spot: SpotMap; metals: Metal[]; className?: string }) {
  if (spot.isLoading || metals.length === 0) return null;
  let text: string;
  if (!spot.data) {
    text = "Live prices didn't load, so values that need them are on hold.";
  } else {
    const missing = metals.filter((m) => !spot.priced(m)).map((m) => METAL_LABEL[m].toLowerCase());
    if (missing.length === 0) return null;
    const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} or ${missing[missing.length - 1]}`;
    text = `There's no live ${list} price right now, so values that need it are on hold.`;
  }
  return (
    <div className={className}>
      <ErrorNote onRetry={() => void spot.refetch()}>{text}</ErrorNote>
    </div>
  );
}
