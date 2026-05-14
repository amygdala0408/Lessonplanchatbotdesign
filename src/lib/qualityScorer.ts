/**
 * EQuIP + UDL quality scorer.
 *
 * Two-layer design (per docs/plans/penny-top-tier-v2.plan.md §P1.1):
 *
 *   • Layer A — deterministic. Pure-function checks against the plan +
 *     catalog. Fast (~5 ms), zero LLM cost. Always runs. Produces a
 *     ScoreCard that's good enough to gate finalize.
 *
 *   • Layer B — LLM judge. Optional. Uses the `scorer` task in the LLM
 *     router (currently openai/gpt-5.5 — deliberately a different brain
 *     than the generator (Opus 4.7) so we don't grade our own homework).
 *     Layer A's findings are passed in as context so the judge can't
 *     contradict deterministic facts; the judge mostly tightens the
 *     subjective dimensions (alignment phrasing, instructional design
 *     coherence, tone).
 *
 * Six rubric dimensions match `src/data/catalog/equip_udl_rubric.json`:
 *   - alignment_coherence
 *   - instructional_design
 *   - access_supports
 *   - assessment_for_learning
 *   - materials_licensing
 *   - tone_clarity
 *
 * Pass threshold: average ≥ 2.5 AND no dimension at 0 (rubric file is
 * source of truth for both numbers).
 */

import { z } from 'zod';
import { generateObject } from 'ai';

import {
  LESSON_PHASE_ORDER,
  type LessonPlanData,
  type LessonPhaseId,
} from '../types';
import {
  getEquipUdlRubric,
  getResources,
  getExitSlips,
  getOpeners,
  getAccommodations,
  getScaffoldsForSubject,
  getCitations,
} from './catalog/index';
import { extractObjectiveVerb, lookupVerbDok, normalizeDokSubject } from './dokLexicon';
import { getModel, getModelId, TASK_SETTINGS } from './llm/router';

export type DimensionId =
  | 'alignment_coherence'
  | 'instructional_design'
  | 'access_supports'
  | 'assessment_for_learning'
  | 'materials_licensing'
  | 'tone_clarity';

export type DimScore = 0 | 1 | 2 | 3;

export interface DimensionResult {
  id: DimensionId;
  title: string;
  score: DimScore;
  rationale: string;
  /** Where the score came from: deterministic check, judge, or merged. */
  source: 'deterministic' | 'judge' | 'merged';
}

export interface ScoreCard {
  average: number;
  passed: boolean;
  threshold: { averageMin: number; noCategoryAt: number };
  dimensions: DimensionResult[];
  /** Set when Layer B ran and contributed to the final score. */
  judgeUsed: boolean;
  /** Layer A scores preserved for transparency / UI tooltips. */
  layerA: DimensionResult[];
}

const DIMENSION_TITLES: Record<DimensionId, string> = {
  alignment_coherence: 'Alignment & Coherence',
  instructional_design: 'Instructional Design',
  access_supports: 'Access & Supports',
  assessment_for_learning: 'Assessment for Learning',
  materials_licensing: 'Materials & Licensing',
  tone_clarity: 'Tone & Clarity',
};

const DIMENSION_ORDER: DimensionId[] = [
  'alignment_coherence',
  'instructional_design',
  'access_supports',
  'assessment_for_learning',
  'materials_licensing',
  'tone_clarity',
];

// ---------- Layer A: deterministic checks ----------

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function describeStandard(plan: Partial<LessonPlanData>): { hasStandard: boolean; code?: string; framework?: string } {
  const s = plan.standard;
  if (!s) return { hasStandard: false };
  if (typeof s === 'string') return { hasStandard: s.trim().length > 0, code: s };
  return { hasStandard: !!s.code, code: s.code, framework: s.framework };
}

function scoreAlignment(plan: Partial<LessonPlanData>): DimensionResult {
  const std = describeStandard(plan);
  const objectives = plan.objectives ?? [];
  const successCriteria = plan.successCriteria ?? [];
  const exitSlip = (plan.exitSlip ?? '').trim();

  const objCount = objectives.length;
  const scCount = successCriteria.length;

  let score: DimScore;
  let why: string;

  if (!std.hasStandard || objCount === 0) {
    score = 0;
    why = `Missing ${[
      !std.hasStandard ? 'standard' : null,
      objCount === 0 ? 'objectives' : null,
    ]
      .filter(Boolean)
      .join(' + ')}`;
  } else if (scCount === 0 || !exitSlip) {
    score = 1;
    why = `Standard + ${objCount} objective(s) present but ${
      scCount === 0 ? 'no success criteria' : 'no exit slip'
    } means alignment can't be verified end-to-end.`;
  } else if (scCount < objCount || exitSlip.length < 20) {
    score = 2;
    why = `Standard + objectives + criteria + exit slip present, but ${
      scCount < objCount
        ? `success criteria (${scCount}) under-cover objectives (${objCount})`
        : `exit slip is short (${exitSlip.length} chars)`
    }.`;
  } else {
    score = 3;
    why = `Standard ${std.code ? `(${std.code}) ` : ''}aligns to ${objCount} objective(s), ${scCount} success criteria, and a developed exit slip (${exitSlip.length} chars).`;
  }
  return {
    id: 'alignment_coherence',
    title: DIMENSION_TITLES.alignment_coherence,
    score,
    rationale: why,
    source: 'deterministic',
  };
}

function scoreInstructionalDesign(plan: Partial<LessonPlanData>): DimensionResult {
  const procedure = plan.procedure ?? [];
  const phases = procedure
    .map((p) => p.phase)
    .filter((p): p is LessonPhaseId => !!p);
  const uniquePhases = new Set(phases);
  const allFive = LESSON_PHASE_ORDER.every((p) => uniquePhases.has(p));
  const inOrder = (() => {
    let last = -1;
    for (const p of phases) {
      const idx = LESSON_PHASE_ORDER.indexOf(p);
      if (idx === -1) continue;
      if (idx < last) return false;
      last = idx;
    }
    return true;
  })();
  const hasModel = isFilled(plan.instructionalModel);
  const avgDescLen =
    procedure.length > 0
      ? procedure.reduce((sum, s) => sum + (s.description?.length ?? 0), 0) / procedure.length
      : 0;

  let score: DimScore;
  let why: string;
  if (procedure.length < 3) {
    score = 0;
    why = `Only ${procedure.length} procedure step(s); need all five phases.`;
  } else if (!allFive) {
    score = 1;
    const missing = LESSON_PHASE_ORDER.filter((p) => !uniquePhases.has(p));
    why = `Missing phase(s): ${missing.join(', ')}.`;
  } else if (!inOrder || !hasModel || avgDescLen < 40) {
    score = 2;
    why = `All 5 phases present but ${[
      !inOrder ? 'order is broken' : null,
      !hasModel ? 'no instructional model' : null,
      avgDescLen < 40 ? `step descriptions are thin (avg ${Math.round(avgDescLen)} chars)` : null,
    ]
      .filter(Boolean)
      .join('; ')}.`;
  } else {
    score = 3;
    why = `All 5 phases in canonical order under ${plan.instructionalModel}; avg step description ${Math.round(avgDescLen)} chars.`;
  }
  return {
    id: 'instructional_design',
    title: DIMENSION_TITLES.instructional_design,
    score,
    rationale: why,
    source: 'deterministic',
  };
}

function scoreAccessSupports(plan: Partial<LessonPlanData>): DimensionResult {
  const procedure = plan.procedure ?? [];
  const supports = plan.supports ?? { all: [], el: [], iep504: [] };
  const lp = plan.learnerProfile;

  const stepsWithAcc = procedure.filter(
    (s) => (s.accommodations && s.accommodations.trim().length > 0) || (s.accommodationIds && s.accommodationIds.length > 0),
  ).length;
  const accCoverage = procedure.length === 0 ? 0 : stepsWithAcc / procedure.length;

  const lanes = [supports.all ?? [], supports.el ?? [], supports.iep504 ?? []];
  const lanesPopulated = lanes.filter((l) => l.length > 0).length;

  // Did the plan address the flagged learners?
  const flaggedEL = !!(lp?.multilingualLevel || (lp?.homeLanguages?.length ?? 0) > 0);
  const flaggedIEP504 = !!(lp?.hasIEP || lp?.has504 || (lp?.needsTags?.length ?? 0) > 0);
  const elAddressed = !flaggedEL || (supports.el?.length ?? 0) > 0;
  const iep504Addressed = !flaggedIEP504 || (supports.iep504?.length ?? 0) > 0;

  let score: DimScore;
  let why: string;
  if (accCoverage === 0 && lanesPopulated === 0) {
    score = 0;
    why = 'No accommodations on any procedure step and no support lanes populated.';
  } else if (accCoverage < 0.5 || lanesPopulated < 1) {
    score = 1;
    why = `Only ${stepsWithAcc}/${procedure.length} steps have accommodations; ${lanesPopulated}/3 lanes populated.`;
  } else if (accCoverage < 1 || lanesPopulated < 3 || !elAddressed || !iep504Addressed) {
    score = 2;
    const gaps: string[] = [];
    if (accCoverage < 1) gaps.push(`${stepsWithAcc}/${procedure.length} steps with accommodations`);
    if (lanesPopulated < 3) gaps.push(`${lanesPopulated}/3 lanes populated`);
    if (!elAddressed) gaps.push('EL learners flagged but supports.el is empty');
    if (!iep504Addressed) gaps.push('IEP/504 flagged but supports.iep504 is empty');
    why = gaps.join('; ');
  } else {
    score = 3;
    why = `Every step has accommodations; all three lanes (all/EL/IEP-504) populated${flaggedEL || flaggedIEP504 ? '; flagged learners addressed' : ''}.`;
  }
  return {
    id: 'access_supports',
    title: DIMENSION_TITLES.access_supports,
    score,
    rationale: why,
    source: 'deterministic',
  };
}

function scoreAssessment(plan: Partial<LessonPlanData>): DimensionResult {
  const exit = (plan.exitSlip ?? '').trim();
  const rubric = plan.rubric ?? [];
  const sc = plan.successCriteria ?? [];
  const objectives = plan.objectives ?? [];
  const rubricScores = rubric.map((r) => r.score).sort((a, b) => a - b);
  const correctRubric = JSON.stringify(rubricScores) === JSON.stringify([0, 1, 2, 3]);

  // Highest objective DOK (if present) — used to justify the exit slip's depth.
  const subject = normalizeDokSubject(plan.subject);
  const objectiveDoks: number[] = [];
  for (const o of objectives) {
    if (typeof o === 'object' && typeof o.dok === 'number') objectiveDoks.push(o.dok);
  }
  const maxObjDok = objectiveDoks.length > 0 ? Math.max(...objectiveDoks) : null;
  const exitVerb = extractObjectiveVerb(exit);
  const exitDok = exitVerb ? lookupVerbDok(exitVerb, subject ?? null).bestDok : null;
  const exitDokAligned =
    maxObjDok === null || exitDok === null || Math.abs(exitDok - maxObjDok) <= 1;

  let score: DimScore;
  let why: string;

  if (!exit || rubric.length === 0) {
    score = 0;
    why = 'No exit slip or rubric.';
  } else if (!correctRubric || sc.length === 0) {
    score = 1;
    why = `Exit slip present but ${
      !correctRubric
        ? `rubric scores must be {0,1,2,3}, got {${rubricScores.join(',')}}`
        : 'no success criteria'
    }.`;
  } else if (sc.length < objectives.length || exit.length < 30 || !exitDokAligned) {
    score = 2;
    const gaps: string[] = [];
    if (sc.length < objectives.length)
      gaps.push(`success criteria (${sc.length}) under-cover objectives (${objectives.length})`);
    if (exit.length < 30) gaps.push(`exit slip thin (${exit.length} chars)`);
    if (!exitDokAligned)
      gaps.push(`exit slip verb "${exitVerb}" sits at DOK ${exitDok}, off the highest objective DOK ${maxObjDok}`);
    why = gaps.join('; ');
  } else {
    score = 3;
    why = `Rubric is a clean 0–3, ${sc.length} success criteria cover ${objectives.length} objective(s), exit slip is ${exit.length} chars and ${exitDok ? `DOK ${exitDok}-aligned` : 'DOK-aligned'}.`;
  }
  return {
    id: 'assessment_for_learning',
    title: DIMENSION_TITLES.assessment_for_learning,
    score,
    rationale: why,
    source: 'deterministic',
  };
}

function scoreMaterialsLicensing(plan: Partial<LessonPlanData>): DimensionResult {
  const texts = plan.textOptions ?? [];
  const selected = texts.filter((t) => t.selected);
  const resourceIds = new Set(getResources().map((r) => r.id));
  const exitSlipIds = new Set(getExitSlips().map((e) => e.id));
  const openerIds = new Set(getOpeners().map((o) => o.id));
  const accIds = new Set(getAccommodations().map((a) => a.id));
  const scaffoldIds = new Set(getScaffoldsForSubject('all').map((s) => s.id));
  const citationIds = new Set(getCitations().map((c) => c.id));

  const unknown: string[] = [];
  for (const t of texts) {
    if (t.resourceId && !resourceIds.has(t.resourceId)) unknown.push(`text:${t.resourceId}`);
  }
  if (plan.exitSlipId && !exitSlipIds.has(plan.exitSlipId)) unknown.push(`exitSlip:${plan.exitSlipId}`);
  if (plan.openerId && !openerIds.has(plan.openerId)) unknown.push(`opener:${plan.openerId}`);
  for (const id of plan.misconceptionIds ?? []) {
    /* misconceptions are not in the same set; checked elsewhere */
    void id;
  }
  for (const id of plan.evidenceCitationKeys ?? []) {
    if (!citationIds.has(id)) unknown.push(`citation:${id}`);
  }
  for (const step of plan.procedure ?? []) {
    for (const id of step.scaffoldIds ?? []) if (!scaffoldIds.has(id)) unknown.push(`scaffold:${id}`);
    for (const id of step.accommodationIds ?? []) if (!accIds.has(id)) unknown.push(`accommodation:${id}`);
  }

  const hasSourceAndUrl = selected.length > 0 && selected.every((t) => isFilled(t.source) && isFilled(t.url));

  let score: DimScore;
  let why: string;
  if (texts.length === 0) {
    score = 0;
    why = 'No texts selected.';
  } else if (unknown.length > 0) {
    score = 1;
    why = `${unknown.length} catalog id(s) unresolved: ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? '…' : ''}`;
  } else if (!hasSourceAndUrl) {
    score = 2;
    why = 'Texts present and IDs resolve, but at least one selected text is missing a source or URL.';
  } else {
    score = 3;
    why = `${selected.length} student-facing text(s) with source + URL, all catalog ids resolve.`;
  }
  return {
    id: 'materials_licensing',
    title: DIMENSION_TITLES.materials_licensing,
    score,
    rationale: why,
    source: 'deterministic',
  };
}

function scoreToneClarity(plan: Partial<LessonPlanData>): DimensionResult {
  const equity = (plan.equityNotes ?? '').trim();
  const procedure = plan.procedure ?? [];
  const objectives = plan.objectives ?? [];
  const objectiveTexts = objectives.map((o) => (typeof o === 'string' ? o : o.text ?? '')).filter(Boolean);
  const objectivesAreSentences = objectiveTexts.length > 0 && objectiveTexts.every((t) => /\s/.test(t.trim()) && t.length >= 10);
  const objectivesHaveVerb = objectiveTexts.length > 0 && objectiveTexts.every((t) => !!extractObjectiveVerb(t));
  const avgStep =
    procedure.length === 0
      ? 0
      : procedure.reduce((s, p) => s + (p.description?.length ?? 0), 0) / procedure.length;
  const fillerCount = procedure.reduce((acc, p) => {
    const text = (p.description ?? '').toLowerCase();
    return acc + (text.match(/\b(very|really|lots of|things|stuff|kind of)\b/g)?.length ?? 0);
  }, 0);
  const allCapsCount = procedure.filter((p) => /[A-Z]{8,}/.test(p.description ?? '')).length;

  let score: DimScore;
  let why: string;
  if (objectives.length === 0 || procedure.length === 0) {
    score = 0;
    why = 'No objectives or no procedure to evaluate.';
  } else if (!equity || !objectivesAreSentences || !objectivesHaveVerb) {
    score = 1;
    why = `${
      !equity ? 'Equity notes empty' : !objectivesHaveVerb ? 'objectives missing leading verbs' : 'objectives are not full sentences'
    }.`;
  } else if (equity.length < 80 || avgStep < 60 || fillerCount > 2 || allCapsCount > 0) {
    score = 2;
    const gaps: string[] = [];
    if (equity.length < 80) gaps.push(`equity notes thin (${equity.length} chars)`);
    if (avgStep < 60) gaps.push(`procedure steps thin (avg ${Math.round(avgStep)} chars)`);
    if (fillerCount > 2) gaps.push(`${fillerCount} filler phrases`);
    if (allCapsCount > 0) gaps.push('all-caps text in procedure');
    why = gaps.join('; ');
  } else {
    score = 3;
    why = `Objectives are sentences with verbs; equity notes ${equity.length} chars; avg step ${Math.round(avgStep)} chars; clean prose.`;
  }
  return {
    id: 'tone_clarity',
    title: DIMENSION_TITLES.tone_clarity,
    score,
    rationale: why,
    source: 'deterministic',
  };
}

function buildLayerA(plan: Partial<LessonPlanData>): DimensionResult[] {
  return [
    scoreAlignment(plan),
    scoreInstructionalDesign(plan),
    scoreAccessSupports(plan),
    scoreAssessment(plan),
    scoreMaterialsLicensing(plan),
    scoreToneClarity(plan),
  ];
}

function summarizeCard(dimensions: DimensionResult[], judgeUsed: boolean, layerA: DimensionResult[]): ScoreCard {
  const rubric = getEquipUdlRubric();
  const threshold = rubric.passThreshold;
  const sum = dimensions.reduce((s, d) => s + d.score, 0);
  const average = dimensions.length === 0 ? 0 : sum / dimensions.length;
  const passed = average >= threshold.averageMin && dimensions.every((d) => d.score > threshold.noCategoryAt);
  return {
    average: Math.round(average * 100) / 100,
    passed,
    threshold,
    dimensions,
    judgeUsed,
    layerA,
  };
}

// ---------- Layer B: LLM judge ----------

const judgeSchema = z.object({
  dimensions: z
    .array(
      z.object({
        id: z.enum([
          'alignment_coherence',
          'instructional_design',
          'access_supports',
          'assessment_for_learning',
          'materials_licensing',
          'tone_clarity',
        ]),
        score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
        rationale: z.string().min(10).max(400),
      }),
    )
    .length(6),
});

const JUDGE_SYSTEM = `You are an EQuIP+UDL rubric judge for K-12 lesson plans. You score the plan across exactly six dimensions on a 0–3 scale.

Hard rules:
- Use Layer-A deterministic findings (provided in the user message) as ground truth. You may be more critical than Layer A; you may NOT score higher than Layer A on a dimension where Layer A proved a structural deficit.
- Score 0 only when the dimension is missing entirely. Reserve 3 for genuinely teacher-ready quality.
- Rationales: 1–2 sentences, plain English, cite the specific gap or strength.
- Do NOT include any commentary outside the JSON. Output a single object matching the schema.`;

function summarizePlanForJudge(plan: Partial<LessonPlanData>): string {
  const std = describeStandard(plan);
  const objectives = (plan.objectives ?? []).map((o) =>
    typeof o === 'string' ? o : `[DOK ${o.dok ?? '?'}] ${o.text ?? ''}`,
  );
  const procedure = (plan.procedure ?? []).map((p) => ({
    phase: p.phase ?? p.step,
    description: (p.description ?? '').slice(0, 240),
    accommodations: (p.accommodations ?? '').slice(0, 200),
  }));
  return [
    `TITLE: ${plan.title ?? '(untitled)'}`,
    `GRADE/SUBJECT: ${plan.gradeLevel ?? '?'} / ${plan.subject ?? '?'}`,
    `DURATION: ${plan.duration ?? '?'}`,
    `STANDARD: ${std.code ?? '(none)'} (${std.framework ?? 'n/a'})`,
    `INSTRUCTIONAL MODEL: ${plan.instructionalModel ?? '(none)'}`,
    `OBJECTIVES:\n  - ${objectives.join('\n  - ') || '(none)'}`,
    `SUCCESS CRITERIA:\n  - ${(plan.successCriteria ?? []).join('\n  - ') || '(none)'}`,
    `PROCEDURE:\n${procedure
      .map((p, i) => `  ${i + 1}. [${p.phase}] ${p.description} (acc: ${p.accommodations || '—'})`)
      .join('\n')}`,
    `EXIT SLIP: ${(plan.exitSlip ?? '').slice(0, 400)}`,
    `RUBRIC: ${(plan.rubric ?? []).map((r) => `${r.score}: ${r.description}`).join(' | ')}`,
    `SUPPORTS.all: ${(plan.supports?.all ?? []).join(', ') || '(none)'}`,
    `SUPPORTS.el: ${(plan.supports?.el ?? []).join(', ') || '(none)'}`,
    `SUPPORTS.iep504: ${(plan.supports?.iep504 ?? []).join(', ') || '(none)'}`,
    `EQUITY NOTES: ${(plan.equityNotes ?? '').slice(0, 600)}`,
    `SELECTED TEXTS: ${
      (plan.textOptions ?? [])
        .filter((t) => t.selected)
        .map((t) => `${t.title} (${t.source})`)
        .join('; ') || '(none)'
    }`,
  ].join('\n');
}

function summarizeLayerAForJudge(layerA: DimensionResult[]): string {
  return layerA
    .map((d) => `- ${d.id} = ${d.score}/3 — ${d.rationale}`)
    .join('\n');
}

async function runJudge(plan: Partial<LessonPlanData>, layerA: DimensionResult[]): Promise<DimensionResult[]> {
  const settings = TASK_SETTINGS.scorer;
  const userMessage = [
    'LAYER-A DETERMINISTIC FINDINGS (treat as ground truth):',
    summarizeLayerAForJudge(layerA),
    '',
    'PLAN SUMMARY:',
    summarizePlanForJudge(plan),
    '',
    'Score the same six dimensions. Be tough but fair. Output the JSON object only.',
  ].join('\n');

  const { object } = await generateObject({
    model: getModel('scorer'),
    schema: judgeSchema,
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
    temperature: settings.temperature,
    ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'penny.scorer',
      metadata: { model: getModelId('scorer') },
    },
  });

  return object.dimensions.map((d) => ({
    id: d.id as DimensionId,
    title: DIMENSION_TITLES[d.id as DimensionId],
    score: d.score as DimScore,
    rationale: d.rationale,
    source: 'judge' as const,
  }));
}

/**
 * Merge Layer A and Layer B scores. Policy:
 *   - Final score per dim = round((A + B) / 2), clamped 0–3.
 *   - If Layer A scored 0 (a structural deficit was proved), Layer B can't
 *     pull it above 1. Likewise, if B scored 0 and A is ≥ 2, the structural
 *     pass survives — A wins because it's deterministic.
 *   - Rationale: prefer judge's prose, fall back to Layer A's.
 */
function mergeScores(layerA: DimensionResult[], layerB: DimensionResult[]): DimensionResult[] {
  const bById = new Map(layerB.map((d) => [d.id, d]));
  return layerA.map((a) => {
    const b = bById.get(a.id);
    if (!b) return { ...a, source: 'merged' as const };
    let final: DimScore;
    if (a.score === 0) final = (Math.min(1, b.score) as DimScore);
    else if (b.score === 0 && a.score >= 2) final = a.score;
    else {
      const avg = (a.score + b.score) / 2;
      final = (Math.min(3, Math.max(0, Math.round(avg))) as DimScore);
    }
    return {
      id: a.id,
      title: a.title,
      score: final,
      rationale: b.rationale || a.rationale,
      source: 'merged' as const,
    };
  });
}

// ---------- Public API ----------

export interface ScoreOptions {
  /** Run the LLM judge in addition to deterministic checks. Defaults to false. */
  useJudge?: boolean;
}

/**
 * Score a (partial) lesson plan. Always runs Layer A. When `useJudge` is
 * true, also runs Layer B and merges. The returned ScoreCard is safe to
 * stash on `LessonPlanData.qualityScore` (shape lines up with the existing
 * type modulo the extra `source` field which we just drop on persist).
 */
export async function scoreLessonPlan(
  plan: Partial<LessonPlanData>,
  options: ScoreOptions = {},
): Promise<ScoreCard> {
  const layerA = buildLayerA(plan);

  if (!options.useJudge) {
    return summarizeCard(layerA, false, layerA);
  }

  try {
    const layerB = await runJudge(plan, layerA);
    const merged = mergeScores(layerA, layerB);
    return summarizeCard(merged, true, layerA);
  } catch (err) {
    console.warn('[qualityScorer] judge failed, falling back to Layer A:', err);
    return summarizeCard(layerA, false, layerA);
  }
}

/** Synchronous variant — Layer A only. Useful for tests and fast paths. */
export function scoreLessonPlanSync(plan: Partial<LessonPlanData>): ScoreCard {
  const layerA = buildLayerA(plan);
  return summarizeCard(layerA, false, layerA);
}

/** Strip the `source` field for persistence on `LessonPlanData.qualityScore`. */
export function toPersistableQualityScore(card: ScoreCard): NonNullable<LessonPlanData['qualityScore']> {
  return {
    average: card.average,
    passed: card.passed,
    dimensions: card.dimensions.map((d) => ({
      name: d.id,
      score: d.score,
      rationale: d.rationale,
    })),
  };
}
