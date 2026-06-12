import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Two files compose Penny's system context, in order:
//   1. PENNY_SYSTEM_PROMPT.md   — pedagogy, voice, worked examples. The
//      teacher-facing identity.
//   2. PENNY_OPERATOR_NOTES.md  — mechanics: tool contracts, JSON tags,
//      schema, machine-readable blocks. Never visible to the teacher.
//
// They're loaded once at module load (cold start) and reused for every
// request. The version stamp is derived from the SHA-256 of BOTH files
// concatenated, so editing either bumps the version automatically.

const PROMPT_FILENAME = 'PENNY_SYSTEM_PROMPT.md';
const OPERATOR_NOTES_FILENAME = 'PENNY_OPERATOR_NOTES.md';

let cachedPrompt: string | null = null;
let cachedOperatorNotes: string | null = null;
let cachedVersion: string | null = null;

function readPromptFile(filename: string): string {
  const promptPath = path.join(process.cwd(), filename);
  try {
    return fs.readFileSync(promptPath, 'utf-8');
  } catch (err) {
    console.error(`[promptInjector] Failed to read ${filename}:`, err);
    return '';
  }
}

function cleanPromptText(raw: string): string {
  return raw
    .replace(/\*\*Copy this to your Poe bot[^*]*\*\*/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

function loadPrompt(): { prompt: string; operatorNotes: string; version: string } {
  if (cachedPrompt !== null && cachedOperatorNotes !== null && cachedVersion !== null) {
    return {
      prompt: cachedPrompt,
      operatorNotes: cachedOperatorNotes,
      version: cachedVersion,
    };
  }

  const rawPrompt = readPromptFile(PROMPT_FILENAME);
  const rawNotes = readPromptFile(OPERATOR_NOTES_FILENAME);

  const prompt = cleanPromptText(rawPrompt);
  const operatorNotes = cleanPromptText(rawNotes);

  // Version stamps both files so edits to either invalidate runtime caches.
  const hash = crypto
    .createHash('sha256')
    .update(rawPrompt + '\n---\n' + rawNotes)
    .digest('hex')
    .slice(0, 8);
  const version = `2026.05.13-${hash}`;

  cachedPrompt = prompt;
  cachedOperatorNotes = operatorNotes;
  cachedVersion = version;
  return { prompt, operatorNotes, version };
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
  /**
   * Optional pre-rendered RESEARCH ANCHORS block (produced by
   * `buildResearchAnchorsMessage`). Appended after the catalog candidates so
   * the model can ground scaffold/accommodation rationale in real citations.
   */
  researchAnchorsMessage?: string | null;
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
  const { prompt, operatorNotes, version } = loadPrompt();
  const messages: ChatMessage[] = [];

  // 1. Pedagogy prompt — Penny's identity, voice, and worked examples. The
  //    only file the teacher's experience is meant to reflect.
  if (prompt) {
    messages.push({ role: 'system', content: prompt });
  }

  // 2. Operator notes — mechanics (JSON tags, tool contracts, schema). These
  //    must NOT bleed into Penny's prose. Kept as a separate system message
  //    so the model can treat it as a wiring contract, not part of voice.
  if (operatorNotes) {
    messages.push({ role: 'system', content: operatorNotes });
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

  if (args.researchAnchorsMessage) {
    messages.push({ role: 'system', content: args.researchAnchorsMessage });
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
