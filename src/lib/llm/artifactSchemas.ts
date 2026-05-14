/**
 * Strict Zod schemas for Penny's *artifact-generator* lane.
 *
 * The artifact lane is a separate LLM call (per `LLMTask: 'artifact_generator'`
 * in `router.ts`) that produces the student-facing scaffolds the teacher hands
 * out — graphic organizers, sentence stems, exit tickets, vocabulary previews,
 * discussion protocols, single-point rubrics. Every artifact is generated
 * AFTER the lesson plan is finalized, so the model has the complete plan,
 * the chosen text, the standards, and the learner profile available as
 * context. The result is a content-specific scaffold, not a generic template.
 *
 * Design rules (kept consistent with `generatorSchema.ts`):
 *   - No top-level `z.union`s between unrelated shapes — they degrade strict
 *     JSON Schema mode at the gateway.
 *   - Number ranges as `.int().min(...).max(...)` instead of literal unions.
 *   - `.describe()` on every field; descriptions are emitted into the
 *     generated JSON Schema and steer the model directly.
 *   - Each artifact is small (sub-2k tokens) so we can run all six in
 *     parallel without blowing context windows or timeouts.
 *
 * The artifact route runs each artifact as its own `generateObject(...)` call
 * so a single artifact's failure (timeout, validation error) doesn't poison
 * the others. The route falls back to the existing heuristic templates in
 * `LessonPlan.tsx` when an artifact's generation fails.
 */

import { z } from 'zod';

/* ----------------------------------------------------------------------------
 * Shared primitives
 * ---------------------------------------------------------------------------*/

const tieredAudienceSchema = z
  .enum(['all', 'el_emerging', 'el_developing', 'el_expanding', 'iep_504'])
  .describe(
    'Which lane of learners this row primarily supports. Use "all" for grade-level access, the el_* tiers for WIDA-aligned scaffolds, and "iep_504" for IEP/504 supports.',
  );

const dokSchema = z
  .number()
  .int()
  .min(1)
  .max(4)
  .describe('Depth of Knowledge level (1=recall, 2=skill/concept, 3=strategic thinking, 4=extended thinking).');

/* ----------------------------------------------------------------------------
 * 1. Graphic organizer
 * ---------------------------------------------------------------------------*/

export const graphicOrganizerCellSchema = z
  .object({
    label: z
      .string()
      .min(2)
      .max(80)
      .describe('Cell heading shown to the student (e.g. "Claim", "Strongest Evidence", "How does this connect to identity?").'),
    prompt: z
      .string()
      .min(10)
      .max(280)
      .describe('Plain-language instruction telling the student what to do in this cell. Reference the chosen text or standard explicitly.'),
    sentenceStem: z
      .string()
      .max(160)
      .describe('A single starter the student can use. Empty string if no stem is appropriate for this cell.'),
    wordBank: z
      .array(z.string().min(1).max(40))
      .max(8)
      .describe('Optional 0-8 word bank for the cell. Skip generic words; prefer text- or standard-specific vocabulary.'),
  })
  .describe('One cell of a graphic organizer.');

export const graphicOrganizerSchema = z
  .object({
    title: z
      .string()
      .min(4)
      .max(120)
      .describe('Title visible at the top of the printable organizer. Reference the text or standard, not just the artifact type.'),
    purpose: z
      .string()
      .min(10)
      .max(240)
      .describe('1-2 sentence statement of what cognitive work the organizer scaffolds. Connect it to the highest-DOK objective.'),
    layout: z
      .enum(['cer', 'comparison', 'theme_tracking', 'argument_map', 'frayer', 'evidence_grid', 'cause_effect', 'sequence', 'timeline'])
      .describe('Pedagogically-recognized organizer shape so the renderer can lay out columns/rows correctly.'),
    cells: z
      .array(graphicOrganizerCellSchema)
      .min(3)
      .max(8)
      .describe('Ordered cells. Most organizers use 3-6 cells; cap at 8 to keep the page readable.'),
    teacherNotes: z
      .string()
      .min(10)
      .max(2000)
      .describe('Teacher-facing note: when to introduce the organizer, what good responses look like, common misconceptions to watch for, and lane-specific (EL/IEP/504) accommodations to apply. Plain text, 3-8 sentences.'),
  })
  .describe('Graphic organizer for a single objective or key task in the lesson.');

export type GraphicOrganizer = z.infer<typeof graphicOrganizerSchema>;

/* ----------------------------------------------------------------------------
 * 2. Sentence stems
 * ---------------------------------------------------------------------------*/

export const sentenceStemRowSchema = z
  .object({
    audience: tieredAudienceSchema,
    function: z
      .string()
      .min(4)
      .max(60)
      .describe('Discourse function this stem supports (e.g. "Citing evidence", "Disagreeing respectfully", "Predicting", "Synthesizing two texts").'),
    stems: z
      .array(z.string().min(6).max(140))
      .min(2)
      .max(5)
      .describe('2-5 stems for this audience and function. Stems must be partial sentences students can complete; never full assertions.'),
  })
  .describe('One row of differentiated stems.');

export const sentenceStemsSchema = z
  .object({
    title: z
      .string()
      .min(4)
      .max(120)
      .describe('Title visible at the top of the printable handout (e.g. "Talk Stems for Citing Evidence in [Text Title]").'),
    pairing: z
      .enum(['text_dependent', 'standards_aligned', 'discussion_routine', 'writing_response'])
      .describe('What workflow these stems plug into so the renderer can label them appropriately.'),
    rows: z
      .array(sentenceStemRowSchema)
      .min(3)
      .max(8)
      .describe('Differentiated rows. Always include at least one el_emerging or el_developing row when the learner profile flags ELs.'),
    usageNote: z
      .string()
      .min(10)
      .max(2000)
      .describe('Teacher tip: when to model the stems, when to require them in writing, how to fade them, and lane-specific notes for EL/IEP/504 students. Plain text, 3-8 sentences.'),
  })
  .describe('Tiered sentence stems for the lesson.');

export type SentenceStems = z.infer<typeof sentenceStemsSchema>;

/* ----------------------------------------------------------------------------
 * 3. Exit ticket
 * ---------------------------------------------------------------------------*/

export const exitTicketQuestionSchema = z
  .object({
    prompt: z
      .string()
      .min(10)
      .max(320)
      .describe('Student-facing question. Must reference the chosen text, content, or standard — not generic ("What did you learn today?" is BANNED).'),
    dok: dokSchema,
    expectedEvidence: z
      .string()
      .min(8)
      .max(280)
      .describe('Teacher-facing answer key: what counts as a strong response. Plain-text only.'),
    accommodation: z
      .string()
      .max(200)
      .describe('Optional one-line accommodation note (audio version, partner-talk first, dictation, etc.). Empty string if none needed.'),
  })
  .describe('A single exit-ticket question.');

export const exitTicketSchema = z
  .object({
    title: z
      .string()
      .min(4)
      .max(120)
      .describe('Title at the top of the exit ticket (e.g. "Exit Ticket: Citing Strong Evidence in [Text Title]").'),
    standardCode: z
      .string()
      .min(2)
      .max(80)
      .describe('Standard the ticket measures (verbatim from the plan, e.g. "CCSS.ELA-LITERACY.RL.9-10.1").'),
    questions: z
      .array(exitTicketQuestionSchema)
      .min(2)
      .max(4)
      .describe('2-4 questions. Always include at least one DOK >= 3 question matched to the highest-DOK objective.'),
    successCriteria: z
      .array(z.string().min(8).max(200))
      .min(2)
      .max(4)
      .describe('Plain-language "I can..." statements students can self-check against. Aligned to the questions above.'),
    timeMinutes: z
      .number()
      .int()
      .min(2)
      .max(15)
      .describe('Recommended time-on-ticket in minutes.'),
  })
  .describe('Exit ticket aligned to the lesson objectives.');

export type ExitTicket = z.infer<typeof exitTicketSchema>;

/* ----------------------------------------------------------------------------
 * 4. Vocabulary preview
 * ---------------------------------------------------------------------------*/

export const vocabularyTermSchema = z
  .object({
    term: z
      .string()
      .min(2)
      .max(60)
      .describe('The academic or text-specific term, exactly as it appears in the chosen text or standard.'),
    studentDefinition: z
      .string()
      .min(8)
      .max(220)
      .describe('Kid-friendly definition in 1-2 sentences. Avoid using the term in its own definition.'),
    exampleFromText: z
      .string()
      .min(8)
      .max(280)
      .describe('A short quoted phrase or paraphrase from the chosen text where the term appears in context. If no direct example is plausible, give a standard-aligned example.'),
    cognate: z
      .string()
      .max(240)
      .describe('Spanish (or other top home-language) cognate or false-cognate note. Empty string if not applicable. Use the format "Spanish: <word>" or "Spanish: false cognate (<word> means …)". May include up to 1-2 sentences when explaining a tricky false cognate.'),
    quickCheck: z
      .string()
      .min(8)
      .max(240)
      .describe('Fast oral or written prompt the teacher can use to check understanding (e.g. "Use \'cite\' in a sentence about evidence").'),
  })
  .describe('A single previewed term.');

export const vocabularyPreviewSchema = z
  .object({
    title: z
      .string()
      .min(4)
      .max(120)
      .describe('Title at the top of the preview (e.g. "Vocabulary Preview: [Text Title]").'),
    terms: z
      .array(vocabularyTermSchema)
      .min(4)
      .max(10)
      .describe('4-10 terms. Prefer Tier 2 (general academic) and Tier 3 (text-specific) words; skip Tier 1 (everyday) words.'),
    routine: z
      .string()
      .min(10)
      .max(2000)
      .describe('Teacher-facing note describing the preview routine (e.g. "Use Marzano 6-step preview before reading: describe → restate → image → discuss → re-engage → game") and any lane-specific (EL/IEP/504) accommodations. Plain text, 3-8 sentences.'),
  })
  .describe('Vocabulary preview tied to the chosen text and standards.');

export type VocabularyPreview = z.infer<typeof vocabularyPreviewSchema>;

/* ----------------------------------------------------------------------------
 * 5. Discussion protocol
 * ---------------------------------------------------------------------------*/

export const discussionRoleSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .max(40)
      .describe('Role name students see (e.g. "Evidence Spotter", "Text Lawyer", "Connector").'),
    responsibility: z
      .string()
      .min(10)
      .max(240)
      .describe('1-2 sentence description of what the student in this role does during the protocol.'),
    promptStems: z
      .array(z.string().min(6).max(140))
      .min(2)
      .max(4)
      .describe('2-4 stems the student can use to fulfill the role.'),
  })
  .describe('A single role within the discussion protocol.');

export const discussionProtocolSchema = z
  .object({
    title: z
      .string()
      .min(4)
      .max(120)
      .describe('Title at the top of the protocol handout (e.g. "Concentric Circles: Citing Evidence in [Text Title]").'),
    structure: z
      .enum([
        'concentric_circles',
        'save_the_last_word',
        'socratic_seminar',
        'jigsaw',
        'four_corners',
        'fishbowl',
        'turn_and_talk_chain',
        'philosophical_chairs',
      ])
      .describe('Named talk structure so the renderer can show the correct seating diagram and timing.'),
    drivingQuestion: z
      .string()
      .min(10)
      .max(280)
      .describe('The text-grounded question students discuss. Must require evidence from the chosen text.'),
    timeMinutes: z
      .number()
      .int()
      .min(8)
      .max(45)
      .describe('Total minutes for the protocol, including transitions.'),
    roles: z
      .array(discussionRoleSchema)
      .min(2)
      .max(4)
      .describe('2-4 roles. For protocols without explicit roles (e.g. Save the Last Word), list the rotating "voices" (Reader, Responder, Final Word).'),
    accountability: z
      .string()
      .min(10)
      .max(1500)
      .describe('How student talk gets captured (one-pager, sticky notes, talk move tracker, etc.). Names the artifact the teacher collects. Plain text, 2-6 sentences.'),
    elSupport: z
      .string()
      .min(10)
      .max(1500)
      .describe('Specific WIDA-aligned support for ELs in this protocol (think-time, native-language partner, sentence frames, cognates, etc.). Should be specific to the chosen text and the multilingual learner level in the profile. Plain text, 2-6 sentences.'),
  })
  .describe('Structured talk protocol tied to the chosen text.');

export type DiscussionProtocol = z.infer<typeof discussionProtocolSchema>;

/* ----------------------------------------------------------------------------
 * 6. Single-point rubric
 * ---------------------------------------------------------------------------*/

export const rubricCriterionSchema = z
  .object({
    criterion: z
      .string()
      .min(4)
      .max(80)
      .describe('Short name of the criterion (e.g. "Evidence Selection", "Reasoning", "Conventions").'),
    proficient: z
      .string()
      .min(10)
      .max(280)
      .describe('"Proficient" descriptor: what does meeting the standard look like for this criterion in this lesson? Plain text, no markdown.'),
    growthCue: z
      .string()
      .min(8)
      .max(240)
      .describe('A coaching cue for "still working toward" — phrased as a next step, not a deficit.'),
    extensionCue: z
      .string()
      .min(8)
      .max(240)
      .describe('A stretch cue for "exceeds proficient" — what a stronger response would add.'),
  })
  .describe('A single criterion row.');

export const singlePointRubricSchema = z
  .object({
    title: z
      .string()
      .min(4)
      .max(120)
      .describe('Title at the top of the rubric (e.g. "Single-Point Rubric: Citing Evidence Argument").'),
    standardCode: z
      .string()
      .min(2)
      .max(80)
      .describe('Standard the rubric measures (verbatim from the plan).'),
    objective: z
      .string()
      .min(10)
      .max(280)
      .describe('The specific objective text this rubric scores. Copy verbatim from the plan when possible.'),
    criteria: z
      .array(rubricCriterionSchema)
      .min(3)
      .max(5)
      .describe('3-5 criteria. Prioritize the criteria that most directly assess the standard.'),
    studentSelfCheck: z
      .array(z.string().min(8).max(200))
      .min(3)
      .max(5)
      .describe('Plain-language "I can..." prompts students use before submitting. Mirror the criteria.'),
  })
  .describe('Single-point rubric for the chosen objective.');

export type SinglePointRubric = z.infer<typeof singlePointRubricSchema>;

/* ----------------------------------------------------------------------------
 * Artifact catalog
 * ---------------------------------------------------------------------------*/

export const ARTIFACT_TYPES = [
  'graphic_organizer',
  'sentence_stems',
  'exit_ticket',
  'vocabulary_preview',
  'discussion_protocol',
  'single_point_rubric',
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_SCHEMAS: Record<ArtifactType, z.ZodTypeAny> = {
  graphic_organizer: graphicOrganizerSchema,
  sentence_stems: sentenceStemsSchema,
  exit_ticket: exitTicketSchema,
  vocabulary_preview: vocabularyPreviewSchema,
  discussion_protocol: discussionProtocolSchema,
  single_point_rubric: singlePointRubricSchema,
};

export const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  graphic_organizer: 'Graphic Organizer',
  sentence_stems: 'Sentence Stems',
  exit_ticket: 'Exit Ticket',
  vocabulary_preview: 'Vocabulary Preview',
  discussion_protocol: 'Discussion Protocol',
  single_point_rubric: 'Single-Point Rubric',
};

/**
 * The union shape returned to the client when the artifact route emits a
 * "result" event. Discriminated by `type` so the renderer can switch.
 */
export type ArtifactPayload =
  | { type: 'graphic_organizer'; data: GraphicOrganizer }
  | { type: 'sentence_stems'; data: SentenceStems }
  | { type: 'exit_ticket'; data: ExitTicket }
  | { type: 'vocabulary_preview'; data: VocabularyPreview }
  | { type: 'discussion_protocol'; data: DiscussionProtocol }
  | { type: 'single_point_rubric'; data: SinglePointRubric };
