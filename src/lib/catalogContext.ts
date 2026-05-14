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
import { resolveAccommodations, groupAccommodationsByPhase } from './accommodations';

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
  openers?: { id: string; type: string; topic: string; dokFloor: number }[];
  scaffolds?: Record<LessonPhaseId, { id: string; name: string; type: string; dok: number }[]>;
  exitSlips?: { id: string; subject: string; dokFloor: number; prompt: string }[];
  misconceptions?: { id: string; misconception: string; probe: string }[];
  standards?: { id: string; description: string }[];
  accommodations?: Record<LessonPhaseId, { id: string; teacherPrompt: string }[]>;
}

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
    block.openers = selectOpeners(ctx, 3).map((o) => ({
      id: o.id,
      type: o.openerType,
      topic: o.topicKeyword,
      dokFloor: o.dokFloor,
    }));
    block.exitSlips = selectExitSlips(ctx, 3).map((e) => ({
      id: e.id,
      subject: e.subject,
      dokFloor: e.dokFloor,
      prompt: e.prompt.length > 160 ? e.prompt.slice(0, 157) + '…' : e.prompt,
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

    // Per-phase scaffolds.
    const scaffolds: NonNullable<CandidateBlock['scaffolds']> = {
      launch: [],
      model: [],
      guided_practice: [],
      independent_practice: [],
      exit_slip: [],
    };
    for (const lp of LESSON_PHASE_ORDER) {
      scaffolds[lp] = selectScaffoldsForPhase(ctx, lp, 3).map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        dok: s.dokLevel,
      }));
    }
    block.scaffolds = scaffolds;
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
    const trimmed: NonNullable<CandidateBlock['accommodations']> = {
      launch: [],
      model: [],
      guided_practice: [],
      independent_practice: [],
      exit_slip: [],
    };
    for (const lp of LESSON_PHASE_ORDER) {
      trimmed[lp] = grouped[lp].slice(0, 6).map((a) => ({
        id: a.id,
        teacherPrompt:
          a.teacherPrompt.length > 200 ? a.teacherPrompt.slice(0, 197) + '…' : a.teacherPrompt,
      }));
    }
    block.accommodations = trimmed;
  }

  // Skip emitting if every section is empty (cold-start / vague prompt).
  const hasAny = Object.values(block).some((v) =>
    Array.isArray(v) ? v.length > 0 : !!v && Object.keys(v).length > 0,
  );
  if (!hasAny) return { systemMessage: null, selectionContext: ctx };

  const systemMessage = [
    'CATALOG_CANDIDATES (you MUST choose IDs from this list when you reference texts,',
    'scaffolds, openers, exit slips, misconceptions, standards, or accommodations.',
    'Do NOT invent new IDs. If nothing fits, ask a clarifying question instead of',
    'fabricating a resource. When you cite a text, copy the title/source/url',
    'verbatim from this list.):',
    'For text selection, every CATALOG_CANDIDATES.texts[] row is student-facing;',
    'never use teacher-PD/reference materials as student reading.',
    '```json',
    JSON.stringify(block, null, 2),
    '```',
  ].join('\n');

  return { systemMessage, selectionContext: ctx };
}
