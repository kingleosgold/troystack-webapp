// @vitest-environment happy-dom
import { createElement as h, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goldTap, rememberGoldTap, type WebPlan } from '../lib/checkout';
import Gold from './Gold';

// Lets act() flush effects without React warning that this isn't a test setup.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The Gold page's own counts, checked without a browser. The page's taps go
// through the real remembered list in sessionStorage, so a back-out visit
// reads what this tab picked before, as it does live.

const state = vi.hoisted(() => ({ sold: ['yearly', 'monthly', 'lifetime'] as string[], gold: false, subLoading: false }));
const counts = vi.hoisted(() => [] as unknown[][]);
const openTrial = vi.hoisted(() => vi.fn());

vi.mock('../hooks/usePageMeta', () => ({ usePageMeta: () => undefined }));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false, sessionUnreadable: false }),
}));

vi.mock('../hooks/useSubscription', () => ({
  useSubscription: () => ({ isGold: state.gold, tier: state.gold ? 'gold' : 'free', loading: state.subLoading, unreadable: false }),
}));

vi.mock('../contexts/TrialContext', () => ({ useTrial: () => ({ openTrial }) }));

vi.mock('../lib/funnel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/funnel')>()),
  countStep: (...args: unknown[]) => {
    counts.push(args);
  },
}));

// Every plan sells here, as on troystack.com, unless a test narrows the list.
vi.mock('../lib/checkout', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/checkout')>();
  return {
    ...real,
    webPlans: () => real.WEB_PLANS.filter((p) => state.sold.includes(p.id)),
    // Like the real list, the page shows only the plans that sell while any do.
    goldPagePlans: () => {
      const sold = real.WEB_PLANS.filter((p) => state.sold.includes(p.id));
      return sold.length > 0 ? sold : real.WEB_PLANS;
    },
    webCheckoutReady: (plan?: WebPlan) => (plan ? state.sold.includes(plan) : state.sold.length > 0),
  };
});

let root: Root;
let host: HTMLDivElement;
const seen = { search: '' };

// Reads the address the page leaves behind after its own effects.
function Where() {
  const { search } = useLocation();
  useEffect(() => {
    seen.search = search;
  }, [search]);
  return null;
}

// A second call with the same path re-renders the mounted page, keeping its state.
function render(path: string) {
  act(() => {
    root.render(h(MemoryRouter, { initialEntries: [path] }, h(Gold), h(Where)));
  });
}

const HALF_HOUR = 30 * 60 * 1000;

const LABEL: Record<WebPlan, string> = { yearly: 'Yearly', monthly: 'Monthly', lifetime: 'Lifetime' };

// The plan cards are in the page's order, so a plan's button is found by the
// card label above it.
function tap(plan: WebPlan) {
  const card = Array.from(document.querySelectorAll('[aria-label="Plans"] > div')).find((c) => c.querySelector('span')?.textContent === LABEL[plan]);
  const b = card?.querySelector('button');
  if (!b) throw new Error(`no button for ${plan}`);
  act(() => {
    b.click();
  });
}

const taps = () => counts.filter((c) => c[0] === 'plan_tap');

beforeEach(() => {
  state.sold = ['yearly', 'monthly', 'lifetime'];
  state.gold = false;
  state.subLoading = false;
  seen.search = '';
  counts.length = 0;
  openTrial.mockReset();
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('a visit back from Stripe', () => {
  it('counts a page tap, a sheet switch and a page tap again once for each opening', () => {
    // Lifetime was picked before the back-out.
    rememberGoldTap('lifetime', 'webapp-gold');
    render('/gold?back=1');
    expect(counts).toEqual([]);

    // Yearly is new, so it counts, and the sheet hears both plans as counted.
    tap('yearly');
    expect(taps()).toEqual([['plan_tap', 'yearly', 'webapp-gold']]);
    expect(openTrial).toHaveBeenLastCalledWith(expect.objectContaining({ plan: 'yearly', counted: ['yearly', 'lifetime'] }));
    // The page remembers it, so the next back-out doesn't count it again.
    expect(goldTap()).toEqual({ plans: ['lifetime', 'yearly'], campaign: 'webapp-gold' });

    // The sheet counts monthly on its own and adds it to the remembered taps.
    rememberGoldTap('monthly', 'webapp-gold');

    // The page read its list once on landing, so monthly tapped on the page
    // opens a new sheet and counts again. Lifetime still doesn't.
    tap('monthly');
    tap('lifetime');
    expect(taps()).toEqual([
      ['plan_tap', 'yearly', 'webapp-gold'],
      ['plan_tap', 'monthly', 'webapp-gold'],
    ]);
    expect(openTrial).toHaveBeenLastCalledWith(expect.objectContaining({ plan: 'lifetime', counted: ['lifetime'] }));
    expect(counts.filter((c) => c[0] === 'gold_view')).toEqual([]);
  });

  it('takes back=1 off the address, keeping the campaign, so a reload counts', () => {
    render('/gold?campaign=site-pricing&back=1');
    expect(seen.search).toBe('?campaign=site-pricing');
  });

  it('counts the view and the tap again once the remembered tap is past the half hour', () => {
    rememberGoldTap('yearly', 'webapp-gold', Date.now() - HALF_HOUR - 1000);
    render('/gold?back=1');
    tap('yearly');
    expect(counts).toEqual([
      ['gold_view', null, 'webapp-gold'],
      ['plan_tap', 'yearly', 'webapp-gold'],
    ]);
  });

  it('still counts nothing again for a remembered tap just inside the half hour', () => {
    rememberGoldTap('yearly', 'webapp-gold', Date.now() - HALF_HOUR + 60_000);
    render('/gold?back=1');
    tap('yearly');
    expect(counts).toEqual([]);
  });

  it('counts nothing again for a site token whose earlier taps were under that same token', () => {
    rememberGoldTap('yearly', 'site-pricing');
    render('/gold?campaign=site-pricing&back=1');
    tap('yearly');
    expect(counts).toEqual([]);
    tap('monthly');
    expect(counts).toEqual([['plan_tap', 'monthly', 'site-pricing']]);
    expect(openTrial).toHaveBeenLastCalledWith(expect.objectContaining({ campaign: 'site-pricing', plan: 'monthly', counted: ['monthly', 'yearly'] }));
  });
});

describe('a fresh visit', () => {
  it('counts the view under the plain campaign where checkout runs here', () => {
    render('/gold');
    expect(counts).toEqual([['gold_view', null, 'webapp-gold']]);
  });

  it('counts the view and a tap again on a reload with no back=1, whatever this tab picked before', () => {
    rememberGoldTap('yearly', 'webapp-gold');
    render('/gold');
    tap('yearly');
    expect(counts).toEqual([
      ['gold_view', null, 'webapp-gold'],
      ['plan_tap', 'yearly', 'webapp-gold'],
    ]);
  });

  it('counts a back=1 landing under a site token when the earlier taps were under another campaign', () => {
    rememberGoldTap('yearly', 'webapp-gold');
    render('/gold?campaign=site-pricing&back=1');
    tap('yearly');
    expect(counts).toEqual([
      ['gold_view', null, 'site-pricing'],
      ['plan_tap', 'yearly', 'site-pricing'],
    ]);
    // The sheet and the remembered tap carry the site token too, so checkout
    // credits the link and a back-out from Stripe knows the tap counted.
    expect(openTrial).toHaveBeenLastCalledWith(expect.objectContaining({ campaign: 'site-pricing', plan: 'yearly', counted: ['yearly'] }));
    expect(goldTap()).toEqual({ plans: ['yearly'], campaign: 'site-pricing' });
  });
});

describe('a Gold account or a plan still loading', () => {
  it('shows a Gold account its plan with no plan buttons and counts no view', () => {
    state.gold = true;
    render('/gold');
    expect(document.querySelector('[aria-label="Plans"]')).toBeNull();
    expect(host.textContent).toContain('You have Gold on this account.');
    expect(counts).toEqual([]);
  });

  it('waits for the plan before counting the view, then counts it once', () => {
    state.subLoading = true;
    render('/gold');
    expect(counts).toEqual([]);
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[aria-label="Plans"] button'));
    expect(buttons).toHaveLength(3);
    expect(buttons.every((b) => b.disabled)).toBe(true);

    state.subLoading = false;
    render('/gold');
    expect(counts).toEqual([['gold_view', null, 'webapp-gold']]);

    // A plan that reloads and settles again doesn't count a second view.
    state.subLoading = true;
    render('/gold');
    state.subLoading = false;
    render('/gold');
    expect(counts).toEqual([['gold_view', null, 'webapp-gold']]);
  });

  it('counts no view when the plan comes back as Gold', () => {
    state.subLoading = true;
    render('/gold');
    state.gold = true;
    state.subLoading = false;
    render('/gold');
    expect(counts).toEqual([]);
  });
});

describe("where the web can't sell a plan", () => {
  it('counts the tap and sends the sheet to the app without starting checkout', () => {
    state.sold = [];
    render('/gold');
    expect(counts).toEqual([['gold_view', null, 'webapp-gold-app']]);

    tap('yearly');
    expect(taps()).toEqual([['plan_tap', 'yearly', 'webapp-gold']]);
    expect(openTrial).toHaveBeenCalledWith(expect.objectContaining({ plan: 'yearly', start: false, counted: ['yearly'] }));
  });

  it('shows only the plans the web sells when it sells some, and starts checkout on them', () => {
    state.sold = ['yearly', 'monthly'];
    render('/gold');
    expect(counts).toEqual([['gold_view', null, 'webapp-gold']]);
    expect(() => tap('lifetime')).toThrow('no button for lifetime');

    tap('monthly');
    expect(openTrial).toHaveBeenLastCalledWith(expect.objectContaining({ plan: 'monthly', start: true }));
    expect(taps()).toEqual([['plan_tap', 'monthly', 'webapp-gold']]);
  });
});
