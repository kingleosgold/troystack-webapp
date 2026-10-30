import { API_BASE } from './apiClient';
import type { WebPlan } from './checkout';

/**
 * Counts a step from the Gold page toward checkout, for the day, so the next
 * fix is picked by numbers. Only the step, the plan and the surface go, never
 * who sent it. The API counts the checkout it opens itself. A count that
 * fails is dropped, and keepalive lets one sent as the page leaves still go.
 */
export type FunnelStep = 'gold_view' | 'plan_tap' | 'signup';

// Crawlers, link previews and headless browsers render the Gold page too, and
// in its first week they were most of its views. Google's own fetchers,
// speed tests and Vercel's preview shots don't say bot, so they're named.
// Only a person's visit counts.
const AUTOMATED_UA = /bot\/|\+https?:|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|embedly|google-inspectiontool|googleother|google-read-aloud|ptst\/|gtmetrix|vercel-screenshot|^curl\/|^wget\/|python-|node-fetch|axios\//i;

export function isAutomated(nav: Pick<Navigator, 'userAgent' | 'webdriver'> | undefined): boolean {
  if (!nav) return true;
  return nav.webdriver === true || AUTOMATED_UA.test(nav.userAgent || '');
}

export function countStep(step: FunnelStep, plan?: WebPlan | null, campaign?: string | null): void {
  try {
    if (isAutomated(typeof navigator === 'undefined' ? undefined : navigator)) return;
    void fetch(`${API_BASE}/v1/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, ...(plan ? { plan } : {}), ...(campaign ? { campaign } : {}) }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // fetch missing or refused; the page goes on
  }
}
