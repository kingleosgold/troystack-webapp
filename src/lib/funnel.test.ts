import { afterEach, describe, expect, it, vi } from 'vitest';
import { countStep, isAutomated } from './funnel';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 16; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const CUBOT = 'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

describe('isAutomated', () => {
  it('lets people through', () => {
    for (const ua of [CHROME, IPHONE, ANDROID, CUBOT]) expect(isAutomated({ userAgent: ua, webdriver: false })).toBe(false);
  });

  it('skips the visitors that filled the first week', () => {
    for (const ua of [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Reflectionbot/1.0; +https://reflection.ai/bot) Chrome/151.0.0.0 Safari/537.36',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'curl/8.5.0',
    ]) expect(isAutomated({ userAgent: ua, webdriver: false })).toBe(true);
  });

  it('skips the fetchers and speed tests that never say bot', () => {
    for (const ua of [
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GoogleOther) Chrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 (compatible; Google-Read-Aloud; +https://support.google.com/webmasters/answer/1061943)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 PTST/250101.120000',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 GTmetrix',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 vercel-screenshot/1.0',
    ]) expect(isAutomated({ userAgent: ua, webdriver: false })).toBe(true);
  });

  it('lets people in an app\'s own browser through', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0.0 (iPhone16,2; iOS 18_7; en_US; en; scale=3.00; 1290x2796; 700000000)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0.0;FBBV/700000000;FBDV/iPhone16,2;FBMD/iPhone;FBSN/iOS;FBSV/18.7;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
      'Mozilla/5.0 (Linux; Android 16; SM-S921U Build/BP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0.0.0.0;]',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/11.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/390.0.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36 Reddit/Version 2026.40.0/Build 2400000/Android 16',
    ]) expect(isAutomated({ userAgent: ua, webdriver: false })).toBe(false);
  });

  it('skips a browser driven by automation whatever it calls itself', () => {
    expect(isAutomated({ userAgent: CHROME, webdriver: true })).toBe(true);
  });

  it('skips when there is no navigator', () => {
    expect(isAutomated(undefined)).toBe(true);
  });
});

describe('countStep', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends nothing from an automated browser', () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('navigator', { userAgent: CHROME, webdriver: true });
    countStep('gold_view', null, 'webapp-gold');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("counts a person's step", () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('navigator', { userAgent: IPHONE, webdriver: false });
    countStep('plan_tap', 'yearly', 'webapp-gold');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ step: 'plan_tap', plan: 'yearly', campaign: 'webapp-gold' });
  });
});
