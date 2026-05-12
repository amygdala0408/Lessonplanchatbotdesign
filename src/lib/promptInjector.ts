import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// The system prompt and version are read once at module load (cold start) and
// reused for every request. The PROMPT_VERSION is derived from the file's
// SHA-256 hash so any edit to PENNY_SYSTEM_PROMPT.md automatically bumps the
// version stamp without us having to remember.

const PROMPT_FILENAME = 'PENNY_SYSTEM_PROMPT.md';

let cachedPrompt: string | null = null;
let cachedVersion: string | null = null;

function loadPrompt(): { prompt: string; version: string } {
  if (cachedPrompt && cachedVersion) {
    return { prompt: cachedPrompt, version: cachedVersion };
  }

  // Resolve from the project root. process.cwd() is the project root in
  // both `next dev` and `next start`.
  const promptPath = path.join(process.cwd(), PROMPT_FILENAME);
  let raw: string;
  try {
    raw = fs.readFileSync(promptPath, 'utf-8');
  } catch (err) {
    console.error(`[promptInjector] Failed to read ${PROMPT_FILENAME}:`, err);
    raw = ''; // Fail open: return empty prompt so Poe bot fallback still works.
  }

  // Strip the "Copy this to your Poe bot" guidance + any HTML comments. We want
  // the model to receive the pedagogical contract, not the operator notes.
  const prompt = raw
    .replace(/\*\*Copy this to your Poe bot[^*]*\*\*/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 8);
  const version = `2026.05.10-${hash}`;

  cachedPrompt = prompt;
  cachedVersion = version;
  return { prompt, version };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BuildMessagesArgs {
  conversationHistory: { role: string; content: string }[];
  currentPlan?: Record<string, unknown> | null;
  learnerProfile?: Record<string, unknown> | null;
  /**
   * Optional pre-rendered catalog candidates block (produced by
   * `buildCatalogContext`). When provided, it's appended as a system message
   * after the prompt and current plan snapshot.
   */
  catalogCandidatesMessage?: string | null;
}

export interface BuildMessagesResult {
  messages: ChatMessage[];
  promptVersion: string;
}

/**
 * Build the message array sent to the model. Always prepends the system prompt
 * and an optional developer message containing the current plan snapshot so
 * Penny edits the live draft instead of re-inventing it.
 */
export function buildMessages(args: BuildMessagesArgs): BuildMessagesResult {
  const { prompt, version } = loadPrompt();
  const messages: ChatMessage[] = [];

  if (prompt) {
    messages.push({ role: 'system', content: prompt });
  }

  // Inject a developer-style message with the current plan snapshot. We use
  // role: 'system' because Poe's OpenAI-compatible API supports system but
  // not the developer role. Models still treat additional system messages
  // as authoritative context.
  if (args.currentPlan && Object.keys(args.currentPlan).length > 0) {
    const planSnapshot = stringifyPlanSnapshot(args.currentPlan);
    if (planSnapshot) {
      messages.push({
        role: 'system',
        content: [
          'CURRENT_LESSON_PLAN_DRAFT (edit this; do not re-invent fields that already exist):',
          '```json',
          planSnapshot,
          '```',
        ].join('\n'),
      });
    }
  }

  if (args.learnerProfile && Object.keys(args.learnerProfile).length > 0) {
    messages.push({
      role: 'system',
      content: [
        'LEARNER_PROFILE (use to drive accommodation choices):',
        '```json',
        JSON.stringify(args.learnerProfile, null, 2),
        '```',
      ].join('\n'),
    });
  }

  if (args.catalogCandidatesMessage) {
    messages.push({ role: 'system', content: args.catalogCandidatesMessage });
  }

  for (const msg of args.conversationHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: String(msg.content) });
    }
  }

  return { messages, promptVersion: version };
}

/**
 * Strip empty/null fields from the lesson plan so we don't send Penny noise.
 * Capped at ~6KB to avoid prompt bloat.
 */
function stringifyPlanSnapshot(plan: Record<string, unknown>): string | null {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(plan)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim().length === 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    cleaned[k] = v;
  }
  if (Object.keys(cleaned).length === 0) return null;
  let stringified = JSON.stringify(cleaned, null, 2);
  if (stringified.length > 6000) {
    stringified = stringified.slice(0, 6000) + '\n... (truncated)';
  }
  return stringified;
}

export function getPromptVersion(): string {
  return loadPrompt().version;
}
