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
 *                       → anthropic/claude-sonnet-4.5
 *   - picker            Catalog selection over structured candidates. Needs
 *                       fast, cheap, reliable JSON. → openai/gpt-4.1-mini
 *   - generator         Final lesson-plan synthesis. Long, structured, must
 *                       follow Zod schema. → anthropic/claude-sonnet-4.5
 *   - scorer            EQuIP/UDL judge. Short, structured, cheap.
 *                       → openai/gpt-4.1-mini
 *   - patcher           Section-level JSON Patch regenerate. Cheap + accurate.
 *                       → openai/gpt-4.1-mini
 *   - accommodation     Generates WIDA/UDL artifacts. Quality-critical.
 *                       → anthropic/claude-sonnet-4.5
 *
 * The Vercel AI Gateway resolves these `provider/model-id` strings to whichever
 * underlying API call is fastest/cheapest at request time (built-in failover).
 */

import { gateway, type GatewayModelId } from '@ai-sdk/gateway';
import type { LanguageModel } from 'ai';

export type LLMTask =
  | 'chat'
  | 'picker'
  | 'generator'
  | 'scorer'
  | 'patcher'
  | 'accommodation';

/**
 * Default model assignment. Every task is independently env-overridable via
 * `PENNY_MODEL_<TASK>` (uppercase, e.g. `PENNY_MODEL_CHAT`).
 */
const DEFAULT_MODELS: Record<LLMTask, string> = {
  chat: 'anthropic/claude-sonnet-4.5',
  picker: 'openai/gpt-4.1-mini',
  generator: 'anthropic/claude-sonnet-4.5',
  scorer: 'openai/gpt-4.1-mini',
  patcher: 'openai/gpt-4.1-mini',
  accommodation: 'anthropic/claude-sonnet-4.5',
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
 * Returns an AI-SDK language model bound to the Vercel AI Gateway. Calls made
 * with this model are routed through the gateway, which handles provider keys,
 * failover, and telemetry.
 *
 * Requires `AI_GATEWAY_API_KEY` in dev (or OIDC when deployed on Vercel).
 */
export function getModel(task: LLMTask): LanguageModel {
  const id = getModelId(task) as GatewayModelId;
  return gateway(id);
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
