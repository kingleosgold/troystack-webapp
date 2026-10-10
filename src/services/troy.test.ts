import { describe, expect, it } from 'vitest';
import { answeredTurns, type TroyMessage } from './troy';

const msg = (role: TroyMessage['role'], content: string): TroyMessage => ({ id: content, role, content, created_at: '2026-10-09T14:00:00Z' });

describe("a visitor's history", () => {
  it('carries each answered question with its answer', () => {
    expect(answeredTurns([msg('user', 'Q1'), msg('assistant', 'A1'), msg('user', 'Q2'), msg('assistant', 'A2')])).toEqual([
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' },
    ]);
  });

  it("leaves out a question that was stopped or didn't get through", () => {
    expect(answeredTurns([msg('user', 'Stopped'), msg('user', 'Q2'), msg('assistant', 'A2'), msg('user', 'Unanswered')])).toEqual([
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' },
    ]);
    expect(answeredTurns([])).toEqual([]);
  });
});
