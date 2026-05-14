import { describe, expect, it } from 'vitest';

import {
  extractLessonPlanFromResponse,
  extractQuickReplies,
  extractTextOptions,
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

  it('extracts text options from a server-injected [TEXT_OPTIONS] block and surfaces them via parseTurn', () => {
    const raw = `Here are 3 great options for RL.9-10.1.

📚 Option 1: African American Poetry Collection
📚 Option 2: CommonLit Free Library
📚 Option 3: Library of Congress Civil Rights

Which one would you like to anchor the lesson?

[TEXT_OPTIONS]
{"options":[
  {"resourceId":"african_american_poetry_collection","title":"African American Poetry Collection","source":"OER Commons / Project Gutenberg","url":"https://www.gutenberg.org/ebooks/10031","rationale":"Culturally sustaining anchor text for RL.9-10.1.","accessibility":{"transcript":true,"audio":true}},
  {"resourceId":"commonlit_free_reading_passages_library","title":"CommonLit: Free Reading Passages Library","source":"CommonLit","url":"https://www.commonlit.org/en/library","rationale":"Built-in WIDA scaffolds + Spanish support."},
  {"resourceId":"library_of_congress_civil_rights","title":"LOC: Civil Rights Movement","source":"Library of Congress","url":"https://www.loc.gov/...","rationale":"Strong inference work."}
]}
[/TEXT_OPTIONS]`;

    const opts = extractTextOptions(raw);
    expect(opts).not.toBeNull();
    expect(opts).toHaveLength(3);
    expect(opts?.[0]?.resourceId).toBe('african_american_poetry_collection');
    expect(opts?.[0]?.selected).toBe(false);
    expect(opts?.[0]?.accessibility?.audio).toBe(true);
    expect(opts?.[1]?.title).toBe('CommonLit: Free Reading Passages Library');

    const visible = stripHiddenBlocks(raw);
    expect(visible).not.toContain('[TEXT_OPTIONS]');
    expect(visible).not.toContain('"resourceId"');
    expect(visible).toContain('Which one would you like');

    const turn = parseTurn(raw);
    expect(turn.plan?.textOptions).toHaveLength(3);
    expect(turn.plan?.textOptions?.[2]?.title).toBe('LOC: Civil Rights Movement');
  });

  it('returns null and leaves visible content untouched when no [TEXT_OPTIONS] block is present', () => {
    const raw = `Just a regular reply with no machine block.`;
    expect(extractTextOptions(raw)).toBeNull();
    expect(parseTurn(raw).plan?.textOptions).toBeUndefined();
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
