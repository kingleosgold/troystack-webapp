import type { Metal } from '../types/holding';
import data from './coins.json';

/**
 * Popular coins and bars, each with a page of its own at /coins/:slug. The
 * figures are the standard published specifications. The prerender script
 * reads the same JSON, so a page's title and description in the HTML match
 * what the app shows once it loads.
 */

export type CoinGroup = 'silver-bullion' | 'us-silver' | 'silver-bars' | 'gold-bullion' | 'old-gold' | 'gold-bars' | 'platinum' | 'palladium';

export interface Coin {
  slug: string;
  name: string;
  metal: Metal;
  group: CoinGroup;
  /** Pure metal per piece, in troy ounces */
  fineOzt: number;
  /** The whole piece, alloy included */
  grossGrams?: number;
  /** Share of the piece that's the named metal, 0 to 1 */
  fineness: number;
  /** How purity is usually written for this piece, like ".999 fine" or "90% silver" */
  purity: string;
  face?: string;
  mint?: string;
  years?: string;
  title: string;
  description: string;
  about: string;
}

export const COIN_GROUPS: Array<{ id: CoinGroup; label: string; metal: Metal }> = [
  { id: 'silver-bullion', label: 'Silver bullion coins', metal: 'silver' },
  { id: 'us-silver', label: 'Older US silver coins', metal: 'silver' },
  { id: 'silver-bars', label: 'Silver bars and rounds', metal: 'silver' },
  { id: 'gold-bullion', label: 'Gold bullion coins', metal: 'gold' },
  { id: 'old-gold', label: 'Older gold coins', metal: 'gold' },
  { id: 'gold-bars', label: 'Gold bars', metal: 'gold' },
  { id: 'platinum', label: 'Platinum', metal: 'platinum' },
  { id: 'palladium', label: 'Palladium', metal: 'palladium' },
];

export const COINS: Coin[] = data as Coin[];

const BY_SLUG = new Map(COINS.map((c) => [c.slug, c]));

export function coinBySlug(slug: string | null | undefined): Coin | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

export function coinsInGroup(group: CoinGroup): Coin[] {
  return COINS.filter((c) => c.group === group);
}

/** Other pieces to look at from a coin's page, its own group first. */
export function relatedCoins(coin: Coin, count = 6): Coin[] {
  const same = COINS.filter((c) => c.group === coin.group && c.slug !== coin.slug);
  const metal = COINS.filter((c) => c.metal === coin.metal && c.group !== coin.group);
  return [...same, ...metal].slice(0, count);
}

/**
 * Collectors pay more than melt for some of these, so their pages say melt
 * is the floor rather than the price.
 */
export function isCollectible(coin: Coin): boolean {
  return coin.group === 'us-silver' || coin.group === 'old-gold';
}

export function isBar(coin: Coin): boolean {
  return coin.group === 'silver-bars' || coin.group === 'gold-bars' || / (bar|round)$/.test(coin.name);
}

/** "a" or "an" before a name, by its first letter. */
export function aOrAn(name: string): string {
  return /^[AEIOU]/.test(name) ? 'an' : 'a';
}

/**
 * The name as it reads mid-sentence. Proper names keep their capitals, while
 * "War nickel" and "Silver Roosevelt dime" are descriptions and drop theirs.
 */
export function inSentence(coin: Coin): string {
  return /^(War|Silver) /.test(coin.name) ? coin.name[0].toLowerCase() + coin.name.slice(1) : coin.name;
}

/** Troy ounces without trailing zeros, to four places under ten ounces and two above: 1, 0.7734, 32.15 */
export function ounces(oz: number): string {
  if (oz >= 10) return String(+oz.toFixed(2));
  return String(+oz.toFixed(4));
}
