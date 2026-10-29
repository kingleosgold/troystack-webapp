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

// troystack-marketing's Signal rules, which troystack.com has served since
// April, kept so the move to this project doesn't change what's indexed.
// Troy's recaps are the pages search engines index. A news item is a short
// take on someone else's headline, so it stays out of the index, and once it
// folds into its day's recap (home_slug) its page answers 301 to its block
// there. Anything that isn't a plain slug, or points back at the item, keeps
// the item's own page.
export function isRecap(article) {
  return article?.is_stack_signal === true;
}

export function homeLocation(article, slug) {
  const home = article?.home_slug;
  if (isRecap(article) || typeof home !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(home) || home === slug) return null;
  return `/signal/${home}#${encodeURIComponent(slug)}`;
}
