/**
 * Generator-side Zod schema for `/api/finalize-plan`.
 *
 * The "intake" schema in src/lib/lessonPlanSchema.ts is intentionally lenient
 * (string objectives allowed, optional fields everywhere) because it parses
 * whatever the chat model happens to emit during conversation. The generator
 * schema below is *strict*: it's what the structured-output LLM (e.g.
 * Claude Sonnet via generateObject) must produce for a final, finalize-ready
 * plan.
 *
 * Design constraints to keep structured output reliable:
 *   - No top-level `z.union` between unrelated shapes (degrades JSON Schema).
 *   - Numbers as `z.number().int().min(...).max(...)` rather than literal
 *     unions, which translate more cleanly to provider strict mode.
 *   - `.describe()` on every field — the description is included in the
 *     generated JSON Schema and steers the model.
 *   - Required fields are explicit (no optional shortcuts) so the model can't
 *     skip them.
 *
 * Post-generation, we still run the *existing* `validateLessonPlan(plan,
 * 'finalize')` gate to catch semantic issues (phase order, embedded
 * accommodations, success criteria coverage). That's the EQuIP-aware layer.
 */

import { z } from 'zod';
import { INSTRUCTIONAL_MODELS, LESSON_PHASE_ORDER } from '../../types';

export const generatorObjectiveSchema = z
  .object({
    text: z
      .string()
      .min(8)
      .describe(
        'Student-facing learning objective. Starts with "Students will..." and names the cognitive action and the content.',
      ),
    dok: z
      .number()
      .int()
      .min(1)
      .max(4)
      .describe('Webb Depth of Knowledge level (1=recall, 2=skill, 3=strategic, 4=extended).'),
    verb: z
      .string()
      .min(2)
      .describe(
        'The single high-impact action verb (e.g., "analyze", "evaluate", "model", "construct").',
      ),
  })
  .describe('A single learning objective.');

export const generatorStandardSchema = z
  .object({
    framework: z
      .enum(['CCSS', 'NGSS', 'C3', 'state', 'other'])
      .describe('Standards framework.'),
    code: z
      .string()
      .min(2)
      .describe('Standard code, e.g. "CCSS.ELA-LITERACY.RI.11-12.6" or "HS-LS1-2".'),
    description: z
      .string()
      .min(8)
      .describe('Short teacher-facing description of what the standard requires.'),
  })
  .describe('Primary standard the lesson addresses.');

export const generatorProcedureStepSchema = z
  .object({
    phase: z
      .enum(LESSON_PHASE_ORDER as unknown as [string, ...string[]])
      .describe(
        'Canonical lesson phase. Procedure must include exactly one step per phase in this order: launch, model, guided_practice, independent_practice, exit_slip.',
      ),
    step: z
      .string()
      .min(3)
      .describe(
        'Short phase label including minutes, e.g. "Modeling (15 min)". PLAIN TEXT ONLY — no asterisks, no markdown.',
      ),
    description: z
      .string()
      .min(20)
      .describe(
        'Teacher-facing instructions for this phase: 2–4 complete sentences of PLAIN TEXT covering what the teacher does, what students do, and the transition. ABSOLUTELY NO markdown syntax: no **bold**, no *italics*, no `code`, no # headings, no [links](url), no leading -/• bullets. The printed lesson renders this string verbatim, so any markdown will appear as literal characters.',
      ),
    accommodations: z
      .string()
      .min(8)
      .describe(
        'Embedded accommodations for this phase (UDL representation/action/engagement; EL supports; IEP/504 supports). 1–3 sentences of plain prose, no markdown. MUST be non-empty.',
      ),
    scaffoldIds: z
      .array(z.string())
      .describe(
        'Catalog IDs for scaffolds used in this phase. Use the IDs surfaced in CATALOG_CANDIDATES; empty array if none.',
      ),
    accommodationIds: z
      .array(z.string())
      .describe(
        'Catalog IDs for accommodations applied in this phase. Use the IDs surfaced in CATALOG_CANDIDATES; empty array if none.',
      ),
    durationMin: z
      .number()
      .int()
      .min(1)
      .describe('Minimum minutes the phase is expected to take.'),
    durationMax: z
      .number()
      .int()
      .min(1)
      .describe('Maximum minutes the phase is expected to take.'),
  })
  .describe('One lesson phase.');

export const generatorRubricRowSchema = z
  .object({
    score: z
      .number()
      .int()
      .min(0)
      .max(3)
      .describe('Score: exactly 0, 1, 2, or 3. Rubric must contain one row at each level.'),
    description: z
      .string()
      .min(8)
      .describe('What student work at this score looks like.'),
  })
  .describe('A single rubric row.');

export const generatorTextOptionSchema = z
  .object({
    title: z.string().min(2).describe('Text title.'),
    source: z.string().min(2).describe('Publisher or source.'),
    lexile: z
      .string()
      .describe(
        'Lexile band (e.g., "1010L-1200L") or qualitative band ("complex grade-level text"). Empty string if not applicable.',
      ),
    url: z.string().describe('Canonical URL or empty string.'),
    rationale: z
      .string()
      .min(8)
      .describe('Why this text fits the objective, students, and standard.'),
    selected: z.boolean().describe('Exactly one option in the array must have selected=true.'),
    resourceId: z
      .string()
      .describe(
        'Catalog resource ID from CATALOG_CANDIDATES if available; empty string if the option is teacher-supplied.',
      ),
    representationTags: z
      .array(z.string())
      .describe('Identity/representation tags (e.g., "AAPI", "Indigenous", "Latina"); empty array if none apply.'),
  })
  .describe('A text option for the lesson.');

export const generatorSupportsSchema = z
  .object({
    all: z
      .array(z.string().min(4))
      .min(1)
      .describe('Universal supports (UDL) for every student.'),
    el: z
      .array(z.string().min(4))
      .min(1)
      .describe('Targeted supports for multilingual learners.'),
    iep504: z
      .array(z.string().min(4))
      .min(1)
      .describe('Targeted supports for students with IEPs / 504 plans.'),
  })
  .describe('Three lanes of supports.');

/**
 * The strict generator schema. `generateObject` will validate the model's
 * output against this. Fields aligned to the existing UI types so we can
 * merge directly into LessonPlanData.
 */
export const generatorLessonPlanSchema = z
  .object({
    title: z.string().min(3).describe('Concise lesson title.'),
    gradeLevel: z.string().min(1).describe('Grade level or band (e.g., "11th Grade", "6-8").'),
    subject: z.string().min(1).describe('Subject (ELA, Math, Science, Social Studies, SEL).'),
    duration: z
      .string()
      .min(1)
      .describe('Total lesson duration as a teacher-readable string, e.g. "90 minutes" or "2 x 45 min".'),
    standard: generatorStandardSchema,
    instructionalModel: z
      .enum(INSTRUCTIONAL_MODELS as unknown as [string, ...string[]])
      .describe('Instructional model driving the procedure flow.'),
    objectives: z
      .array(generatorObjectiveSchema)
      .min(1)
      .max(4)
      .describe('1-4 objectives. At least one objective must be at DOK >= 3.'),
    materials: z
      .array(z.string().min(2))
      .min(1)
      .max(12)
      .describe('Concrete materials needed (handouts, devices, manipulatives).'),
    procedure: z
      .array(generatorProcedureStepSchema)
      .length(5)
      .describe(
        'Exactly 5 phases in canonical order: launch, model, guided_practice, independent_practice, exit_slip.',
      ),
    assessment: z
      .string()
      .min(10)
      .describe('Summative/formative assessment description for the lesson.'),
    successCriteria: z
      .array(z.string().min(6))
      .min(1)
      .max(6)
      .describe(
        'Student-facing "I can..." statements, one per objective at minimum.',
      ),
    supports: generatorSupportsSchema,
    equityNotes: z
      .string()
      .min(10)
      .describe('Equity considerations and representation tag rationale.'),
    exitSlip: z
      .string()
      .min(10)
      .describe('Exit slip prompt aligned to the highest-DOK objective.'),
    rubric: z
      .array(generatorRubricRowSchema)
      .length(4)
      .describe('Exactly 4 rubric rows scored 0, 1, 2, 3 (one each).'),
    textOptions: z
      .array(generatorTextOptionSchema)
      .length(3)
      .describe('Exactly 3 text options, with exactly one marked selected=true.'),
    teacherModifications: z
      .array(z.string())
      .describe('Optional teacher-facing modifications. Empty array if none.'),
    resourceIds: z
      .array(z.string())
      .describe('Catalog resource IDs referenced by this lesson. Empty array if none.'),
    openerId: z
      .string()
      .describe('Catalog opener ID from CATALOG_CANDIDATES; empty string if none.'),
    exitSlipId: z
      .string()
      .describe('Catalog exit slip ID from CATALOG_CANDIDATES; empty string if none.'),
    misconceptionIds: z
      .array(z.string())
      .describe('Catalog misconception IDs addressed in this lesson.'),
    evidenceCitationKeys: z
      .array(z.string())
      .describe('Catalog citation keys backing the pedagogical moves used.'),
  })
  .describe('A finalized, teacher-ready lesson plan.');

export type GeneratorLessonPlan = z.infer<typeof generatorLessonPlanSchema>;
