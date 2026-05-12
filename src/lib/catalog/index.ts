/**
 * Catalog runtime loader.
 *
 * Server-only. Reads compiled JSON from `src/data/catalog/` via the Node
 * filesystem so the catalog stays out of the client bundle (the bilingual
 * glossary alone is ~1.5 MB). Each loader memoizes after the first read.
 *
 * The catalogs are produced by `npm run catalog:build` from CSVs vendored in
 * `catalog-sources/`. Re-running the build is idempotent.
 *
 * Always import from `'@/lib/catalog'` in API routes / server components.
 * Never import this file from a "use client" component.
 */

import fs from 'fs';
import path from 'path';

import type {
  AccommodationRecord,
  CitationRecord,
  DokLexiconRecord,
  EquipUdlRubric,
  ExitSlipRecord,
  GlossaryEntryRecord,
  InstructionalModelPhaseRecord,
  LessonPhaseRecord,
  MisconceptionRecord,
  OpenerRecord,
  RepresentationTagRecord,
  ResourceRecord,
  ScaffoldRecord,
  StandardRecord,
} from './types';
import type { CatalogSubject } from './types';

const CATALOG_DIR = path.resolve(process.cwd(), 'src', 'data', 'catalog');

const cache = new Map<string, unknown>();

function load<T>(name: string): T {
  if (cache.has(name)) return cache.get(name) as T;
  const p = path.join(CATALOG_DIR, name);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Catalog file missing: ${name}. Run \`npm run catalog:build\` to generate it.`,
    );
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  cache.set(name, data);
  return data;
}

/* ----- Public loaders --------------------------------------------------- */

export const getLessonPhases = (): LessonPhaseRecord[] =>
  load<LessonPhaseRecord[]>('lesson_phases.json');

export const getDokLexicon = (): DokLexiconRecord[] =>
  load<DokLexiconRecord[]>('dok_lexicon.json');

export const getInstructionalModels = (): InstructionalModelPhaseRecord[] =>
  load<InstructionalModelPhaseRecord[]>('instructional_models.json');

export const getRepresentationTags = (): RepresentationTagRecord[] =>
  load<RepresentationTagRecord[]>('representation_tags.json');

export const getEquipUdlRubric = (): EquipUdlRubric =>
  load<EquipUdlRubric>('equip_udl_rubric.json');

export const getResources = (): ResourceRecord[] =>
  load<ResourceRecord[]>('resources.json');

export const getExitSlips = (): ExitSlipRecord[] =>
  load<ExitSlipRecord[]>('exit_slips.json');

export const getOpeners = (): OpenerRecord[] => load<OpenerRecord[]>('openers.json');

export const getMisconceptions = (): MisconceptionRecord[] =>
  load<MisconceptionRecord[]>('misconceptions.json');

export const getScaffoldsForSubject = (subject: CatalogSubject): ScaffoldRecord[] => {
  if (subject === 'all') {
    return [
      ...getScaffoldsForSubject('ela'),
      ...getScaffoldsForSubject('math'),
      ...getScaffoldsForSubject('science'),
      ...getScaffoldsForSubject('sel'),
      ...getScaffoldsForSubject('social_studies'),
    ];
  }
  return load<ScaffoldRecord[]>(`scaffolds_${subject}.json`);
};

export const getBilingualGlossary = (): GlossaryEntryRecord[] =>
  load<GlossaryEntryRecord[]>('bilingual_glossary.json');

export const getCitations = (): CitationRecord[] =>
  load<CitationRecord[]>('citations.json');

export const getAccommodations = (): AccommodationRecord[] =>
  load<AccommodationRecord[]>('accommodations.json');

export const getStandards = (): StandardRecord[] =>
  load<StandardRecord[]>('standards.json');

export const getCatalogManifest = (): {
  builtAt: string;
  version: number;
  files: { name: string; rowCount: number }[];
} => load('manifest.json');

/** Reset the in-process cache. Useful in tests or when hot-reloading. */
export function clearCatalogCache(): void {
  cache.clear();
}
