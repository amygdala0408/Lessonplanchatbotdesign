/**
 * Tools exposed to Penny's chat model.
 *
 * The chat model (anthropic/claude-sonnet-4.5 by default) drives conversation,
 * but when it needs to pick from the curated catalog it hands the decision off
 * to the *picker* model (openai/gpt-4.1-mini by default) via the `pickCatalog`
 * tool. The chat model then uses the structured result in its natural-language
 * reply to the teacher.
 *
 * This is the visible piece of Penny's multi-LLM choreography:
 *   chat model  --(tool call)-->  picker model  --(structured choice)-->  chat model
 *
 * Why expose this as a tool instead of letting the chat model just pick?
 *   1. Constrained vocabulary: the picker only ever sees the deterministic
 *      candidate list, so hallucination of IDs is impossible.
 *   2. Cost & latency: the chat model doesn't need to reason over hundreds of
 *      catalog rows. Picker does that, returns the winner in <2s, and chat
 *      continues talking warmly.
 *   3. Auditability: every catalog choice goes through one validated code path
 *      (src/lib/llm/pickCatalog.ts), used both here and at /api/catalog-pick.
 */

import { tool } from 'ai';
import { z } from 'zod';

import {
  pickCatalog,
  type CatalogDecisionType,
  type CatalogPickInput,
  type CatalogPickResult,
} from './pickCatalog';
import type { LearnerProfile, LessonPhaseId } from '../../types';

const CATALOG_DECISION_VALUES = [
  'instructional_model',
  'text',
  'opener',
  'exit_slip',
  'misconception',
  'standard',
  'scaffold',
] as const satisfies readonly CatalogDecisionType[];

const LESSON_PHASE_VALUES = [
  'launch',
  'model',
  'guided_practice',
  'independent_practice',
  'exit_slip',
] as const satisfies readonly LessonPhaseId[];

/**
 * Context the chat route passes into the tool factory so the tool's `execute`
 * function has access to the current plan and learner profile without round-
 * tripping through the model.
 */
export interface ToolBindings {
  plan?: Record<string, unknown> | null;
  learnerProfile?: LearnerProfile | null;
  messages?: { role: string; content: string }[];
  /** Optional event hook for logging tool invocations to telemetry. */
  onPick?: (input: CatalogPickInput, result: { latencyMs: number; model: string }) => void;
  /**
   * Fires AFTER the picker resolves, with the full pick result. The chat
   * route uses this to capture text-decision `choices[]` and append a
   * `[TEXT_OPTIONS]` block to the streamed response so the client can
   * populate `lessonPlan.textOptions` and unlock the picker UI + finalize
   * gate. Distinct from `onPick` which fires earlier (and only carries
   * input + telemetry meta) so existing callers stay untouched.
   */
  onPickResult?: (input: CatalogPickInput, result: CatalogPickResult) => void;
}

/**
 * Build the tool set bound to the current chat-turn context.
 *
 * Usage:
 *   const tools = buildPennyTools({ plan, learnerProfile, messages });
 *   streamText({ model, system, messages, tools, stopWhen: stepCountIs(4) });
 */
export function buildPennyTools(bindings: ToolBindings) {
  return {
    pickCatalog: tool({
      description: [
        "Pick the best option from Penny's curated catalog for a specific decision (instructional model, text, opener, exit slip, misconception, standard, or scaffold).",
        'Use this whenever the teacher asks for a recommendation or whenever a single choice from the catalog is needed.',
        'The tool delegates to a fast structured-output model that always returns a valid catalog id, a teacher-facing rationale, and a confidence level.',
        'You should call this BEFORE writing your reply when the teacher needs you to pick something.',
      ].join(' '),
      inputSchema: z.object({
        decision: z
          .enum(CATALOG_DECISION_VALUES)
          .describe(
            'Which kind of decision to make. instructional_model = pick the high-level pedagogy. text = pick the primary reading/media. opener = pick the lesson hook. exit_slip = pick the closing prompt. misconception = pick the top misconception to address. standard = align to a specific standard. scaffold = pick a scaffold for one phase.',
          ),
        phase: z
          .enum(LESSON_PHASE_VALUES)
          .optional()
          .describe(
            'Required ONLY when decision === "scaffold". The lesson phase the scaffold supports.',
          ),
        instruction: z
          .string()
          .optional()
          .describe(
            'Optional 1-sentence note from you (the chat model) explaining what you want the picker to prioritize, e.g. "favor visual hooks because student needs include processing supports".',
          ),
      }),
      execute: async ({ decision, phase, instruction }) => {
        const result = await pickCatalog({
          decision,
          phase,
          instruction,
          plan: bindings.plan ?? null,
          learnerProfile: bindings.learnerProfile ?? null,
          messages: bindings.messages ?? [],
        });

        const inputForHooks: CatalogPickInput = {
          decision,
          phase,
          instruction,
          plan: bindings.plan,
          learnerProfile: bindings.learnerProfile,
        };

        if (bindings.onPick) {
          bindings.onPick(inputForHooks, {
            latencyMs: result.meta.latencyMs,
            model: result.meta.model,
          });
        }

        if (bindings.onPickResult) {
          bindings.onPickResult(inputForHooks, result);
        }

        // Return a chat-model-friendly view. The model only needs the chosen
        // id, the rationale, and minimal candidate context to follow up
        // conversationally.
        return {
          decision: result.decision,
          choice: result.choice,
          choices: result.choices,
          rationale: result.rationale,
          confidence: result.confidence,
          runnerUp: result.runnerUp,
          candidateCount: result.candidates.length,
          modelUsed: result.meta.model,
        };
      },
    }),
  };
}

export type PennyTools = ReturnType<typeof buildPennyTools>;
