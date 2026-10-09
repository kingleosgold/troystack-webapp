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
  tier?: 'free' | 'gold';
  /** How many holdings inserts fail before they start working. */
  failInserts?: number;
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
  let failures = opts.failInserts ?? 0;
  // The profile row. Verifying a checkout turns it to Gold, as the real route does.
  let profile: Record<string, unknown> = { subscription_tier: opts.tier ?? 'free', subscription_status: null, trial_end: null };

  await page.route('https://api.troystack.ai/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    calls.push(`${req.method()} ${p}`);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (p === '/v1/prices') return fulfillJson(route, read('prices.json'));
    if (p === '/v1/sparkline-24h') return fulfillJson(route, read('sparkline.json'));
    if (p === '/v1/prices/history') return fulfillJson(route, read(url.searchParams.get('range') === 'ALL' || url.searchParams.get('range') === '5Y' ? 'history-all.json' : 'history-1y.json'));
    if (p === '/v1/historical-spot') return fulfillJson(route, { gold: 3980.1, silver: 47.2, platinum: 1500, palladium: 1050 });
    if (p === '/v1/vault-watch') return fulfillJson(route, url.searchParams.get('days') ? read('vault-history.json') : read('vault.json'));
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
        conversations: Array.from({ length: n }, (_, i) => ({
          id: `conv-${i}`,
          title: ['Silver ratio', 'Junk silver value', 'Maple vs Eagle', 'COMEX drain', 'Stack check'][i % 5],
          created_at: new Date(Date.now() - i * 86400000).toISOString(),
          updated_at: new Date(Date.now() - i * 86400000).toISOString(),
        })),
      });
    }
    if (p === '/v1/troy/conversations' && req.method() === 'POST') {
      return fulfillJson(route, { id: 'conv-new', title: 'New chat', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    if (/^\/v1\/troy\/conversations\/[^/]+\/messages$/.test(p)) {
      return fulfillJson(route, {
        message: { id: 'm-reply', role: 'assistant', content: 'Your stack is worth **$6,024** at spot, up **$84** today.', created_at: new Date().toISOString() },
        preview: null,
      });
    }
    if (/^\/v1\/troy\/conversations\/[^/]+$/.test(p)) {
      return fulfillJson(route, { id: p.split('/').pop(), title: 'Silver ratio', created_at: '', updated_at: '', messages: [] });
    }
    if (p === '/v1/snapshots' || p.startsWith('/v1/snapshots/')) return fulfillJson(route, { success: true, snapshots: [] });
    if (p === '/v1/sync-subscription') return fulfillJson(route, { user_id: USER_ID, subscription_tier: profile.subscription_tier, subscription_status: profile.subscription_status });
    if (p === '/v1/stripe/verify-session') {
      profile = { subscription_tier: 'gold', subscription_status: 'trialing', trial_end: new Date(Date.now() + 7 * 86400000).toISOString() };
      return fulfillJson(route, { success: true, tier: 'gold' });
    }
    if (p === '/v1/scan-status') return fulfillJson(route, { scansUsed: 0, scansLimit: 5, resetsAt: '2026-11-01T00:00:00Z' });
    if (p === '/v1/stripe/create-checkout-session') return fulfillJson(route, { url: 'https://checkout.stripe.com/c/pay/e2e' });

    return fulfillJson(route, { error: `No fixture for ${p}` }, 404);
  });

  await page.route('https://e2e.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname.startsWith('/rest/v1/profiles')) return fulfillJson(route, profile);
    if (url.pathname.startsWith('/rest/v1/holdings')) {
      if (req.method() === 'GET') return fulfillJson(route, opts.holdings ?? []);
      if (req.method() === 'POST') {
        inserts.push(req.postDataJSON());
        if (failures > 0) {
          failures -= 1;
          return fulfillJson(route, { code: '57014', message: 'canceling statement due to statement timeout' }, 500);
        }
        return fulfillJson(route, [], 201);
      }
      return fulfillJson(route, [], 200);
    }
    if (url.pathname.startsWith('/auth/v1/user')) return fulfillJson(route, sessionUser());
    return fulfillJson(route, {});
  });

  // Anything else outside the site (images, Stripe, Apple) stays offline.
  await page.route(/^https:\/\/(?!api\.troystack\.ai|e2e\.supabase\.co)/, (route) => route.abort());

  return { calls, inserts };
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

/** Puts a signed-in session where supabase-js looks for it, before the page loads. */
export async function signIn(page: Page) {
  const session = {
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
    refresh_token: 'e2e-refresh-token',
    user: sessionUser(),
  };
  await page.addInitScript((value) => {
    localStorage.setItem('sb-e2e-auth-token', value);
    localStorage.setItem('troy_ai_consent_v1', '{"version":1}');
  }, JSON.stringify(session));
}

export const SAMPLE_HOLDINGS = [
  { id: 'r1', user_id: USER_ID, metal: 'silver', type: 'American Silver Eagle', weight: 1, weight_unit: 'oz', quantity: 60, purchase_price: 36.5, purchase_date: '2026-02-11', notes: '{"local_id":1700000000001,"source":"APMEX","shipping":9.95}', created_at: '2026-02-11T00:00:00Z', updated_at: '2026-02-11T00:00:00Z' },
  { id: 'r2', user_id: USER_ID, metal: 'gold', type: 'Gold Maple Leaf', weight: 1, weight_unit: 'oz', quantity: 1, purchase_price: 3480, purchase_date: '2026-01-05', notes: null, created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
];
