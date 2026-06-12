/**
 * Catalog build script.
 *
 * Reads the vendored Zeno LX catalog sources from `catalog-sources/`, parses
 * each `.csv.md` export into typed records, and writes JSON outputs to
 * `src/data/catalog/`. Idempotent — re-running emits the same files.
 *
 * Run with:
 *   npm run catalog:build
 */

import fs from 'fs';
import path from 'path';

import { parseCsvMd, parseCsvMdRaw, splitList, toInt } from './catalog/parseCsvMd';
import { TagDictionary } from './catalog/normalizeTags';
import type {
  AccommodationCondition,
  AccommodationLabel,
  AccommodationMode,
  AccommodationPredicate,
  AccommodationRecord,
  CatalogSubject,
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
  ResourceLicenseClass,
  ResourceRecord,
  RubricCriterionRecord,
  ScaffoldRecord,
  ScaffoldType,
  StandardRecord,
} from '../src/lib/catalog/types';
import { inferResourceAudience, inferResourceKind } from '../src/lib/catalog/audience';
import type { DOKLevel, InstructionalModel, LessonPhaseId } from '../src/types';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'catalog-sources');
const OUT = path.join(ROOT, 'src', 'data', 'catalog');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let warnings = 0;
function warn(msg: string) {
  warnings++;
  console.warn(`  [warn] ${msg}`);
}

// Accumulates canonical UDL/HLP tag mappings across scaffold + accommodation
// builds; flushed to tag_dictionary.json in main().
const tagDictionary = new TagDictionary();

function writeJson(name: string, data: unknown, count?: number) {
  const filePath = path.join(OUT, name);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const size = fs.statSync(filePath).size;
  console.log(
    `  ✓ ${name.padEnd(36)} ${count != null ? `${count} rows`.padEnd(12) : ''}` +
      `${(size / 1024).toFixed(1)}kb`,
  );
}

function source(name: string): string {
  return path.join(SRC, name);
}

/* ----------------------------------------------------------------------------
 * Subject normalization
 * --------------------------------------------------------------------------*/

function normalizeSubject(raw: string): CatalogSubject {
  const v = (raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v === 'ela' || v === 'english_language_arts' || v === 'english') return 'ela';
  if (v === 'math' || v === 'mathematics') return 'math';
  if (v === 'science' || v === 'physics' || v === 'biology' || v === 'chemistry' || v === 'physics_math')
    return 'science';
  if (
    v === 'social_studies' ||
    v === 'socialstudies' ||
    v === 'history' ||
    v === 'civics' ||
    v === 'ss'
  )
    return 'social_studies';
  if (v === 'sel' || v === 'social_emotional_learning') return 'sel';
  if (v === 'all' || v === '*') return 'all';
  return (v || 'all') as CatalogSubject;
}

function normalizeDok(raw: string): DOKLevel {
  const n = parseInt((raw || '').trim(), 10);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n as DOKLevel;
  return 1;
}

/* ----------------------------------------------------------------------------
 * Lesson phases
 * --------------------------------------------------------------------------*/

function buildLessonPhases(): LessonPhaseRecord[] {
  const { rows } = parseCsvMd(source('lesson_phase_manifest.csv.md'));
  const records: LessonPhaseRecord[] = rows.map((r) => ({
    id: r.phase_id as LessonPhaseId,
    order: toInt(r.order, 0),
    hasTimer: r.has_timer === 'true',
    hasGrouping: r.has_grouping === 'true',
    hasAssessmentItems: r.has_assessment_items === 'true',
    textSlots: splitList(r.text_slots, /[;|]/),
    defaultMinutesMin: toInt(r.default_minutes_min, 0),
    defaultMinutesMax: toInt(r.default_minutes_max, 0),
  }));
  records.sort((a, b) => a.order - b.order);
  writeJson('lesson_phases.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * DOK lexicon
 * --------------------------------------------------------------------------*/

function buildDokLexicon(): DokLexiconRecord[] {
  const { rows } = parseCsvMd(source('dok_lexicon_backup.csv.md'));
  const records: DokLexiconRecord[] = rows.map((r) => ({
    subject: normalizeSubject(r.subject),
    dokLevel: normalizeDok(r.dok_level),
    verb: (r.verb || '').toLowerCase().trim(),
    signal: r.signal || '',
    notes: r.notes || '',
  }));
  // Drop duplicates (subject, dok, verb)
  const seen = new Set<string>();
  const dedup = records.filter((r) => {
    const k = `${r.subject}::${r.dokLevel}::${r.verb}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  writeJson('dok_lexicon.json', dedup, dedup.length);
  return dedup;
}

/* ----------------------------------------------------------------------------
 * Instructional models (one row per (model, phase))
 * --------------------------------------------------------------------------*/

function buildInstructionalModels(): InstructionalModelPhaseRecord[] {
  const { rows } = parseCsvMd(source('instructional_models.csv.md'));
  const records: InstructionalModelPhaseRecord[] = rows.map((r) => ({
    model: (r.model || '').trim() as InstructionalModel,
    phase: (r.phase || '').trim(),
    phaseOrder: toInt(r.phase_order, 0),
    description: r.description || '',
    exampleTeacherMoves: r.example_teacher_moves || '',
    expectedStrategyTypes: splitList(r.expected_strategy_types, /[;|]/),
    resources: splitList(r.resources, /[;|]/),
  }));
  writeJson('instructional_models.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * Representation tags
 * --------------------------------------------------------------------------*/

function buildRepresentationTags(): RepresentationTagRecord[] {
  const { rows } = parseCsvMd(source('representation_tags.csv.md'));
  const records: RepresentationTagRecord[] = rows.map((r) => ({
    id: r.tag_id || '',
    category: r.tag_category || '',
    label: r.tag_label || '',
    description: r.tag_description || '',
  }));
  writeJson('representation_tags.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * EQuIP+UDL rubric
 *
 * The source is a free-form markdown table; we model it manually because the
 * loose markdown shape doesn't survive a CSV parser. We capture the canonical
 * 6 criteria + 0–3 descriptors + pass threshold from
 * `lesson_quality_rubric_equip_udl.md.md`.
 * --------------------------------------------------------------------------*/

function buildEquipUdlRubric(): EquipUdlRubric {
  const criteria: RubricCriterionRecord[] = [
    {
      id: 'alignment_coherence',
      title: 'Alignment & Coherence',
      levels: [
        { score: 0, descriptor: 'Misaligned.' },
        { score: 1, descriptor: 'Significant gaps or unclear alignment.' },
        { score: 2, descriptor: 'Minor gaps; mostly aligned.' },
        {
          score: 3,
          descriptor:
            'Objectives, tasks, and assessment align tightly to the standard; canonical ID shown.',
        },
      ],
    },
    {
      id: 'instructional_design',
      title: 'Instructional Design (Model Fidelity)',
      levels: [
        { score: 0, descriptor: 'No coherent structure.' },
        { score: 1, descriptor: 'Structure weak; minimal checks.' },
        { score: 2, descriptor: 'Structure present with occasional drift.' },
        {
          score: 3,
          descriptor: 'Clear I‑We‑You or 5E/PBL structure with checks for understanding.',
        },
      ],
    },
    {
      id: 'access_supports',
      title: 'Access & Supports (UDL/HLP)',
      levels: [
        { score: 0, descriptor: 'No supports.' },
        { score: 1, descriptor: 'Generic supports; not personalized.' },
        { score: 2, descriptor: 'Supports present but inconsistent or weak rationale.' },
        {
          score: 3,
          descriptor: 'At least one scaffold per flagged student; rationale (HLP/UDL) shown.',
        },
      ],
    },
    {
      id: 'assessment_for_learning',
      title: 'Assessment for Learning',
      levels: [
        { score: 0, descriptor: 'Missing or unusable.' },
        { score: 1, descriptor: 'Low‑value prompt; no criteria.' },
        { score: 2, descriptor: 'Slip present, missing one element.' },
        {
          score: 3,
          descriptor:
            'Exit slip includes DOK + misconception + 0–3 criteria; drives next steps.',
        },
      ],
    },
    {
      id: 'materials_licensing',
      title: 'Materials & Licensing',
      levels: [
        { score: 0, descriptor: 'Unlicensed/unknown sources.' },
        { score: 1, descriptor: 'Mixed sources; unclear licensing.' },
        { score: 2, descriptor: 'OER with incomplete metadata.' },
        { score: 3, descriptor: 'OER only; TASL printed; accessibility noted.' },
      ],
    },
    {
      id: 'tone_clarity',
      title: 'Professional Tone & Clarity',
      levels: [
        { score: 0, descriptor: 'Unusable.' },
        { score: 1, descriptor: 'Vague; requires guessing.' },
        { score: 2, descriptor: 'Mostly clear; some ambiguity.' },
        { score: 3, descriptor: 'Clear microcopy; actionable steps; teacher‑ready.' },
      ],
    },
  ];
  const rubric: EquipUdlRubric = {
    passThreshold: { averageMin: 2.5, noCategoryAt: 0 },
    criteria,
  };
  writeJson('equip_udl_rubric.json', rubric, criteria.length);
  return rubric;
}

/* ----------------------------------------------------------------------------
 * Resource bank
 *
 * Backfills:
 *  - id          : slugified title
 *  - licenseClass: rules over the License string
 *  - subjectTags : maps the Subject column into normalized CatalogSubject values
 *  - account     : inferred from Source (PhET=free, Newsela=paid, etc.)
 *  - audio       : inferred from accessibility fields
 *  - audience    : student vs teacher-PD/reference, inferred from title/source
 *  - representationTags: minimal heuristics by Source
 * --------------------------------------------------------------------------*/

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function classifyLicense(license: string): ResourceLicenseClass {
  const v = license.toLowerCase();
  if (!v) return 'unknown';
  if (v.includes('cc by-sa') || v.includes('cc-by-sa')) return 'cc-by-sa';
  if (v.includes('cc by-nc') || v.includes('cc-by-nc')) return 'cc-by-nc';
  if (v.includes('cc by') || v.includes('cc-by') || v.includes('cc 0') || v.includes('cc0'))
    return 'cc-by';
  if (v.includes('public domain') || v.includes('pd')) return 'public-domain';
  if (v.includes('oer')) return 'oer';
  if (v.includes('fair use')) return 'fair-use';
  if (v.includes('free account') || v.includes('free login')) return 'free-account';
  if (v.includes('paid') || v.includes('subscription')) return 'paid';
  return 'unknown';
}

function inferSubjectTags(subject: string): CatalogSubject[] {
  const v = subject.toLowerCase();
  const tags: CatalogSubject[] = [];
  if (/(ela|english|reading|literacy|writing|literature)/.test(v)) tags.push('ela');
  if (/(math|algebra|geometry|stats|statistic|calculus)/.test(v)) tags.push('math');
  if (/(science|physics|biology|chemistry|earth|environment)/.test(v)) tags.push('science');
  if (/(history|civic|geograph|social studies|economics)/.test(v)) tags.push('social_studies');
  if (/(sel|social[-\s_]emotional)/.test(v)) tags.push('sel');
  if (tags.length === 0) tags.push('all');
  return tags;
}

function inferAccount(source: string): ResourceRecord['account'] {
  const s = source.toLowerCase();
  if (/(phet|gutenberg|wikimedia|smithsonian|loc\.gov|library of congress|nasa|cdc|noaa)/.test(s))
    return 'free';
  if (/(commonlit|readworks|noredink|khan academy)/.test(s)) return 'free-account';
  if (/(newsela|zinn ed|brainpop|nearpod premium|edpuzzle pro)/.test(s)) return 'paid';
  return 'unknown';
}

function inferAudio(captions: string, transcript: string): ResourceRecord['audio'] {
  const c = captions.toLowerCase();
  const t = transcript.toLowerCase();
  if (c === 'yes' || t === 'yes') return 'yes';
  if (c === 'no' && t === 'no') return 'no';
  return 'unknown';
}

function inferRepresentationTags(source: string, accessibility: string): string[] {
  const s = source.toLowerCase();
  const tags = new Set<string>();
  if (/phet|simulation/.test(s)) tags.add('rtag.media.multimodal_resources');
  if (/audio|podcast/.test(accessibility.toLowerCase())) tags.add('rtag.media.accessible_media');
  if (/transcript/.test(accessibility.toLowerCase())) tags.add('rtag.media.accessible_media');
  if (/zinn|1619|teaching tolerance|learning for justice/.test(s))
    tags.add('rtag.context.multiple_perspectives');
  return Array.from(tags);
}

function buildResources(): ResourceRecord[] {
  const { rows } = parseCsvMd(source('resourcebank_v1.csv.md'));
  const records: ResourceRecord[] = rows
    .filter((r) => r.Title && r.URL)
    .map((r) => {
      const id = slugify(r.Title);
      const resource = {
        id,
        title: r.Title,
        author: r.Author || '',
        source: r.Source || '',
        url: r.URL,
        license: r.License || '',
        licenseClass: classifyLicense(r.License || ''),
        subject: r.Subject || '',
        subjectTags: inferSubjectTags(r.Subject || ''),
        accessibility: r.Accessibility || '',
        tasl: r.TASL || '',
        status: (r.Status || 'active').toLowerCase(),
        captions: (r.Captions || 'unknown').toLowerCase(),
        transcript: (r.Transcript || 'unknown').toLowerCase(),
        keyboardNav: (r.Keyboard_Nav || 'unknown').toLowerCase(),
        audio: inferAudio(r.Captions || '', r.Transcript || ''),
        account: inferAccount(r.Source || ''),
        representationTags: inferRepresentationTags(r.Source || '', r.Accessibility || ''),
      };
      // Classify the row into one of four `kind` lanes. Collections and
      // teacher_reference rows are forced to `audience: 'teacher'` so the
      // picker can never accidentally surface them as student readings.
      const kind = inferResourceKind(resource);
      const audience =
        kind === 'collection' || kind === 'teacher_reference'
          ? 'teacher'
          : inferResourceAudience(resource);
      return {
        ...resource,
        audience,
        kind,
      };
    });
  // De-duplicate by id (slug collisions are possible with very similar titles).
  const seen = new Set<string>();
  const dedup = records.filter((r) => {
    if (seen.has(r.id)) {
      warn(`duplicate resource id ${r.id} (title="${r.title}") – skipping`);
      return false;
    }
    seen.add(r.id);
    return true;
  });
  writeJson('resources.json', dedup, dedup.length);
  return dedup;
}

/* ----------------------------------------------------------------------------
 * Exit slips
 * --------------------------------------------------------------------------*/

function parseRubric03(raw: string): string[] {
  // Source format: "0=...; 1=...; 2=...; 3=..."
  const parts = raw.split(/;\s*/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = ['', '', '', ''];
  for (const p of parts) {
    const m = p.match(/^([0-3])\s*=\s*(.+)$/);
    if (m) out[parseInt(m[1], 10)] = m[2].trim();
  }
  return out;
}

function buildExitSlips(): ExitSlipRecord[] {
  const { rows } = parseCsvMd(source('exit_slip_archetypes.csv.md'));
  const records: ExitSlipRecord[] = rows
    .filter((r) => r.id && r.slip_prompt)
    .map((r) => ({
      id: r.id,
      subject: normalizeSubject(r.subject),
      dokFloor: normalizeDok(r.dok),
      topicKeyword: (r.standard_keyword || '').toLowerCase().trim(),
      prompt: r.slip_prompt || '',
      successCriteria: [],
      rubric03: parseRubric03(r.criteria_0_3 || ''),
      misconceptionFlag: r.probe || '',
      timeMinutes: 5,
    }));
  writeJson('exit_slips.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * Openers
 * --------------------------------------------------------------------------*/

function buildOpeners(): OpenerRecord[] {
  const { rows } = parseCsvMd(source('opener_templates.csv.md'));
  const records: OpenerRecord[] = rows
    .filter((r) => r.opener_id && r.hook_text)
    .map((r) => ({
      id: r.opener_id,
      subject: normalizeSubject(r.subject),
      topicKeyword: (r.topic_keyword || '').toLowerCase().trim(),
      dokFloor: normalizeDok(r.dok_floor),
      openerType: r.opener_type || '',
      hookText: r.hook_text || '',
      priorKnowledgeProbe: r.prior_knowledge_probe || '',
      learningIntentionStem: r.learning_intention_stem || '',
      timeMinutes: toInt(r.time_minutes, 4),
      researchTags: splitList(r.research_tags, /[;|]/),
    }));
  writeJson('openers.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * Misconceptions
 * --------------------------------------------------------------------------*/

function buildMisconceptions(): MisconceptionRecord[] {
  const { rows } = parseCsvMd(source('misconception_patterns.csv.md'));
  const records: MisconceptionRecord[] = rows
    .filter((r) => r.misconception)
    .map((r, i) => {
      const subject = normalizeSubject(r.subject);
      const keyword = (r.standard_keyword || '').toLowerCase().trim();
      const id = `${subject}.${keyword || 'general'}.${i + 1}`;
      return {
        id,
        subject,
        standardKeyword: keyword,
        misconception: r.misconception,
        probe: r.probe || '',
        exemplarRationale: r.exemplar_rationale || '',
      };
    });
  writeJson('misconceptions.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * Scaffolds (one file per subject)
 * --------------------------------------------------------------------------*/

function normalizeScaffoldType(raw: string): ScaffoldType {
  const v = (raw || '').toLowerCase().trim();
  if (
    v === 'cognitive' ||
    v === 'metacognitive' ||
    v === 'linguistic' ||
    v === 'social_collaborative' ||
    v === 'physical' ||
    v === 'affective'
  )
    return v as ScaffoldType;
  if (v.includes('social')) return 'social_collaborative';
  if (v.includes('language') || v.includes('linguistic')) return 'linguistic';
  if (v.includes('cogniti')) return 'cognitive';
  if (v.includes('meta')) return 'metacognitive';
  if (v.includes('affect') || v.includes('emotion')) return 'affective';
  return 'unknown';
}

function buildScaffoldsForSubject(subject: CatalogSubject, file: string): ScaffoldRecord[] {
  if (!fs.existsSync(source(file))) {
    warn(`missing scaffold file ${file}`);
    return [];
  }
  const { rows } = parseCsvMd(source(file));
  const records: ScaffoldRecord[] = rows
    .filter((r) => r.scaffold_id && r.scaffold_name)
    .map((r) => ({
      id: r.scaffold_id,
      subject,
      gradeBands: splitList(r.grade_bands, /[;|,]/),
      name: r.scaffold_name,
      type: normalizeScaffoldType(r.scaffold_type),
      problemType: r.problem_type || '',
      targetMisconception: r.target_misconception || '',
      teacherMoves: splitList(r.teacher_moves, /\|/),
      studentTasks: splitList(r.student_tasks, /\|/),
      supports: splitList(r.supports_list, /\|/),
      fadePlan: r.fade_plan || '',
      whenNotToUse: r.when_not_to_use || '',
      formativeChecks: splitList(r.formative_checks, /[;|]/),
      bloomLevel: (r.bloom_level || '').toLowerCase().trim(),
      dokLevel: normalizeDok(r.dok_level),
      udlHlpTags: splitList(r.udl_hlp_tags, /\|/),
      udlHlpTagsCanonical: tagDictionary.normalizeAll(splitList(r.udl_hlp_tags, /\|/)),
      selStrand: (r.sel_strand || '').trim(),
      representationTags: splitList(r.representation_tags, /\|/).map((t) =>
        t.toLowerCase().trim(),
      ),
      cspTags: splitList(r.csp_tags, /\|/),
      equityScore: toInt(r.equity_score, 0),
      evidenceCitationKeys: splitList(r.evidence_citation_keys, /[;|]/),
      lastUpdated: r.last_updated || '',
    }));
  writeJson(`scaffolds_${subject}.json`, records, records.length);
  return records;
}

function buildScaffolds(): Record<string, ScaffoldRecord[]> {
  return {
    ela: buildScaffoldsForSubject('ela', 'scaffolds_ela.csv.md'),
    math: buildScaffoldsForSubject('math', 'scaffolds_math.csv.md'),
    science: buildScaffoldsForSubject('science', 'scaffolds_science.csv.md'),
    sel: buildScaffoldsForSubject('sel', 'scaffolds_sel.csv.md'),
    social_studies: buildScaffoldsForSubject(
      'social_studies',
      'scaffolds_social_studies.csv.md',
    ),
  };
}

/* ----------------------------------------------------------------------------
 * Bilingual glossary
 *
 * The source CSV is malformed in places (un-quoted commas inside long
 * pedagogical_definition cells), so we take a defensive approach: keep the
 * first 4 columns reliably (term_id, term, language, translation) and
 * best-effort fill the rest. Rows missing the essential 4 fields are dropped
 * with a single aggregated warning at the end.
 * --------------------------------------------------------------------------*/

function buildBilingualGlossary(): GlossaryEntryRecord[] {
  const { rows } = parseCsvMd(source('bilingual_glossary.csv.md'));
  let dropped = 0;
  const records: GlossaryEntryRecord[] = [];
  for (const r of rows) {
    if (!r.term_id || !r.language || !r.term) {
      dropped++;
      continue;
    }
    records.push({
      termId: r.term_id,
      term: r.term,
      language: (r.language || '').toLowerCase(),
      translation: r.translation || r.term,
      partOfSpeech: r.part_of_speech || '',
      category: r.category || '',
      pedagogicalDefinition: r.pedagogical_definition || '',
      exampleContext: r.example_context || '',
      citationKeys: splitList(r.citation_keys, /[;|]/),
      scaffoldReferences: splitList(r.scaffold_references, /[;|]/),
      equityNotes: r.equity_notes || '',
      lastUpdated: r.last_updated || '',
    });
  }
  if (dropped > 0) {
    warn(`bilingual_glossary: dropped ${dropped} malformed rows (missing term_id/term/language)`);
  }
  writeJson('bilingual_glossary.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * Citations
 * --------------------------------------------------------------------------*/

function classifyWeight(raw: string): CitationRecord['weight'] {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'gold' || v === 'silver' || v === 'bronze') return v;
  return 'unknown';
}

function buildCitations(): CitationRecord[] {
  const { rows } = parseCsvMd(source('research_citations.csv.md'));
  const records: CitationRecord[] = rows
    .filter((r) => r.citation_id)
    .map((r) => ({
      id: r.citation_id,
      sourceTitle: r.source_title || '',
      sourceOrg: r.source_org || '',
      year: r.year || '',
      url: r.url || '',
      focusArea: r.focus_area || '',
      claimSummary: r.claim_summary || '',
      quoteMax25: r.quote_max_25 || '',
      weight: classifyWeight(r.weight || ''),
    }));
  writeJson('citations.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * Accommodations (rules + evidence + artifacts merged)
 *
 * `applies_when` DSL grammar:
 *   <expr>   := <clause> ('OR' <clause>)*
 *   <clause> := <atom>   ('AND' <atom>)*
 *   <atom>   := iep == yes
 *             | plan_504 == yes
 *             | el == yes
 *             | ml_level <= N
 *             | ml_level >= N
 *             | attn_chunk_minutes <= N
 *             | needs_tags contains "<tag>"
 *
 * Operator precedence: AND binds tighter than OR. There are no parentheses in
 * the source data, so a flat split-and-tokenize is sufficient.
 * --------------------------------------------------------------------------*/

const COND_RE_LIST: { re: RegExp; build: (m: RegExpMatchArray) => AccommodationCondition }[] = [
  {
    re: /^iep\s*==\s*(yes|no)$/i,
    build: (m) => ({ kind: 'iep', equals: m[1].toLowerCase() === 'yes' }),
  },
  {
    re: /^plan[_-]?504\s*==\s*(yes|no)$/i,
    build: (m) => ({ kind: 'plan_504', equals: m[1].toLowerCase() === 'yes' }),
  },
  {
    re: /^el\s*==\s*(yes|no)$/i,
    build: (m) => ({ kind: 'el', equals: m[1].toLowerCase() === 'yes' }),
  },
  {
    re: /^ml[_-]?level\s*<=\s*([0-9]+)$/i,
    build: (m) => ({ kind: 'ml_level_lte', value: parseInt(m[1], 10) }),
  },
  {
    re: /^ml[_-]?level\s*>=\s*([0-9]+)$/i,
    build: (m) => ({ kind: 'ml_level_gte', value: parseInt(m[1], 10) }),
  },
  {
    re: /^attn[_-]?chunk[_-]?minutes\s*<=\s*([0-9]+)$/i,
    build: (m) => ({ kind: 'attn_chunk_minutes_lte', value: parseInt(m[1], 10) }),
  },
  {
    re: /^needs[_-]?tags\s+contains\s+"([^"]+)"$/i,
    build: (m) => ({ kind: 'needs_tag', tag: m[1] }),
  },
  {
    re: /^reading[_-]?band\s+in\s+\[([^\]]+)\]$/i,
    build: (m) => ({
      kind: 'reading_band_in',
      values: m[1]
        .split(',')
        .map((v) => v.trim().replace(/^"|"$/g, ''))
        .filter(Boolean),
    }),
  },
];

function parseAtom(raw: string): AccommodationCondition | null {
  const t = raw.trim();
  for (const { re, build } of COND_RE_LIST) {
    const m = t.match(re);
    if (m) return build(m);
  }
  return null;
}

function parseAppliesWhen(raw: string): {
  predicate: AccommodationPredicate;
  unparsed: string[];
} {
  if (!raw || !raw.trim()) return { predicate: [], unparsed: [] };
  const unparsed: string[] = [];
  // The source data uses parens to disambiguate AND-groups inside an OR
  // chain, e.g. `iep==yes AND needs_tags contains "X" OR (plan_504==yes AND
  // needs_tags contains "X")`. We don't honor parens semantically (AND already
  // binds tighter than OR in this DSL); we strip them so atom matching can
  // succeed. Quoted strings have no parens, so this is safe.
  const cleaned = raw.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const orParts = cleaned.split(/\s+OR\s+/i);
  const predicate: AccommodationPredicate = [];
  for (const orPart of orParts) {
    // Within an OR clause, split on " AND ".
    const andParts = orPart.split(/\s+AND\s+/i);
    const clause: AccommodationCondition[] = [];
    for (const a of andParts) {
      const cond = parseAtom(a);
      if (cond) clause.push(cond);
      else unparsed.push(a);
    }
    if (clause.length > 0) predicate.push(clause);
  }
  return { predicate, unparsed };
}

function parseLabels(raw: string): AccommodationLabel[] {
  const tokens = splitList(raw, /[;,|]/);
  const out: AccommodationLabel[] = [];
  for (const t of tokens) {
    const v = t.trim();
    if (v === 'IEP' || v === '504' || v === 'EL' || v === 'All') out.push(v);
  }
  return out;
}

function parsePhaseScope(raw: string): LessonPhaseId[] | 'all' {
  const v = (raw || '').trim().toLowerCase();
  if (!v || v === 'all' || v === '*') return 'all';
  return splitList(v, /[;,|]/) as LessonPhaseId[];
}

function parseDefaultParameters(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function buildAccommodations(): AccommodationRecord[] {
  // The student_microcopy column in accommodations_rules.csv often contains
  // un-quoted commas which shift adjacent cells left by one. Detect via the
  // el_only column (must be "true" or "false") and unshift before mapping.
  // We use the raw row API so we can patch by header index.
  const { header, rows: rawRows } = parseCsvMdRaw(source('accommodations_rules.csv.md'));
  const idx = (col: string) => header.indexOf(col);
  const elOnlyIdx = idx('el_only');
  const langIdx = idx('language_support_type');
  const microIdx = idx('student_microcopy');
  const isBool = (v: string) => v === 'true' || v === 'false';

  const rules = rawRows.map((row) => {
    let cells = row.slice();
    // Pad short rows.
    while (cells.length < header.length) cells.push('');

    // Repair: while el_only is not boolean but a later cell is, shift left
    // and merge the displaced microcopy back together.
    if (
      elOnlyIdx > microIdx &&
      microIdx >= 0 &&
      cells.length > elOnlyIdx &&
      !isBool(cells[elOnlyIdx]) &&
      isBool(cells[langIdx] || '')
    ) {
      // Shift cells [microIdx+1..elOnlyIdx] left by 1 and merge into microIdx.
      const overflow = cells[microIdx + 1] ?? '';
      cells[microIdx] = [cells[microIdx], overflow].filter(Boolean).join(', ');
      for (let i = microIdx + 1; i < elOnlyIdx; i++) {
        cells[i] = cells[i + 1] ?? '';
      }
      cells[elOnlyIdx] = cells[langIdx] ?? '';
      cells[langIdx] = '';
    }

    const rec: Record<string, string> = {};
    header.forEach((col, i) => {
      rec[col] = (cells[i] ?? '').trim();
    });
    return rec;
  });

  const evidence = parseCsvMd(source('accommodations_evidence.csv.md')).rows;
  const artifacts = parseCsvMd(source('accommodations_artifacts.csv.md')).rows;

  const evIndex = new Map<string, { citationText: string; sourceLink: string }>();
  for (const e of evidence) {
    if (!e.support_id) continue;
    evIndex.set(e.support_id, {
      citationText: e.citation_text || '',
      sourceLink: e.source_link || '',
    });
  }
  const artIndex = new Map<string, { id: string; title?: string; filePath?: string; displayName?: string }>();
  for (const a of artifacts) {
    if (!a.accommodation || !a.artifact_id) continue;
    artIndex.set(a.accommodation, {
      id: a.artifact_id,
      title: a.artifact_title || undefined,
      filePath: a.file_path || a.artifact_path || undefined,
      displayName: a.display_name || undefined,
    });
  }

  let unparsedClauses = 0;
  const records: AccommodationRecord[] = rules
    .filter((r) => r.accommodation_id)
    .map((r) => {
      const { predicate, unparsed } = parseAppliesWhen(r.applies_when || '');
      unparsedClauses += unparsed.length;
      const id = r.accommodation_id;
      return {
        id,
        labels: parseLabels(r.labels || ''),
        mode: ((r.mode || '').toLowerCase().trim() || 'unknown') as AccommodationMode,
        phaseScope: parsePhaseScope(r.phase_scope || ''),
        slotTargets: splitList(r.slot_targets, /[;,|]/),
        defaultParameters: parseDefaultParameters(r.default_parameters || ''),
        appliesWhen: predicate,
        appliesWhenRaw: r.applies_when || '',
        teacherPrompt: r.teacher_prompt || '',
        studentMicrocopy: r.student_microcopy || '',
        udlHlpTags: splitList(r.udl_hlp_tags, /[;,|]/).map((t) => t.trim()),
        udlHlpTagsCanonical: tagDictionary.normalizeAll(
          splitList(r.udl_hlp_tags, /[;,|]/).map((t) => t.trim()),
        ),
        artifact: artIndex.get(id),
        // Evidence join: try the explicit evidence_key first, then fall back
        // to the accommodation id itself. Several rules rows carry a stale
        // evidence_key (e.g. `bilingual_glossary` vs the evidence file's
        // `bilingual_glossary_es`), which silently dropped the research cite.
        evidence:
          (r.evidence_key ? evIndex.get(r.evidence_key) : undefined) ?? evIndex.get(id),
        elOnly: (r.el_only || '').toLowerCase() === 'true',
        languageSupportType: r.language_support_type || '',
      };
    });

  if (unparsedClauses > 0) {
    warn(`accommodations: ${unparsedClauses} unparsed predicate atom(s)`);
  }
  writeJson('accommodations.json', records, records.length);
  return records;
}

/* ----------------------------------------------------------------------------
 * Subject standards (one record per standard, all subjects merged)
 * --------------------------------------------------------------------------*/

function buildStandardsForFile(file: string, subject: CatalogSubject): StandardRecord[] {
  if (!fs.existsSync(source(file))) return [];
  const { rows } = parseCsvMd(source(file));
  return rows
    .filter((r) => r.standard)
    .map((r) => ({
      id: r.standard,
      subject,
      strand: r.strand || '',
      description: r.description || '',
    }));
}

function buildStandards(): StandardRecord[] {
  const all: StandardRecord[] = [
    ...buildStandardsForFile('ela.csv.md', 'ela'),
    ...buildStandardsForFile('math.csv.md', 'math'),
    ...buildStandardsForFile('science.csv.md', 'science'),
    ...buildStandardsForFile('ss.csv.md', 'social_studies'),
    ...buildStandardsForFile('sel.csv.md', 'sel'),
  ];
  writeJson('standards.json', all, all.length);
  return all;
}

/* ----------------------------------------------------------------------------
 * Manifest
 * --------------------------------------------------------------------------*/

interface CatalogManifest {
  builtAt: string;
  version: number;
  files: { name: string; rowCount: number }[];
}

function buildManifest(counts: { name: string; rowCount: number }[]) {
  const manifest: CatalogManifest = {
    builtAt: new Date().toISOString(),
    version: 1,
    files: counts,
  };
  writeJson('manifest.json', manifest);
}

/* ----------------------------------------------------------------------------
 * Main
 * --------------------------------------------------------------------------*/

function main() {
  console.log(`Building catalogs from ${path.relative(ROOT, SRC)}/ → ${path.relative(ROOT, OUT)}/`);

  const phases = buildLessonPhases();
  const dok = buildDokLexicon();
  const models = buildInstructionalModels();
  const repTags = buildRepresentationTags();
  buildEquipUdlRubric();
  const resources = buildResources();
  const exitSlips = buildExitSlips();
  const openers = buildOpeners();
  const misconceptions = buildMisconceptions();
  const scaffolds = buildScaffolds();
  const glossary = buildBilingualGlossary();
  const citations = buildCitations();
  const accommodations = buildAccommodations();
  const standards = buildStandards();

  // Canonical tag dictionary — built as a side effect of the scaffold +
  // accommodation builds above.
  const tagRecords = tagDictionary.toRecords();
  writeJson('tag_dictionary.json', tagRecords, tagRecords.length);

  const counts = [
    { name: 'lesson_phases.json', rowCount: phases.length },
    { name: 'dok_lexicon.json', rowCount: dok.length },
    { name: 'instructional_models.json', rowCount: models.length },
    { name: 'representation_tags.json', rowCount: repTags.length },
    { name: 'equip_udl_rubric.json', rowCount: 6 },
    { name: 'resources.json', rowCount: resources.length },
    { name: 'exit_slips.json', rowCount: exitSlips.length },
    { name: 'openers.json', rowCount: openers.length },
    { name: 'misconceptions.json', rowCount: misconceptions.length },
    { name: 'scaffolds_ela.json', rowCount: scaffolds.ela.length },
    { name: 'scaffolds_math.json', rowCount: scaffolds.math.length },
    { name: 'scaffolds_science.json', rowCount: scaffolds.science.length },
    { name: 'scaffolds_sel.json', rowCount: scaffolds.sel.length },
    { name: 'scaffolds_social_studies.json', rowCount: scaffolds.social_studies.length },
    { name: 'bilingual_glossary.json', rowCount: glossary.length },
    { name: 'citations.json', rowCount: citations.length },
    { name: 'accommodations.json', rowCount: accommodations.length },
    { name: 'standards.json', rowCount: standards.length },
  ];

  buildManifest(counts);

  const total = counts.reduce((acc, x) => acc + x.rowCount, 0);
  console.log(
    `\nDone. ${counts.length} catalogs · ${total.toLocaleString()} rows · ${warnings} warning(s).`,
  );
}

main();
