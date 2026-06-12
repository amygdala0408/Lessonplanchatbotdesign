import { z } from 'zod';
import {
  INSTRUCTIONAL_MODELS,
  LESSON_PHASE_ORDER,
  LESSON_PHASE_LABELS,
  type LessonPhaseId,
  type ValidationError,
} from '../types';
import { validateObjectiveDok } from './dokLexicon';

// Standard code regex coverage for the four canonical frameworks. Conservative on
// purpose: we want to reject obviously-wrong codes (e.g. "11th grade ELA") while
// accepting the broad shapes teachers actually paste in. State frameworks are
// permitted via 'state' + a free code.
const STANDARD_REGEXES: Record<string, RegExp> = {
  CCSS: /^CCSS\.[A-Z0-9.\-]+/i,
  NGSS: /^(HS|MS|K|[1-8])\s*[-.]\s*[A-Z]+\d?[-.]?\d+/i,
  C3: /^D\d+\.\d+\.[\dK]+[-.]?\d*/i,
};

export const standardSchema = z.union([
  z.string().min(1),
  z.object({
    framework: z.enum(['CCSS', 'NGSS', 'C3', 'state', 'other']),
    code: z.string().min(1),
    description: z.string().optional().default(''),
  }).refine(
    (s) => {
      const re = STANDARD_REGEXES[s.framework];
      return !re || re.test(s.code);
    },
    { message: 'Standard code does not match the expected format for the framework' },
  ),
]);

export const objectiveSchema = z.union([
  z.string().min(8),
  z.object({
    text: z.string().min(8),
    dok: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    verb: z.string().optional(),
    isExtension: z.boolean().optional(),
  }),
]);

export const teacherMovesSchema = z.object({
  launch: z.string(),
  duringWork: z.string(),
  checkForUnderstanding: z.string(),
  ifStuck: z.string(),
  ifAhead: z.string(),
  transition: z.string(),
});

export const procedureStepSchema = z.object({
  phase: z.enum(LESSON_PHASE_ORDER as [LessonPhaseId, ...LessonPhaseId[]]).optional(),
  step: z.string().min(2),
  description: z.string().min(20),
  // Lenient at intake (legacy plans lack it); the finalize gate checks quality.
  teacherMoves: teacherMovesSchema.optional(),
  accommodations: z.string().optional(),
  scaffoldIds: z.array(z.string()).optional(),
  accommodationIds: z.array(z.string()).optional(),
  durationMin: z.number().optional(),
  durationMax: z.number().optional(),
});

export const rubricRowSchema = z.object({
  score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  description: z.string().min(2),
});

export const textOptionSchema = z.object({
  title: z.string().min(2),
  source: z.string().min(2),
  lexile: z.string(),
  url: z.string().url().or(z.literal('')),
  rationale: z.string().optional().default(''),
  selected: z.boolean(),
  resourceId: z.string().optional(),
  representationTags: z.array(z.string()).optional(),
  accessibility: z.object({
    audio: z.boolean().optional(),
    captions: z.boolean().optional(),
    transcript: z.boolean().optional(),
    keyboardNav: z.boolean().optional(),
    accountRequired: z.boolean().optional(),
  }).optional(),
});

export const supportsSchema = z.object({
  all: z.array(z.string()),
  el: z.array(z.string()),
  iep504: z.array(z.string()),
});

export const learnerProfileSchema = z.object({
  hasIEP: z.boolean(),
  has504: z.boolean(),
  multilingualLevel: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.null(),
  ]),
  homeLanguages: z.array(z.string()),
  needsTags: z.array(z.string()),
  classSize: z.number().optional(),
  notes: z.string().optional(),
});

// The base lesson plan shape. Used in all phases; finalization runs the *strict*
// schema below which adds quality gates on top of this.
export const lessonPlanSchema = z.object({
  title: z.string().min(3),
  gradeLevel: z.string().min(1),
  subject: z.string().min(1),
  duration: z.string().min(1),
  standard: standardSchema.optional(),
  objectives: z.array(objectiveSchema).min(1),
  materials: z.array(z.string()).default([]),
  procedure: z.array(procedureStepSchema).default([]),
  assessment: z.string().default(''),
  successCriteria: z.array(z.string()).optional(),
  supports: supportsSchema.optional(),
  equityNotes: z.string().optional(),
  exitSlip: z.string().optional(),
  rubric: z.array(rubricRowSchema).optional(),
  teacherModifications: z.array(z.string()).optional(),
  textOptions: z.array(textOptionSchema).optional(),
  instructionalModel: z.enum(INSTRUCTIONAL_MODELS as [string, ...string[]]).optional(),
  learnerProfile: learnerProfileSchema.optional(),
  resourceIds: z.array(z.string()).optional(),
  exitSlipId: z.string().optional(),
  openerId: z.string().optional(),
  misconceptionIds: z.array(z.string()).optional(),
  evidenceCitationKeys: z.array(z.string()).optional(),
});

export type LessonPlanInput = z.input<typeof lessonPlanSchema>;
export type LessonPlanParsed = z.infer<typeof lessonPlanSchema>;

// Phase-specific gates.
//
// `text_selection` gate: exactly 3 candidates, none yet selected.
// `post_selection` gate: 3 candidates with exactly one selected.
// `finalize` gate: full quality requirements (the EQuIP+UDL rubric scorer in P2
// adds the holistic score; this Zod gate covers the structural requirements).
export type ValidationGate = 'text_selection' | 'post_selection' | 'finalize';

const PROCEDURE_PHASE_SET = new Set(LESSON_PHASE_ORDER);

function detectPhaseFromLabel(label: string): LessonPhaseId | null {
  const normalized = label.toLowerCase();
  for (const [phaseId, labels] of Object.entries(LESSON_PHASE_LABELS) as [LessonPhaseId, string[]][]) {
    if (labels.some((l) => normalized.includes(l.toLowerCase()))) {
      return phaseId;
    }
  }
  return null;
}

/**
 * Run the structural validations relevant to the current phase. Pure function
 * returning a list of {path, message, severity} so the chat orchestrator can
 * surface them in retry prompts and the UI can render them as a checklist.
 */
export function validateLessonPlan(
  data: unknown,
  gate: ValidationGate,
): { ok: boolean; errors: ValidationError[]; parsed?: LessonPlanParsed } {
  const errors: ValidationError[] = [];

  // Step 1: shape validation.
  const parseResult = lessonPlanSchema.safeParse(data ?? {});
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push({
        path: issue.path.join('.') || '<root>',
        message: issue.message,
        severity: 'error',
      });
    }
    // Continue with partial data so finalize gates still produce useful messages.
  }

  const plan: Partial<LessonPlanParsed> = parseResult.success
    ? parseResult.data
    : ((data as Partial<LessonPlanParsed>) ?? {});

  // Step 2: gate-specific quality checks.
  if (gate === 'text_selection') {
    const opts = plan.textOptions ?? [];
    if (opts.length !== 3) {
      errors.push({
        path: 'textOptions',
        message: `Expected exactly 3 text options, got ${opts.length}`,
        severity: 'error',
      });
    }
    if (opts.some((o) => o.selected)) {
      errors.push({
        path: 'textOptions',
        message: 'Text options should not be marked selected before the teacher picks',
        severity: 'warning',
      });
    }
  }

  if (gate === 'post_selection' || gate === 'finalize') {
    const opts = plan.textOptions ?? [];
    if (opts.length !== 3) {
      errors.push({
        path: 'textOptions',
        message: `Expected exactly 3 text options, got ${opts.length}`,
        severity: 'error',
      });
    }
    const selectedCount = opts.filter((o) => o.selected).length;
    if (selectedCount !== 1) {
      errors.push({
        path: 'textOptions',
        message: `Expected exactly one selected text, got ${selectedCount}`,
        severity: 'error',
      });
    }
  }

  if (gate === 'finalize') {
    // Procedure must contain the canonical 5 phases in order.
    const procedure = plan.procedure ?? [];
    const detectedPhases: LessonPhaseId[] = procedure.map(
      (p) => p.phase ?? detectPhaseFromLabel(p.step) ?? ('' as LessonPhaseId),
    );
    const missing = LESSON_PHASE_ORDER.filter((p) => !detectedPhases.includes(p));
    if (missing.length > 0) {
      errors.push({
        path: 'procedure',
        message: `Missing required lesson phase(s): ${missing.join(', ')}`,
        severity: 'error',
      });
    }
    if (procedure.length < 5) {
      errors.push({
        path: 'procedure',
        message: `Expected at least 5 procedure steps (one per phase), got ${procedure.length}`,
        severity: 'error',
      });
    }
    // Order check: detected phases that are present should appear in the canonical order.
    const presentInOrder = detectedPhases.filter((p) => PROCEDURE_PHASE_SET.has(p));
    let lastIdx = -1;
    let outOfOrder = false;
    for (const p of presentInOrder) {
      const idx = LESSON_PHASE_ORDER.indexOf(p);
      if (idx < lastIdx) {
        outOfOrder = true;
        break;
      }
      lastIdx = idx;
    }
    if (outOfOrder) {
      errors.push({
        path: 'procedure',
        message: 'Lesson phases are not in canonical order (launch -> model -> guided_practice -> independent_practice -> exit_slip)',
        severity: 'error',
      });
    }

    // Embedded accommodations: each procedure step should have non-empty
    // accommodations text OR a non-empty accommodationIds array.
    procedure.forEach((step, i) => {
      const hasText = !!(step.accommodations && step.accommodations.trim().length > 0);
      const hasIds = Array.isArray(step.accommodationIds) && step.accommodationIds.length > 0;
      if (!hasText && !hasIds) {
        errors.push({
          path: `procedure[${i}].accommodations`,
          message: `Phase "${step.step}" has no embedded accommodations. Penny must list at least one accommodation per phase.`,
          severity: 'error',
        });
      }
    });

    // Teacher moves: every fresh finalize carries the six-field execution
    // recipe per phase. Missing block is a warning (legacy plans predate it);
    // a present-but-thin or markdown-contaminated block is an error because
    // the generator schema required it and the print layout renders verbatim.
    const TEACHER_MOVE_FIELDS = [
      'launch', 'duringWork', 'checkForUnderstanding', 'ifStuck', 'ifAhead', 'transition',
    ] as const;
    const MARKDOWN_LEAK = /(\*\*|__|^#{1,6}\s|`|\[[^\]]+\]\([^)]+\))/m;
    let phasesWithQuotedLanguage = 0;
    let phasesWithMoves = 0;
    procedure.forEach((step, i) => {
      const moves = step.teacherMoves;
      if (!moves) {
        errors.push({
          path: `procedure[${i}].teacherMoves`,
          message: `Phase "${step.step}" is missing the teacherMoves execution recipe (launch / duringWork / checkForUnderstanding / ifStuck / ifAhead / transition).`,
          severity: 'warning',
        });
        return;
      }
      phasesWithMoves += 1;
      for (const field of TEACHER_MOVE_FIELDS) {
        const value = (moves[field] ?? '').trim();
        if (value.length < 15) {
          errors.push({
            path: `procedure[${i}].teacherMoves.${field}`,
            message: `Phase "${step.step}" teacherMoves.${field} is ${value.length === 0 ? 'empty' : 'too thin'} — write 1-3 concrete sentences (min 15 chars).`,
            severity: 'error',
          });
        } else if (MARKDOWN_LEAK.test(value)) {
          errors.push({
            path: `procedure[${i}].teacherMoves.${field}`,
            message: `Phase "${step.step}" teacherMoves.${field} contains markdown syntax; the printed plan renders this verbatim. Use plain text.`,
            severity: 'error',
          });
        }
      }
      // Soft check: the recipe should contain verbatim teacher language
      // (a quoted question or directive) somewhere in the six moves.
      const allMoves = TEACHER_MOVE_FIELDS.map((f) => moves[f] ?? '').join(' ');
      if (/[""][^""]{4,}[""]|"[^"]{4,}"/.test(allMoves)) {
        phasesWithQuotedLanguage += 1;
      }
    });
    if (phasesWithMoves > 0 && phasesWithQuotedLanguage < Math.min(3, phasesWithMoves)) {
      errors.push({
        path: 'procedure',
        message: `Only ${phasesWithQuotedLanguage}/${phasesWithMoves} phases include verbatim quoted teacher language in teacherMoves. Aim for the exact words the teacher says (in quotation marks) in at least 3 phases.`,
        severity: 'warning',
      });
    }

    // DOK lexicon check: each objective with a claimed DOK level should use a
    // verb whose canonical DOK is within 1 level of the claim. We treat this
    // as a `warning` (not blocking) so an unfamiliar verb doesn't tank
    // finalize, but the teacher sees the mismatch and a suggested fix.
    const subjectForDok = plan.subject ?? null;
    (plan.objectives ?? []).forEach((obj, i) => {
      if (!obj || typeof obj === 'string') return;
      const text = obj.text ?? '';
      if (!text || typeof obj.dok !== 'number') return;
      const dokWarnings = validateObjectiveDok({
        objectiveText: text,
        claimedDok: obj.dok,
        subject: subjectForDok,
        pathPrefix: `objectives[${i}].dok`,
      });
      errors.push(...dokWarnings);
    });

    // Success criteria aligned to objectives.
    const objectives = plan.objectives ?? [];
    const successCriteria = plan.successCriteria ?? [];
    if (successCriteria.length === 0) {
      errors.push({
        path: 'successCriteria',
        message: 'Missing success criteria',
        severity: 'error',
      });
    } else if (successCriteria.length < objectives.length) {
      errors.push({
        path: 'successCriteria',
        message: `Need at least one success criterion per objective. Got ${successCriteria.length} criteria for ${objectives.length} objectives.`,
        severity: 'error',
      });
    }

    // Rubric must be a 0-3 rubric with all four rows.
    const rubric = plan.rubric ?? [];
    if (rubric.length !== 4) {
      errors.push({
        path: 'rubric',
        message: `Rubric must have exactly 4 rows scored 0-3, got ${rubric.length}`,
        severity: 'error',
      });
    } else {
      const scores = rubric.map((r) => r.score).sort();
      const expected = [0, 1, 2, 3];
      if (JSON.stringify(scores) !== JSON.stringify(expected)) {
        errors.push({
          path: 'rubric',
          message: `Rubric scores must be exactly {0,1,2,3}, got {${scores.join(',')}}`,
          severity: 'error',
        });
      }
    }

    // Exit slip required.
    if (!plan.exitSlip || plan.exitSlip.trim().length < 10) {
      errors.push({
        path: 'exitSlip',
        message: 'Exit slip prompt is missing or too short',
        severity: 'error',
      });
    }

    // Supports across the three lanes (P0 still allows free-text; P1 swaps to rules engine).
    if (!plan.supports || (
      (plan.supports.all?.length ?? 0) === 0
      && (plan.supports.el?.length ?? 0) === 0
      && (plan.supports.iep504?.length ?? 0) === 0
    )) {
      errors.push({
        path: 'supports',
        message: 'Supports & scaffolds section is empty for all three learner lanes',
        severity: 'error',
      });
    }
  }

  const hasBlockingError = errors.some((e) => e.severity === 'error');
  return {
    ok: !hasBlockingError,
    errors,
    parsed: parseResult.success ? parseResult.data : undefined,
  };
}

/**
 * Render validation errors as a structured retry prompt the model can act on.
 *
 * Used by the auto-retry path in /api/finalize-plan and /api/validate-plan.
 *
 * Optionally accepts a `suggestSimilar` callback that, given an `id` and the
 * error `path`, returns up to N catalog IDs similar to the offending one.
 * When provided, each "Unknown … id" error is annotated with closest valid
 * IDs so the model stops re-guessing on the next attempt.
 *
 * The schema module stays portable (no server-only deps); the API routes
 * pass the catalog-aware suggester from `src/lib/catalog/closestIds.ts`.
 */
export function formatErrorsForRetry(
  errors: ValidationError[],
  options?: {
    suggestSimilar?: (args: { id: string; path: string }) => string[];
  },
): string {
  const blocking = errors.filter((e) => e.severity === 'error');
  if (blocking.length === 0) return '';
  const lines: string[] = [
    'Your previous lesson plan JSON failed validation. Re-emit ONLY the [LESSON_PLAN_JSON] block with these fixes (no commentary):',
  ];
  blocking.forEach((e, i) => {
    let line = `${i + 1}. ${e.path}: ${e.message}`;
    const suggester = options?.suggestSimilar;
    if (suggester) {
      const m = e.message.match(/"([^"]+)"/);
      const badId = m?.[1];
      if (badId) {
        const suggestions = suggester({ id: badId, path: e.path });
        if (suggestions.length > 0) {
          line += `\n   Closest valid ids: ${suggestions.map((s) => `"${s}"`).join(', ')}`;
        }
      }
    }
    lines.push(line);
  });
  return lines.join('\n');
}
