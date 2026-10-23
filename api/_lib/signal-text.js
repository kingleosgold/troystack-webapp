// The Signal text rules the app applies in src/lib/text.ts and
// src/lib/signalApi.ts, for the build's prerender and api/signal-html.js,
// which can't import TypeScript. signal-text.test.ts keeps the copies equal.

/** A dash between words becomes a comma, an en dash between numbers a hyphen. */
export function plainDashes(text) {
  if (!text) return '';
  return String(text)
    .replace(/(\d)\s*–\s*(\d)/g, '$1-$2')
    .replace(/^[ \t]*[—–][ \t]*/gm, '')
    .replace(/[ \t]*[—–]+[ \t]*(?=[.,;:!?)\]]|$)/gm, '')
    .replace(/[ \t]*[—–]+[ \t]*/g, ', ')
    .replace(/,\s*,/g, ',');
}

/** A one-liner cut to a word or two ("Fed", "Gold shines as") doesn't count. */
export function usableOneLiner(raw) {
  const s = plainDashes(String(raw || '').trim());
  const words = s.split(/\s+/).filter(Boolean).length;
  return words >= 5 && s.length >= 25 ? s : '';
}
