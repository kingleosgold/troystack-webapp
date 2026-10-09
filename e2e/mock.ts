import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => fs.readFileSync(path.join(DIR, name), 'utf8');

export const USER_ID = '7b1c6c1e-1111-4a2b-9c3d-000000000001';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export interface MockOptions {
  /** What GET /v1/troy/ask/status answers. null means the route isn't live yet (404). */
  visitorQuota?: { questionsUsed: number; questionsLimit: number; resetsAt: string } | null;
  conversations?: number;
  holdings?: Array<Record<string, unknown>>;
  tier?: 'free' | 'gold' | 'lifetime';
  /** How many holdings inserts fail before they start working. */
  failInserts?: number;
  /** How many visitor questions fail with a server error before they start working. */
  failAsks?: number;
  /** A signed-in free account that has used today's questions. */
  chatLimitReached?: boolean;
  /** Deleting a Troy chat fails, as when the connection drops. */
  failDeletes?: boolean;
  /** How many chat deletes fail before they start working. */
  failDeletesTimes?: number;
  /** Deletes answer 404, as for a chat already deleted in the app. */
  deletesGone?: boolean;
  /** Saved chats don't finish loading until the test calls releaseChatLoads. */
  holdChatLoads?: boolean;
  /** GET /v1/sync-subscription fails, as when the API is down. */
  failSync?: boolean;
  /** The subscription status verify-session reports, 'active' for someone who had Gold before. */
  verifyStatus?: string;
  /** Counting a receipt scan fails, as when the API is down. */
  failScanCount?: boolean;
  /** Checkout answers 409, as the API does for an account that already holds a plan. */
  checkoutConflict?: boolean;
  /** Reading the profile row fails, so the plan can't be read. */
  failProfileRead?: boolean;
  /** Metals the prices answer leaves out, as when a feed is down for one. */
  missingPrices?: Array<'gold' | 'silver' | 'platinum' | 'palladium'>;
  /** The 30-day vault history request fails. */
  failVaultHistory?: boolean;
  /**
   * The profile reads Free until a sync after a checkout attempt puts back the
   * Gold the API knows about, as when the app wrote Free over a web plan and
   * the sign-in sync lost the race with the plan read.
   */
  syncRestoresGold?: boolean;
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

/** Answers every TroyStack API and Supabase request the site makes. */
export async function mockBackends(page: Page, opts: MockOptions = {}) {
  const quota = opts.visitorQuota === undefined ? { questionsUsed: 0, questionsLimit: 3, resetsAt: '2026-10-10T04:00:00Z' } : opts.visitorQuota;
  let asked = quota?.questionsUsed ?? 0;
  const calls: string[] = [];
  /** The body of every holdings insert, in order. */
  const inserts: unknown[] = [];
  /** Every holdings update, its query and body, in order. */
  const patches: Array<{ query: string; body: Record<string, unknown> }> = [];
  /** The body of every visitor question, in order. */
  const asks: Array<{ message: string; history: Array<{ role: string; content: string }> }> = [];
  let failures = opts.failInserts ?? 0;
  let askFailures = opts.failAsks ?? 0;
  let deleteFailures = opts.failDeletesTimes ?? 0;
  /** Messages saved in each Troy chat during the test, by conversation id. */
  const chats: Record<string, Array<Record<string, unknown>>> = {};
  /** Chats started during the test, newest first in the list. */
  const started: Array<Record<string, unknown>> = [];
  // While false, holdings writes fail the way a dropped connection does.
  let connectionUp = true;
  // The profile row. Verifying a checkout turns it to Gold, as the real route does.
  let profile: Record<string, unknown> = { subscription_tier: opts.tier ?? 'free', subscription_status: null, trial_end: null };
  let checkoutTried = false;
  let releaseChatLoads: () => void = () => undefined;
  const chatLoads = opts.holdChatLoads ? new Promise<void>((resolve) => { releaseChatLoads = resolve; }) : Promise.resolve();

  await page.route('https://api.troystack.ai/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    calls.push(`${req.method()} ${p}`);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (p === '/v1/prices') {
      const body = JSON.parse(read('prices.json')) as { prices: Record<string, unknown> };
      for (const m of opts.missingPrices ?? []) delete body.prices[m];
      return fulfillJson(route, body);
    }
    if (p === '/v1/sparkline-24h') return fulfillJson(route, read('sparkline.json'));
    if (p === '/v1/prices/history') return fulfillJson(route, read(url.searchParams.get('range') === 'ALL' || url.searchParams.get('range') === '5Y' ? 'history-all.json' : 'history-1y.json'));
    if (p === '/v1/historical-spot') return fulfillJson(route, { gold: 3980.1, silver: 47.2, platinum: 1500, palladium: 1050 });
    if (p === '/v1/vault-watch') {
      if (url.searchParams.get('days')) {
        if (opts.failVaultHistory) return fulfillJson(route, { error: 'Vault history unavailable' }, 500);
        return fulfillJson(route, read('vault-history.json'));
      }
      return fulfillJson(route, read('vault.json'));
    }
    if (p === '/v1/stack-signal/latest') return fulfillJson(route, read('latest.json'));
    if (p === '/v1/stack-signal') return fulfillJson(route, read('signal.json'));
    if (p.startsWith('/v1/stack-signal/')) return fulfillJson(route, read('article.json'));
    if (p === '/v1/podcast/feed.xml') return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/rss+xml' }, body: read('podcast.xml') });
    if (p === '/v1/dealer-prices/click') return fulfillJson(route, { success: true });

    if (p === '/v1/troy/ask/status') {
      if (!quota) return fulfillJson(route, { error: 'Not found' }, 404);
      return fulfillJson(route, { ...quota, questionsUsed: asked });
    }
    if (p === '/v1/troy/ask') {
      if (!quota) return fulfillJson(route, { error: 'Not found' }, 404);
      asks.push(req.postDataJSON());
      if (askFailures > 0) {
        askFailures -= 1;
        return fulfillJson(route, { error: 'Upstream timed out' }, 502);
      }
      if (asked >= quota.questionsLimit) {
        return fulfillJson(route, { error: 'Daily limit reached', questionsUsed: asked, questionsLimit: quota.questionsLimit, resetsAt: quota.resetsAt }, 429);
      }
      asked += 1;
      return fulfillJson(route, {
        reply: 'Gold is up **0.4%** at **$4,180.80** and silver is up **0.9%** at **$60.24**. The ratio sits near **69**.\n\nThe move came after the Fed minutes, and nothing in it changes the case for holding physical metal.',
        questionsUsed: asked,
        questionsLimit: quota.questionsLimit,
        resetsAt: quota.resetsAt,
      });
    }

    if (p === '/v1/troy/conversations' && req.method() === 'GET') {
      const n = opts.conversations ?? 0;
      return fulfillJson(route, {
        conversations: [...started, ...Array.from({ length: n }, (_, i) => ({
          id: `conv-${i}`,
          title: ['Silver ratio', 'Junk silver value', 'Maple vs Eagle', 'COMEX drain', 'Stack check'][i % 5],
          created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
          updated_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
        }))],
      });
    }
    if (p === '/v1/troy/conversations' && req.method() === 'POST') {
      const conv = { id: 'conv-new', title: 'New chat', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      started.push(conv);
      return fulfillJson(route, conv);
    }
    if (/^\/v1\/troy\/conversations\/[^/]+\/messages$/.test(p)) {
      if (opts.chatLimitReached) {
        return fulfillJson(route, { error: 'Daily question limit reached', questionsUsed: 3, questionsLimit: 3, resetsAt: '2026-10-10T04:00:00Z' }, 403);
      }
      const id = p.split('/')[4];
      const now = new Date().toISOString();
      const reply = { id: 'm-reply', role: 'assistant', content: 'Your stack is worth **$6,024** at spot, up **$84** today.', created_at: now };
      const asked = (req.postDataJSON() as { message?: string; content?: string } | null) ?? {};
      chats[id] = [...(chats[id] ?? []), { id: `m-q-${Date.now()}`, role: 'user', content: asked.message ?? asked.content ?? '', created_at: now }, reply];
      return fulfillJson(route, { message: reply, preview: null });
    }
    if (/^\/v1\/troy\/conversations\/[^/]+$/.test(p)) {
      const id = p.split('/').pop() as string;
      if (req.method() === 'GET') await chatLoads;
      if (req.method() === 'DELETE') {
        if (opts.failDeletes) return fulfillJson(route, { error: 'Could not delete' }, 500);
        if (deleteFailures > 0) {
          deleteFailures -= 1;
          return fulfillJson(route, { error: 'Could not delete' }, 500);
        }
        if (opts.deletesGone) return fulfillJson(route, { error: 'Conversation not found' }, 404);
        const at = started.findIndex((c) => c.id === id);
        if (at >= 0) started.splice(at, 1);
      }
      const saved = chats[id] ?? (id.startsWith('conv-') && id !== 'conv-new' ? [{ id: `m-${id}`, role: 'assistant', content: `Saved answer for ${id}.`, created_at: '2026-10-08T12:00:00Z' }] : []);
      return fulfillJson(route, { id, title: 'Silver ratio', created_at: '', updated_at: '', messages: saved });
    }
    if (p === '/v1/snapshots' || p.startsWith('/v1/snapshots/')) return fulfillJson(route, { success: true, snapshots: [] });
    if (p === '/v1/sync-subscription') {
      if (opts.failSync) return fulfillJson(route, { error: 'Failed to fetch subscription status' }, 500);
      if (opts.syncRestoresGold && checkoutTried) profile = { ...profile, subscription_tier: 'gold', subscription_status: 'active' };
      return fulfillJson(route, { user_id: USER_ID, subscription_tier: profile.subscription_tier, subscription_status: profile.subscription_status });
    }
    if (p === '/v1/stripe/verify-session') {
      const status = opts.verifyStatus ?? 'trialing';
      profile = { subscription_tier: 'gold', subscription_status: status, trial_end: status === 'trialing' ? new Date(Date.now() + 7 * 86400000).toISOString() : null };
      return fulfillJson(route, opts.verifyStatus ? { success: true, tier: 'gold', status } : { success: true, tier: 'gold' });
    }
    if (p === '/v1/scan-status') return fulfillJson(route, { scansUsed: 0, scansLimit: 5, resetsAt: '2026-11-01T00:00:00Z' });
    if (p === '/v1/increment-scan') {
      if (opts.failScanCount) return fulfillJson(route, { error: 'Failed to increment scan count' }, 500);
      return fulfillJson(route, { success: true, scansUsed: 1, scansLimit: 5, resetsAt: '2026-11-01T00:00:00Z' });
    }
    if (p === '/v1/scan-receipt') {
      return fulfillJson(route, { success: true, data: { dealer: 'APMEX', purchaseDate: '2026-10-01', items: [{ description: '1 oz Silver Eagle', metal: 'silver', ozt: 1, quantity: 10, unitPrice: 62.5 }] } });
    }
    if (p === '/v1/stripe/create-checkout-session') {
      checkoutTried = true;
      if (opts.checkoutConflict) return fulfillJson(route, { error: 'This account already has Gold' }, 409);
      return fulfillJson(route, { url: 'https://checkout.stripe.com/c/pay/e2e' });
    }

    return fulfillJson(route, { error: `No fixture for ${p}` }, 404);
  });

  await page.route('https://e2e.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname.startsWith('/rest/v1/profiles')) {
      if (opts.failProfileRead) return fulfillJson(route, { message: 'upstream connect error' }, 503);
      return fulfillJson(route, profile);
    }
    if (url.pathname.startsWith('/rest/v1/holdings')) {
      if (req.method() === 'GET') return fulfillJson(route, opts.holdings ?? []);
      if (req.method() === 'POST') {
        inserts.push(req.postDataJSON());
        if (!connectionUp) return route.abort('internetdisconnected');
        if (failures > 0) {
          failures -= 1;
          return fulfillJson(route, { code: '57014', message: 'canceling statement due to statement timeout' }, 500);
        }
        return fulfillJson(route, [], 201);
      }
      if (req.method() === 'PATCH') patches.push({ query: decodeURIComponent(url.search), body: req.postDataJSON() });
      if (!connectionUp) return route.abort('internetdisconnected');
      return fulfillJson(route, [], 200);
    }
    if (url.pathname.startsWith('/auth/v1/user')) return fulfillJson(route, sessionUser());
    // Email and password sign-in on the page itself, with no reload.
    if (url.pathname === '/auth/v1/token' && req.method() === 'POST') return fulfillJson(route, sessionFor());
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
    return fulfillJson(route, {});
  });

  // Anything else outside the site (images, Stripe, Apple) stays offline.
  await page.route(/^https:\/\/(?!api\.troystack\.ai|e2e\.supabase\.co)/, (route) => route.abort());

  return {
    calls,
    inserts,
    patches,
    asks,
    setConnection(up: boolean) {
      connectionUp = up;
    },
    releaseChatLoads() {
      releaseChatLoads();
    },
  };
}

function sessionUser() {
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'stacker@example.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [{ provider: 'email' }],
    created_at: '2026-01-01T00:00:00Z',
  };
}

function sessionFor() {
  return {
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
    refresh_token: 'e2e-refresh-token',
    user: sessionUser(),
  };
}

/**
 * Puts a signed-in session where supabase-js looks for it, before the page
 * loads. With `once`, only the first page load of the test gets it, so a
 * sign-out that reloads the page stays signed out.
 */
export async function signIn(page: Page, { once = false }: { once?: boolean } = {}) {
  const session = sessionFor();
  await page.addInitScript(
    ({ value, once }) => {
      if (once) {
        if (sessionStorage.getItem('e2e_signed_in')) return;
        sessionStorage.setItem('e2e_signed_in', '1');
      }
      localStorage.setItem('sb-e2e-auth-token', value);
      localStorage.setItem('troy_ai_consent_v1', '{"version":1}');
    },
    { value: JSON.stringify(session), once },
  );
}

export const SAMPLE_HOLDINGS = [
  { id: 'r1', user_id: USER_ID, metal: 'silver', type: 'American Silver Eagle', weight: 1, weight_unit: 'oz', quantity: 60, purchase_price: 36.5, purchase_date: '2026-02-11', notes: '{"local_id":1700000000001,"source":"APMEX","shipping":9.95}', created_at: '2026-02-11T00:00:00Z', updated_at: '2026-02-11T00:00:00Z' },
  { id: 'r2', user_id: USER_ID, metal: 'gold', type: 'Gold Maple Leaf', weight: 1, weight_unit: 'oz', quantity: 1, purchase_price: 3480, purchase_date: '2026-01-05', notes: null, created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
];
