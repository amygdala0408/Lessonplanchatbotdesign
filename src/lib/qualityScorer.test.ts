import { describe, expect, it } from 'vitest';

import {
  buildJudgeSystem,
  scoreLessonPlanSync,
  scoreProceduralSpecificity,
  toPersistableQualityScore,
} from './qualityScorer';
import { getEquipUdlExemplars } from './curated';
import type { LessonPlanData } from '@/types';

const goldenPlan: LessonPlanData = {
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
      text: 'Students will analyze how textual evidence supports an interpretation of the speaker\'s tone in two stanzas.',
      dok: 3,
      verb: 'analyze',
    },
  ],
  materials: ['Student-facing poem packet', 'CER organizer'],
  procedure: [
    {
      phase: 'launch',
      step: 'Launch',
      description:
        'Students preview the focus question, mark words they recognize, and turn-and-talk for 90 seconds about what they expect from the text.',
      accommodations:
        'Preview vocabulary card pre-distributed; sentence starters posted; visual agenda on board.',
    },
    {
      phase: 'model',
      step: 'Model',
      description:
        'Teacher uses a think-aloud to cite one line from the poem and explain why it answers the focus question, recording the move on the anchor chart.',
      accommodations: 'Think-aloud is chunked into three steps and paired with sentence frames.',
    },
    {
      phase: 'guided_practice',
      step: 'Guided Practice',
      description:
        'In strategic pairs, students choose two lines and rehearse the explanation orally before writing, using the CER organizer to capture their reasoning.',
      accommodations: 'Strategic pairs use a claim-evidence-reasoning organizer with bilingual glossary.',
    },
    {
      phase: 'independent_practice',
      step: 'Independent Practice',
      description:
        'Students independently draft a one-paragraph evidence-based interpretation, citing two lines and explaining tone.',
      accommodations: 'Reduced-load option; checklist supports organization; quiet workspace available.',
    },
    {
      phase: 'exit_slip',
      step: 'Exit Slip',
      description:
        'Students submit a one-claim-one-line response that includes evidence and reasoning aligned to the standard.',
      accommodations: 'Students may respond with sentence frames or oral rehearsal before writing.',
    },
  ],
  assessment: 'CER exit slip aligned to evidence standard with rubric scoring.',
  successCriteria: [
    'I can cite a precise line of evidence for my interpretation.',
    'I can explain why my evidence supports the claim about tone.',
  ],
  supports: {
    all: ['CER organizer', 'Anchor chart'],
    el: ['Bilingual glossary, sentence frames, paired discussion'],
    iep504: ['Chunked directions, organization checklist, extended time'],
  },
  equityNotes:
    'Texts represent African American poets of the Harlem Renaissance, chosen for student-facing accessibility and representation. Pairings honor multilingual learners by giving oral rehearsal before writing.',
  exitSlip:
    'Write one claim about the speaker\'s tone in the poem. Cite one specific line of evidence and explain in two sentences why it supports your claim.',
  rubric: [
    { score: 0, description: 'No claim or evidence is offered.' },
    { score: 1, description: 'Claim or evidence is incomplete or unclear.' },
    { score: 2, description: 'Claim and evidence are present with limited reasoning.' },
    { score: 3, description: 'Claim, evidence, and reasoning are clear and aligned to tone.' },
  ],
  textOptions: [
    {
      title: 'Selected Poem',
      source: 'Poetry Foundation',
      lexile: '',
      url: 'https://www.poetryfoundation.org/',
      rationale: 'Student-facing Harlem Renaissance poem.',
      selected: true,
      resourceId: 'african_american_poetry_collection',
    },
  ],
  learnerProfile: {
    classSize: 28,
    multilingualLevel: 3,
    homeLanguages: ['es'],
    hasIEP: true,
    has504: false,
    needsTags: ['anxiety_support', 'organization_support', 'reading_support'],
  },
};

describe('scoreLessonPlanSync — Layer A only', () => {
  it('scores a fully-built plan at the top of the rubric', () => {
    const card = scoreLessonPlanSync(goldenPlan);
    expect(card.dimensions).toHaveLength(6);
    expect(card.average).toBeGreaterThanOrEqual(2.5);
    expect(card.passed).toBe(true);
    expect(card.dimensions.every((d) => d.score >= 2)).toBe(true);
    expect(card.judgeUsed).toBe(false);
  });

  it('flags missing standard / objectives as alignment 0', () => {
    const broken = { ...goldenPlan, standard: undefined, objectives: [] };
    const card = scoreLessonPlanSync(broken);
    const align = card.dimensions.find((d) => d.id === 'alignment_coherence')!;
    expect(align.score).toBe(0);
    expect(card.passed).toBe(false);
  });

  it('flags missing accommodations as access_supports 0', () => {
    const broken: LessonPlanData = {
      ...goldenPlan,
      procedure: goldenPlan.procedure.map((p) => ({
        ...p,
        accommodations: '',
        accommodationIds: undefined,
      })),
      supports: { all: [], el: [], iep504: [] },
    };
    const card = scoreLessonPlanSync(broken);
    const acc = card.dimensions.find((d) => d.id === 'access_supports')!;
    expect(acc.score).toBe(0);
    expect(card.passed).toBe(false);
  });

  it('flags incomplete rubric as assessment 1', () => {
    const broken: LessonPlanData = {
      ...goldenPlan,
      rubric: goldenPlan.rubric!.slice(0, 2),
    };
    const card = scoreLessonPlanSync(broken);
    const a = card.dimensions.find((d) => d.id === 'assessment_for_learning')!;
    expect(a.score).toBeLessThanOrEqual(1);
  });

  it('flags missing texts as materials 0', () => {
    const broken = { ...goldenPlan, textOptions: [] };
    const card = scoreLessonPlanSync(broken);
    const m = card.dimensions.find((d) => d.id === 'materials_licensing')!;
    expect(m.score).toBe(0);
    expect(card.passed).toBe(false);
  });

  it('flags out-of-order phases as instructional_design 2', () => {
    const broken: LessonPlanData = {
      ...goldenPlan,
      procedure: [
        goldenPlan.procedure[1], // model
        goldenPlan.procedure[0], // launch
        goldenPlan.procedure[2],
        goldenPlan.procedure[3],
        goldenPlan.procedure[4],
      ],
    };
    const card = scoreLessonPlanSync(broken);
    const d = card.dimensions.find((d) => d.id === 'instructional_design')!;
    expect(d.score).toBeLessThanOrEqual(2);
  });

  it('flags vague language and short equity notes as tone_clarity 2', () => {
    const broken: LessonPlanData = {
      ...goldenPlan,
      equityNotes: 'Short.',
      procedure: goldenPlan.procedure.map((p) => ({
        ...p,
        description: 'Students do really lots of things and stuff. Very short.',
      })),
    };
    const card = scoreLessonPlanSync(broken);
    const t = card.dimensions.find((d) => d.id === 'tone_clarity')!;
    expect(t.score).toBeLessThanOrEqual(2);
  });
});

describe('toPersistableQualityScore', () => {
  it('strips the source field and produces a shape compatible with LessonPlanData.qualityScore', () => {
    const card = scoreLessonPlanSync(goldenPlan);
    const persistable = toPersistableQualityScore(card);
    expect(persistable.average).toBe(card.average);
    expect(persistable.passed).toBe(card.passed);
    expect(persistable.dimensions).toHaveLength(6);
    expect(persistable.dimensions[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        score: expect.any(Number),
        rationale: expect.any(String),
      }),
    );
    // No `source` field on persistable form.
    expect((persistable.dimensions[0] as Record<string, unknown>).source).toBeUndefined();
  });
});

describe('scoreProceduralSpecificity — teacherMoves recipe quality', () => {
  const richMoves = {
    launch: 'Project stanza one and say: "Underline the line that tells you what the speaker values."',
    duringWork: 'Confer with the flagged pairs first and listen for students naming why their line matters; track which pairs cite stanza two.',
    checkForUnderstanding: 'Scan each organizer for one cited line before releasing pairs.',
    ifStuck: 'Hand the pair the bilingual glossary card and re-read the line aloud together.',
    ifAhead: 'Ask the pair to find a counter-line that complicates their claim.',
    transition: 'Chime, then pivot to the anchor chart for the debrief.',
  };

  it('scores 0 when no procedure step carries teacherMoves', () => {
    const { score, rationale } = scoreProceduralSpecificity(goldenPlan);
    expect(score).toBe(0);
    expect(rationale).toContain('No teacherMoves');
  });

  it('scores 3 when every phase has quoted launches and named conferring moves', () => {
    const plan: LessonPlanData = {
      ...goldenPlan,
      procedure: goldenPlan.procedure.map((p) => ({ ...p, teacherMoves: { ...richMoves } })),
    };
    const { score } = scoreProceduralSpecificity(plan);
    expect(score).toBe(3);
  });

  it('scores 1 when recipes are generic (no quotes, no conferring moves)', () => {
    const generic = {
      ...richMoves,
      launch: 'Open the phase by stating the goal and showing the agenda slide to everyone.',
      duringWork: 'Walk around the room while students work on the task and keep an eye on progress.',
    };
    const plan: LessonPlanData = {
      ...goldenPlan,
      procedure: goldenPlan.procedure.map((p) => ({ ...p, teacherMoves: { ...generic } })),
    };
    const { score } = scoreProceduralSpecificity(plan);
    expect(score).toBe(1);
  });

  it('scores 1 when only some phases carry teacherMoves', () => {
    const plan: LessonPlanData = {
      ...goldenPlan,
      procedure: goldenPlan.procedure.map((p, i) =>
        i < 2 ? { ...p, teacherMoves: { ...richMoves } } : p,
      ),
    };
    const { score, rationale } = scoreProceduralSpecificity(plan);
    expect(score).toBe(1);
    expect(rationale).toContain('2/5 phases');
  });

  it('surfaces recipeClarity on the sync scorecard and the persistable score', () => {
    const plan: LessonPlanData = {
      ...goldenPlan,
      procedure: goldenPlan.procedure.map((p) => ({ ...p, teacherMoves: { ...richMoves } })),
    };
    const card = scoreLessonPlanSync(plan);
    expect(card.recipeClarity).toBeDefined();
    expect(card.recipeClarity!.score).toBe(3);
    expect(card.recipeClarity!.source).toBe('deterministic');
    const persistable = toPersistableQualityScore(card);
    expect(persistable.recipeClarity).toEqual({
      score: 3,
      rationale: expect.stringContaining('5/5 phases'),
    });
  });
});

describe('buildJudgeSystem — curated score-calibration exemplars (C1)', () => {
  it('inlines the curated exemplar bank with annotated score anchors', () => {
    const exemplars = getEquipUdlExemplars();
    // The draft bank ships 24 entries (6 dimensions x 4 levels).
    expect(exemplars.length).toBeGreaterThanOrEqual(24);

    const system = buildJudgeSystem();
    expect(system).toContain('SCORE CALIBRATION EXEMPLARS');
    // Spot-check that real exemplar prose (not just headers) made it in.
    const sample = exemplars.find((e) => e.score === 3);
    expect(sample).toBeTruthy();
    expect(system).toContain(sample!.exemplar.slice(0, 60));
    expect(system).toContain(`Why this is a ${sample!.score}:`);
  });
});
