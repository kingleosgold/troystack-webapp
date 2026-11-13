// @vitest-environment happy-dom
import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goldTap, rememberGoldTap, type WebPlan } from '../lib/checkout';
import Gold from './Gold';

// Lets act() flush effects without React warning that this isn't a test setup.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The Gold page's own counts, checked without a browser. The page's taps go
// through the real remembered list in sessionStorage, so a back-out visit
// reads what this tab picked before, as it does live.

const state = vi.hoisted(() => ({ sells: true }));
const counts = vi.hoisted(() => [] as unknown[][]);
const openTrial = vi.hoisted(() => vi.fn());

vi.mock('../hooks/usePageMeta', () => ({ usePageMeta: () => undefined }));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false, sessionUnreadable: false }),
}));

vi.mock('../hooks/useSubscription', () => ({
  useSubscription: () => ({ isGold: false, tier: 'free', loading: false, unreadable: false }),
}));

vi.mock('../contexts/TrialContext', () => ({ useTrial: () => ({ openTrial }) }));

vi.mock('../lib/funnel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/funnel')>()),
  countStep: (...args: unknown[]) => {
    counts.push(args);
  },
}));

// Every plan sells here, as on troystack.com, unless a test turns checkout off.
vi.mock('../lib/checkout', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/checkout')>();
  return {
    ...real,
    webPlans: () => (state.sells ? real.WEB_PLANS : []),
    goldPagePlans: () => real.WEB_PLANS,
    webCheckoutReady: () => state.sells,
  };
});

let root: Root;
let host: HTMLDivElement;

function render(path: string) {
  act(() => {
    root.render(h(MemoryRouter, { initialEntries: [path] }, h(Gold)));
  });
}

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
  state.sells = true;
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

describe("where the web can't sell a plan", () => {
  it('counts the tap and sends the sheet to the app without starting checkout', () => {
    state.sells = false;
    render('/gold');
    expect(counts).toEqual([['gold_view', null, 'webapp-gold-app']]);

    tap('yearly');
    expect(taps()).toEqual([['plan_tap', 'yearly', 'webapp-gold']]);
    expect(openTrial).toHaveBeenCalledWith(expect.objectContaining({ plan: 'yearly', start: false, counted: ['yearly'] }));
  });
});
