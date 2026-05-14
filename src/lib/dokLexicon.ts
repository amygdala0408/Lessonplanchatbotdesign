/**
 * DOK lexicon helpers.
 *
 * Loads `src/data/catalog/dok_lexicon.json` (81 rows across ELA, math,
 * science, social studies, SEL) and exposes:
 *   - `lookupVerbDok(verb, subject?)` — get the canonical DOK level(s) for a
 *     verb, optionally biased by subject.
 *   - `extractObjectiveVerb(text)` — pull the leading verb from an
 *     objective sentence ("Students will analyze..." → "analyze").
 *   - `validateObjectiveDok(objective, subject)` — emit ValidationError
 *     entries when an objective's verb misaligns with its claimed DOK.
 *
 * Used by the finalize gate so an objective that says "DOK 3 / list..." or
 * "DOK 1 / evaluate..." surfaces as a warning the teacher can act on.
 * Severity is `warning` (not `error`) because DOK assignment is partly
 * subjective and we don't want to block finalize on edge cases.
 */

import dokLexiconRaw from '../data/catalog/dok_lexicon.json';
import type { ValidationError, DOKLevel } from '../types';

interface DokLexiconRow {
  subject: 'ela' | 'math' | 'science' | 'social_studies' | 'sel';
  dokLevel: 1 | 2 | 3 | 4;
  verb: string;
  signal?: string;
  notes?: string;
}

const lexicon = dokLexiconRaw as DokLexiconRow[];

export type DokSubject = DokLexiconRow['subject'];

/**
 * Map of verb → array of {subject, dok} entries. A verb may legitimately
 * appear at different DOK levels in different subjects (e.g. "model"
 * skews higher in math than in social studies); the lookup picks the
 * subject-matching row first, then falls back to the cross-subject
 * minimum DOK so we don't over-flag warnings.
 */
const verbIndex: Map<string, { subject: DokSubject; dok: 1 | 2 | 3 | 4 }[]> = (() => {
  const m = new Map<string, { subject: DokSubject; dok: 1 | 2 | 3 | 4 }[]>();
  for (const row of lexicon) {
    const key = row.verb.trim().toLowerCase();
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push({ subject: row.subject, dok: row.dokLevel });
  }
  return m;
})();

/** Normalize a free-text subject string into one of the lexicon subjects. */
export function normalizeDokSubject(raw: string | null | undefined): DokSubject | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (/(ela|english|reading|literacy|writing|literature|language arts)/.test(v)) return 'ela';
  if (/(math|algebra|geometry|stats|statistic|calculus|number)/.test(v)) return 'math';
  if (/(science|physics|biology|chemistry|earth|stem)/.test(v)) return 'science';
  if (/(social|history|civic|geograph|economic)/.test(v)) return 'social_studies';
  if (/(sel|advisor|wellness|social[-\s_]emotional)/.test(v)) return 'sel';
  return null;
}

export interface VerbDokMatch {
  verb: string;
  /** Canonical DOK level(s) the lexicon assigns to this verb. */
  candidates: { subject: DokSubject; dok: 1 | 2 | 3 | 4 }[];
  /** Best DOK match for the given subject, falling back to the median. */
  bestDok: 1 | 2 | 3 | 4 | null;
}

export function lookupVerbDok(verb: string, subject?: DokSubject | null): VerbDokMatch {
  const key = verb.trim().toLowerCase();
  const candidates = verbIndex.get(key) ?? [];
  if (candidates.length === 0) {
    return { verb: key, candidates: [], bestDok: null };
  }
  // Prefer the subject-matched row when available.
  const subjectMatch = subject ? candidates.find((c) => c.subject === subject) : undefined;
  if (subjectMatch) {
    return { verb: key, candidates, bestDok: subjectMatch.dok };
  }
  // Fall back to the lowest cross-subject DOK so we err on the side of NOT
  // flagging a warning when the verb has multiple legitimate readings.
  const minDok = candidates.reduce<1 | 2 | 3 | 4>(
    (acc, c) => (c.dok < acc ? c.dok : acc),
    candidates[0].dok,
  );
  return { verb: key, candidates, bestDok: minDok };
}

/**
 * Pull the leading action verb from an objective. Tolerant of "Students
 * will...", "Students will be able to...", "I can...", "By the end of
 * class, students will...", and a few other common stems.
 */
export function extractObjectiveVerb(text: string): string | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^(by the end of [^,]+,\s*)/i, '')
    .replace(/^(students?\s+will(\s+be\s+able\s+to)?\s+)/i, '')
    .replace(/^(i\s+can\s+)/i, '')
    .replace(/^(learners?\s+will\s+)/i, '');

  const match = cleaned.match(/^([a-z][a-z'-]+)/i);
  if (!match) return null;
  return match[1].toLowerCase();
}

export function suggestVerbsForDok(dok: DOKLevel, subject?: DokSubject | null, limit = 4): string[] {
  let pool = lexicon.filter((r) => r.dokLevel === dok);
  if (subject) {
    const subjectPool = pool.filter((r) => r.subject === subject);
    if (subjectPool.length > 0) pool = subjectPool;
  }
  // Stable order: same subject first, then by verb.
  return pool
    .slice()
    .sort((a, b) => a.verb.localeCompare(b.verb))
    .slice(0, limit)
    .map((r) => r.verb);
}

/**
 * Emit ValidationErrors when an objective's verb misaligns with its DOK.
 *
 * - If the verb maps to a DOK that's >=2 levels off the claimed DOK, emit a
 *   warning with a suggested replacement verb.
 * - If the claimed DOK is 1 but the verb is DOK 3+ (almost always a model
 *   miscount), emit a warning.
 * - If the verb is unknown to the lexicon, emit an info-level warning so
 *   the teacher knows we couldn't auto-check it (still allowed).
 */
export function validateObjectiveDok(args: {
  objectiveText: string;
  claimedDok: DOKLevel;
  subject?: string | null;
  pathPrefix?: string;
}): ValidationError[] {
  const errors: ValidationError[] = [];
  const subject = normalizeDokSubject(args.subject ?? null);
  const verb = extractObjectiveVerb(args.objectiveText);
  const path = args.pathPrefix ?? 'objective';

  if (!verb) {
    errors.push({
      path,
      message: `Couldn't find a leading verb in objective "${args.objectiveText.slice(0, 60)}…". Aim for "Students will [verb] …" so the DOK can be auto-checked.`,
      severity: 'warning',
    });
    return errors;
  }

  const match = lookupVerbDok(verb, subject);
  if (match.bestDok === null) {
    // Unknown verb — soft note, with suggested replacements at this DOK.
    const suggestions = suggestVerbsForDok(args.claimedDok, subject, 4);
    errors.push({
      path,
      message: `Verb "${verb}" isn't in the DOK lexicon, so the DOK ${args.claimedDok} claim couldn't be auto-checked. Closest DOK ${args.claimedDok} verbs: ${suggestions.join(', ')}.`,
      severity: 'warning',
    });
    return errors;
  }

  const drift = match.bestDok - args.claimedDok;
  if (Math.abs(drift) >= 2) {
    const suggestions = suggestVerbsForDok(args.claimedDok, subject, 4);
    errors.push({
      path,
      message: `Verb "${verb}" maps to DOK ${match.bestDok} but the objective claims DOK ${args.claimedDok}. Either rewrite the objective with a DOK ${args.claimedDok} verb (${suggestions.join(', ')}) or update the DOK level.`,
      severity: 'warning',
    });
  } else if (args.claimedDok === 1 && match.bestDok >= 3) {
    // Defensive: also catch the explicit "low DOK with high-DOK verb" case.
    const suggestions = suggestVerbsForDok(1, subject, 4);
    errors.push({
      path,
      message: `Verb "${verb}" suggests deeper thinking (DOK ${match.bestDok}) than the claimed DOK 1. If you really mean recall, try ${suggestions.join(', ')}.`,
      severity: 'warning',
    });
  }
  return errors;
}
