import { API_BASE } from './apiClient';
import type { WebPlan } from './checkout';

/**
 * Counts a step from the Gold page toward checkout, for the day, so the next
 * fix is picked by numbers. Only the step, the plan and the surface go, never
 * who sent it. The API counts the checkout it opens itself. A count that
 * fails is dropped, and keepalive lets one sent as the page leaves still go.
 */
export type FunnelStep = 'gold_view' | 'plan_tap' | 'signup';

export function countStep(step: FunnelStep, plan?: WebPlan | null, campaign?: string | null): void {
  try {
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
