import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS shared with the build and the Vercel function
import * as shared from '../../api/_lib/signal-text.js';
import { usableOneLiner } from './signalApi';
import { plainDashes } from './text';

const samples = [
  '', 'Fed', 'Gold shines as', '  Gold shines as ',
  'Fed minutes hammered paper gold, but the PBOC tells the real story.',
  'Silver — the quiet one — moved 3–4% today, and stackers noticed it.',
  '— Gold held near record highs as yields eased again',
  'Gold, five words but short',
];

describe('the Signal text rules shared with the prerender and signal-html', () => {
  it('match the app', () => {
    for (const s of samples) {
      expect(shared.usableOneLiner(s)).toBe(usableOneLiner(s));
      expect(shared.plainDashes(s)).toBe(plainDashes(s));
    }
    expect(shared.usableOneLiner(null)).toBe('');
  });
});
