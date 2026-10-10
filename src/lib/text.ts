/**
 * Display helpers for text that comes from the API (Troy's articles, episode
 * titles, chat replies).
 */

/**
 * The site's house style has no long dashes. Generated text sometimes uses
 * them, so at display time a dash between words becomes a comma, an en dash
 * between numbers becomes a hyphen, and one that opens a line is dropped.
 */
export function plainDashes(text: string): string {
  if (!text) return '';
  return text
    .replace(/(\d)\s*\u2013\s*(\d)/g, '$1-$2')
    .replace(/^[ \t]*[\u2014\u2013][ \t]*/gm, '')
    .replace(/[ \t]*[\u2014\u2013]+[ \t]*(?=[.,;:!?)\]]|$)/gm, '')
    .replace(/[ \t]*[\u2014\u2013]+[ \t]*/g, ', ')
    .replace(/,\s*,/g, ',');
}

/** Remove **bold** and *italic* markers for plain-text previews. */
export function stripMarkdown(text: string): string {
  return (text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1$2')
    .replace(/^#+\s+/gm, '')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1');
}

/** First `max` characters of plain text, cut at a word boundary. */
export function excerpt(text: string, max = 180): string {
  const plain = plainDashes(stripMarkdown(text)).replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[,;:.\s]+$/, '')}…`;
}

/** First paragraph(s) of a markdown body up to roughly `maxChars`. */
export function leadParagraphs(text: string, maxChars = 700): string {
  const paras = (text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let total = 0;
  for (const p of paras) {
    if (out.length > 0 && total + p.length > maxChars) break;
    out.push(p);
    total += p.length;
  }
  return out.join('\n\n');
}

const NY = 'America/New_York';

export function timeAgo(iso: string | number | Date | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return formatDate(iso);
}

/** "October 8, 2026" in New York time */
export function formatDate(iso: string | number | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { timeZone: NY, month: 'long', day: 'numeric', year: 'numeric', ...opts });
}

/** "Oct 8" */
export function formatShortDate(iso: string | number | Date): string {
  return formatDate(iso, { month: 'short', day: 'numeric', year: undefined });
}

/** "8:42 PM ET" */
export function formatTimeET(iso: string | number | Date): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.toLocaleTimeString('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' })} ET`;
}

/** Today's date in New York as YYYY-MM-DD */
export function todayET(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: NY });
}

/** "8:42 PM ET" for a time today, "Oct 8, 8:42 PM ET" for one on another day */
export function whenET(at: string | number | Date, now = new Date()): string {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return '';
  return todayET(d) === todayET(now) ? formatTimeET(d) : `${formatDate(d, { month: 'short', year: undefined })}, ${formatTimeET(d)}`;
}

/** "Good morning" by New York hour */
export function greeting(now = new Date()): string {
  const hour = Number(now.toLocaleString('en-US', { timeZone: NY, hour: 'numeric', hour12: false }));
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function minutesLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min`;
}
