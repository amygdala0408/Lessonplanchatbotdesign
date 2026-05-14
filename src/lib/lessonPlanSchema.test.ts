import { describe, expect, it } from 'vitest';

import { validateLessonPlan } from './lessonPlanSchema';
import type { LessonPlanData } from '@/types';

const validPlan: LessonPlanData = {
  title: 'Reading Evidence in Harlem Renaissance Poetry',
  gradeLevel: '9th grade',
  subject: 'ELA',
  duration: '60 minutes',
  standard: {
    framework: 'CCSS',
    code: 'CCSS.ELA-LITERACY.RL.9-10.1',
    description: 'Cite strong and thorough textual evidence.',
  },
  instructionalModel: 'Explicit Instruction',
  objectives: [
    {
      text: 'Students will analyze how textual evidence supports an interpretation of a poem.',
      dok: 3,
      verb: 'analyze',
    },
  ],
  materials: ['Student-facing poem', 'CER reading companion'],
  procedure: [
    {
      phase: 'launch',
      step: 'Launch',
      description: 'Students preview the question and mark words they recognize.',
      accommodations: 'Preview vocabulary and provide visual agenda.',
    },
    {
      phase: 'model',
      step: 'Model',
      description: 'Teacher models citing one line and explaining its relevance.',
      accommodations: 'Think-aloud is chunked and paired with sentence frames.',
    },
    {
      phase: 'guided_practice',
      step: 'Guided Practice',
      description: 'Pairs choose evidence and rehearse an explanation orally.',
      accommodations: 'Strategic pairs use a claim-evidence-reasoning organizer.',
    },
    {
      phase: 'independent_practice',
      step: 'Independent Practice',
      description: 'Students independently write one evidence-based interpretation.',
      accommodations: 'Reduced-load option and checklist support organization.',
    },
    {
      phase: 'exit_slip',
      step: 'Exit Slip',
      description: 'Students submit one claim with one cited line and reasoning.',
      accommodations: 'Students may respond with sentence frames or oral rehearsal.',
    },
  ],
  assessment: 'CER exit slip aligned to evidence standard.',
  successCriteria: ['I can cite a precise line of evidence for my interpretation.'],
  supports: {
    all: ['CER organizer'],
    el: ['Bilingual glossary and sentence frames'],
    iep504: ['Chunked directions and organization checklist'],
  },
  equityNotes: 'Texts are selected for student-facing access and representation.',
  exitSlip: 'Write one claim about the poem and cite one line that supports it.',
  rubric: [
    { score: 0, description: 'No claim or evidence.' },
    { score: 1, description: 'Claim or evidence is incomplete.' },
    { score: 2, description: 'Claim and evidence are present with limited reasoning.' },
    { score: 3, description: 'Claim, evidence, and reasoning are clear and aligned.' },
  ],
  textOptions: [
    {
      title: 'Poem A',
      source: 'Poetry Foundation',
      lexile: '',
      url: 'https://www.poetryfoundation.org/',
      rationale: 'Student-facing poem.',
      selected: true,
      resourceId: 'poem_a',
    },
    {
      title: 'Primary Source B',
      source: 'Library of Congress',
      lexile: '',
      url: 'https://www.loc.gov/',
      rationale: 'Primary source extension.',
      selected: false,
      resourceId: 'primary_source_b',
    },
    {
      title: 'Article C',
      source: 'CommonLit',
      lexile: '900L',
      url: 'https://www.commonlit.org/',
      rationale: 'Accessible article option.',
      selected: false,
      resourceId: 'article_c',
    },
  ],
};

describe('validateLessonPlan', () => {
  it('accepts a schema-valid finalized plan shape', () => {
    const result = validateLessonPlan(validPlan, 'finalize');
    expect(result.ok).toBe(true);
    expect(result.errors.filter((error) => error.severity === 'error')).toHaveLength(0);
  });

  it('rejects finalize plans without exactly one selected text', () => {
    const invalid = {
      ...validPlan,
      textOptions: validPlan.textOptions?.map((option) => ({ ...option, selected: false })),
    };

    const result = validateLessonPlan(invalid, 'finalize');
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.path === 'textOptions')).toBe(true);
  });

  it('emits a DOK warning when an objective verb mismatches its claimed DOK', () => {
    const mismatched: LessonPlanData = {
      ...validPlan,
      objectives: [
        {
          text: 'Students will list the main characters in the poem.',
          dok: 3,
          verb: 'list',
        },
      ],
    };

    const result = validateLessonPlan(mismatched, 'finalize');
    // Plan should still pass (warnings are non-blocking).
    expect(result.ok).toBe(true);
    const dokWarnings = result.errors.filter(
      (e) => e.severity === 'warning' && e.path.startsWith('objectives[0].dok'),
    );
    expect(dokWarnings.length).toBe(1);
    expect(dokWarnings[0].message).toContain('list');
    expect(dokWarnings[0].message).toContain('DOK 1');
    expect(dokWarnings[0].message).toContain('DOK 3');
  });

  it('does not emit DOK warnings when the verb matches the claimed DOK', () => {
    const result = validateLessonPlan(validPlan, 'finalize');
    const dokWarnings = result.errors.filter(
      (e) => e.severity === 'warning' && e.path.startsWith('objectives[0].dok'),
    );
    expect(dokWarnings).toHaveLength(0);
  });
});
