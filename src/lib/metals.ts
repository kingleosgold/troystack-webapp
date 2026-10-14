import type { Metal } from '../types/holding';

export const METALS: Metal[] = ['gold', 'silver', 'platinum', 'palladium'];

export const METAL_LABEL: Record<Metal, string> = {
  gold: 'Gold',
  silver: 'Silver',
  platinum: 'Platinum',
  palladium: 'Palladium',
};

export const METAL_SYMBOL: Record<Metal, string> = {
  gold: 'Au',
  silver: 'Ag',
  platinum: 'Pt',
  palladium: 'Pd',
};

/** CSS variable for each metal's accent, so charts follow the theme. */
export const METAL_VAR: Record<Metal, string> = {
  gold: 'var(--m-gold)',
  silver: 'var(--m-silver)',
  platinum: 'var(--m-platinum)',
  palladium: 'var(--m-palladium)',
};

/** Tailwind text class for each metal's accent. */
export const METAL_TEXT: Record<Metal, string> = {
  gold: 'text-m-gold',
  silver: 'text-m-silver',
  platinum: 'text-m-platinum',
  palladium: 'text-m-palladium',
};

/** Tailwind background class for each metal's accent. */
export const METAL_BG: Record<Metal, string> = {
  gold: 'bg-m-gold',
  silver: 'bg-m-silver',
  platinum: 'bg-m-platinum',
  palladium: 'bg-m-palladium',
};

export function isMetal(value: unknown): value is Metal {
  return value === 'gold' || value === 'silver' || value === 'platinum' || value === 'palladium';
}

/** Troy ounces in one gram and one kilogram. */
export const OZT_PER_GRAM = 0.0321507466;
export const OZT_PER_KG = 32.1507466;
