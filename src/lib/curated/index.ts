/**
 * Curated-content loader (research-content-additions plan, items C1/B1/A4).
 *
 * Server-only, mirroring `src/lib/catalog/index.ts`: reads draft JSON from
 * `src/data/curated/` via the filesystem and memoizes. Unlike the catalog
 * loader, EVERY loader here degrades gracefully — the curated files are
 * drafts pending teacher voice review, and a missing or malformed file must
 * never break prompt assembly or scoring. Callers always get a usable
 * (possibly empty) value.
 */

import fs from 'fs';
import path from 'path';

const CURATED_DIR = path.resolve(process.cwd(), 'src', 'data', 'curated');

const cache = new Map<string, unknown>();

function loadOptional<T>(name: string, fallback: T): T {
  if (cache.has(name)) return cache.get(name) as T;
  let data: T = fallback;
  try {
    const p = path.join(CURATED_DIR, name);
    if (fs.existsSync(p)) {
      data = JSON.parse(fs.readFileSync(p, 'utf8')) as T;
    }
  } catch (err) {
    console.warn(`[curated] failed to load ${name}; continuing without it:`, err);
  }
  cache.set(name, data);
  return data;
}

/* ----- C1: EQuIP+UDL score-calibration exemplars ------------------------- */

export interface EquipUdlExemplar {
  dimension: string;
  score: 0 | 1 | 2 | 3;
  exemplar: string;
  annotation: string;
}

export function getEquipUdlExemplars(): EquipUdlExemplar[] {
  const file = loadOptional<{ exemplars?: EquipUdlExemplar[] }>('equip_udl_exemplars.json', {});
  return Array.isArray(file.exemplars) ? file.exemplars : [];
}

/* ----- B1: verbatim teacher-language exemplars per scaffold --------------- */

export function getTeacherLanguageExemplars(): Record<string, string[]> {
  const file = loadOptional<{ exemplars?: Record<string, string[]> }>(
    'teacher_language_exemplars.json',
    {},
  );
  return file.exemplars && typeof file.exemplars === 'object' ? file.exemplars : {};
}

/** Exemplars for one scaffold id, or empty array when none drafted yet. */
export function getTeacherLanguageForScaffold(scaffoldId: string): string[] {
  return getTeacherLanguageExemplars()[scaffoldId] ?? [];
}

/* ----- A4: why_for_teacher rationales per accommodation rule -------------- */

export function getWhyForTeacherRationales(): Record<string, string> {
  const file = loadOptional<{ rationales?: Record<string, string> }>('why_for_teacher.json', {});
  return file.rationales && typeof file.rationales === 'object' ? file.rationales : {};
}

/** Rationale for one accommodation id, or undefined when none drafted yet. */
export function getWhyForTeacher(accommodationId: string): string | undefined {
  return getWhyForTeacherRationales()[accommodationId];
}
