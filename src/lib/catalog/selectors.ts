/**
 * Catalog selectors.
 *
 * Each selector takes a `SelectionContext` (subject, grade level, topic
 * keyword, target DOK, learner profile, …) and narrows one catalog down to a
 * small set of candidates. The candidates are passed into Penny's system
 * prompt as a constrained vocabulary so she picks from the catalog instead of
 * inventing.
 *
 * All selectors are server-only — they import `./index` which uses Node `fs`.
 */

import type {
  DOKLevel,
  InstructionalModel,
  LearnerProfile,
  LessonPhaseId,
} from '../../types';

import {
  getCitations,
  getExitSlips,
  getInstructionalModels,
  getMisconceptions,
  getOpeners,
  getResources,
  getScaffoldsForSubject,
  getStandards,
  getBilingualGlossary,
} from './index';
import { inferResourceAudience, inferResourceKind, isStudentFacingResource } from './audience';
import type {
  CatalogSubject,
  CitationRecord,
  ExitSlipRecord,
  GlossaryEntryRecord,
  InstructionalModelPhaseRecord,
  MisconceptionRecord,
  OpenerRecord,
  ResourceRecord,
  ScaffoldRecord,
  StandardRecord,
} from './types';

/* ----------------------------------------------------------------------------
 * Selection context
 * ---------------------------------------------------------------------------*/

export interface SelectionContext {
  subject?: string;
  gradeLevel?: string;
  topicKeyword?: string;
  standardCodes?: string[];
  dokTarget?: DOKLevel;
  instructionalModel?: InstructionalModel;
  learnerProfile?: LearnerProfile;
  homeLanguages?: string[];
  /** Free-text title or topic the teacher provided. Used as a fallback signal. */
  topicQuery?: string;
}

/* ----------------------------------------------------------------------------
 * Normalization helpers
 * ---------------------------------------------------------------------------*/

export function normalizeSubject(raw: string | undefined): CatalogSubject {
  const v = (raw || '').trim().toLowerCase();
  if (/(ela|english|reading|literacy|writing|literature|language arts)/.test(v)) return 'ela';
  if (/(math|algebra|geometry|stats|statistic|calculus|number)/.test(v)) return 'math';
  if (/(science|physics|biology|chemistry|earth)/.test(v)) return 'science';
  if (/(social studies|history|civic|geograph|economic)/.test(v)) return 'social_studies';
  if (/(sel|social[-\s_]emotional|advisory|wellness)/.test(v)) return 'sel';
  return 'all';
}

/**
 * Normalize a free-text grade level into a "9-12" / "6-8" / "3-5" / "K-2"
 * band. Returns null if we can't tell.
 */
export function normalizeGradeBand(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  // Accept ranges like "9-12", "9–12", "grades 6-8".
  const rangeMatch = s.match(/(\d{1,2})\s*[\-–to ]+\s*(\d{1,2})/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10);
    const hi = parseInt(rangeMatch[2], 10);
    if (lo <= 5 && hi <= 5) return 'K-5';
    if (lo <= 8 && hi <= 8) return '6-8';
    return '9-12';
  }
  const single = s.match(/(\d{1,2})/);
  if (single) {
    const n = parseInt(single[1], 10);
    if (n <= 2) return 'K-2';
    if (n <= 5) return '3-5';
    if (n <= 8) return '6-8';
    return '9-12';
  }
  if (/kindergarten|^k$/.test(s)) return 'K-2';
  return null;
}

function tokenize(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3);
}

function overlap(a: string | string[], b: string | string[]): number {
  const at = Array.isArray(a) ? a.flatMap(tokenize) : tokenize(a);
  const bt = Array.isArray(b) ? b.flatMap(tokenize) : tokenize(b);
  if (at.length === 0 || bt.length === 0) return 0;
  const setB = new Set(bt);
  let n = 0;
  for (const t of at) if (setB.has(t)) n++;
  return n;
}

function gradeBandMatches(record: string[] | string | undefined, band: string | null): boolean {
  if (!band || !record) return true; // No grade info = everything passes through.
  const arr = Array.isArray(record) ? record : [record];
  return arr.some((r) => {
    const v = (r || '').toLowerCase();
    if (v.includes(band.toLowerCase())) return true;
    // Partial overlap: if record is "9-12" and band is "9-12", match. If
    // record is "K-5" and band is "3-5", match (any digit overlap).
    const rangeMatch = v.match(/(\d{1,2})/g);
    const bandMatch = band.match(/(\d{1,2})/g);
    if (rangeMatch && bandMatch) {
      const rs = rangeMatch.map((n) => parseInt(n, 10));
      const bs = bandMatch.map((n) => parseInt(n, 10));
      const rmin = Math.min(...rs);
      const rmax = Math.max(...rs);
      const bmin = Math.min(...bs);
      const bmax = Math.max(...bs);
      // Overlap.
      return rmax >= bmin && bmax >= rmin;
    }
    return false;
  });
}

/* ----------------------------------------------------------------------------
 * Resources / texts
 * ---------------------------------------------------------------------------*/

export interface SelectedResource extends ResourceRecord {
  score: number;
  format: string;
}

export function inferResourceFormat(resource: {
  title?: string;
  source?: string;
  url?: string;
  accessibility?: string;
}): string {
  const haystack = [resource.title, resource.source, resource.url, resource.accessibility]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\bpoem|poetry|poets?\b/.test(haystack)) return 'poem';
  if (/primary[-\s]?source|loc\.gov|library of congress|archives|document/.test(haystack)) return 'primary_source';
  if (/article|commonlit|newsela|readworks|magazine/.test(haystack)) return 'article';
  if (/simulation|interactive|phet|desmos/.test(haystack)) return 'interactive';
  if (/video|youtube|pbs|ted|khan academy/.test(haystack)) return 'video';
  if (/book|gutenberg|anthology|collection/.test(haystack)) return 'collection';
  return 'resource';
}

export function selectTexts(ctx: SelectionContext, limit = 6): SelectedResource[] {
  const subject = normalizeSubject(ctx.subject);
  const band = normalizeGradeBand(ctx.gradeLevel);
  const topic = [ctx.topicKeyword, ctx.topicQuery].filter(Boolean).join(' ');

  const resources = getResources();
  const scored: SelectedResource[] = resources
    .filter((r) => r.status === 'active')
    // Defense in depth: every layer that could surface a row as a "text"
    // must agree the row is a real student-facing reading.
    //
    // 1. `kind === 'student_reading'` is the primary gate — we ONLY ever
    //    offer single, specific readings (one article, one poem, one
    //    primary source) as text options. Collections, libraries,
    //    anthologies, databases, and teacher PD never qualify regardless
    //    of how they're flagged elsewhere.
    // 2. `isStudentFacingResource` (audience === 'student') is the legacy
    //    gate; we keep it as a belt-and-suspenders check in case the build
    //    classifies a row's `kind` one way and `audience` another.
    .filter((r) => (r.kind ? r.kind === 'student_reading' : inferResourceKind(r) === 'student_reading'))
    .filter(isStudentFacingResource)
    .map((r) => {
      let score = 0;
      // Subject match. We deliberately removed the `subjectTags.includes('all')`
      // wildcard bypass that previously let 53 'all'-tagged rows (mostly
      // teacher PD and cross-domain resource hubs) score +4 against ANY
      // subject prompt. After curation those rows are reclassified by `kind`
      // and never reach this point, but the scoring also now demands an
      // explicit subject match so a stray 'all'-tagged row can't crowd out
      // real subject-aligned readings.
      if (subject === 'all' || r.subjectTags.includes(subject)) {
        score += 4;
      }
      // Topic keyword overlap
      score += overlap(topic, [r.title, r.author, r.source]) * 3;
      // OER preference
      if (r.licenseClass === 'cc-by' || r.licenseClass === 'oer' || r.licenseClass === 'public-domain')
        score += 3;
      else if (r.licenseClass === 'cc-by-sa' || r.licenseClass === 'cc-by-nc') score += 2;
      // Free access preference
      if (r.account === 'free') score += 2;
      else if (r.account === 'free-account') score += 1;
      else if (r.account === 'paid') score -= 2;
      // Accessibility preference
      if (r.captions === 'yes') score += 1;
      if (r.transcript === 'yes') score += 1;
      if (r.keyboardNav === 'yes') score += 1;
      // Subtle penalty when subject doesn't match at all
      if (subject !== 'all' && !r.subjectTags.includes(subject)) {
        score -= 5;
      }
      // Note: gradeBand isn't authoritative on resources yet; we leave room
      // for a backfill in P2. `band` is intentionally unused here so we don't
      // over-filter the 333 resources.
      void band;
      return {
        ...r,
        audience: inferResourceAudience(r),
        format: inferResourceFormat(r),
        score,
      };
    });

  const ranked = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return diversifyTextCandidates(ranked, limit);
}

function diversifyTextCandidates(candidates: SelectedResource[], limit: number): SelectedResource[] {
  const picked: SelectedResource[] = [];
  const pickedIds = new Set<string>();
  const pickedSources = new Set<string>();
  const pickedFormats = new Set<string>();

  const take = (predicate: (r: SelectedResource) => boolean) => {
    for (const candidate of candidates) {
      if (picked.length >= limit) return;
      if (pickedIds.has(candidate.id)) continue;
      if (!predicate(candidate)) continue;
      picked.push(candidate);
      pickedIds.add(candidate.id);
      pickedSources.add(candidate.source.toLowerCase());
      pickedFormats.add(candidate.format);
    }
  };

  take((r) => !pickedSources.has(r.source.toLowerCase()) && !pickedFormats.has(r.format));
  take((r) => !pickedSources.has(r.source.toLowerCase()));
  take(() => true);

  return picked.slice(0, limit);
}

/* ----------------------------------------------------------------------------
 * Instructional model candidates
 * ---------------------------------------------------------------------------*/

export interface InstructionalModelCandidate {
  model: InstructionalModel;
  rationale: string;
  phases: InstructionalModelPhaseRecord[];
}

const MODEL_RATIONALES: Record<InstructionalModel, (subject: CatalogSubject) => string> = {
  'Explicit Instruction': () =>
    'High-leverage when introducing a new procedure or skill. Strong fit for explicit modeling and frequent CFUs.',
  '5E Inquiry': () =>
    'Strong fit for science / phenomena-based learning where students need to engage and explore before formal explanation.',
  'Project-Based Learning': () =>
    'Strong fit when an authentic, multi-day product anchors the learning and a Driving Question is appropriate.',
  'Cooperative Learning': () =>
    'Strong fit when interdependence and structured collaboration accelerate learning and equity of voice.',
  'Socratic Seminar': () =>
    'Strong fit when students are analyzing a complex text or evaluating ideas through evidence-based dialogue.',
  'Workshop Model': () =>
    'Strong fit for writing / reading workshops where mini-lesson + sustained independent practice + share-out is the norm.',
  'Flipped Classroom': () =>
    'Strong fit when pre-work can offload direct instruction and class time can prioritize collaborative application.',
};

export function selectInstructionalModelCandidates(
  ctx: SelectionContext,
  limit = 3,
): InstructionalModelCandidate[] {
  const subject = normalizeSubject(ctx.subject);
  const phases = getInstructionalModels();
  const grouped = new Map<InstructionalModel, InstructionalModelPhaseRecord[]>();
  for (const p of phases) {
    if (!grouped.has(p.model)) grouped.set(p.model, []);
    grouped.get(p.model)!.push(p);
  }

  // Subject-aware ranking.
  const ranked: { model: InstructionalModel; score: number }[] = [];
  for (const [model] of grouped) {
    let score = 1;
    if (subject === 'science' && model === '5E Inquiry') score += 4;
    if (subject === 'ela' && (model === 'Workshop Model' || model === 'Socratic Seminar'))
      score += 3;
    if (subject === 'math' && (model === 'Explicit Instruction' || model === 'Cooperative Learning'))
      score += 3;
    if (subject === 'social_studies' && (model === 'Socratic Seminar' || model === 'Project-Based Learning'))
      score += 3;
    if (subject === 'sel' && model === 'Cooperative Learning') score += 3;
    // Favor explicit instruction as a safe default.
    if (model === 'Explicit Instruction') score += 1;
    ranked.push({ model, score });
  }
  ranked.sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map(({ model }) => ({
    model,
    rationale: MODEL_RATIONALES[model](subject),
    phases: (grouped.get(model) || []).sort((a, b) => a.phaseOrder - b.phaseOrder),
  }));
}

/* ----------------------------------------------------------------------------
 * Openers
 * ---------------------------------------------------------------------------*/

export interface SelectedOpener extends OpenerRecord {
  score: number;
}

export function selectOpeners(ctx: SelectionContext, limit = 3): SelectedOpener[] {
  const subject = normalizeSubject(ctx.subject);
  const topic = [ctx.topicKeyword, ctx.topicQuery].filter(Boolean).join(' ');

  return getOpeners()
    .map((o) => {
      let score = 0;
      if (subject === 'all' || o.subject === subject || o.subject === 'all') score += 3;
      score += overlap(topic, [o.topicKeyword, o.hookText, o.learningIntentionStem]) * 2;
      if (ctx.dokTarget && o.dokFloor <= ctx.dokTarget) score += 1;
      return { ...o, score };
    })
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ----------------------------------------------------------------------------
 * Scaffolds
 * ---------------------------------------------------------------------------*/

export interface SelectedScaffold extends ScaffoldRecord {
  score: number;
}

export function selectScaffoldsForPhase(
  ctx: SelectionContext,
  phase: LessonPhaseId,
  limit = 4,
): SelectedScaffold[] {
  const subject = normalizeSubject(ctx.subject);
  const band = normalizeGradeBand(ctx.gradeLevel);
  const topic = [ctx.topicKeyword, ctx.topicQuery].filter(Boolean).join(' ');
  const scaffolds = subject === 'all'
    ? getScaffoldsForSubject('all')
    : getScaffoldsForSubject(subject);

  // Phase-to-scaffold-type rough affinity.
  const phaseAffinity: Record<LessonPhaseId, Record<string, number>> = {
    launch: { metacognitive: 2, linguistic: 2, affective: 2, cognitive: 1 },
    model: { cognitive: 3, metacognitive: 1, linguistic: 1 },
    guided_practice: { cognitive: 2, social_collaborative: 3, linguistic: 2 },
    independent_practice: { cognitive: 2, metacognitive: 2, linguistic: 1 },
    exit_slip: { metacognitive: 3, linguistic: 1 },
  };

  const scored: SelectedScaffold[] = scaffolds
    .filter((s) => gradeBandMatches(s.gradeBands, band))
    .map((s) => {
      let score = 0;
      const affinity = phaseAffinity[phase] || {};
      score += affinity[s.type] || 0;
      score += overlap(topic, [s.name, s.problemType, s.targetMisconception]) * 2;
      if (ctx.dokTarget && s.dokLevel <= ctx.dokTarget) score += 1;
      // Equity score is 1-5.
      score += (s.equityScore || 0) / 5;
      return { ...s, score };
    });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ----------------------------------------------------------------------------
 * Exit slips
 * ---------------------------------------------------------------------------*/

export interface SelectedExitSlip extends ExitSlipRecord {
  score: number;
}

export function selectExitSlips(ctx: SelectionContext, limit = 3): SelectedExitSlip[] {
  const subject = normalizeSubject(ctx.subject);
  const topic = [ctx.topicKeyword, ctx.topicQuery].filter(Boolean).join(' ');

  return getExitSlips()
    .map((e) => {
      let score = 0;
      if (e.subject === subject || e.subject === 'all') score += 3;
      score += overlap(topic, [e.topicKeyword, e.prompt]) * 2;
      if (ctx.dokTarget) {
        // Prefer slips at the same DOK floor, allow up to one above target.
        const diff = Math.abs(e.dokFloor - ctx.dokTarget);
        score += diff === 0 ? 2 : diff === 1 ? 1 : 0;
      }
      return { ...e, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ----------------------------------------------------------------------------
 * Misconceptions
 * ---------------------------------------------------------------------------*/

export interface SelectedMisconception extends MisconceptionRecord {
  score: number;
}

export function selectMisconceptions(
  ctx: SelectionContext,
  limit = 3,
): SelectedMisconception[] {
  const subject = normalizeSubject(ctx.subject);
  const topic = [ctx.topicKeyword, ctx.topicQuery].filter(Boolean).join(' ');

  return getMisconceptions()
    .map((m) => {
      let score = 0;
      if (m.subject === subject || m.subject === 'all') score += 3;
      score += overlap(topic, [m.standardKeyword, m.misconception, m.exemplarRationale]) * 2;
      return { ...m, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ----------------------------------------------------------------------------
 * Bilingual glossary
 * ---------------------------------------------------------------------------*/

export function selectGlossaryEntries(
  ctx: SelectionContext,
  vocab: string[],
  limit = 12,
): GlossaryEntryRecord[] {
  if (!vocab || vocab.length === 0) return [];
  const wanted = new Set(vocab.map((v) => v.toLowerCase().trim()));
  const langs = new Set([
    'en',
    ...(ctx.homeLanguages || ctx.learnerProfile?.homeLanguages || []).map((l) =>
      l.toLowerCase(),
    ),
  ]);
  return getBilingualGlossary()
    .filter((g) => wanted.has(g.term.toLowerCase()) && langs.has(g.language))
    .slice(0, limit);
}

/* ----------------------------------------------------------------------------
 * Standards
 * ---------------------------------------------------------------------------*/

export function selectStandards(
  ctx: SelectionContext,
  limit = 5,
): StandardRecord[] {
  const subject = normalizeSubject(ctx.subject);
  const topic = [ctx.topicKeyword, ctx.topicQuery].filter(Boolean).join(' ');
  const standards = getStandards();

  // Direct code match has highest priority.
  if (ctx.standardCodes && ctx.standardCodes.length > 0) {
    const set = new Set(ctx.standardCodes.map((c) => c.toUpperCase()));
    const direct = standards.filter((s) => set.has(s.id.toUpperCase()));
    if (direct.length > 0) return direct.slice(0, limit);
  }
  return standards
    .map((s) => {
      let score = 0;
      if (s.subject === subject) score += 3;
      score += overlap(topic, [s.strand, s.description]) * 2;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

/* ----------------------------------------------------------------------------
 * Citations
 * ---------------------------------------------------------------------------*/

export function selectCitations(keys: string[]): CitationRecord[] {
  if (!keys || keys.length === 0) return [];
  const set = new Set(keys);
  return getCitations().filter((c) => set.has(c.id));
}
