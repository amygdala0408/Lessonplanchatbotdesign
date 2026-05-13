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
  inferResourceFormat,
  selectExitSlips,
  selectInstructionalModelCandidates,
  selectMisconceptions,
  selectOpeners,
  selectScaffoldsForPhase,
  selectStandards,
  selectTexts,
} from '../catalog/selectors';
import { isStudentFacingResource } from '../catalog/audience';
import { getModel, getModelId, TASK_SETTINGS, isGatewayConfigured } from './router';
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
  decision?: CatalogDecisionType;
  /** Backward-compatible alias used by older selector tests/docs. */
  scope?: CatalogDecisionType;
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

export const TextPickerOutputSchema = z.object({
  chosenIds: z
    .array(z.string().min(1))
    .length(3, 'Choose exactly three student-facing text IDs.'),
  rationale: z
    .string()
    .min(8, 'Give a 1-2 sentence teacher-facing reason.')
    .max(360, 'Keep it under ~360 characters.'),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type TextPickerOutput = z.infer<typeof TextPickerOutputSchema>;

export interface CatalogPickResult {
  decision: CatalogDecisionType;
  choice: unknown | null;
  choices?: unknown[];
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

function resolveDecision(input: CatalogPickInput): CatalogDecisionType {
  const decision = input.decision ?? input.scope;
  if (!decision) throw new Error('Catalog pick requires `decision` (or legacy `scope`).');
  return decision;
}

/* ----------------------------------------------------------------------------
 * Candidate shaping
 * ---------------------------------------------------------------------------*/

export function buildCandidates(input: CatalogPickInput): Candidate[] {
  const decision = resolveDecision(input);
  const ctx = buildSelectionContext({
    currentPlan: input.plan ?? null,
    learnerProfile: input.learnerProfile ?? null,
    conversationHistory: input.messages ?? [],
  });

  switch (decision) {
    case 'instructional_model': {
      const cands = selectInstructionalModelCandidates(ctx, input.limit ?? 5);
      return cands.map((c) => ({
        id: c.model,
        summary: { id: c.model, rationale: c.rationale, phaseCount: c.phases.length },
        record: c,
      }));
    }
    case 'text': {
      const cands = selectTexts(ctx, input.limit ?? 9);
      return cands.map((c) => ({
        id: c.id,
        summary: {
          id: c.id,
          title: c.title,
          source: c.source,
          license: c.license,
          captions: c.captions,
          transcript: c.transcript,
          audience: c.audience,
          format: c.format,
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
      const _never: never = decision;
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
  text: 'Choose exactly three distinct student-facing texts for this lesson. Never choose professional-development, teacher-reference, framework, standards, or practice-guide rows as student reading. Prioritize accessibility, license openness, grade-level fit, topical relevance, and diversity across format/source/representation.',
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
  const decision = resolveDecision(input);
  const context = {
    decision,
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
    DECISION_PROMPTS[decision],
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
  const decision = resolveDecision(input);
  const modelId = getModelId('picker');
  const settings = TASK_SETTINGS.picker;
  const candidates = buildCandidates(input);

  if (candidates.length === 0) {
    return {
      decision,
      choice: null,
      rationale: 'No catalog candidates matched the current context.',
      confidence: 'low',
      runnerUp: null,
      candidates: [],
      meta: { provider: 'ai-gateway', model: modelId, modelInvoked: false, latencyMs: Date.now() - startedAt },
    };
  }

  if (decision === 'text') {
    return pickTextCatalog(input, candidates, startedAt, modelId, settings);
  }

  if (candidates.length === 1) {
    return {
      decision,
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
            decision,
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
      decision,
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
    decision,
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

async function pickTextCatalog(
  input: CatalogPickInput,
  candidates: Candidate[],
  startedAt: number,
  modelId: string,
  settings: typeof TASK_SETTINGS.picker,
): Promise<CatalogPickResult> {
  const decision = resolveDecision(input);
  const studentCandidates = candidates.filter((candidate) =>
    isStudentFacingResource(candidate.record as Parameters<typeof isStudentFacingResource>[0]),
  );
  const candidatePool = studentCandidates.length > 0 ? studentCandidates : [];
  const fallback = chooseDistinctTextCandidates(candidatePool, 3);

  if (fallback.length === 0) {
    return {
      decision,
      choice: null,
      choices: [],
      rationale: 'No student-facing text candidates matched the current context.',
      confidence: 'low',
      runnerUp: null,
      candidates: [],
      meta: { provider: 'ai-gateway', model: modelId, modelInvoked: false, latencyMs: Date.now() - startedAt },
    };
  }

  if (!isGatewayConfigured() || candidatePool.length < 3) {
    return buildTextResult({
      picked: fallback,
      candidates: candidatePool,
      rationale:
        candidatePool.length < 3
          ? 'The catalog returned fewer than three student-facing matches, so Penny is surfacing every viable option.'
          : 'Using the top three distinct student-facing catalog matches while the picker model is unavailable.',
      confidence: candidatePool.length >= 3 ? 'medium' : 'low',
      modelInvoked: false,
      startedAt,
      modelId,
    });
  }

  const ids = new Set(candidatePool.map((c) => c.id));
  let picked: TextPickerOutput | null = null;
  let modelError: string | undefined;

  for (const attempt of [0, 1] as const) {
    try {
      const { object } = await generateObject({
        model: getModel('picker'),
        schema: TextPickerOutputSchema,
        system: PICKER_SYSTEM_PROMPT,
        prompt: buildTextPickerPrompt(input, candidatePool, attempt > 0),
        temperature: settings.temperature,
        ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'penny.picker.texts',
          metadata: {
            decision,
            attempt,
            candidateCount: candidatePool.length,
          },
        },
      });

      const uniqueIds = Array.from(new Set(object.chosenIds));
      if (uniqueIds.length === 3 && uniqueIds.every((id) => ids.has(id))) {
        picked = { ...object, chosenIds: uniqueIds };
        break;
      }
      console.warn(`[pickCatalog:text] attempt ${attempt} returned invalid ids "${object.chosenIds.join(', ')}"; retrying.`);
    } catch (err) {
      modelError = err instanceof Error ? err.message : String(err);
      console.error(`[pickCatalog:text] generateObject failed (attempt ${attempt}):`, err);
    }
  }

  if (!picked) {
    return buildTextResult({
      picked: fallback,
      candidates: candidatePool,
      rationale: 'Falling back to the top three distinct student-facing catalog matches after the picker model returned invalid output.',
      confidence: 'low',
      modelInvoked: true,
      modelError: modelError ?? 'invalid_text_ids_after_retry',
      startedAt,
      modelId,
    });
  }

  const byId = new Map(candidatePool.map((c) => [c.id, c]));
  const selected = picked.chosenIds.map((id) => byId.get(id)).filter((c): c is Candidate => !!c);
  return buildTextResult({
    picked: selected,
    candidates: candidatePool,
    rationale: picked.rationale,
    confidence: picked.confidence,
    modelInvoked: true,
    startedAt,
    modelId,
  });
}

function buildTextPickerPrompt(
  input: CatalogPickInput,
  candidates: Candidate[],
  retry: boolean,
): string {
  const decision = resolveDecision(input);
  const context = {
    decision,
    plan: input.plan
      ? {
          subject: (input.plan as { subject?: unknown }).subject ?? null,
          gradeLevel: (input.plan as { gradeLevel?: unknown }).gradeLevel ?? null,
          duration: (input.plan as { duration?: unknown }).duration ?? null,
          title: (input.plan as { title?: unknown }).title ?? null,
          objectives: (input.plan as { objectives?: unknown }).objectives ?? null,
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
    DECISION_PROMPTS.text,
    '',
    'INPUT (JSON):',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
    '',
    'RULES:',
    '- `chosenIds` MUST contain exactly three unique IDs from the candidates list.',
    '- Every chosen ID must have audience="student".',
    '- The three picks should differ on at least one useful classroom axis: source, format, Lexile/complexity, accessibility, or representation.',
    '- Never choose teacher-PD/reference rows such as Hattie, Marzano, Wiggins/McTighe, EQuIP, practice guides, frameworks, or standards documents as student reading.',
    '- `rationale` is teacher-facing: warm, jargon-free, ≤2 sentences.',
    '- `confidence` reflects how well the set fits the context.',
  ];

  if (retry) {
    lines.push(
      '',
      'IMPORTANT: Your previous response did not return exactly three unique in-set student-facing IDs. Pick STRICTLY from the IDs shown above.',
    );
  }

  return lines.join('\n');
}

function buildTextResult({
  picked,
  candidates,
  rationale,
  confidence,
  modelInvoked,
  modelError,
  startedAt,
  modelId,
}: {
  picked: Candidate[];
  candidates: Candidate[];
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  modelInvoked: boolean;
  modelError?: string;
  startedAt: number;
  modelId: string;
}): CatalogPickResult {
  return {
    decision: 'text',
    choice: picked[0]?.record ?? null,
    choices: picked.map((c) => c.record),
    rationale,
    confidence,
    runnerUp: picked[1]?.record ?? null,
    candidates: candidates.map((c) => c.record),
    meta: {
      provider: 'ai-gateway',
      model: modelId,
      modelInvoked,
      ...(modelError ? { modelError } : {}),
      latencyMs: Date.now() - startedAt,
    },
  };
}

function chooseDistinctTextCandidates(candidates: Candidate[], limit: number): Candidate[] {
  const picked: Candidate[] = [];
  const pickedIds = new Set<string>();
  const pickedSources = new Set<string>();
  const pickedFormats = new Set<string>();

  const read = (candidate: Candidate) => candidate.record as {
    id?: string;
    title?: string;
    source?: string;
    url?: string;
    accessibility?: string;
    format?: string;
  };

  const take = (predicate: (record: ReturnType<typeof read>) => boolean) => {
    for (const candidate of candidates) {
      if (picked.length >= limit) return;
      if (pickedIds.has(candidate.id)) continue;
      const record = read(candidate);
      if (!predicate(record)) continue;
      picked.push(candidate);
      pickedIds.add(candidate.id);
      pickedSources.add((record.source ?? '').toLowerCase());
      pickedFormats.add(record.format ?? inferResourceFormat(record));
    }
  };

  take((r) => !pickedSources.has((r.source ?? '').toLowerCase()) && !pickedFormats.has(r.format ?? inferResourceFormat(r)));
  take((r) => !pickedSources.has((r.source ?? '').toLowerCase()));
  take(() => true);

  return picked.slice(0, limit);
}
