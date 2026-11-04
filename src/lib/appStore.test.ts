import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAMPAIGNS, appStoreUrl } from './appStore';
import { siteCampaign } from './checkout';

// Apple drops a campaign token longer than 40 characters, and the API keeps a
// checkout or funnel campaign only when it matches this shape.
const APPLE_MAX = 40;
const API_SHAPE = /^[a-z0-9-]{1,40}$/;

const ct = (url: string) => new URL(url).searchParams.get('ct') ?? '';

describe('campaign tokens', () => {
  it.each(CAMPAIGNS)('%s is a webapp token that fits Apple and the API, QR code included', (campaign) => {
    expect(campaign).toMatch(/^webapp-[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const qr of [false, true]) {
      const token = ct(appStoreUrl(campaign, qr));
      expect(token.length).toBeLessThanOrEqual(APPLE_MAX);
      expect(token).toMatch(API_SHAPE);
    }
  });

  it('has no token twice', () => {
    expect(new Set(CAMPAIGNS).size).toBe(CAMPAIGNS.length);
  });

  it("keeps the longest site token troystack.com can send within Apple's limit, QR code included", () => {
    const longest = `site-${'a'.repeat(32)}`;
    expect(siteCampaign(longest)).toBe(longest);
    expect(siteCampaign(`${longest}a`)).toBeUndefined();
    const token = ct(appStoreUrl(siteCampaign(longest)!, true));
    expect(token.length).toBeLessThanOrEqual(APPLE_MAX);
    expect(token).toMatch(API_SHAPE);
  });

  it("names Safari's Smart App Banner token in the list, so it's held to the same limits", () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const meta = html.match(/<meta name="apple-itunes-app" content="([^"]*)"/)?.[1] ?? '';
    const banner = meta.replace(/&amp;/g, '&').match(/(?:^|[&,=\s])ct=([^&,\s]+)/)?.[1];
    expect(banner).toBeDefined();
    expect(CAMPAIGNS).toContain(banner);
  });
});
