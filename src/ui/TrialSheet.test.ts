// @vitest-environment happy-dom
import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutCampaign, WebPlan } from '../lib/checkout';
import { TrialSheet } from './TrialSheet';

// Lets act() flush effects without React warning that this isn't a test setup.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The sheet's funnel counts, checked without a browser. Each test sets who is
// signed in, how far their plan has loaded and what device this is, then
// reads every count the sheet sent, so a stray one fails the test too.

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  planLoading: false,
  isGold: false,
  iphone: false,
  android: false,
}));

const counts = vi.hoisted(() => [] as unknown[][]);
const openCheckout = vi.hoisted(() => vi.fn());

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.user, session: state.user ? { access_token: 'token' } : null }),
}));

vi.mock('../hooks/useSubscription', () => ({
  useSubscription: () => ({ isGold: state.isGold, loading: state.planLoading }),
}));

vi.mock('../lib/funnel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/funnel')>()),
  countStep: (...args: unknown[]) => {
    counts.push(args);
  },
}));

vi.mock('../lib/account', () => ({ stillSignedInAs: () => true }));

vi.mock('../lib/appStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/appStore')>()),
  isAppleMobile: () => state.iphone,
  isAndroid: () => state.android,
}));

// Every plan sells here, as on troystack.com.
vi.mock('../lib/checkout', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/checkout')>();
  return {
    ...real,
    webPlans: () => real.WEB_PLANS,
    webCheckoutReady: () => true,
    openCheckout,
    rememberCheckout: () => undefined,
  };
});

// The App Store buttons are their own component with their own counts.
vi.mock('./AppStore', () => ({ InstallPath: () => null }));

let root: Root;
let host: HTMLDivElement;

interface Opening {
  open?: boolean;
  campaign?: CheckoutCampaign;
  plan?: WebPlan;
  start?: boolean;
}

function render({ open = true, campaign = 'webapp-settings', plan, start }: Opening = {}) {
  act(() => {
    root.render(h(MemoryRouter, null, h(TrialSheet, { open, onClose: () => undefined, campaign, plan, start })));
  });
}

function button(name: string | RegExp): HTMLButtonElement {
  const hit = Array.from(document.querySelectorAll('button')).find((b) => (typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? '')));
  if (!hit) throw new Error(`no button ${String(name)}`);
  return hit;
}

async function click(b: HTMLButtonElement) {
  await act(async () => {
    b.click();
  });
}

beforeEach(() => {
  state.user = { id: 'user-1' };
  state.planLoading = false;
  state.isGold = false;
  state.iphone = false;
  state.android = false;
  counts.length = 0;
  openCheckout.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the sheet counts its view', () => {
  it('sends no view for a Gold account', () => {
    state.isGold = true;
    render();
    render();
    expect(counts).toEqual([]);
  });

  it('sends nothing while the plan loads, then nothing once it lands as Gold', () => {
    state.planLoading = true;
    render();
    expect(counts).toEqual([]);
    state.planLoading = false;
    state.isGold = true;
    render();
    expect(counts).toEqual([]);
  });

  it('counts a slow plan load once, after it lands', () => {
    state.planLoading = true;
    render();
    render();
    expect(counts).toEqual([]);
    state.planLoading = false;
    render();
    render();
    expect(counts).toEqual([['gold_view', null, 'webapp-settings']]);
  });

  it('counts a guest who signs in while the sheet is open once, not again when their plan lands', () => {
    state.user = null;
    render();
    state.user = { id: 'user-1' };
    state.planLoading = true;
    render();
    state.planLoading = false;
    render();
    expect(counts).toEqual([['gold_view', null, 'webapp-settings']]);
  });

  it('counts a plan that reloads under an open sheet once', () => {
    render();
    state.planLoading = true;
    render();
    state.planLoading = false;
    render();
    expect(counts).toEqual([['gold_view', null, 'webapp-settings']]);
  });

  // The site remounts the sheet for each opening, so this checks the open
  // guard on its own rather than a lifecycle the site runs.
  it('counts nothing when the sheet closes before the plan loads', () => {
    state.planLoading = true;
    render();
    render({ open: false });
    state.planLoading = false;
    render({ open: false });
    expect(counts).toEqual([]);
  });

  it('counts a guest at once, since there is no plan to wait on', () => {
    state.user = null;
    state.planLoading = true;
    render();
    expect(counts).toEqual([['gold_view', null, 'webapp-settings']]);
  });

  it('leaves the view and the tap to the Gold page when a plan was picked on the way in', async () => {
    state.user = null;
    render({ campaign: 'webapp-gold', plan: 'monthly' });
    await click(button('Start my free week'));
    expect(counts).toEqual([]);
  });

  it('counts nothing when the Gold page starts checkout on its own', async () => {
    openCheckout.mockResolvedValue(true);
    await act(async () => {
      root.render(h(MemoryRouter, null, h(TrialSheet, { open: true, onClose: () => undefined, campaign: 'webapp-gold', plan: 'yearly', start: true })));
    });
    expect(openCheckout).toHaveBeenCalledTimes(1);
    expect(counts).toEqual([]);
  });
});

describe('on an iPhone', () => {
  beforeEach(() => {
    state.iphone = true;
  });

  it('counts the app view under -app and the card form under the campaign itself, once each', async () => {
    render();
    expect(counts).toEqual([['gold_view', null, 'webapp-settings-app']]);
    await click(button('Rather start it here with a card?'));
    render();
    expect(counts).toEqual([
      ['gold_view', null, 'webapp-settings-app'],
      ['gold_view', null, 'webapp-settings'],
    ]);
  });

  it('cuts a long site token so its -app view fits the API', () => {
    const long = `site-${'a'.repeat(32)}` as CheckoutCampaign;
    render({ campaign: long });
    expect(counts).toEqual([['gold_view', null, `site-${'a'.repeat(31)}-app`]]);
  });

  it('counts a tap from the card form under the plain campaign', async () => {
    state.user = null;
    render();
    await click(button('Rather start it here with a card?'));
    await click(button('Start my free week'));
    expect(counts).toEqual([
      ['gold_view', null, 'webapp-settings-app'],
      ['gold_view', null, 'webapp-settings'],
      ['plan_tap', 'yearly', 'webapp-settings'],
    ]);
  });
});

describe('the plan tap', () => {
  it('counts a retried tap on the same plan once', async () => {
    openCheckout.mockRejectedValue(new Error('Network down'));
    render();
    await click(button('Start my free week'));
    await click(button('Start my free week'));
    expect(openCheckout).toHaveBeenCalledTimes(2);
    expect(counts).toEqual([
      ['gold_view', null, 'webapp-settings'],
      ['plan_tap', 'yearly', 'webapp-settings'],
    ]);
  });

  it('counts a second plan picked in the same sheet as its own tap', async () => {
    openCheckout.mockRejectedValue(new Error('Network down'));
    render();
    await click(button('Start my free week'));
    await click(button(/^Monthly/));
    await click(button('Start my free week'));
    expect(counts).toEqual([
      ['gold_view', null, 'webapp-settings'],
      ['plan_tap', 'yearly', 'webapp-settings'],
      ['plan_tap', 'monthly', 'webapp-settings'],
    ]);
  });
});
