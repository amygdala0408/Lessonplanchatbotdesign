/**
 * /api/finalize-plan
 *
 * Penny's *generator* lane in the multi-LLM strategy.
 *
 * Replaces the old `[LESSON_PLAN_JSON]` regex extraction in handleFinalize.
 * Instead of asking the chat model to emit JSON between magic tags and praying
 * the regex catches it, we call a high-quality structured-output model via
 * `generateObject(... lessonPlanSchema)`. The JSON Schema is enforced by the
 * provider — there is no regex, no commentary leakage, no partial output.
 *
 * Flow:
 *   1. Build the same system prompt + catalog candidates context that the
 *      chat route uses (so the generator picks real IDs and follows Penny's
 *      contract).
 *   2. Call generateObject with the strict generator schema.
 *   3. Run the existing `validateLessonPlan(merged, 'finalize')` gate to catch
 *      semantic issues the schema alone can't (phase order, embedded
 *      accommodations, success criteria coverage).
 *   4. If validation fails, retry once with an explicit violations list.
 *   5. Return the parsed plan + errors.
 *
 * Returns 200 in all cases with `{ ok, plan, errors, retryPrompt, meta }` so
 * the client can branch on `ok`.
 */

import { NextRequest } from 'next/server';
import { generateObject, NoObjectGeneratedError } from 'ai';

import { buildMessages } from '@/lib/promptInjector';
import { buildCatalogContext } from '@/lib/catalogContext';
import { validateLessonPlan, formatErrorsForRetry } from '@/lib/lessonPlanSchema';
import { validateCatalogIds } from '@/lib/catalog/validateIds';
import { generatorLessonPlanSchema, type GeneratorLessonPlan } from '@/lib/llm/generatorSchema';
import {
  getModel,
  getModelId,
  TASK_SETTINGS,
  isGatewayConfigured,
} from '@/lib/llm/router';
import type { ValidationError, LearnerProfile, LessonPlanData } from '@/types';

export const runtime = 'nodejs';

interface FinalizeRequest {
  plan?: Partial<LessonPlanData>;
  learnerProfile?: LearnerProfile | null;
  messages?: { role: string; content: string }[];
  /** Optional teacher-facing fix instruction for retry rounds. */
  fixInstructions?: string;
}

const FINALIZE_INSTRUCTION = [
  'TASK: Emit the FINAL lesson plan as a single JSON object that matches the provided schema EXACTLY.',
  '',
  'Hard requirements:',
  '- Exactly 5 procedure phases in canonical order (launch, model, guided_practice, independent_practice, exit_slip).',
  '- Every procedure step has non-empty `accommodations` text AND uses scaffoldIds/accommodationIds from CATALOG_CANDIDATES where possible.',
  '- Exit slip aligned to the highest-DOK objective.',
  '- Rubric has exactly 4 rows scored 0, 1, 2, 3 (one each).',
  '- Exactly 3 textOptions; exactly one has selected=true (preserve any existing teacher selection).',
  '- Use catalog IDs from CATALOG_CANDIDATES whenever you reference texts, openers, exit slips, misconceptions, or accommodations. Empty string / empty array if nothing in the candidates matches.',
  '- Standards code must follow the framework convention (e.g., CCSS.ELA-LITERACY.RI.11-12.6, HS-LS1-2).',
  '- objective.dok values: at least one objective must be DOK >= 3.',
  '- All text is teacher-facing, jargon-free, plainspoken. No emoji. No filler.',
  '',
  'STRING-VALUE FORMATTING (mandatory):',
  '- JSON string values must be PLAIN TEXT only. No markdown syntax inside any field.',
  '- Forbidden inside any string value: ** (double asterisk), * (single asterisk for emphasis), backticks, # headings, [link](url) syntax, leading -/• bullets.',
  '- Use complete sentences with normal punctuation. To emphasize a term, just name it directly — do not wrap it in **bold** or *italics*.',
  '- Newlines are allowed for readability inside long descriptions; do not start lines with markdown syntax.',
  '- Each procedure step description is 2–4 complete sentences of teacher-facing prose. The schema renderer renders strings verbatim, so any markdown you include will appear as literal characters in the printed lesson.',
].join('\n');

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  if (!isGatewayConfigured()) {
    return new Response(
      JSON.stringify({
        ok: false,
        plan: null,
        errors: [
          {
            path: '<root>',
            message:
              '/api/finalize-plan requires the Vercel AI Gateway. Set AI_GATEWAY_API_KEY in .env.local.',
            severity: 'error',
          },
        ],
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: FinalizeRequest;
  try {
    body = (await request.json()) as FinalizeRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const currentPlan = body.plan ?? {};
  const learnerProfile = body.learnerProfile ?? null;
  const conversationHistory = Array.isArray(body.messages) ? body.messages : [];

  // Build the same constrained-vocabulary system message that the chat route
  // uses, but always in the `drafting` phase so the generator gets the
  // broadest candidate set (texts + models + openers + exit slips + scaffolds +
  // accommodations).
  let catalogCandidatesMessage: string | null = null;
  try {
    const result = buildCatalogContext({
      currentPlan,
      learnerProfile,
      conversationHistory,
      conversationPhase: 'drafting',
    });
    catalogCandidatesMessage = result.systemMessage;
  } catch (err) {
    console.warn('[finalize-plan] catalog context build failed:', err);
  }

  const { messages, promptVersion } = buildMessages({
    conversationHistory,
    currentPlan,
    learnerProfile: learnerProfile as Record<string, unknown> | null,
    catalogCandidatesMessage,
  });

  // Lift the primary Penny system prompt into the dedicated `system` param.
  const [primarySystem, ...rest] = messages;
  const hasPrimarySystem = primarySystem?.role === 'system';
  const systemPrompt = hasPrimarySystem
    ? `${primarySystem.content}\n\n${FINALIZE_INSTRUCTION}`
    : FINALIZE_INSTRUCTION;
  const remaining = hasPrimarySystem ? rest : messages;

  const settings = TASK_SETTINGS.generator;
  const modelId = getModelId('generator');

  console.info('[finalize-plan] turn', {
    promptVersion,
    provider: 'ai-gateway',
    model: modelId,
    messageCount: remaining.length,
    hasCatalogCandidates: !!catalogCandidatesMessage,
    hasLearnerProfile: !!learnerProfile,
  });

  // Allow the model two attempts at producing a plan that passes both schema
  // and validation gates.
  let generated: GeneratorLessonPlan | null = null;
  let merged: Partial<LessonPlanData> = {};
  let validation = { ok: false, errors: [] as ValidationError[] };
  let lastModelError: string | null = null;

  for (const attempt of [0, 1] as const) {
    try {
      const extraInstruction =
        attempt > 0
          ? `\n\nPRIOR ATTEMPT FAILED. Fix these specific issues and emit a NEW complete plan:\n${formatErrorsForRetry(validation.errors)}`
          : body.fixInstructions
            ? `\n\nTEACHER NOTE: ${body.fixInstructions}`
            : '';

      const { object } = await generateObject({
        model: getModel('generator'),
        schema: generatorLessonPlanSchema,
        system: systemPrompt + extraInstruction,
        messages: remaining.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        // Multiple inline system messages are intentional in our pipeline.
        allowSystemInMessages: true,
        temperature: settings.temperature,
        ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'penny.generator',
          metadata: { promptVersion, attempt },
        },
      });

      generated = object as GeneratorLessonPlan;
      merged = { ...currentPlan, ...(generated as Partial<LessonPlanData>) };

      // Run the *full* finalize-time validation. This catches semantic issues
      // the schema alone can't (phase order, accommodation coverage, success
      // criteria alignment).
      const structural = validateLessonPlan(merged, 'finalize');
      const catalogErrors = validateCatalogIds(merged);
      validation = {
        ok: !structural.errors.some((e) => e.severity === 'error') &&
            !catalogErrors.some((e) => e.severity === 'error'),
        errors: [...structural.errors, ...catalogErrors],
      };

      if (validation.ok) break;

      console.warn(
        `[finalize-plan] attempt ${attempt} produced plan with ${validation.errors.length} issue(s); retrying.`,
      );
    } catch (err) {
      lastModelError =
        err instanceof NoObjectGeneratedError
          ? `Structured output failed: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      console.error(`[finalize-plan] generateObject failed (attempt ${attempt}):`, err);
    }
  }

  const responseBody = {
    ok: validation.ok,
    plan: generated,
    merged,
    errors: validation.errors,
    retryPrompt: validation.ok ? '' : formatErrorsForRetry(validation.errors),
    meta: {
      provider: 'ai-gateway',
      model: modelId,
      modelInvoked: !!generated || !!lastModelError,
      modelError: lastModelError,
      latencyMs: Date.now() - startedAt,
      promptVersion,
    },
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'x-penny-provider': 'ai-gateway',
      'x-penny-model': modelId,
      'x-penny-task': 'generator',
      'x-penny-prompt-version': promptVersion,
    },
  });
}
