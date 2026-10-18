import { GOLD } from './appStore';
import { formatTimeET, todayET } from './text';

/**
 * What Troy's limit card says, in the same words as the iPhone app's
 * troyLimitPrompt (mobile-app/src/utils/troyChat.js in troystack-mobile).
 * Change one and change the other.
 */

export const TROY_GOLD_DAILY_QUESTIONS = 30;

// The calendar day after a YYYY-MM-DD date. Counted on the calendar, not as
// 24 hours, since a day with a clock change is 23 or 25.
function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** "at 9:14 PM ET", "tomorrow at 9:14 PM ET" or "Tuesday at 9:14 PM ET". Without a time, "tomorrow". */
export function troyResetLabel(iso: string | undefined, now = new Date()): string {
  const t = new Date(iso || NaN);
  if (!Number.isFinite(t.getTime())) return 'tomorrow';
  const time = formatTimeET(t);
  if (todayET(t) === todayET(now)) return `at ${time}`;
  if (todayET(t) === nextDay(todayET(now))) return `tomorrow at ${time}`;
  return `${t.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })} at ${time}`;
}

/**
 * visitor is someone not signed in. free is a signed-in account on the free
 * plan. other is Gold, or a plan that hasn't loaded yet, and gets the plain
 * note with nothing to buy.
 */
export type LimitAudience = 'visitor' | 'free' | 'other';

export interface LimitCopy {
  headline: string;
  body: string;
  /** Whether the card offers Gold's free week. */
  offerGold: boolean;
}

export function troyLimitCopy(quota: { questionsLimit: number; resetsAt?: string }, audience: LimitAudience, now = new Date()): LimitCopy {
  const limit = Number(quota.questionsLimit) || 0;
  const back = `They come back ${troyResetLabel(quota.resetsAt, now)}.`;
  if (audience === 'other') {
    return {
      headline: limit ? `That's today's ${limit} questions to Troy.` : "That's today's questions to Troy.",
      body: back,
      offerGold: false,
    };
  }
  const headline = limit ? `That's today's ${limit} free questions.` : "That's today's free questions.";
  if (audience === 'visitor') {
    return { headline, body: `${back} A free account gets you three more a day, with your stack in context.`, offerGold: true };
  }
  return {
    headline,
    body: `${back} Gold gives you ${TROY_GOLD_DAILY_QUESTIONS} a day, and you can try it free for ${GOLD.trialDays} days.`,
    offerGold: true,
  };
}
