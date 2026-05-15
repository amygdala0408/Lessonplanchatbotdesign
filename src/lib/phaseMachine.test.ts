import { describe, expect, it } from 'vitest';

import { nextPhase } from './phaseMachine';
import type { ChatTurnResult } from '../types';

function makeTurn(overrides: Partial<ChatTurnResult['signals']> = {}): ChatTurnResult {
  return {
    ok: true,
    rawResponse: '',
    visibleContent: '',
    signals: {
      isWaitingForTextSelection: false,
      containsLessonPlanDraft: false,
      hasJsonBlock: false,
      quickReplies: null,
      ...overrides,
    },
  };
}

describe('nextPhase — unit-context guard (Commit 4)', () => {
  it('blocks gathering -> text_selection when the model jumps straight to texts', () => {
    const transition = nextPhase({
      current: 'gathering',
      plan: { subject: 'ELA', gradeLevel: '9th grade', duration: '60 minutes' },
      turn: makeTurn({ isWaitingForTextSelection: true }),
      messages: [
        { role: 'user', content: '9th grade ELA, RL.9-10.1, 60 minutes. 28 students, 3 ELs at WIDA 3.' },
        { role: 'assistant', content: 'Here are three texts: ...' },
      ],
    });

    expect(transition.next).toBe('gathering');
    expect(transition.reason).toMatch(/unit-context/);
    expect(transition.toast?.kind).toBe('info');
  });

  it('allows gathering -> text_selection after a unit-context question + teacher reply', () => {
    const transition = nextPhase({
      current: 'gathering',
      plan: { subject: 'ELA', gradeLevel: '9th grade', duration: '60 minutes' },
      turn: makeTurn({ isWaitingForTextSelection: true }),
      messages: [
        { role: 'user', content: '9th grade ELA, RL.9-10.1, 60 minutes.' },
        {
          role: 'assistant',
          content:
            'Got it. Quick question before texts: is this a hook into a new unit, mid-unit deepening, or a transfer / assessment day?',
        },
        { role: 'user', content: 'Mid-unit, identity and belonging.' },
        { role: 'assistant', content: 'Here are three texts.' },
      ],
    });

    expect(transition.next).toBe('text_selection');
  });

  it('recognizes a unit-context question even when phrased with "where in the unit"', () => {
    const transition = nextPhase({
      current: 'gathering',
      plan: { subject: 'ELA' },
      turn: makeTurn({ isWaitingForTextSelection: true }),
      messages: [
        { role: 'user', content: '9th ELA RL.9-10.1 60 min' },
        { role: 'assistant', content: 'Where this lesson lands in the unit shapes the text pick — hook, mid-unit, or transfer?' },
        { role: 'user', content: 'mid-unit' },
        { role: 'assistant', content: 'Three options:' },
      ],
    });

    expect(transition.next).toBe('text_selection');
  });

  it('does not block when phase is already past gathering', () => {
    const transition = nextPhase({
      current: 'instructional_model',
      plan: { subject: 'ELA' },
      turn: makeTurn({ isWaitingForTextSelection: true }),
      messages: [{ role: 'user', content: 'go' }, { role: 'assistant', content: 'here' }],
    });

    expect(transition.next).toBe('text_selection');
  });

  it('falls through permissively when messages is omitted (legacy callers)', () => {
    const transition = nextPhase({
      current: 'gathering',
      plan: {},
      turn: makeTurn({ isWaitingForTextSelection: true }),
    });

    expect(transition.next).toBe('text_selection');
  });
});

describe('nextPhase — existing transitions still work', () => {
  it('stays in gathering when no signals fire', () => {
    const transition = nextPhase({
      current: 'gathering',
      plan: {},
      turn: makeTurn(),
      messages: [],
    });
    expect(transition.next).toBe('gathering');
  });

  it('advances text_selection -> instructional_model when a text is selected', () => {
    const transition = nextPhase({
      current: 'text_selection',
      plan: {
        textOptions: [
          { title: 'A', source: 's', lexile: '', url: 'u', rationale: '', selected: true },
          { title: 'B', source: 's', lexile: '', url: 'u', rationale: '', selected: false },
          { title: 'C', source: 's', lexile: '', url: 'u', rationale: '', selected: false },
        ],
      },
      turn: makeTurn(),
    });
    expect(transition.next).toBe('instructional_model');
  });

  it('complete is terminal', () => {
    const transition = nextPhase({
      current: 'complete',
      plan: {},
      turn: makeTurn({ isWaitingForTextSelection: true }),
    });
    expect(transition.next).toBe('complete');
  });
});
