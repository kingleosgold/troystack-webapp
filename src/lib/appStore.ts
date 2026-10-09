/**
 * Links out to the App Store and the podcast. Every App Store link carries
 * a campaign token (ct) under TroyStack's provider token (pt), so App Store
 * Connect's campaign report shows which part of the site sent each install.
 * Tokens stay under Apple's 40-character limit and all start with "webapp".
 */

export const APP_STORE_ID = '6757343766';
const PROVIDER_TOKEN = '96487801';

export type Campaign =
  | 'webapp-home'
  | 'webapp-nav'
  | 'webapp-sidebar'
  | 'webapp-trial'
  | 'webapp-troy-limit'
  | 'webapp-troy-history'
  | 'webapp-signal'
  | 'webapp-podcast'
  | 'webapp-prices'
  | 'webapp-alerts'
  | 'webapp-stack'
  | 'webapp-tools'
  | 'webapp-vault'
  | 'webapp-getapp'
  | 'webapp-footer'
  | 'webapp-settings'
  | 'webapp-auth';

export function appStoreUrl(campaign: Campaign, qr = false): string {
  const ct = qr ? `${campaign}-qr` : campaign;
  return `https://apps.apple.com/app/apple-store/id${APP_STORE_ID}?pt=${PROVIDER_TOKEN}&ct=${encodeURIComponent(ct)}&mt=8`;
}

/** Apple Podcasts listing for The Stack Signal. */
export const PODCAST_APPLE_URL = 'https://podcasts.apple.com/us/podcast/id6815980718';
export const PODCAST_RSS_URL = 'https://api.troystack.ai/v1/podcast/feed.xml';

export const SUPPORT_EMAIL = 'support@troystack.com';
export const PRIVACY_URL = 'https://troystack.com/privacy';
export const TERMS_URL = 'https://troystack.com/terms';

/**
 * Gold's price and trial, as set in App Store Connect. Both plans carry a
 * one-week free introductory offer for new subscribers.
 */
export const GOLD = {
  monthly: '$4.99',
  yearly: '$39.99',
  trialDays: 7,
} as const;

/** True on iPhone, iPad and iPod, where the App Store link opens the store. */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}
