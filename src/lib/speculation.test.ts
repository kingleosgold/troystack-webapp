import { describe, expect, it } from 'vitest';
import { scenario, targetContext } from './speculation';

describe('the what-if scenario', () => {
  it('values the stack at the targets and at spot', () => {
    const r = scenario(1, 100, 10000, 250, 4000, 50)!;
    expect(r.current).toBe(9000);
    expect(r.projected).toBe(35000);
    expect(r.gain).toBe(26000);
    expect(r.gainPct).toBeCloseTo((26000 / 9000) * 100, 6);
  });

  it('holds a metal with no target at spot', () => {
    const r = scenario(1, 100, 10000, 0, 4000, 50)!;
    expect(r.silverAt).toBe(50);
    expect(r.projected).toBe(15000);
  });

  it('shows a loss when a target is under spot', () => {
    const r = scenario(2, 0, 3000, 0, 4000, 50)!;
    expect(r.gain).toBe(-2000);
    expect(r.gainPct).toBe(-25);
  });

  it('ignores a target for a metal not held', () => {
    expect(scenario(1, 0, 0, 250, 4000, 50)).toBeNull();
    const r = scenario(1, 0, 5000, 250, 4000, 50)!;
    expect(r.projected).toBe(5000);
    expect(r.silverAt).toBe(0);
  });

  it('needs a live price only for the metals held', () => {
    expect(scenario(1, 0, 5000, 0, 4000, 0)!.current).toBe(4000);
    expect(scenario(1, 10, 5000, 0, 4000, 0)).toBeNull();
    expect(scenario(1, 0, 5000, 0, 0, 50)).toBeNull();
  });

  it('has nothing to say without a stack or a target', () => {
    expect(scenario(0, 0, 5000, 250, 4000, 50)).toBeNull();
    expect(scenario(1, 100, 0, 0, 4000, 50)).toBeNull();
  });
});

describe('a target against spot', () => {
  it('names the rise, the drop or that it is about there', () => {
    expect(targetContext('Gold', 10000, 4000)).toBe("Gold would have to rise 150% from today's spot.");
    expect(targetContext('Silver', 75, 50)).toBe("Silver would have to rise 50.0% from today's spot.");
    expect(targetContext('Gold', 3000, 4000)).toBe("That's 25.0% below today's spot.");
    expect(targetContext('Gold', 4050, 4000)).toBe('Gold is trading right around that today.');
  });
});
