/**
 * /api/regenerate-section
 *
 * Regenerates a single section of a finalized lesson plan in isolation. The
 * teacher hovers a section in the UI, hits "Regenerate", optionally jots a
 * note ("make this more rigorous", "swap to a Socratic seminar protocol"),
 * and we return a fresh JSON payload for just that slice. The client merges
 * it back into `LessonPlanData` and re-runs the scorer.
 *
 * Why a per-section endpoint instead of "regenerate the whole plan"?
 *   - Cheaper + faster (1 round-trip on the patcher model vs. another full
 *     generator pass).
 *   - Keeps the rest of the plan stable so the teacher doesn't lose hand-
 *     edited tweaks elsewhere.
 *   - Aligns with the EQuIP "fix the weakest dimension" workflow: the
 *     scorecard can deep-link directly to the section that scored lowest
 *     and pre-fill the regenerate request with the rationale.
 *
 * Sections supported (a subset of `LessonPlanData`; expandable):
 *   - objectives, successCriteria, procedure, exitSlip, rubric,
 *     equityNotes, supports, assessment, materials.
 *
 * Routing: uses the `patcher` task on the LLM router (currently
 * openai/gpt-4.1-mini — cheap, accurate at narrow structured output).
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { generateObject, NoObjectGeneratedError } from 'ai';

import { getModel, getModelId, isGatewayConfigured, TASK_SETTINGS } from '@/lib/llm/router';
import {
  generatorObjectiveSchema,
  generatorProcedureStepSchema,
  generatorRubricRowSchema,
  generatorSupportsSchema,
} from '@/lib/llm/generatorSchema';
import type { LessonPlanData } from '@/types';

export const runtime = 'nodejs';

type SectionId =
  | 'objectives'
  | 'successCriteria'
  | 'procedure'
  | 'exitSlip'
  | 'rubric'
  | 'equityNotes'
  | 'supports'
  | 'assessment'
  | 'materials';

const SECTION_SCHEMAS: Record<SectionId, z.ZodTypeAny> = {
  objectives: z
    .object({
      objectives: z.array(generatorObjectiveSchema).min(1).max(4),
    })
    .describe(
      'Refreshed objectives. 1–4 entries, at least one at DOK >= 3, each starting with "Students will...".',
    ),
  successCriteria: z
    .object({
      successCriteria: z.array(z.string().min(6)).min(1).max(6),
    })
    .describe('Refreshed "I can..." statements, one per objective at minimum.'),
  procedure: z
    .object({
      procedure: z.array(generatorProcedureStepSchema).length(5),
    })
    .describe('Refreshed 5-phase procedure in canonical order.'),
  exitSlip: z
    .object({
      exitSlip: z.string().min(20).max(800),
    })
    .describe('Refreshed exit slip prompt aligned to the highest-DOK objective.'),
  rubric: z
    .object({
      rubric: z.array(generatorRubricRowSchema).length(4),
    })
    .describe('Refreshed 0-3 rubric, one row per score.'),
  equityNotes: z
    .object({
      equityNotes: z.string().min(40).max(1200),
    })
    .describe(
      'Refreshed equity notes: name the identities/representations centered, the access decisions you made, and how this lesson disrupts inequity.',
    ),
  supports: z
    .object({
      supports: generatorSupportsSchema,
    })
    .describe('Refreshed three-lane supports (all / EL / IEP-504), each lane with at least one entry.'),
  assessment: z
    .object({
      assessment: z.string().min(20).max(800),
    })
    .describe('Refreshed assessment description aligned to objectives + rubric.'),
  materials: z
    .object({
      materials: z.array(z.string().min(2)).min(1).max(12),
    })
    .describe('Refreshed materials list (handouts, devices, manipulatives).'),
};

const SECTION_LABELS: Record<SectionId, string> = {
  objectives: 'Learning Objectives',
  successCriteria: 'Success Criteria',
  procedure: 'Procedure (5 phases)',
  exitSlip: 'Exit Slip',
  rubric: 'Rubric',
  equityNotes: 'Equity Notes',
  supports: 'Supports & Scaffolds',
  assessment: 'Assessment',
  materials: 'Materials',
};

interface RegenerateBody {
  plan: Partial<LessonPlanData>;
  section: SectionId;
  teacherNote?: string;
  /** Optional: the dimension rationale from the scorer that prompted this regen. */
  scorerRationale?: string;
}

function summarizePlanContext(plan: Partial<LessonPlanData>, section: SectionId): string {
  // Build a short, plain-text summary of the rest of the plan so the patcher
  // model can keep the regenerated section consistent with what's around it.
  const lines: string[] = [];
  lines.push(`TITLE: ${plan.title ?? '(untitled)'}`);
  lines.push(`GRADE/SUBJECT: ${plan.gradeLevel ?? '?'} / ${plan.subject ?? '?'}`);
  lines.push(`DURATION: ${plan.duration ?? '?'}`);
  if (plan.standard) {
    const code = typeof plan.standard === 'string' ? plan.standard : plan.standard.code;
    lines.push(`STANDARD: ${code}`);
  }
  if (plan.instructionalModel) lines.push(`INSTRUCTIONAL MODEL: ${plan.instructionalModel}`);

  if (section !== 'objectives' && plan.objectives?.length) {
    lines.push(
      `OBJECTIVES:\n  - ${plan.objectives
        .map((o) => (typeof o === 'string' ? o : `[DOK ${o.dok}] ${o.text}`))
        .join('\n  - ')}`,
    );
  }
  if (section !== 'successCriteria' && plan.successCriteria?.length) {
    lines.push(`SUCCESS CRITERIA:\n  - ${plan.successCriteria.join('\n  - ')}`);
  }
  if (section !== 'procedure' && plan.procedure?.length) {
    lines.push(
      `PROCEDURE PHASES: ${plan.procedure
        .map((p) => p.phase ?? p.step)
        .join(' → ')}`,
    );
  }
  if (section !== 'exitSlip' && plan.exitSlip) {
    lines.push(`EXIT SLIP: ${plan.exitSlip.slice(0, 200)}`);
  }
  if (section !== 'equityNotes' && plan.equityNotes) {
    lines.push(`EQUITY NOTES: ${plan.equityNotes.slice(0, 200)}`);
  }
  if (plan.textOptions?.length) {
    const sel = plan.textOptions.find((t) => t.selected);
    if (sel) lines.push(`SELECTED TEXT: ${sel.title} — ${sel.source}`);
  }
  if (plan.learnerProfile) {
    const lp = plan.learnerProfile;
    const lines2: string[] = [];
    if (lp.classSize) lines2.push(`${lp.classSize} students`);
    if (lp.multilingualLevel) lines2.push(`WIDA ${lp.multilingualLevel} ELs`);
    if (lp.hasIEP) lines2.push('IEPs present');
    if (lp.has504) lines2.push('504s present');
    if (lp.needsTags?.length) lines2.push(`needs: ${lp.needsTags.join(', ')}`);
    if (lines2.length) lines.push(`LEARNER PROFILE: ${lines2.join('; ')}`);
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are Penny's section-regenerator. You receive ONE section of an existing lesson plan plus the surrounding context. You return a fresh, teacher-ready version of THAT SECTION ONLY, in strict JSON matching the provided schema.

Hard rules:
- Stay consistent with the provided context (standard, objectives, learner profile, text choice). Do not reinvent the lesson.
- If the teacher gave a note, treat it as the regeneration intent. Address it directly.
- If the scorer rationale describes a deficit (e.g. "exit slip too thin"), fix that deficit specifically.
- Plain text only inside string fields. NO markdown (no asterisks, no bullets, no backticks, no headings).
- Output ONLY the JSON object matching the schema. No commentary.`;

export async function POST(request: NextRequest) {
  if (!isGatewayConfigured()) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'AI_GATEWAY_API_KEY not configured. Cannot regenerate without the gateway.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: RegenerateBody;
  try {
    body = (await request.json()) as RegenerateBody;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON body.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!body.section || !(body.section in SECTION_SCHEMAS)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Unknown section "${body.section}". Supported: ${Object.keys(SECTION_SCHEMAS).join(', ')}.`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (!body.plan) {
    return new Response(
      JSON.stringify({ ok: false, error: 'plan is required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const section = body.section;
  const schema = SECTION_SCHEMAS[section];
  const settings = TASK_SETTINGS.patcher;
  const modelId = getModelId('patcher');
  const startedAt = Date.now();

  const userMessage = [
    `SECTION TO REGENERATE: ${SECTION_LABELS[section]} (\`${section}\`)`,
    '',
    'PLAN CONTEXT (do not modify; stay consistent):',
    summarizePlanContext(body.plan, section),
    '',
    body.teacherNote ? `TEACHER NOTE: ${body.teacherNote}` : '',
    body.scorerRationale ? `SCORER RATIONALE (fix this deficit): ${body.scorerRationale}` : '',
    '',
    `Return ONLY the JSON object with the "${section}" key per the schema.`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { object } = await generateObject({
      model: getModel('patcher'),
      schema,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      temperature: settings.temperature,
      ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'penny.regenerate-section',
        metadata: { section, hasNote: !!body.teacherNote, hasRationale: !!body.scorerRationale },
      },
    });

    const obj = object as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        ok: true,
        section,
        value: obj[section],
        meta: {
          provider: 'ai-gateway',
          model: modelId,
          latencyMs: Date.now() - startedAt,
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-penny-task': 'patcher',
          'x-penny-model': modelId,
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof NoObjectGeneratedError
        ? `Structured output failed for section "${section}": ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error('[regenerate-section] generateObject failed:', message, err);
    return new Response(
      JSON.stringify({
        ok: false,
        section,
        error: message,
        meta: { model: modelId, latencyMs: Date.now() - startedAt },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
