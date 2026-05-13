/**
 * Shared catalog picker logic.
 *
 * Used by:
 *   1. The /api/catalog-pick route (direct invocation from the client).
 *   2. The `pickCatalog` tool exposed to the chat model (so Penny can hand
 *      off to the picker LLM mid-conversation — multi-LLM choreography).
 *
 * Keeping the implementation here means both call sites use identical
 * candidate scoring, prompt structure, validation, and fallback behavior.
 */

import { generateObject } from 'ai';
import { z } from 'zod';

import { buildSelectionContext } from '../catalogContext';
import {
  selectExitSlips,
  selectInstructionalModelCandidates,
  selectMisconceptions,
  selectOpeners,
  selectScaffoldsForPhase,
  selectStandards,
  selectTexts,
} from '../catalog/selectors';
import { getModel, getModelId, TASK_SETTINGS } from './router';
import type { LearnerProfile, LessonPhaseId } from '../../types';

/* ----------------------------------------------------------------------------
 * Contracts
 * ---------------------------------------------------------------------------*/

export type CatalogDecisionType =
  | 'instructional_model'
  | 'text'
  | 'opener'
  | 'exit_slip'
  | 'misconception'
  | 'standard'
  | 'scaffold';

export interface CatalogPickInput {
  decision: CatalogDecisionType;
  plan?: Record<string, unknown> | null;
  learnerProfile?: LearnerProfile | null;
  messages?: { role: string; content: string }[];
  phase?: LessonPhaseId;
  instruction?: string;
  limit?: number;
}

export interface Candidate {
  id: string;
  summary: Record<string, unknown>;
  record: unknown;
}

// IMPORTANT: OpenAI's strict structured-output mode requires *every* property
// to appear in `required`. That means `.optional()` is not allowed; use
// `.nullable()` alone so the field is always present but may be null. Same
// rationale for the empty-string trick on `chosenId` — the schema is strict;
// we validate semantically below.
export const PickerOutputSchema = z.object({
  chosenId: z.string().min(1, 'Must reference an ID from the candidates list.'),
  rationale: z
    .string()
    .min(8, 'Give a 1-2 sentence teacher-facing reason.')
    .max(280, 'Keep it under ~280 characters.'),
  confidence: z.enum(['high', 'medium', 'low']),
  runnerUpId: z
    .string()
    .nullable()
    .describe('Second-best id, or null if there is no meaningful runner-up.'),
});

export type PickerOutput = z.infer<typeof PickerOutputSchema>;

export interface CatalogPickResult {
  decision: CatalogDecisionType;
  choice: unknown | null;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  runnerUp: unknown | null;
  candidates: unknown[];
  meta: {
    provider: 'ai-gateway';
    model: string;
    modelInvoked: boolean;
    modelError?: string;
    latencyMs: number;
  };
}

/* ----------------------------------------------------------------------------
 * Candidate shaping
 * ---------------------------------------------------------------------------*/

export function buildCandidates(input: CatalogPickInput): Candidate[] {
  const ctx = buildSelectionContext({
    currentPlan: input.plan ?? null,
    learnerProfile: input.learnerProfile ?? null,
    conversationHistory: input.messages ?? [],
  });

  switch (input.decision) {
    case 'instructional_model': {
      const cands = selectInstructionalModelCandidates(ctx, input.limit ?? 5);
      return cands.map((c) => ({
        id: c.model,
        summary: { id: c.model, rationale: c.rationale, phaseCount: c.phases.length },
        record: c,
      }));
    }
    case 'text': {
      const cands = selectTexts(ctx, input.limit ?? 6);
      return cands.map((c) => ({
        id: c.id,
        summary: {
          id: c.id,
          title: c.title,
          source: c.source,
          license: c.license,
          captions: c.captions,
          transcript: c.transcript,
          score: c.score,
        },
        record: c,
      }));
    }
    case 'opener': {
      const cands = selectOpeners(ctx, input.limit ?? 4);
      return cands.map((c) => ({
        id: c.id,
        summary: {
          id: c.id,
          type: c.openerType,
          dokFloor: c.dokFloor,
          hook: truncate(c.hookText, 160),
        },
        record: c,
      }));
    }
    case 'exit_slip': {
      const cands = selectExitSlips(ctx, input.limit ?? 4);
      return cands.map((c) => ({
        id: c.id,
        summary: {
          id: c.id,
          subject: c.subject,
          dokFloor: c.dokFloor,
          prompt: truncate(c.prompt, 200),
        },
        record: c,
      }));
    }
    case 'misconception': {
      const cands = selectMisconceptions(ctx, input.limit ?? 4);
      return cands.map((c) => ({
        id: c.id,
        summary: {
          id: c.id,
          misconception: truncate(c.misconception, 160),
          probe: truncate(c.probe, 160),
        },
        record: c,
      }));
    }
    case 'standard': {
      const cands = selectStandards(ctx, input.limit ?? 6);
      return cands.map((c) => ({
        id: c.id,
        summary: { id: c.id, strand: c.strand, description: truncate(c.description, 200) },
        record: c,
      }));
    }
    case 'scaffold': {
      if (!input.phase) {
        throw new Error('Scaffold decision requires a `phase` field.');
      }
      const cands = selectScaffoldsForPhase(ctx, input.phase, input.limit ?? 4);
      return cands.map((c) => ({
        id: c.id,
        summary: {
          id: c.id,
          name: c.name,
          type: c.type,
          dok: c.dokLevel,
          equityScore: c.equityScore,
        },
        record: c,
      }));
    }
    default: {
      const _never: never = input.decision;
      throw new Error(`Unsupported decision type: ${_never}`);
    }
  }
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/* ----------------------------------------------------------------------------
 * Prompting
 * ---------------------------------------------------------------------------*/

const DECISION_PROMPTS: Record<CatalogDecisionType, string> = {
  instructional_model:
    'Choose the instructional model that best matches this lesson context. Prefer models that fit the subject and the type of cognitive demand the topic requires. Avoid Project-Based Learning unless the duration is >= 90 minutes.',
  text: 'Choose the single best primary text for this lesson. Prioritize accessibility (captions/transcript when video), license openness (OER/CC over paid), grade-level fit, and topical relevance. Cite by the catalog id only.',
  opener:
    'Choose the strongest opener (hook + learning intention frame) for the topic. Prefer openers whose DOK floor matches or sits one below the objective DOK.',
  exit_slip:
    'Choose the strongest exit slip for the lesson. Prefer prompts that surface a clear evidence of learning at the target DOK.',
  misconception:
    'Choose the highest-impact misconception to address during this lesson — the one most likely to affect the most students at this grade band.',
  standard:
    'Choose the single most-aligned standard for the stated objective. Prefer direct strand matches over loose thematic ones.',
  scaffold:
    'Choose the strongest scaffold for the given lesson phase, weighing equity score, DOK match, and topical relevance.',
};

const PICKER_SYSTEM_PROMPT = [
  'You are Penny\'s curriculum selection assistant. Your only job is to pick one option from a small, pre-filtered candidate set for a K-12 teacher.',
  'You never invent ids. You never expand the candidate set. You never propose new content. You pick from the given ids only.',
  'You write teacher-facing rationales: warm, plainspoken, ≤2 short sentences, no jargon, no buzzwords.',
].join('\n');

function buildPickerPrompt(
  input: CatalogPickInput,
  candidates: Candidate[],
  retry: boolean,
): string {
  const context = {
    decision: input.decision,
    phase: input.phase,
    plan: input.plan
      ? {
          subject: (input.plan as { subject?: unknown }).subject ?? null,
          gradeLevel: (input.plan as { gradeLevel?: unknown }).gradeLevel ?? null,
          duration: (input.plan as { duration?: unknown }).duration ?? null,
          title: (input.plan as { title?: unknown }).title ?? null,
          objectives: (input.plan as { objectives?: unknown }).objectives ?? null,
          instructionalModel:
            (input.plan as { instructionalModel?: unknown }).instructionalModel ?? null,
        }
      : null,
    learnerProfile: input.learnerProfile
      ? {
          hasIEP: input.learnerProfile.hasIEP ?? false,
          has504: input.learnerProfile.has504 ?? false,
          multilingualLevel: input.learnerProfile.multilingualLevel ?? null,
          homeLanguages: input.learnerProfile.homeLanguages ?? [],
          needsTags: input.learnerProfile.needsTags ?? [],
        }
      : null,
    teacherInstruction: input.instruction || null,
    candidates: candidates.map((c) => c.summary),
  };

  const lines = [
    DECISION_PROMPTS[input.decision],
    '',
    'INPUT (JSON):',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
    '',
    'RULES:',
    '- `chosenId` MUST be one of the `id` values from the candidates list.',
    '- `rationale` is teacher-facing: warm, jargon-free, ≤2 sentences.',
    '- `confidence` reflects how well the top candidate fits the context.',
    '- `runnerUpId` may be null if there is no meaningful second choice.',
  ];

  if (retry) {
    lines.push(
      '',
      'IMPORTANT: Your previous response referenced an id that was not in the candidates list. Pick STRICTLY from the ids shown above.',
    );
  }

  return lines.join('\n');
}

/* ----------------------------------------------------------------------------
 * Main entry — picks one candidate via the picker LLM.
 * ---------------------------------------------------------------------------*/

export async function pickCatalog(input: CatalogPickInput): Promise<CatalogPickResult> {
  const startedAt = Date.now();
  const modelId = getModelId('picker');
  const settings = TASK_SETTINGS.picker;
  const candidates = buildCandidates(input);

  if (candidates.length === 0) {
    return {
      decision: input.decision,
      choice: null,
      rationale: 'No catalog candidates matched the current context.',
      confidence: 'low',
      runnerUp: null,
      candidates: [],
      meta: { provider: 'ai-gateway', model: modelId, modelInvoked: false, latencyMs: Date.now() - startedAt },
    };
  }

  if (candidates.length === 1) {
    return {
      decision: input.decision,
      choice: candidates[0].record,
      rationale: 'Only one viable candidate in the catalog for this context.',
      confidence: 'medium',
      runnerUp: null,
      candidates: candidates.map((c) => c.record),
      meta: { provider: 'ai-gateway', model: modelId, modelInvoked: false, latencyMs: Date.now() - startedAt },
    };
  }

  const ids = new Set(candidates.map((c) => c.id));
  let picked: PickerOutput | null = null;
  let modelError: string | undefined;

  for (const attempt of [0, 1] as const) {
    try {
      const { object } = await generateObject({
        model: getModel('picker'),
        schema: PickerOutputSchema,
        system: PICKER_SYSTEM_PROMPT,
        prompt: buildPickerPrompt(input, candidates, attempt > 0),
        temperature: settings.temperature,
        ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'penny.picker',
          metadata: {
            decision: input.decision,
            attempt,
            candidateCount: candidates.length,
          },
        },
      });

      if (ids.has(object.chosenId)) {
        picked = object;
        break;
      }
      console.warn(`[pickCatalog] attempt ${attempt} returned out-of-set id "${object.chosenId}"; retrying.`);
    } catch (err) {
      modelError = err instanceof Error ? err.message : String(err);
      console.error(`[pickCatalog] generateObject failed (attempt ${attempt}):`, err);
    }
  }

  if (!picked) {
    return {
      decision: input.decision,
      choice: candidates[0].record,
      rationale: 'Falling back to the highest-ranked deterministic candidate after the picker model returned invalid output.',
      confidence: 'low',
      runnerUp: candidates[1]?.record ?? null,
      candidates: candidates.map((c) => c.record),
      meta: {
        provider: 'ai-gateway',
        model: modelId,
        modelInvoked: true,
        modelError: modelError ?? 'invalid_id_after_retry',
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  const chosen = candidates.find((c) => c.id === picked!.chosenId);
  const runnerUp =
    picked.runnerUpId && ids.has(picked.runnerUpId)
      ? candidates.find((c) => c.id === picked!.runnerUpId)?.record ?? null
      : null;

  return {
    decision: input.decision,
    choice: chosen?.record ?? null,
    rationale: picked.rationale,
    confidence: picked.confidence,
    runnerUp,
    candidates: candidates.map((c) => c.record),
    meta: {
      provider: 'ai-gateway',
      model: modelId,
      modelInvoked: true,
      latencyMs: Date.now() - startedAt,
    },
  };
}
