/**
 * /api/generate-artifacts
 *
 * Penny's *artifact-generator* lane.
 *
 * After `/api/finalize-plan` produces a validated lesson plan, this route
 * generates the student-facing scaffolds the teacher actually hands out:
 * graphic organizers, sentence stems, exit tickets, vocabulary previews,
 * discussion protocols, single-point rubrics. Each artifact is its own
 * `generateObject(...)` call against the strict schemas in
 * `src/lib/llm/artifactSchemas.ts`.
 *
 * Why a dedicated lane instead of bundling artifacts into the generator
 * schema?
 *   1. Latency. Six artifacts in parallel is ~10s end-to-end on Opus 4.7;
 *      bundling them all into the finalize call would push that turn past
 *      the 60-90s envelope teachers are already nervous about.
 *   2. Isolation. A single artifact's failure (timeout, schema mismatch,
 *      provider blip) doesn't poison the rest. We return whatever succeeded
 *      and let the client fall back to heuristic templates for the rest.
 *   3. Pedagogical depth. Each artifact gets its own focused system prompt
 *      and schema, so the model isn't juggling six different micro-formats
 *      in a single mega-response.
 *   4. Regenerate granularity. With each artifact addressable on its own,
 *      the section-regenerate UX (Phase C9) becomes a simple POST with
 *      `{ types: ['exit_ticket'] }`.
 *
 * The route streams Server-Sent Events so the client can render artifacts
 * progressively as they finish. Event shape:
 *   - { type: 'artifact', artifact: { type, data } }   on success
 *   - { type: 'error',    artifact: type, message }    on failure
 *   - { type: 'done',     succeeded, failed, latencyMs } at the end
 */

import { NextRequest } from 'next/server';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';

import {
  getModel,
  getModelId,
  TASK_SETTINGS,
  isGatewayConfigured,
} from '@/lib/llm/router';
import {
  ARTIFACT_TYPES,
  ARTIFACT_LABELS,
  ARTIFACT_SCHEMAS,
  type ArtifactType,
  type ArtifactPayload,
} from '@/lib/llm/artifactSchemas';
import { getScaffoldsForSubject } from '@/lib/catalog';
import type { LearnerProfile, LessonPlanData, TextOption } from '@/types';

export const runtime = 'nodejs';

interface ArtifactRequest {
  /** The finalized lesson plan (output of /api/finalize-plan). */
  plan: Partial<LessonPlanData>;
  /**
   * The text the teacher selected from `plan.textOptions`. We pass this
   * separately so the model gets it without hunting through the array.
   */
  selectedText?: TextOption | null;
  learnerProfile?: LearnerProfile | null;
  /** Subset of artifacts to generate. If omitted, all 6 are generated. */
  types?: ArtifactType[];
}

const DEFAULT_TYPES: readonly ArtifactType[] = ARTIFACT_TYPES;

/* ----------------------------------------------------------------------------
 * Prompt construction
 *
 * The artifact lane reasons over the *whole* finalized plan because most
 * scaffolds need cross-section context: a graphic organizer references the
 * highest-DOK objective, the exit ticket aligns to a specific procedure step,
 * etc. We collapse the plan into a compact teacher-facing brief so we don't
 * burn tokens on raw JSON.
 * ---------------------------------------------------------------------------*/

const SYSTEM_PROMPT = [
  'You are Penny Pedagogy generating a single student-facing artifact for a teacher.',
  '',
  'Hard rules:',
  '- Reason over the FINAL lesson plan, the CHOSEN text, the LEARNER PROFILE, and the STANDARDS provided in the user message.',
  '- Reference the chosen text by title in your output where the schema asks for it; do not invent a different text.',
  '- Use the standard\'s exact code where the schema asks for it.',
  '- Match the highest-DOK objective in the plan when the schema asks for DOK.',
  '- For ELs, build in WIDA-tier supports (sentence frames, cognates, partner talk, audio) when the learner profile flags them.',
  '- For IEP/504 needs, build in named accommodations (extended time, chunked tasks, audio, dictation) when the learner profile flags them.',
  '- Plain-text strings only. NO markdown (**, *, `, #, -). NO emoji. Use complete sentences.',
  '- Be specific to THIS lesson and THIS text. Generic templates are a failure mode — call out what you would write differently for a different lesson.',
].join('\n');

function summarizePlanForArtifacts(plan: Partial<LessonPlanData>): string {
  const lines: string[] = [];
  if (plan.title) lines.push(`TITLE: ${plan.title}`);
  if (plan.subject) lines.push(`SUBJECT: ${plan.subject}`);
  if (plan.gradeLevel) lines.push(`GRADE: ${plan.gradeLevel}`);
  if (plan.duration) lines.push(`DURATION: ${plan.duration}`);

  // The plan envelope carries a single `standard` (string | Standard) today;
  // tolerate both shapes plus a forward-looking `standards[]` if upstream
  // ever migrates.
  const standardsList: { code: string; description: string }[] = [];
  const stdAny = plan as unknown as {
    standard?: string | { code?: string; description?: string };
    standards?: (string | { code?: string; description?: string })[];
  };
  if (stdAny.standard) {
    const s = stdAny.standard;
    standardsList.push({
      code: typeof s === 'string' ? s : s?.code ?? '',
      description: typeof s === 'object' && s ? s.description ?? '' : '',
    });
  }
  if (Array.isArray(stdAny.standards)) {
    for (const s of stdAny.standards) {
      standardsList.push({
        code: typeof s === 'string' ? s : s?.code ?? '',
        description: typeof s === 'object' && s ? s.description ?? '' : '',
      });
    }
  }
  if (standardsList.length > 0) {
    lines.push('STANDARDS:');
    for (const s of standardsList) {
      lines.push(`  - ${s.code}${s.description ? ` — ${s.description}` : ''}`);
    }
  }

  if (Array.isArray(plan.objectives) && plan.objectives.length > 0) {
    lines.push('OBJECTIVES:');
    for (const o of plan.objectives) {
      if (typeof o === 'string') {
        lines.push(`  - ${o}`);
      } else if (o && typeof o === 'object') {
        const text = (o as { text?: string }).text ?? '';
        const dok = (o as { dok?: number }).dok;
        lines.push(`  - [DOK ${dok ?? '?'}] ${text}`);
      }
    }
  }

  if (Array.isArray(plan.successCriteria) && plan.successCriteria.length > 0) {
    lines.push('SUCCESS CRITERIA:');
    for (const c of plan.successCriteria) {
      const text = typeof c === 'string' ? c : (c as { text?: string }).text ?? '';
      if (text) lines.push(`  - ${text}`);
    }
  }

  if (plan.instructionalModel) lines.push(`INSTRUCTIONAL MODEL: ${plan.instructionalModel}`);

  if (Array.isArray(plan.procedure) && plan.procedure.length > 0) {
    lines.push('PROCEDURE (phase summaries):');
    for (const step of plan.procedure) {
      const id = step.phase ?? step.step ?? '?';
      const minutes =
        step.durationMin != null
          ? step.durationMax != null && step.durationMax !== step.durationMin
            ? `${step.durationMin}-${step.durationMax}m`
            : `${step.durationMin}m`
          : '';
      const label = step.step && step.step !== id ? ` "${step.step}"` : '';
      lines.push(`  - ${id}${minutes ? ` (${minutes})` : ''}${label}: ${step.description || '(no description)'}`);
      if (step.accommodations) {
        lines.push(`    Accommodations in this phase: ${step.accommodations}`);
      }
      // Teacher-move recipe: artifacts must align to the actual named moves
      // (e.g. the discussion protocol references the same anchor chart the
      // teacher names in duringWork) instead of improvising a parallel plan.
      if (step.teacherMoves) {
        const tm = step.teacherMoves;
        lines.push(`    Teacher moves: launch: ${tm.launch} | during: ${tm.duringWork} | CFU: ${tm.checkForUnderstanding} | if stuck: ${tm.ifStuck} | if ahead: ${tm.ifAhead} | transition: ${tm.transition}`);
      }
    }
  }

  if (plan.exitSlip) lines.push(`EXIT SLIP PROMPT: ${plan.exitSlip}`);
  if (Array.isArray(plan.rubric) && plan.rubric.length > 0) {
    lines.push('RUBRIC (0-3):');
    for (const row of plan.rubric) {
      lines.push(`  ${row.score}: ${row.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * SCAFFOLDS IN USE (pedagogical-grounding bridge, commit 6).
 *
 * The finalized plan names catalog scaffolds per procedure step
 * (`scaffoldIds`). Resolving them here and shipping their curated teacher
 * moves / student tasks / supports means each artifact aligns to the NAMED
 * pedagogy of the lesson — the sentence stems echo the scaffold's language
 * frames, the organizer mirrors its student tasks — instead of improvising
 * a parallel structure the teacher never planned.
 */
function summarizeScaffoldsInUse(plan: Partial<LessonPlanData>): string {
  const ids = new Map<string, string[]>(); // id -> phases using it
  for (const step of plan.procedure ?? []) {
    for (const id of step.scaffoldIds ?? []) {
      const phases = ids.get(id) ?? [];
      const phase = step.phase ?? step.step ?? '?';
      if (!phases.includes(phase)) phases.push(phase);
      ids.set(id, phases);
    }
  }
  if (ids.size === 0) return '';

  let catalog: ReturnType<typeof getScaffoldsForSubject>;
  try {
    catalog = getScaffoldsForSubject('all');
  } catch (err) {
    console.warn('[generate-artifacts] scaffold catalog unavailable:', err);
    return '';
  }
  const byId = new Map(catalog.map((s) => [s.id, s]));

  const lines: string[] = ['SCAFFOLDS IN USE (align every artifact to these named strategies):'];
  let emitted = 0;
  for (const [id, phases] of ids) {
    if (emitted >= 6) break;
    const s = byId.get(id);
    if (!s) continue;
    emitted++;
    lines.push(`  - ${s.name} (${id}; used in: ${phases.join(', ')})`);
    if (s.teacherMoves?.length) lines.push(`    Teacher moves: ${s.teacherMoves.slice(0, 3).join(' / ')}`);
    if (s.studentTasks?.length) lines.push(`    Student tasks: ${s.studentTasks.slice(0, 3).join(' / ')}`);
    if (s.supports?.length) lines.push(`    Supports: ${s.supports.slice(0, 3).join(' / ')}`);
    if (s.fadePlan) lines.push(`    Fade plan: ${s.fadePlan}`);
  }
  return emitted > 0 ? lines.join('\n') : '';
}

function summarizeTextForArtifacts(text: TextOption | null | undefined): string {
  if (!text) return 'CHOSEN TEXT: (none yet — generate scaffolds aligned to the standard.)';
  const lines: string[] = ['CHOSEN TEXT:'];
  lines.push(`  Title: ${text.title || '(untitled)'}`);
  if (text.source) lines.push(`  Source: ${text.source}`);
  if (text.url) lines.push(`  URL: ${text.url}`);
  if (text.lexile) lines.push(`  Lexile: ${text.lexile}`);
  if (text.rationale) lines.push(`  Why this fits: ${text.rationale}`);
  if (Array.isArray(text.representationTags) && text.representationTags.length > 0) {
    lines.push(`  Representation tags: ${text.representationTags.join(', ')}`);
  }
  return lines.join('\n');
}

function summarizeLearnerProfile(lp: LearnerProfile | null | undefined): string {
  if (!lp) return 'LEARNER PROFILE: (not provided)';
  const lines: string[] = ['LEARNER PROFILE:'];
  if (lp.classSize) lines.push(`  Class size: ${lp.classSize}`);
  const planFlags: string[] = [];
  if (lp.hasIEP) planFlags.push('IEP');
  if (lp.has504) planFlags.push('504');
  if (planFlags.length > 0) lines.push(`  Plans: ${planFlags.join(', ')}`);
  if (lp.multilingualLevel != null) {
    const labels = ['', 'newcomer', 'emerging', 'developing', 'expanding', 'reclassified'];
    const label = labels[lp.multilingualLevel] ?? `level ${lp.multilingualLevel}`;
    lines.push(`  Multilingual learner level: ${lp.multilingualLevel} (${label})`);
  }
  if (Array.isArray(lp.homeLanguages) && lp.homeLanguages.length > 0) {
    lines.push(`  Home languages: ${lp.homeLanguages.join(', ')}`);
  }
  if (Array.isArray(lp.needsTags) && lp.needsTags.length > 0) {
    lines.push(`  Specific needs: ${lp.needsTags.join(', ')}`);
  }
  if (lp.notes) lines.push(`  Notes: ${lp.notes}`);
  return lines.join('\n');
}

function buildArtifactPrompt(
  type: ArtifactType,
  plan: Partial<LessonPlanData>,
  selectedText: TextOption | null | undefined,
  learnerProfile: LearnerProfile | null | undefined,
): string {
  const planSummary = summarizePlanForArtifacts(plan);
  const textSummary = summarizeTextForArtifacts(selectedText);
  const learnerSummary = summarizeLearnerProfile(learnerProfile);
  const scaffoldsSummary = summarizeScaffoldsInUse(plan);

  return [
    `ARTIFACT TYPE: ${ARTIFACT_LABELS[type]} (schema id: ${type})`,
    '',
    planSummary,
    '',
    textSummary,
    '',
    learnerSummary,
    ...(scaffoldsSummary ? ['', scaffoldsSummary] : []),
    '',
    `Generate the ${ARTIFACT_LABELS[type]} as a JSON object that matches the provided schema EXACTLY. Be specific to the chosen text and the highest-DOK objective. Do not output a generic template.`,
  ].join('\n');
}

/* ----------------------------------------------------------------------------
 * Per-artifact runner
 * ---------------------------------------------------------------------------*/

async function generateOne(
  type: ArtifactType,
  plan: Partial<LessonPlanData>,
  selectedText: TextOption | null | undefined,
  learnerProfile: LearnerProfile | null | undefined,
): Promise<{ ok: true; artifact: ArtifactPayload } | { ok: false; type: ArtifactType; error: string }> {
  const settings = TASK_SETTINGS.artifact_generator;
  const schema = ARTIFACT_SCHEMAS[type] as z.ZodTypeAny;
  const basePrompt = buildArtifactPrompt(type, plan, selectedText, learnerProfile);

  const attempt = async (prompt: string, temperature: number, attemptNo: number) => {
    const { object } = await generateObject({
      model: getModel('artifact_generator'),
      schema,
      system: SYSTEM_PROMPT,
      prompt,
      temperature,
      ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'penny.artifact_generator',
        metadata: { artifactType: type, attempt: attemptNo },
      },
    });
    return object;
  };

  const describeError = (err: unknown): { message: string; detail: unknown; isSchemaFailure: boolean } => {
    if (err instanceof NoObjectGeneratedError) {
      return {
        message: `Structured output failed: ${err.message}`,
        detail: {
          text: typeof err.text === 'string' ? err.text.slice(0, 800) : null,
          cause: err.cause instanceof Error ? err.cause.message : String(err.cause ?? ''),
          finishReason: (err as unknown as { finishReason?: string }).finishReason ?? null,
        },
        isSchemaFailure: true,
      };
    }
    return {
      message: err instanceof Error ? err.message : String(err),
      detail: null,
      isSchemaFailure: false,
    };
  };

  try {
    const object = await attempt(basePrompt, settings.temperature, 1);
    return { ok: true, artifact: { type, data: object } as ArtifactPayload };
  } catch (err) {
    const first = describeError(err);

    // Exit tickets are the schema-failure hotspot (banned-generic prompts +
    // tight min/max bounds). When the first attempt fails schema validation,
    // retry exactly once with a slightly looser temperature and a corrective
    // hint built from the validator's complaint. Other artifact types fall
    // through to the heuristic print templates, so they fail fast instead.
    if (type === 'exit_ticket' && first.isSchemaFailure) {
      console.warn(`[generate-artifacts] ${type} schema failure — retrying once:`, first.message);
      const cause =
        err instanceof NoObjectGeneratedError && err.cause instanceof Error ? err.cause.message.slice(0, 600) : '';
      const retryPrompt = [
        basePrompt,
        '',
        'IMPORTANT — your previous attempt FAILED schema validation. Correct these issues and emit valid JSON only:',
        cause ? `Validator said: ${cause}` : 'The output did not match the schema (check string length bounds, required fields, and integer ranges).',
        'Every question prompt must reference the chosen text or standard. Respect all min/max lengths. questions: 2-4 items, successCriteria: 2-4 items, timeMinutes: integer 2-15.',
      ].join('\n');
      try {
        const object = await attempt(retryPrompt, Math.min(settings.temperature + 0.1, 1), 2);
        return { ok: true, artifact: { type, data: object } as ArtifactPayload };
      } catch (retryErr) {
        const second = describeError(retryErr);
        console.error(`[generate-artifacts] ${type} retry failed:`, second.message, second.detail ?? '');
        return { ok: false, type, error: `${second.message} (after 1 retry)` };
      }
    }

    console.error(`[generate-artifacts] ${type} failed:`, first.message, first.detail ?? '');
    return { ok: false, type, error: first.message };
  }
}

/* ----------------------------------------------------------------------------
 * Route
 * ---------------------------------------------------------------------------*/

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  if (!isGatewayConfigured()) {
    return new Response(
      JSON.stringify({
        ok: false,
        artifacts: [],
        errors: [
          {
            type: '<root>',
            message:
              '/api/generate-artifacts requires the Vercel AI Gateway. Set AI_GATEWAY_API_KEY in .env.local.',
          },
        ],
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: ArtifactRequest;
  try {
    body = (await request.json()) as ArtifactRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const plan = body.plan ?? {};
  const learnerProfile = body.learnerProfile ?? null;
  const selectedText =
    body.selectedText ??
    (Array.isArray(plan.textOptions) ? plan.textOptions.find((t) => t.selected) ?? null : null);

  const requested = (body.types && body.types.length > 0 ? body.types : DEFAULT_TYPES).filter(
    (t): t is ArtifactType => (ARTIFACT_TYPES as readonly string[]).includes(t),
  );

  if (requested.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid artifact types requested.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const modelId = getModelId('artifact_generator');
  console.info('[generate-artifacts] turn', {
    provider: 'ai-gateway',
    model: modelId,
    requested,
    hasSelectedText: !!selectedText,
    hasLearnerProfile: !!learnerProfile,
  });

  // Fan out: each artifact runs as its own generateObject call so failures
  // are isolated and the whole batch finishes in roughly the slowest single
  // artifact's latency.
  const tasks = requested.map((t) => generateOne(t, plan, selectedText, learnerProfile));

  // Stream results as they complete using SSE so the client can render
  // artifacts progressively. We use a per-task wrapper that resolves with
  // an index so the writer can send each event as soon as its task finishes.
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const succeeded: ArtifactType[] = [];
      const failed: { type: ArtifactType; error: string }[] = [];

      // Wrap each task with a marker so we can write events in finish order.
      const wrapped = tasks.map(async (p, i) => {
        const result = await p;
        return { i, type: requested[i], result };
      });

      try {
        // Use a settled-style loop: race the remaining promises, write the
        // first one to settle, remove it, repeat. This is more stream-friendly
        // than `Promise.allSettled` (which buffers all results).
        const pending = new Set(wrapped);
        while (pending.size > 0) {
          const next = await Promise.race(
            Array.from(pending).map((p) => p.then((v) => ({ p, v }))),
          );
          pending.delete(next.p);
          const { result, type } = next.v;
          if (result.ok) {
            succeeded.push(type);
            const payload = { type: 'artifact', artifact: result.artifact };
            controller.enqueue(encoder.encode(`event: artifact\ndata: ${JSON.stringify(payload)}\n\n`));
          } else {
            failed.push({ type, error: result.error });
            const payload = { type: 'error', artifact: type, message: result.error };
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(payload)}\n\n`));
          }
        }

        const done = {
          type: 'done',
          succeeded,
          failed,
          latencyMs: Date.now() - startedAt,
          model: modelId,
        };
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(done)}\n\n`));
        controller.close();
      } catch (err) {
        console.error('[generate-artifacts] stream error:', err);
        const payload = {
          type: 'fatal',
          message: err instanceof Error ? err.message : String(err),
        };
        controller.enqueue(encoder.encode(`event: fatal\ndata: ${JSON.stringify(payload)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'x-penny-provider': 'ai-gateway',
      'x-penny-model': modelId,
      'x-penny-task': 'artifact_generator',
    },
  });
}
