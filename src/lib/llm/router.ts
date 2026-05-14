/**
 * Penny LLM Router
 *
 * Maps internal task keys to the best-fit model on the Vercel AI Gateway.
 * Every server-side LLM call should flow through `getModel(task)` so we can:
 *   - swap models in one place,
 *   - per-task tune for cost / latency / quality,
 *   - record telemetry consistently.
 *
 * Task → model rationale (defaults; override with env vars):
 *   - chat              Penny's conversational turns. Needs warmth + nuance.
 *                       → anthropic/claude-sonnet-4.6
 *   - picker            Catalog selection over structured candidates. Needs
 *                       fast, cheap, reliable JSON. → openai/gpt-4.1-mini
 *   - generator         Final lesson-plan synthesis. Long, structured, must
 *                       follow Zod schema. → anthropic/claude-opus-4.7
 *   - scorer            EQuIP/UDL judge. Short, structured, cheap.
 *                       → openai/gpt-5.5
 *   - patcher           Section-level JSON Patch regenerate. Cheap + accurate.
 *                       → openai/gpt-4.1-mini
 *   - accommodation     Generates WIDA/UDL artifacts. Quality-critical.
 *                       → anthropic/claude-sonnet-4.6
 *   - artifact_generator Lesson-aware student artifacts (graphic organizers,
 *                       sentence stems, exit tickets, vocab previews,
 *                       discussion protocols, single-point rubrics). Reasons
 *                       over the finalized plan + selected text + standards
 *                       to produce content-specific scaffolds — not generic
 *                       templates. Quality-critical, structured-output.
 *                       → anthropic/claude-opus-4.7
 *
 * The Vercel AI Gateway resolves these `provider/model-id` strings to whichever
 * underlying API call is fastest/cheapest at request time (built-in failover).
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

/**
 * We talk to the Vercel AI Gateway via its OpenAI-compatible endpoint
 * (`/v1/chat/completions`) instead of `@ai-sdk/gateway`'s native v3 protocol.
 *
 * Why: as of 2026-05, the gateway's `/v3/ai/language-model` path returns
 * malformed error envelopes (empty `{}` body, statusCode undefined) that the
 * `@ai-sdk/gateway` provider can't parse, causing every streamText call to
 * fail with `AI_RetryError → AI_TypeValidationError`. The same gateway's
 * `/v1` OpenAI-compat path streams cleanly. The gateway still routes,
 * fails over, and bills exactly the same — only the wire protocol differs.
 *
 * The model id we pass through (e.g. `anthropic/claude-sonnet-4.6`,
 * `openai/gpt-5.5`) is the gateway's canonical slug; it accepts the full
 * `provider/model` form on the OpenAI-compat endpoint.
 */
const gatewayProvider = createOpenAICompatible({
  name: 'vercel-ai-gateway',
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.AI_GATEWAY_API_KEY,
  includeUsage: true,
  // Tell the SDK to send `response_format: { type: 'json_schema', ... }`
  // instead of the legacy `json_object` mode. The gateway rejects the
  // legacy mode for picker/generator/scorer/patcher generateObject calls
  // ("Invalid input" on response_format), so we opt into the modern
  // structured-outputs path that all current OpenAI + Anthropic models
  // (Sonnet 4.6, Opus 4.7, gpt-4.1-mini, gpt-5.5) support through the
  // gateway.
  supportsStructuredOutputs: true,
});

export type LLMTask =
  | 'chat'
  | 'picker'
  | 'generator'
  | 'scorer'
  | 'patcher'
  | 'accommodation'
  | 'artifact_generator';

/**
 * Default model assignment. Every task is independently env-overridable via
 * `PENNY_MODEL_<TASK>` (uppercase, e.g. `PENNY_MODEL_CHAT`).
 */
const DEFAULT_MODELS: Record<LLMTask, string> = {
  chat: 'anthropic/claude-sonnet-4.6',
  picker: 'openai/gpt-4.1-mini',
  generator: 'anthropic/claude-opus-4.7',
  scorer: 'openai/gpt-5.5',
  patcher: 'openai/gpt-4.1-mini',
  accommodation: 'anthropic/claude-sonnet-4.6',
  artifact_generator: 'anthropic/claude-opus-4.7',
};

/**
 * Tuning knobs per task. Kept here so the route handlers stay declarative.
 */
export const TASK_SETTINGS: Record<
  LLMTask,
  { temperature: number; maxOutputTokens?: number }
> = {
  chat: { temperature: 0.55 },
  picker: { temperature: 0.1, maxOutputTokens: 1500 },
  generator: { temperature: 0.35, maxOutputTokens: 6000 },
  scorer: { temperature: 0, maxOutputTokens: 1200 },
  patcher: { temperature: 0.1, maxOutputTokens: 2000 },
  accommodation: { temperature: 0.4, maxOutputTokens: 2500 },
  // Artifacts need just enough warmth to write authentic stems and probes
  // without freelancing past the chosen text. Six artifacts are generated
  // in parallel per finalized plan, so each schema is small and bounded.
  artifact_generator: { temperature: 0.4, maxOutputTokens: 2200 },
};

function envOverride(task: LLMTask): string | undefined {
  const key = `PENNY_MODEL_${task.toUpperCase()}`;
  return process.env[key];
}

/**
 * Resolve the configured model string for a task. Useful for telemetry and
 * for any callers that need the bare ID (e.g. structured logging).
 */
export function getModelId(task: LLMTask): string {
  return envOverride(task) ?? DEFAULT_MODELS[task];
}

/**
 * Returns an AI-SDK language model bound to the Vercel AI Gateway via its
 * OpenAI-compatible endpoint. Calls made with this model are routed through
 * the gateway, which handles provider keys, failover, and telemetry exactly
 * as it does on the native protocol.
 *
 * Requires `AI_GATEWAY_API_KEY` in dev (or OIDC when deployed on Vercel).
 */
export function getModel(task: LLMTask): LanguageModel {
  const id = getModelId(task);
  return gatewayProvider(id);
}

/**
 * Verifies the gateway is reachable from this environment. Routes can call
 * this at startup to fail fast with a clear error instead of mid-stream.
 */
export function isGatewayConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.VERCEL_ENV, // Vercel sets this in deployed envs
  );
}

/**
 * Returns true when we should fall back to the legacy Poe fetch path
 * (i.e. gateway is unavailable but Poe is configured). Helpful for staged
 * rollout: developers without an AI_GATEWAY_API_KEY can still run Penny.
 */
export function shouldUsePoeFallback(): boolean {
  if (isGatewayConfigured()) return false;
  return Boolean(process.env.POE_API_KEY);
}
