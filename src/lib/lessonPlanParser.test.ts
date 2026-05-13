import { describe, expect, it } from 'vitest';

import {
  extractLessonPlanFromResponse,
  extractQuickReplies,
  isWaitingForTextSelection,
  parseTurn,
  stripHiddenBlocks,
} from './lessonPlanParser';

describe('lessonPlanParser', () => {
  it('round-trips tagged JSON and strips markdown from plan fields', () => {
    const raw = `
Here is the plan.

[LESSON_PLAN_JSON]
{
  "title": "**Evidence Lesson**",
  "gradeLevel": "9th grade",
  "subject": "ELA",
  "duration": "60 minutes",
  "objectives": [{"text": "**Analyze** evidence", "dok": 3, "verb": "analyze"}],
  "procedure": [
    {"phase": "launch", "step": "**Launch**", "description": "**Preview** the text with students."}
  ],
  "assessment": "Exit slip"
}
[/LESSON_PLAN_JSON]`;

    const plan = extractLessonPlanFromResponse(raw);
    expect(plan?.title).toBe('Evidence Lesson');
    expect(typeof plan?.objectives?.[0]).toBe('object');
    expect(plan?.procedure?.[0]?.step).toBe('Launch');
    expect(plan?.procedure?.[0]?.description).toBe('Preview the text with students.');

    const turn = parseTurn(raw);
    expect(turn.visibleContent).not.toContain('[LESSON_PLAN_JSON]');
  });

  it('does not mine markdown-only lesson prose as a plan', () => {
    const markdown = `
## Lesson Preview
- Objective: Students will analyze evidence.
- Procedure: Launch, model, guided practice.
`;
    expect(extractLessonPlanFromResponse(markdown)).toBeNull();
  });

  it('parses and strips quick replies', () => {
    const raw = `How long is class?

[QUICK_REPLIES]
{"prompt":"Class duration?","kind":"duration","options":["45 min","60 min"]}
[/QUICK_REPLIES]`;

    const replies = extractQuickReplies(raw);
    expect(replies?.options.map((option) => option.label)).toEqual(['45 min', '60 min']);
    expect(stripHiddenBlocks(raw)).toBe('How long is class?');
  });

  it('detects text-selection waiting turns', () => {
    const raw = `
Before I build your lesson, let's choose your text. Here are 3 options:

Option 1: A student-facing poem
Option 2: A primary source
Option 3: A CommonLit article

Which text would you like me to build the lesson around?`;

    expect(isWaitingForTextSelection(raw)).toBe(true);
  });
});
