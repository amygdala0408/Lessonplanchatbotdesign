/**
 * Accommodations rules engine.
 *
 * Evaluates the compiled `applies_when` predicates from
 * `src/data/catalog/accommodations.json` against a `LearnerProfile` and
 * emits accommodations that should be applied to the lesson, grouped by
 * lesson phase and slot target.
 *
 * The DSL was already parsed at build time into a normalized
 * disjunction-of-conjunctions tree, so this runtime is a simple boolean
 * evaluator with no string parsing.
 *
 * Server-only (depends on the catalog loader).
 */

import type { LearnerProfile, LessonPhaseId, NeedsTag } from '../types';

import { getAccommodations } from './catalog';
import type {
  AccommodationCondition,
  AccommodationRecord,
} from './catalog/types';

/**
 * Optional runtime context that can refine accommodation matching beyond what
 * the LearnerProfile carries (e.g. attention chunk minutes, reading band).
 */
export interface AccommodationContext {
  attnChunkMinutes?: number;
  readingBand?: 'early' | 'approaching' | 'on_grade' | 'above';
}

/* ----------------------------------------------------------------------------
 * Predicate evaluation
 * ---------------------------------------------------------------------------*/

function evalCondition(
  cond: AccommodationCondition,
  profile: LearnerProfile,
  ctx: AccommodationContext,
): boolean {
  switch (cond.kind) {
    case 'iep':
      return profile.hasIEP === cond.equals;
    case 'plan_504':
      return profile.has504 === cond.equals;
    case 'el':
      // "EL" status means there's at least one ML in the class with level <= 4
      // (i.e. not yet reclassified). Level 5 is reclassified/proficient.
      return cond.equals
        ? profile.multilingualLevel != null && profile.multilingualLevel <= 4
        : profile.multilingualLevel == null || profile.multilingualLevel === 5;
    case 'ml_level_lte':
      return profile.multilingualLevel != null && profile.multilingualLevel <= cond.value;
    case 'ml_level_gte':
      return profile.multilingualLevel != null && profile.multilingualLevel >= cond.value;
    case 'attn_chunk_minutes_lte':
      return ctx.attnChunkMinutes != null && ctx.attnChunkMinutes <= cond.value;
    case 'needs_tag':
      return profile.needsTags.includes(cond.tag as NeedsTag);
    case 'reading_band_in':
      return ctx.readingBand != null && cond.values.includes(ctx.readingBand);
    default: {
      // Exhaustiveness check.
      const _never: never = cond;
      void _never;
      return false;
    }
  }
}

function predicateMatches(
  acc: AccommodationRecord,
  profile: LearnerProfile,
  ctx: AccommodationContext,
): boolean {
  // Empty predicate = always-on (e.g. "All" labels with no conditions).
  if (acc.appliesWhen.length === 0) {
    // If labels include "All" we consider it always-on; otherwise require a
    // matching plan/EL flag.
    if (acc.labels.includes('All')) return true;
    if (acc.labels.includes('IEP') && profile.hasIEP) return true;
    if (acc.labels.includes('504') && profile.has504) return true;
    if (
      acc.labels.includes('EL') &&
      profile.multilingualLevel != null &&
      profile.multilingualLevel <= 4
    )
      return true;
    return false;
  }
  // Disjunction-of-conjunctions: at least one clause must be all-true.
  return acc.appliesWhen.some((clause) => clause.every((c) => evalCondition(c, profile, ctx)));
}

/* ----------------------------------------------------------------------------
 * Resolution + grouping
 * ---------------------------------------------------------------------------*/

export interface ResolvedAccommodation {
  id: string;
  labels: AccommodationRecord['labels'];
  mode: AccommodationRecord['mode'];
  phaseScope: LessonPhaseId[];
  slotTargets: string[];
  defaultParameters: Record<string, unknown>;
  teacherPrompt: string;
  studentMicrocopy: string;
  udlHlpTags: string[];
  artifact?: AccommodationRecord['artifact'];
  evidence?: AccommodationRecord['evidence'];
}

const ALL_PHASES: LessonPhaseId[] = [
  'launch',
  'model',
  'guided_practice',
  'independent_practice',
  'exit_slip',
];

/**
 * Evaluate every accommodation rule against the learner profile and return the
 * ones that should be applied. Phase scope of `'all'` is expanded to the full
 * phase list so callers can group by phase uniformly.
 */
export function resolveAccommodations(
  profile: LearnerProfile,
  ctx: AccommodationContext = {},
): ResolvedAccommodation[] {
  const all = getAccommodations();
  const matched = all.filter((a) => predicateMatches(a, profile, ctx));
  return matched.map((a) => ({
    id: a.id,
    labels: a.labels,
    mode: a.mode,
    phaseScope: a.phaseScope === 'all' ? ALL_PHASES : a.phaseScope,
    slotTargets: a.slotTargets,
    defaultParameters: a.defaultParameters,
    teacherPrompt: a.teacherPrompt,
    studentMicrocopy: a.studentMicrocopy,
    udlHlpTags: a.udlHlpTags,
    artifact: a.artifact,
    evidence: a.evidence,
  }));
}

/** Group resolved accommodations by lesson phase. */
export function groupAccommodationsByPhase(
  resolved: ResolvedAccommodation[],
): Record<LessonPhaseId, ResolvedAccommodation[]> {
  const out: Record<LessonPhaseId, ResolvedAccommodation[]> = {
    launch: [],
    model: [],
    guided_practice: [],
    independent_practice: [],
    exit_slip: [],
  };
  for (const r of resolved) {
    for (const p of r.phaseScope) {
      if (out[p]) out[p].push(r);
    }
  }
  return out;
}

/** Filter resolved accommodations to those that should appear in a given slot. */
export function accommodationsForSlot(
  resolved: ResolvedAccommodation[],
  phase: LessonPhaseId,
  slot: string,
): ResolvedAccommodation[] {
  return resolved.filter(
    (r) => r.phaseScope.includes(phase) && r.slotTargets.includes(slot),
  );
}
