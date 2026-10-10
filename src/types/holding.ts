export type Metal = 'gold' | 'silver' | 'platinum' | 'palladium';
export type WeightUnit = 'oz' | 'g' | 'kg';

/**
 * One line of a stack. Field meanings match the iPhone app, which stores the
 * same row in Supabase `holdings`: `weight` is troy ounces per piece,
 * `purchasePrice` is the price per piece, and taxes and shipping are totals
 * for the line. The app keeps dealer, taxes, shipping, spot at purchase,
 * premium and its own id inside the row's `notes` JSON, and so does the site.
 */
export interface Holding {
  id: string;
  metal: Metal;
  /** Product name, for example "American Silver Eagle" */
  type: string;
  /** Troy ounces per piece */
  weight: number;
  /** The unit the weight was entered in, for display only */
  weightUnit: WeightUnit;
  quantity: number;
  /** Price paid per piece */
  purchasePrice: number;
  /** YYYY-MM-DD, or empty when unknown */
  purchaseDate: string;
  dealer?: string;
  taxes?: number;
  shipping?: number;
  /** Spot per ounce when bought */
  spotAtPurchase?: number;
  /** Premium over spot per piece */
  premium?: number;
  /** The app's own cost basis override for the line */
  costBasisOverride?: number;
  /** HH:MM, as the app records it */
  timePurchased?: string;
  /** A free-text note entered on the site */
  note?: string;
  /** Every key read from the row's notes JSON, so a save keeps the app's keys */
  notesMeta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface HoldingFormData {
  metal: Metal;
  type: string;
  /** In `weightUnit` */
  weight: number;
  weightUnit: WeightUnit;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  dealer?: string;
  taxes?: number;
  shipping?: number;
  spotAtPurchase?: number;
  premium?: number;
  note?: string;
}

/** Common products by metal, with troy ounces per piece. */
export interface ProductPreset {
  name: string;
  ozt: number;
}

export const PRODUCT_PRESETS: Record<Metal, ProductPreset[]> = {
  gold: [
    { name: 'American Gold Eagle 1 oz', ozt: 1 },
    { name: 'American Gold Buffalo 1 oz', ozt: 1 },
    { name: 'Canadian Gold Maple Leaf 1 oz', ozt: 1 },
    { name: 'South African Krugerrand 1 oz', ozt: 1 },
    { name: 'Austrian Gold Philharmonic 1 oz', ozt: 1 },
    { name: 'American Gold Eagle 1/10 oz', ozt: 0.1 },
    { name: 'Gold Bar 1 oz', ozt: 1 },
    { name: 'Gold Bar 10 g', ozt: 0.3215 },
    { name: 'Gold Bar 1 kg', ozt: 32.1507 },
  ],
  silver: [
    { name: 'American Silver Eagle 1 oz', ozt: 1 },
    { name: 'Canadian Silver Maple Leaf 1 oz', ozt: 1 },
    { name: 'Austrian Silver Philharmonic 1 oz', ozt: 1 },
    { name: 'British Silver Britannia 1 oz', ozt: 1 },
    { name: 'Silver Round 1 oz', ozt: 1 },
    { name: 'Silver Bar 10 oz', ozt: 10 },
    { name: 'Silver Bar 100 oz', ozt: 100 },
    { name: 'Silver Bar 1 kg', ozt: 32.1507 },
    { name: 'Morgan Dollar', ozt: 0.77344 },
    { name: '90% Junk Silver, $1 face', ozt: 0.715 },
  ],
  platinum: [
    { name: 'American Platinum Eagle 1 oz', ozt: 1 },
    { name: 'Canadian Platinum Maple Leaf 1 oz', ozt: 1 },
    { name: 'Platinum Bar 1 oz', ozt: 1 },
  ],
  palladium: [
    { name: 'Canadian Palladium Maple Leaf 1 oz', ozt: 1 },
    { name: 'American Palladium Eagle 1 oz', ozt: 1 },
    { name: 'Palladium Bar 1 oz', ozt: 1 },
  ],
};

export const WEIGHT_TO_OZT: Record<WeightUnit, number> = {
  oz: 1,
  g: 0.0321507466,
  kg: 32.1507466,
};
