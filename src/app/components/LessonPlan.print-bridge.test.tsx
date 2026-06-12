/**
 * Print-bridge regression tests: when Pipeline A artifacts are present the
 * lesson-plan print bundle must render the text-specific artifact pages, and
 * when they are absent the heuristic Pipeline B templates must still appear.
 *
 * Rendered with react-dom/server (no jsdom needed) — we assert on the static
 * markup, which is exactly what the print pipeline consumes.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonPlan } from './LessonPlan';
import type {
  ArtifactPayload,
  ArtifactType,
  GraphicOrganizer,
  SentenceStems,
  VocabularyPreview,
  DiscussionProtocol,
  SinglePointRubric,
} from '../../lib/llm/artifactSchemas';
import type { LessonPlanData } from '../../types';

const basePlan: LessonPlanData = {
  title: 'The Leap: Cite Evidence of Character Motivation',
  gradeLevel: 'Grade 9',
  subject: 'ELA',
  duration: '55 minutes',
  standard: 'CCSS.ELA-LITERACY.RL.9-10.1',
  objectives: [
    'Students will cite strong textual evidence to support analysis of character motivation (DOK 3).',
  ],
  materials: ['Copies of "The Leap"', 'Note-catchers'],
  procedure: [
    {
      phase: 'launch',
      step: 'Launch',
      description: 'Quick-write on risk and family loyalty.',
      teacherMoves: {
        launch: 'Project the quick-write and say: "Write about a risk someone took for family."',
        duringWork: 'Confer with the two flagged pairs first; listen for students naming motivation.',
        checkForUnderstanding: 'Scan quick-writes for one concrete example before sharing out.',
        ifStuck: 'Offer the sentence frame card and a 30-second partner rehearsal.',
        ifAhead: 'Ask the student to connect their example to the title "The Leap".',
        transition: 'Chime, then pivot to the anchor chart to frame the reading.',
      },
    },
  ],
  assessment: 'Exit ticket citing two pieces of evidence.',
  successCriteria: ['I can cite evidence that supports my claim.'],
  supports: {
    all: ['Anchor chart of CER moves'],
    el: ['Sentence frames: "The author states ___, which shows ___."'],
    iep504: ['Chunked text with line numbers'],
  },
} as LessonPlanData;

const organizer: GraphicOrganizer = {
  title: 'Evidence Grid for "The Leap"',
  purpose: 'Track motivation evidence across the three flashback scenes before drafting the CER paragraph.',
  layout: 'evidence_grid',
  cells: [
    {
      label: 'Claim about Anna',
      prompt: 'What does Anna value most? State your claim about her motivation.',
      sentenceStem: 'Anna is motivated by ___ because ___.',
      wordBank: ['sacrifice', 'devotion'],
    },
    {
      label: 'Strongest Evidence',
      prompt: 'Quote the line from "The Leap" that best supports your claim. Include the paragraph number.',
      sentenceStem: '',
      wordBank: [],
    },
    {
      label: 'Reasoning',
      prompt: 'Explain how the quote proves your claim about her motivation.',
      sentenceStem: 'This shows ___ because ___.',
      wordBank: [],
    },
  ],
  teacherNotes: 'Introduce after the first read. Watch for students quoting plot summary instead of motivation evidence. EL emerging students may complete the claim cell orally first.',
};

const stems: SentenceStems = {
  title: 'Talk Stems for Citing Evidence in "The Leap"',
  pairing: 'text_dependent',
  rows: [
    {
      audience: 'all',
      function: 'Citing evidence',
      stems: ['The author states ___, which shows ___.', 'In paragraph ___, the narrator reveals ___.'],
    },
    {
      audience: 'el_emerging',
      function: 'Citing evidence',
      stems: ['I see ___ on page ___.', 'The text says ___.'],
    },
    {
      audience: 'iep_504',
      function: 'Explaining reasoning',
      stems: ['This matters because ___.', 'My evidence proves ___.'],
    },
  ],
  usageNote: 'Model the "all" row during the launch. Require one stem in the written CER. Fade by week three.',
};

const vocab: VocabularyPreview = {
  title: 'Vocabulary Preview: "The Leap"',
  terms: [
    {
      term: 'extricate',
      studentDefinition: 'To free someone or something from a tangled or difficult situation.',
      exampleFromText: '"...she could not extricate herself from the netting..."',
      cognate: 'Spanish: false cognate (extricar is rare; use "liberar")',
      quickCheck: 'Tell your partner about a time you had to extricate yourself from a plan.',
    },
    {
      term: 'commemorates',
      studentDefinition: 'Honors the memory of a person or event.',
      exampleFromText: 'The statue commemorates the circus fire.',
      cognate: 'Spanish: conmemorar',
      quickCheck: 'What does the town commemorate, and why?',
    },
    {
      term: 'tentative',
      studentDefinition: 'Unsure; done without confidence.',
      exampleFromText: 'Her tentative steps on the wire.',
      cognate: 'Spanish: tentativo',
      quickCheck: 'Show me a tentative gesture.',
    },
    {
      term: 'perpetually',
      studentDefinition: 'Happening all the time; never ending.',
      exampleFromText: 'The mother is perpetually calm in emergencies.',
      cognate: 'Spanish: perpetuamente',
      quickCheck: 'Name something you do perpetually.',
    },
  ],
  routine: 'Run the six-step preview before the first read: describe, restate, image, discuss, re-engage, game. Pair EL students for the discuss step.',
};

const protocol: DiscussionProtocol = {
  title: 'Save the Last Word: Anna\'s Motivation',
  structure: 'save_the_last_word',
  drivingQuestion: 'Which single act in "The Leap" best reveals what Anna values, and how do you know?',
  timeMinutes: 18,
  roles: [
    {
      name: 'Reader',
      responsibility: 'Shares a chosen quote without explaining it yet.',
      promptStems: ['The line I chose is ___.', 'Listen for what this might reveal.'],
    },
    {
      name: 'Responder',
      responsibility: 'Interprets the quote before the Reader explains.',
      promptStems: ['I think this shows ___.', 'This connects to ___ because ___.'],
    },
  ],
  accountability: 'Each student submits their quote card with one sentence of reasoning at the end of the rotation.',
  elSupport: 'Provide the driving question in writing before the protocol. Allow 60 seconds of silent think-time and a bilingual quote card for emerging ELs.',
};

const rubric: SinglePointRubric = {
  title: 'Single-Point Rubric: Citing Evidence of Motivation',
  standardCode: 'CCSS.ELA-LITERACY.RL.9-10.1',
  objective: 'Cite strong textual evidence to support analysis of character motivation.',
  criteria: [
    {
      criterion: 'Evidence Selection',
      proficient: 'Quotes the line that most directly reveals motivation and names its location.',
      growthCue: 'Re-read the flashback scenes and choose a line about why she acts, not what she does.',
      extensionCue: 'Pair two quotes from different scenes to show a pattern.',
    },
    {
      criterion: 'Reasoning',
      proficient: 'Explains how the quote proves the claim without retelling the plot.',
      growthCue: 'Add a sentence starting with "This proves..." after your quote.',
      extensionCue: 'Address a counter-reading of the same quote.',
    },
    {
      criterion: 'Claim Clarity',
      proficient: 'States a debatable claim about what Anna values.',
      growthCue: 'Make sure your claim is arguable, not a fact from the story.',
      extensionCue: 'Qualify your claim with a condition or exception.',
    },
  ],
  studentSelfCheck: [
    'I can point to the exact line my claim depends on.',
    'I can explain my evidence without retelling the story.',
    'I can state my claim in one sentence.',
  ],
};

const allArtifacts: Partial<Record<ArtifactType, ArtifactPayload>> = {
  graphic_organizer: { type: 'graphic_organizer', data: organizer },
  sentence_stems: { type: 'sentence_stems', data: stems },
  vocabulary_preview: { type: 'vocabulary_preview', data: vocab },
  discussion_protocol: { type: 'discussion_protocol', data: protocol },
  single_point_rubric: { type: 'single_point_rubric', data: rubric },
};

function render(artifacts?: Partial<Record<ArtifactType, ArtifactPayload>>) {
  return renderToStaticMarkup(<LessonPlan {...basePlan} artifacts={artifacts} />);
}

describe('LessonPlan print bridge (Pipeline A artifacts)', () => {
  it('renders all five artifact pages when artifacts are present', () => {
    const html = render(allArtifacts);
    // Graphic organizer: artifact title + cell labels replace the heuristic template
    expect(html).toContain('Evidence Grid for');
    expect(html).toContain('Claim about Anna');
    // Sentence stems: differentiated audience badges
    expect(html).toContain('Talk Stems for Citing Evidence');
    expect(html).toContain('ML — Emerging');
    expect(html).toContain('IEP / 504');
    // Vocabulary preview: text-specific terms with cognates
    expect(html).toContain('extricate');
    expect(html).toContain('conmemorar');
    // Discussion protocol: driving question + roles
    expect(html).toContain('Which single act in');
    expect(html).toContain('Responder');
    // Single-point rubric: three-column layout with criteria
    expect(html).toContain('Proficient — the target');
    expect(html).toContain('Evidence Selection');
    expect(html).toContain('I can point to the exact line my claim depends on.');
  });

  it('replaces the heuristic graphic organizer and sentence frames when artifacts exist', () => {
    const html = render(allArtifacts);
    // Heuristic organizer headers should not render
    expect(html).not.toContain('Use this organizer to structure your thinking before you write or share.');
    // Legacy sentence-frame fallback copy should not render
    expect(html).not.toContain('Use these frames to help structure your responses');
  });

  it('falls back to heuristic templates when no artifacts are present', () => {
    const html = render(undefined);
    // Heuristic organizer (CER, because objectives say "cite evidence")
    expect(html).toContain('Use this organizer to structure your thinking before you write or share.');
    // Legacy sentence-frames page driven by supports
    expect(html).toContain('Sentence Starters &amp; Frames');
    // No artifact-only pages
    expect(html).not.toContain('Driving question');
    expect(html).not.toContain('Proficient — the target');
  });

  it('falls back per-artifact: missing stems artifact keeps legacy frames page', () => {
    const html = render({
      graphic_organizer: { type: 'graphic_organizer', data: organizer },
    });
    expect(html).toContain('Claim about Anna');
    expect(html).toContain('Sentence Starters &amp; Frames');
  });

  it('renders the teacherMoves micro-grid on procedure steps that carry one', () => {
    const html = render(undefined);
    expect(html).toContain('During Work');
    expect(html).toContain('Check for Understanding');
    expect(html).toContain('If Stuck');
    expect(html).toContain('If Ahead');
    expect(html).toContain('Write about a risk someone took for family.');
    expect(html).toContain('Confer with the two flagged pairs first');
  });
});
