/**
 * Typed catalog records.
 *
 * Every JSON file emitted by `scripts/build-catalog.ts` into `src/data/catalog/`
 * conforms to one of these shapes. These types are the single source of truth
 * for both the build script and the runtime selectors.
 */

import type {
  DOKLevel,
  InstructionalModel,
  LessonPhaseId,
  NeedsTag,
} from '../../types';

/* -----------------------------------------------------------------------------
 * Lesson phase manifest
 * ---------------------------------------------------------------------------*/

export interface LessonPhaseRecord {
  id: LessonPhaseId;
  order: number;
  hasTimer: boolean;
  hasGrouping: boolean;
  hasAssessmentItems: boolean;
  textSlots: string[];
  defaultMinutesMin: number;
  defaultMinutesMax: number;
}

/* -----------------------------------------------------------------------------
 * DOK lexicon
 * ---------------------------------------------------------------------------*/

export type CatalogSubject = 'ela' | 'math' | 'science' | 'social_studies' | 'sel' | 'all';

export interface DokLexiconRecord {
  subject: CatalogSubject;
  dokLevel: DOKLevel;
  verb: string;
  signal: string;
  notes: string;
}

/* -----------------------------------------------------------------------------
 * Instructional models (one record per (model, phase))
 * ---------------------------------------------------------------------------*/

export interface InstructionalModelPhaseRecord {
  model: InstructionalModel;
  phase: string;
  phaseOrder: number;
  description: string;
  exampleTeacherMoves: string;
  expectedStrategyTypes: string[];
  resources: string[];
}

/* -----------------------------------------------------------------------------
 * Representation tags (CRP / CSP / UDL framing)
 * ---------------------------------------------------------------------------*/

export interface RepresentationTagRecord {
  id: string;
  category: string;
  label: string;
  description: string;
}

/* -----------------------------------------------------------------------------
 * EQuIP+UDL rubric
 * ---------------------------------------------------------------------------*/

export interface RubricCriterionRecord {
  id: string;
  title: string;
  levels: { score: 0 | 1 | 2 | 3; descriptor: string }[];
}

export interface EquipUdlRubric {
  passThreshold: { averageMin: number; noCategoryAt: number };
  criteria: RubricCriterionRecord[];
}

/* -----------------------------------------------------------------------------
 * Resource bank
 * ---------------------------------------------------------------------------*/

export type ResourceLicenseClass =
  | 'oer'
  | 'cc-by'
  | 'cc-by-sa'
  | 'cc-by-nc'
  | 'public-domain'
  | 'fair-use'
  | 'free-account'
  | 'paid'
  | 'unknown';

export type ResourceAudience = 'student' | 'teacher';

/**
 * What kind of resource this row represents.
 *
 * - `student_reading` — a single, specific student-facing reading or media
 *   asset Penny can recommend as a lesson text. One article, one poem, one
 *   short story, one primary source document, one short video.
 * - `collection` — a browseable library/anthology/database/archive/hub. A
 *   teacher uses these as a *finding aid* to pick a specific reading from.
 *   They are NEVER themselves a student reading.
 * - `teacher_reference` — professional development, frameworks, practice
 *   guides, intervention research portals, advocacy hubs. Penny may mention
 *   them to the teacher as background, but never picks them as student
 *   readings.
 * - `interactive` — simulations, interactive tools (PhET, Desmos, etc.) that
 *   students actually use. Treated similarly to student_reading for text
 *   selection but flagged for richer affordances later.
 */
export type ResourceKind = 'student_reading' | 'collection' | 'teacher_reference' | 'interactive';

export interface ResourceRecord {
  id: string;
  title: string;
  author: string;
  source: string;
  url: string;
  license: string;
  licenseClass: ResourceLicenseClass;
  subject: string;
  subjectTags: CatalogSubject[];
  accessibility: string;
  tasl: string;
  status: string;
  captions: string;
  transcript: string;
  keyboardNav: string;
  audience: ResourceAudience;
  /** What kind of resource this is. See {@link ResourceKind}. */
  kind: ResourceKind;
  // Backfilled / inferred metadata. Empty when unknown.
  gradeBand?: string;
  lexile?: number;
  representationTags?: string[];
  audio?: 'yes' | 'no' | 'unknown';
  account?: 'free' | 'free-account' | 'paid' | 'unknown';
}

/* -----------------------------------------------------------------------------
 * Exit slips, openers, misconceptions
 * ---------------------------------------------------------------------------*/

export interface ExitSlipRecord {
  id: string;
  subject: CatalogSubject;
  dokFloor: DOKLevel;
  topicKeyword: string;
  prompt: string;
  successCriteria: string[];
  rubric03: string[]; // 4 strings, indexed by score 0..3
  misconceptionFlag: string;
  timeMinutes: number;
}

export interface OpenerRecord {
  id: string;
  subject: CatalogSubject;
  topicKeyword: string;
  dokFloor: DOKLevel;
  openerType: string;
  hookText: string;
  priorKnowledgeProbe: string;
  learningIntentionStem: string;
  timeMinutes: number;
  researchTags: string[];
}

export interface MisconceptionRecord {
  id: string;
  subject: CatalogSubject;
  standardKeyword: string;
  misconception: string;
  probe: string;
  exemplarRationale: string;
}

/* -----------------------------------------------------------------------------
 * Scaffolds (per subject)
 * ---------------------------------------------------------------------------*/

export type ScaffoldType =
  | 'cognitive'
  | 'metacognitive'
  | 'linguistic'
  | 'social_collaborative'
  | 'physical'
  | 'affective'
  | 'unknown';

export interface ScaffoldRecord {
  id: string;
  subject: CatalogSubject;
  gradeBands: string[];
  name: string;
  type: ScaffoldType;
  problemType: string;
  targetMisconception: string;
  teacherMoves: string[];
  studentTasks: string[];
  supports: string[];
  fadePlan: string;
  whenNotToUse: string;
  formativeChecks: string[];
  bloomLevel: string;
  dokLevel: DOKLevel;
  udlHlpTags: string[];
  /** Canonical forms (udl.3.3, hlp.16.explicit_instruction) for joins. */
  udlHlpTagsCanonical?: string[];
  selStrand: string;
  representationTags: string[];
  cspTags: string[];
  equityScore: number;
  evidenceCitationKeys: string[];
  lastUpdated: string;
}

/* -----------------------------------------------------------------------------
 * Bilingual glossary
 * ---------------------------------------------------------------------------*/

export interface GlossaryEntryRecord {
  termId: string;
  term: string;
  language: string;
  translation: string;
  partOfSpeech: string;
  category: string;
  pedagogicalDefinition: string;
  exampleContext: string;
  citationKeys: string[];
  scaffoldReferences: string[];
  equityNotes: string;
  lastUpdated: string;
}

/* -----------------------------------------------------------------------------
 * Research citations
 * ---------------------------------------------------------------------------*/

export interface CitationRecord {
  id: string;
  sourceTitle: string;
  sourceOrg: string;
  year: string;
  url: string;
  focusArea: string;
  claimSummary: string;
  quoteMax25: string;
  weight: 'gold' | 'silver' | 'bronze' | 'unknown';
}

/* -----------------------------------------------------------------------------
 * Accommodations (rules + evidence + artifacts merged)
 * ---------------------------------------------------------------------------*/

export type AccommodationLabel = 'IEP' | '504' | 'EL' | 'All';
export type AccommodationMode =
  | 'presentation'
  | 'interaction'
  | 'response'
  | 'assessment'
  | 'timing'
  | 'environment'
  | 'unknown';

/**
 * Compiled `applies_when` predicate.
 *
 * The DSL in CSV looks like:
 *   iep==yes AND needs_tags contains "anxiety_support"
 *   OR plan_504==yes AND needs_tags contains "organization_support"
 *
 * We parse this into a normalized disjunction-of-conjunctions tree at build
 * time, so the runtime engine never has to parse strings.
 */
export type AccommodationCondition =
  | { kind: 'iep'; equals: boolean }
  | { kind: 'plan_504'; equals: boolean }
  | { kind: 'el'; equals: boolean }
  | { kind: 'ml_level_lte'; value: number }
  | { kind: 'ml_level_gte'; value: number }
  | { kind: 'attn_chunk_minutes_lte'; value: number }
  | { kind: 'needs_tag'; tag: NeedsTag | string }
  | { kind: 'reading_band_in'; values: string[] };

export type AccommodationClause = AccommodationCondition[];
export type AccommodationPredicate = AccommodationClause[]; // OR of ANDs

export interface AccommodationArtifactRef {
  id: string;
  title?: string;
  filePath?: string;
  displayName?: string;
}

export interface AccommodationRecord {
  id: string;
  labels: AccommodationLabel[];
  mode: AccommodationMode;
  phaseScope: LessonPhaseId[] | 'all';
  slotTargets: string[];
  defaultParameters: Record<string, unknown>;
  appliesWhen: AccommodationPredicate;
  appliesWhenRaw: string;
  teacherPrompt: string;
  studentMicrocopy: string;
  udlHlpTags: string[];
  /** Canonical forms (udl.3.3, hlp.16.explicit_instruction) for joins. */
  udlHlpTagsCanonical?: string[];
  artifact?: AccommodationArtifactRef;
  evidence?: { citationText: string; sourceLink: string };
  elOnly: boolean;
  languageSupportType: string;
}

/* -----------------------------------------------------------------------------
 * Subject standards
 * ---------------------------------------------------------------------------*/

export interface StandardRecord {
  id: string; // canonical code
  subject: CatalogSubject;
  strand: string;
  description: string;
}
