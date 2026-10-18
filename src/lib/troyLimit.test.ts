import { describe, expect, it } from 'vitest';
import { troyLimitCopy, troyResetLabel } from './troyLimit';

// 10:00 AM ET on Saturday Oct 31, 2026, the night before the clocks go back.
const now = new Date('2026-10-31T14:00:00Z');

describe('troyResetLabel', () => {
  it('says the time for later today', () => {
    expect(troyResetLabel('2026-10-31T23:05:00Z', now)).toBe('at 7:05 PM ET');
  });
  it('says tomorrow across a clock change, counted on the calendar', () => {
    // Sunday 11:30 PM ET is 28.5 hours after now, still tomorrow.
    expect(troyResetLabel('2026-11-02T04:30:00Z', now)).toBe('tomorrow at 11:30 PM ET');
  });
  it('names the weekday further out', () => {
    expect(troyResetLabel('2026-11-03T14:00:00Z', now)).toBe('Tuesday at 9:00 AM ET');
  });
  it('says tomorrow without a time', () => {
    expect(troyResetLabel(undefined, now)).toBe('tomorrow');
    expect(troyResetLabel('nope', now)).toBe('tomorrow');
  });
});

describe('troyLimitCopy', () => {
  const quota = { questionsLimit: 3, resetsAt: '2026-11-01T13:05:00Z' };

  it("says it the way the app does for a free account", () => {
    const c = troyLimitCopy(quota, 'free', now);
    expect(`${c.headline} ${c.body}`).toBe(
      "That's today's 3 free questions. They come back tomorrow at 8:05 AM ET. Gold gives you 30 a day, and you can try it free for 7 days.",
    );
    expect(c.offerGold).toBe(true);
  });

  it("never pitches Gold to someone at Gold's limit", () => {
    const c = troyLimitCopy({ questionsLimit: 30, resetsAt: quota.resetsAt }, 'other', now);
    expect(`${c.headline} ${c.body}`).toBe("That's today's 30 questions to Troy. They come back tomorrow at 8:05 AM ET.");
    expect(c.offerGold).toBe(false);
  });

  it('points a visitor to a free account', () => {
    const c = troyLimitCopy(quota, 'visitor', now);
    expect(c.body).toBe('They come back tomorrow at 8:05 AM ET. A free account gets you three more a day, with your stack in context.');
    expect(c.offerGold).toBe(true);
  });
});
