import { describe, expect, it } from 'vitest';
import { greeting } from './text';

describe('the time-of-day greeting', () => {
  it('follows the hour on the date it is given, which is the viewer\'s local clock', () => {
    expect(greeting(new Date(2026, 9, 19, 9, 30))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 19, 14, 0))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 19, 19, 0))).toBe('Good evening');
    expect(greeting(new Date(2026, 9, 19, 2, 15))).toBe('Good evening');
  });
});
