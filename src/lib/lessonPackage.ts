/**
 * Lesson package resolver.
 *
 * Once a plan is finalized, we resolve every catalog ID Penny picked into
 * its full record so the printable package can render real content (rather
 * than placeholders).
 *
 * Server-only.
 */

import {
  getAccommodations,
  getBilingualGlossary,
  getCitations,
  getExitSlips,
  getMisconceptions,
  getOpeners,
  getResources,
  getScaffoldsForSubject,
} from './catalog';
import { groupAccommodationsByPhase, resolveAccommodations } from './accommodations';
import type { LearnerProfile, LessonPhaseId, LessonPlanData } from '../types';
import type {
  AccommodationRecord,
  CitationRecord,
  ExitSlipRecord,
  GlossaryEntryRecord,
  MisconceptionRecord,
  OpenerRecord,
  ResourceRecord,
  ScaffoldRecord,
} from './catalog/types';

export interface ResolvedLessonPackage {
  /** Resolved accommodations grouped by lesson phase, plus their evidence/artifact refs. */
  accommodationsByPhase: Record<LessonPhaseId, AccommodationRecord[]>;
  /** Misconceptions referenced by id in plan.misconceptionIds. */
  misconceptions: MisconceptionRecord[];
  /** Bilingual glossary entries for plan.materials/objectives in the teacher's home languages. */
  glossary: GlossaryEntryRecord[];
  /** Research citations referenced by plan.evidenceCitationKeys + scaffold evidence. */
  citations: CitationRecord[];
  /** Resources referenced by plan.resourceIds + textOptions[].resourceId. */
  resources: ResourceRecord[];
  /** Scaffolds referenced by procedure[i].scaffoldIds, grouped by phase. */
  scaffoldsByPhase: Record<LessonPhaseId, ScaffoldRecord[]>;
  /** Resolved opener / exit slip if Penny picked them. */
  opener?: OpenerRecord;
  exitSlip?: ExitSlipRecord;
}

const EMPTY_PHASE_MAP: Record<LessonPhaseId, never[]> = {
  launch: [],
  model: [],
  guided_practice: [],
  independent_practice: [],
  exit_slip: [],
};

function clonePhaseMap<T>(): Record<LessonPhaseId, T[]> {
  return {
    launch: [],
    model: [],
    guided_practice: [],
    independent_practice: [],
    exit_slip: [],
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const i of items) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
}

function inferVocabFromPlan(plan: Partial<LessonPlanData>): string[] {
  const text = [
    plan.title,
    plan.assessment,
    ...(plan.objectives ?? []).map((o) => (typeof o === 'string' ? o : o.text)),
    ...(plan.materials ?? []),
    ...(plan.successCriteria ?? []),
  ]
    .filter(Boolean)
    .join(' ');
  // Extract notable academic verbs / nouns by lowercasing and splitting on
  // non-word characters. We keep tokens that look like Tier-2 academic words
  // (4+ chars, not numbers, not very common stopwords).
  const STOP = new Set([
    'the', 'and', 'for', 'with', 'their', 'this', 'that', 'will', 'from', 'into',
    'about', 'using', 'when', 'have', 'been', 'were', 'than', 'they', 'them',
    'each', 'such', 'while', 'students', 'student', 'lesson', 'today', 'class',
    'work', 'task', 'tasks', 'group', 'groups',
  ]);
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    ),
  );
}

export function resolveLessonPackage(
  plan: Partial<LessonPlanData>,
  learnerProfile?: LearnerProfile | null,
): ResolvedLessonPackage {
  // ----- Resources --------------------------------------------------------
  const resourceIds = new Set<string>();
  for (const id of plan.resourceIds ?? []) resourceIds.add(id);
  for (const t of plan.textOptions ?? []) {
    if (t.resourceId) resourceIds.add(t.resourceId);
  }
  const allResources = getResources();
  const resources = uniqueById(allResources.filter((r) => resourceIds.has(r.id)));

  // ----- Scaffolds (per phase) -------------------------------------------
  const scaffoldIdsByPhase: Record<LessonPhaseId, Set<string>> = {
    launch: new Set(),
    model: new Set(),
    guided_practice: new Set(),
    independent_practice: new Set(),
    exit_slip: new Set(),
  };
  for (const step of plan.procedure ?? []) {
    const phase = step.phase as LessonPhaseId | undefined;
    if (!phase) continue;
    for (const sid of step.scaffoldIds ?? []) scaffoldIdsByPhase[phase].add(sid);
  }
  const allScaffolds = getScaffoldsForSubject('all');
  const scaffoldsByPhase = clonePhaseMap<ScaffoldRecord>();
  for (const phase of Object.keys(scaffoldIdsByPhase) as LessonPhaseId[]) {
    const ids = scaffoldIdsByPhase[phase];
    if (ids.size === 0) continue;
    scaffoldsByPhase[phase] = uniqueById(allScaffolds.filter((s) => ids.has(s.id)));
  }

  // ----- Accommodations ---------------------------------------------------
  const accIdsByPhase: Record<LessonPhaseId, Set<string>> = {
    launch: new Set(),
    model: new Set(),
    guided_practice: new Set(),
    independent_practice: new Set(),
    exit_slip: new Set(),
  };
  for (const step of plan.procedure ?? []) {
    const phase = step.phase as LessonPhaseId | undefined;
    if (!phase) continue;
    for (const aid of step.accommodationIds ?? []) accIdsByPhase[phase].add(aid);
  }
  const allAccommodations = getAccommodations();
  const accommodationsByPhase = clonePhaseMap<AccommodationRecord>();
  for (const phase of Object.keys(accIdsByPhase) as LessonPhaseId[]) {
    const ids = accIdsByPhase[phase];
    if (ids.size > 0) {
      accommodationsByPhase[phase] = uniqueById(allAccommodations.filter((a) => ids.has(a.id)));
    }
  }
  // If Penny didn't emit explicit accommodation IDs but we have a learner
  // profile, surface the rules-engine matches as a fallback so the print
  // package isn't empty for IEP/504/EL classes.
  const noExplicit = Object.values(accommodationsByPhase).every((arr) => arr.length === 0);
  if (noExplicit && learnerProfile) {
    const resolved = resolveAccommodations(learnerProfile, {});
    if (resolved.length > 0) {
      const grouped = groupAccommodationsByPhase(resolved);
      const fullById = new Map(allAccommodations.map((a) => [a.id, a]));
      for (const phase of Object.keys(grouped) as LessonPhaseId[]) {
        accommodationsByPhase[phase] = grouped[phase]
          .map((g) => fullById.get(g.id))
          .filter((a): a is AccommodationRecord => !!a);
      }
    }
  }

  // ----- Misconceptions ---------------------------------------------------
  const miscIds = new Set(plan.misconceptionIds ?? []);
  const misconceptions = uniqueById(getMisconceptions().filter((m) => miscIds.has(m.id)));

  // ----- Citations --------------------------------------------------------
  const citationIds = new Set(plan.evidenceCitationKeys ?? []);
  // Pull in any citations referenced by the resolved scaffolds too.
  for (const phase of Object.keys(scaffoldsByPhase) as LessonPhaseId[]) {
    for (const s of scaffoldsByPhase[phase]) {
      for (const k of s.evidenceCitationKeys) citationIds.add(k);
    }
  }
  const citations = uniqueById(getCitations().filter((c) => citationIds.has(c.id)));

  // ----- Glossary ---------------------------------------------------------
  // Prefer learner-profile home languages; default to en+es so we *always*
  // surface a bilingual reference pair (covers the most common classroom
  // case). The print package looks dramatically thinner without a glossary,
  // and the catalog has 1000+ curated entries — using them is the whole
  // point of having a content library.
  const profileLangs = (learnerProfile?.homeLanguages ?? []).map((l) => l.toLowerCase());
  const wantedLangs = new Set(['en', ...profileLangs, ...(profileLangs.length === 0 ? ['es'] : [])]);
  const vocab = new Set(inferVocabFromPlan(plan));
  const allGlossary = getBilingualGlossary();
  let glossary = allGlossary.filter(
    (g) => wantedLangs.has(g.language) && vocab.has(g.term.toLowerCase()),
  );

  // Always-on fallback: if plan-text inference yielded nothing useful, surface
  // the top tier-2 academic verbs from the catalog (analyze, argue, cite,
  // compare, evaluate, justify, infer, summarize, synthesize). These are the
  // verbs that show up most often in DOK 2-4 objectives across subjects.
  if (glossary.length < 6) {
    const PRIORITY_TERMS = [
      'analyze', 'argue', 'cite', 'compare', 'contrast', 'evaluate',
      'justify', 'infer', 'summarize', 'synthesize', 'classify',
      'construct', 'evidence', 'claim',
    ];
    const fallback = allGlossary.filter(
      (g) => wantedLangs.has(g.language) && PRIORITY_TERMS.includes(g.term.toLowerCase()),
    );
    // Merge: keep any vocab-matched entries first, then top up with priority.
    const seen = new Set(glossary.map((g) => `${g.termId}|${g.language}`));
    for (const g of fallback) {
      const key = `${g.termId}|${g.language}`;
      if (!seen.has(key)) {
        seen.add(key);
        glossary.push(g);
      }
    }
    // Cap to 24 entries so the print page stays one sheet.
    glossary = glossary.slice(0, 24);
  }

  // ----- Opener / Exit Slip ----------------------------------------------
  const opener = plan.openerId
    ? getOpeners().find((o) => o.id === plan.openerId)
    : undefined;
  const exitSlip = plan.exitSlipId
    ? getExitSlips().find((e) => e.id === plan.exitSlipId)
    : undefined;

  // Note: EMPTY_PHASE_MAP is exported above only to silence unused-import
  // warnings if something else needs it; suppress here.
  void EMPTY_PHASE_MAP;

  return {
    accommodationsByPhase,
    misconceptions,
    glossary,
    citations,
    resources,
    scaffoldsByPhase,
    opener,
    exitSlip,
  };
}
