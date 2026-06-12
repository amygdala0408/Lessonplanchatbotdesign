/**
 * Catalog context builder.
 *
 * Bridges the runtime API request (current plan + learner profile + recent
 * user message) with the catalog selectors. Returns:
 *   1. A `SelectionContext` derived from the current plan + last user message.
 *   2. A `CATALOG_CANDIDATES` system message containing the curated candidate
 *      IDs that Penny is allowed to choose from.
 *
 * Server-only.
 */

import type { ConversationPhase, LearnerProfile, LessonPhaseId, LessonPlanData } from '../types';
import { LESSON_PHASE_ORDER } from '../types';

import {
  normalizeSubject,
  selectExitSlips,
  selectInstructionalModelCandidates,
  selectMisconceptions,
  selectOpeners,
  selectScaffoldsForPhase,
  selectStandards,
  selectTexts,
  type SelectionContext,
} from './catalog/selectors';
import {
  resolveAccommodations,
  groupAccommodationsByPhase,
  type ResolvedAccommodation,
} from './accommodations';
import { getTeacherLanguageForScaffold, getWhyForTeacher } from './curated';

/* ----------------------------------------------------------------------------
 * Inputs
 * ---------------------------------------------------------------------------*/

export interface BuildCatalogContextArgs {
  currentPlan?: Partial<LessonPlanData> | null;
  learnerProfile?: Partial<LearnerProfile> | null;
  conversationHistory?: { role: string; content: string }[];
  conversationPhase?: ConversationPhase;
}

/* ----------------------------------------------------------------------------
 * Context derivation
 * ---------------------------------------------------------------------------*/

function lastUserMessage(history: { role: string; content: string }[] = []): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === 'user') return history[i].content || '';
  }
  return '';
}

function deriveTopic(plan: Partial<LessonPlanData> | null | undefined, recent: string): string {
  const fromTitle = (plan?.title || '').trim();
  if (fromTitle.length > 0) return fromTitle;
  const fromObjective =
    plan?.objectives && plan.objectives.length > 0
      ? typeof plan.objectives[0] === 'string'
        ? (plan.objectives[0] as string)
        : (plan.objectives[0] as { text: string }).text
      : '';
  if (fromObjective) return fromObjective;
  // Fall back to the most recent user message (truncated).
  return recent.slice(0, 200);
}

function deriveDokTarget(plan: Partial<LessonPlanData> | null | undefined): 1 | 2 | 3 | 4 | undefined {
  if (!plan?.objectives || plan.objectives.length === 0) return undefined;
  let max = 0;
  for (const o of plan.objectives) {
    const dok =
      typeof o === 'object' && o && 'dok' in o ? (o as { dok?: number }).dok ?? 0 : 0;
    if (dok > max) max = dok;
  }
  if (max >= 1 && max <= 4) return max as 1 | 2 | 3 | 4;
  return undefined;
}

export function buildSelectionContext(args: BuildCatalogContextArgs): SelectionContext {
  const plan = args.currentPlan ?? null;
  const recent = lastUserMessage(args.conversationHistory);

  // In the `gathering` phase the plan is empty but the teacher almost always
  // names the subject in their first message ("9th grade ELA, CCSS.ELA-…").
  // Without a sniffed subject the catalog selectors fall back to scoring
  // every active resource the same — that's why an ELA RL.9-10.1 prompt was
  // surfacing NOAA Climate & Weather as a top-3 text option. Sniff the most
  // recent user turn so subject-aware scoring kicks in immediately, before
  // the chat model has had a chance to commit a structured plan.
  const explicitSubject = (plan?.subject || '').trim();
  let inferredSubject = explicitSubject;
  if (!inferredSubject && recent) {
    const sniffed = normalizeSubject(recent);
    if (sniffed !== 'all') inferredSubject = sniffed;
  }

  // Same reasoning for grade level — a teacher who writes "9th grade ELA"
  // wants the 9-12 band scored above K-2/3-5/6-8 even before the plan
  // captures `gradeLevel` formally.
  const explicitGrade = (plan?.gradeLevel || '').trim();
  let inferredGrade = explicitGrade;
  if (!inferredGrade && recent) {
    const m = recent.match(/\b(?:grade\s*)?(K|kindergarten|\d{1,2})(?:st|nd|rd|th)?\s*(?:grade)?\b/i);
    if (m) inferredGrade = m[0];
  }

  return {
    subject: inferredSubject,
    gradeLevel: inferredGrade,
    topicKeyword: plan?.title || '',
    topicQuery: deriveTopic(plan, recent),
    dokTarget: deriveDokTarget(plan),
    instructionalModel: plan?.instructionalModel,
    learnerProfile: (args.learnerProfile as LearnerProfile) ?? undefined,
    homeLanguages: (args.learnerProfile?.homeLanguages as string[]) ?? [],
  };
}

/* ----------------------------------------------------------------------------
 * Build a constrained-vocabulary system message
 * ---------------------------------------------------------------------------*/

/**
 * Pedagogical-grounding bridge: the candidate block ships the curated catalog
 * CONTENT to the model, not just selector keys. Per-phase lists stay compact
 * (IDs + a short label) for placement; the deduplicated `scaffoldDetails` and
 * `accommodationDetails` arrays carry the full research-anchored prose once
 * per unique record, so the same scaffold appearing in three phases doesn't
 * triple the token bill.
 */
interface WideScaffold {
  id: string;
  name: string;
  type: string;
  dok: number;
  phases: LessonPhaseId[];
  teacherMoves: string[];
  studentTasks: string[];
  supports: string[];
  fadePlan: string;
  whenNotToUse: string;
  formativeChecks: string[];
  udlHlpTags: string[];
  evidenceKeys: string[];
  /**
   * Curated verbatim teacher-language exemplars (draft bank, item B1).
   * Present only for scaffolds the bank covers; Penny adapts these lines
   * for the current text and class instead of inventing teacher talk.
   */
  teacherLanguageExemplars?: string[];
}

interface WideAccommodation {
  id: string;
  phases: LessonPhaseId[];
  teacherPrompt: string;
  studentMicrocopy: string;
  evidenceCite: string;
  evidenceUrl: string;
  udlHlpTags: string[];
  appliesWhenReason: string;
  /**
   * Curated rationale (draft bank, item A4) — WHY this support helps, in
   * teacher-facing language Penny can quote when explaining her choices.
   */
  whyForTeacher?: string;
}

interface CandidateBlock {
  texts?: {
    id: string;
    title: string;
    source: string;
    license: string;
    url: string;
    audience: 'student';
    format: string;
  }[];
  instructionalModels?: { model: string; rationale: string }[];
  openers?: {
    id: string;
    type: string;
    topic: string;
    dokFloor: number;
    hookText: string;
    priorKnowledgeProbe: string;
    learningIntentionStem: string;
    researchTags: string[];
    timeMinutes: number;
  }[];
  scaffolds?: Record<LessonPhaseId, { id: string; name: string; type: string; dok: number }[]>;
  /** Full curated content for every unique scaffold listed in `scaffolds`. */
  scaffoldDetails?: WideScaffold[];
  exitSlips?: {
    id: string;
    subject: string;
    dokFloor: number;
    prompt: string;
    probe: string;
    criteria0to3: string[];
  }[];
  misconceptions?: { id: string; misconception: string; probe: string }[];
  standards?: { id: string; description: string }[];
  accommodations?: Record<LessonPhaseId, string[]>;
  /** Full curated content for every unique accommodation listed in `accommodations`. */
  accommodationDetails?: WideAccommodation[];
}

/** Truncate to `n` chars on a word boundary with an ellipsis. */
function trunc(s: string, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

/**
 * Character budgets for the emitted JSON block. The chat lane shares the
 * context window with the conversation; the generator lane (drafting) can
 * afford a wider block because it's a single structured-output call.
 */
const CHAT_BLOCK_BUDGET = 12_000;
const GENERATOR_BLOCK_BUDGET = 18_000;

const PHASE_AWARE_CANDIDATES: ConversationPhase[] = [
  'gathering',
  'text_selection',
  'instructional_model',
  'preview',
  'drafting',
];

export function buildCatalogContext(args: BuildCatalogContextArgs): {
  systemMessage: string | null;
  selectionContext: SelectionContext;
} {
  const phase = args.conversationPhase ?? 'gathering';
  const ctx = buildSelectionContext(args);
  if (!PHASE_AWARE_CANDIDATES.includes(phase)) {
    return { systemMessage: null, selectionContext: ctx };
  }

  const block: CandidateBlock = {};

  // Phase-specific shaping. We hand Penny a small, curated vocabulary at each
  // phase so she chooses real catalog rows instead of inventing.

  if (phase === 'gathering' || phase === 'text_selection') {
    block.texts = selectTexts(ctx, 6).map((r) => ({
      id: r.id,
      title: r.title,
      source: r.source,
      license: r.license,
      url: r.url,
      audience: 'student',
      format: r.format,
    }));
  }

  if (phase === 'gathering' || phase === 'instructional_model') {
    block.instructionalModels = selectInstructionalModelCandidates(ctx, 3).map((m) => ({
      model: m.model,
      rationale: m.rationale,
    }));
  }

  if (phase === 'preview' || phase === 'drafting' || phase === 'instructional_model') {
    // Openers ship their verbatim hook + probe + intention stem so the model
    // uses the curated teacher language instead of improvising an opener.
    block.openers = selectOpeners(ctx, 3).map((o) => ({
      id: o.id,
      type: o.openerType,
      topic: o.topicKeyword,
      dokFloor: o.dokFloor,
      hookText: o.hookText,
      priorKnowledgeProbe: o.priorKnowledgeProbe,
      learningIntentionStem: o.learningIntentionStem,
      researchTags: o.researchTags ?? [],
      timeMinutes: o.timeMinutes,
    }));
    // Exit slips ship the full prompt, the anticipated-misconception probe,
    // and the verbatim 0-3 rubric criteria so the generated rubric is the
    // curated one, not a pretraining guess.
    block.exitSlips = selectExitSlips(ctx, 3).map((e) => ({
      id: e.id,
      subject: e.subject,
      dokFloor: e.dokFloor,
      prompt: e.prompt,
      probe: e.misconceptionFlag ?? '',
      criteria0to3: e.rubric03 ?? [],
    }));
    block.misconceptions = selectMisconceptions(ctx, 3).map((m) => ({
      id: m.id,
      misconception: m.misconception,
      probe: m.probe,
    }));
    block.standards = selectStandards(ctx, 4).map((s) => ({
      id: s.id,
      description: s.description.length > 160 ? s.description.slice(0, 157) + '…' : s.description,
    }));

    // Per-phase scaffold placement (compact) + deduplicated full details.
    // Details are assembled round-robin by relevance rank across phases
    // (every phase's #1 pick first, then every #2, …) so when the character
    // budget forces trimming, we drop third choices — never a phase's
    // top-ranked scaffold.
    const scaffolds: NonNullable<CandidateBlock['scaffolds']> = {
      launch: [],
      model: [],
      guided_practice: [],
      independent_practice: [],
      exit_slip: [],
    };
    const pickedScaffolds = new Map<LessonPhaseId, ReturnType<typeof selectScaffoldsForPhase>>();
    for (const lp of LESSON_PHASE_ORDER) {
      const picked = selectScaffoldsForPhase(ctx, lp, 3);
      pickedScaffolds.set(lp, picked);
      scaffolds[lp] = picked.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        dok: s.dokLevel,
      }));
    }
    const detailById = new Map<string, WideScaffold>();
    for (let rank = 0; rank < 3; rank++) {
      for (const lp of LESSON_PHASE_ORDER) {
        const s = pickedScaffolds.get(lp)?.[rank];
        if (!s) continue;
        const existing = detailById.get(s.id);
        if (existing) {
          if (!existing.phases.includes(lp)) existing.phases.push(lp);
          continue;
        }
        const languageExemplars = getTeacherLanguageForScaffold(s.id)
          .slice(0, 2)
          .map((t) => trunc(t, 220));
        detailById.set(s.id, {
          id: s.id,
          name: s.name,
          type: s.type,
          dok: s.dokLevel,
          phases: [lp],
          teacherMoves: (s.teacherMoves ?? []).slice(0, 3).map((t) => trunc(t, 120)),
          studentTasks: (s.studentTasks ?? []).slice(0, 3).map((t) => trunc(t, 120)),
          supports: (s.supports ?? []).slice(0, 3).map((t) => trunc(t, 100)),
          fadePlan: trunc(s.fadePlan ?? '', 200),
          whenNotToUse: trunc(s.whenNotToUse ?? '', 120),
          formativeChecks: (s.formativeChecks ?? []).slice(0, 2).map((t) => trunc(t, 100)),
          udlHlpTags: s.udlHlpTags ?? [],
          evidenceKeys: (s.evidenceCitationKeys ?? []).slice(0, 2),
          ...(languageExemplars.length > 0 ? { teacherLanguageExemplars: languageExemplars } : {}),
        });
      }
    }
    block.scaffolds = scaffolds;
    block.scaffoldDetails = Array.from(detailById.values());
  }

  // Always include resolved accommodations when we have a learner profile.
  if (
    args.learnerProfile &&
    (args.learnerProfile.hasIEP ||
      args.learnerProfile.has504 ||
      (args.learnerProfile.multilingualLevel != null &&
        args.learnerProfile.multilingualLevel <= 4) ||
      (args.learnerProfile.needsTags && args.learnerProfile.needsTags.length > 0))
  ) {
    const resolved = resolveAccommodations(args.learnerProfile as LearnerProfile, {});
    const grouped = groupAccommodationsByPhase(resolved);
    const byPhase: NonNullable<CandidateBlock['accommodations']> = {
      launch: [],
      model: [],
      guided_practice: [],
      independent_practice: [],
      exit_slip: [],
    };
    // Six per phase: the per-phase entries are bare IDs now, so the cost
    // lives in the deduplicated details array, which the budget trimmer
    // bounds. Phase-targeted supports (like the bilingual glossary, which
    // only attaches to guided_practice) outrank generic all-phase supports
    // so they survive the cut — they're the ones a teacher can't get from
    // the generic lanes. Details are assembled round-robin by rank across
    // phases so budget trimming drops the least-specific entries first.
    const pickedAcc = new Map<LessonPhaseId, ResolvedAccommodation[]>();
    for (const lp of LESSON_PHASE_ORDER) {
      const picked = [...grouped[lp]]
        .sort((a, b) => a.phaseScope.length - b.phaseScope.length)
        .slice(0, 6);
      pickedAcc.set(lp, picked);
      byPhase[lp] = picked.map((a) => a.id);
    }
    const accDetailById = new Map<string, WideAccommodation>();
    for (let rank = 0; rank < 6; rank++) {
      for (const lp of LESSON_PHASE_ORDER) {
        const a = pickedAcc.get(lp)?.[rank];
        if (!a) continue;
        const existing = accDetailById.get(a.id);
        if (existing) {
          if (!existing.phases.includes(lp)) existing.phases.push(lp);
          continue;
        }
        const whyForTeacher = getWhyForTeacher(a.id);
        accDetailById.set(a.id, {
          id: a.id,
          phases: [lp],
          teacherPrompt: a.teacherPrompt,
          studentMicrocopy: trunc(a.studentMicrocopy ?? '', 140),
          evidenceCite: a.evidence?.citationText ?? '',
          evidenceUrl: a.evidence?.sourceLink ?? '',
          udlHlpTags: a.udlHlpTags ?? [],
          appliesWhenReason: a.appliesWhenReason,
          ...(whyForTeacher ? { whyForTeacher: trunc(whyForTeacher, 240) } : {}),
        });
      }
    }
    block.accommodations = byPhase;
    block.accommodationDetails = Array.from(accDetailById.values());
  }

  // Skip emitting if every section is empty (cold-start / vague prompt).
  const hasAny = Object.values(block).some((v) =>
    Array.isArray(v) ? v.length > 0 : !!v && Object.keys(v).length > 0,
  );
  if (!hasAny) return { systemMessage: null, selectionContext: ctx };

  // Enforce the character budget. Detail arrays are the variable-cost part of
  // the block, so when we're over budget we drop the least-relevant detail
  // entries (selectors return them relevance-ranked) until we fit. Per-phase
  // ID lists always survive, so placement context is never lost.
  const budget = phase === 'drafting' ? GENERATOR_BLOCK_BUDGET : CHAT_BLOCK_BUDGET;
  let payload = JSON.stringify(block, null, 1);
  while (payload.length > budget) {
    if (block.scaffoldDetails && block.scaffoldDetails.length > 0 &&
        (block.scaffoldDetails.length >= (block.accommodationDetails?.length ?? 0))) {
      block.scaffoldDetails.pop();
    } else if (block.accommodationDetails && block.accommodationDetails.length > 0) {
      block.accommodationDetails.pop();
    } else {
      break;
    }
    payload = JSON.stringify(block, null, 1);
  }

  const systemMessage = [
    'CATALOG_CANDIDATES (you MUST choose IDs from this list when you reference texts,',
    'scaffolds, openers, exit slips, misconceptions, standards, or accommodations.',
    'Do NOT invent new IDs. If nothing fits, ask a clarifying question instead of',
    'fabricating a resource. When you cite a text, copy the title/source/url',
    'verbatim from this list.):',
    'For text selection, every CATALOG_CANDIDATES.texts[] row is student-facing;',
    'never use teacher-PD/reference materials as student reading.',
    'scaffoldDetails and accommodationDetails carry the curated teacher moves,',
    'student tasks, supports, fade plans, evidence citations, and trigger',
    'rationale for every ID listed per phase. Ground your procedure steps,',
    'supports, and accommodation prose in that curated content — quote and',
    'adapt it for THIS text and THIS class; do not improvise parallel pedagogy.',
    'When a scaffold carries teacherLanguageExemplars, adapt that verbatim',
    'teacher talk for this text instead of inventing your own register. When an',
    'accommodation carries whyForTeacher, use it to explain WHY the support',
    'attached when the teacher asks.',
    '```json',
    payload,
    '```',
  ].join('\n');

  return { systemMessage, selectionContext: ctx };
}
