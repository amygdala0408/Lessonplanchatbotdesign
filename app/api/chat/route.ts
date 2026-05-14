/**
 * /api/chat
 *
 * Penny's main conversational endpoint. Streams plain-text chunks back to the
 * client (the frontend parses the stream as text — NOT OpenAI SSE).
 *
 * Routing strategy (set by env at deploy time):
 *   1. Vercel AI Gateway via Vercel AI SDK (preferred).
 *      Required: AI_GATEWAY_API_KEY (local dev) OR VERCEL_OIDC_TOKEN (deployed).
 *   2. Legacy Poe fetch fallback (used only if gateway not configured AND
 *      POE_API_KEY is set). Kept temporarily to avoid breaking local setups
 *      mid-migration. Will be removed once everyone has gateway access.
 */

import { NextRequest } from 'next/server';
import { streamText, stepCountIs, type ModelMessage } from 'ai';

import { buildMessages, getPromptVersion } from '@/lib/promptInjector';
import { buildCatalogContext } from '@/lib/catalogContext';
import {
  getModel,
  getModelId,
  TASK_SETTINGS,
  isGatewayConfigured,
  shouldUsePoeFallback,
} from '@/lib/llm/router';
import { buildPennyTools } from '@/lib/llm/tools';
import type { LearnerProfile } from '@/types';

export const runtime = 'nodejs'; // promptInjector uses fs

const POE_API_KEY = process.env.POE_API_KEY;
const POE_BOT_NAME = process.env.POE_BOT_NAME || 'Penny_Pedagogy_v1.0';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const conversationHistory = Array.isArray(body.messages) ? body.messages : [];
    const currentPlan = body.currentPlan ?? null;
    const learnerProfile = body.learnerProfile ?? null;
    const conversationPhase = body.conversationPhase ?? null;

    // Resolve catalog candidates server-side so Penny picks from the curated
    // library instead of inventing IDs.
    let catalogCandidatesMessage: string | null = null;
    try {
      const result = buildCatalogContext({
        currentPlan,
        learnerProfile,
        conversationHistory,
        conversationPhase: conversationPhase ?? undefined,
      });
      catalogCandidatesMessage = result.systemMessage;
    } catch (err) {
      console.warn('[chat] catalog context build failed, continuing without it:', err);
    }

    const { messages, promptVersion } = buildMessages({
      conversationHistory,
      currentPlan,
      learnerProfile,
      catalogCandidatesMessage,
    });

    const useGateway = isGatewayConfigured();
    const usePoe = !useGateway && shouldUsePoeFallback();

    console.info('[chat] turn', {
      promptVersion,
      provider: useGateway ? 'ai-gateway' : usePoe ? 'poe' : 'none',
      model: useGateway ? getModelId('chat') : POE_BOT_NAME,
      messageCount: messages.length,
      hasPlan: !!currentPlan,
      hasLearnerProfile: !!learnerProfile,
      hasCatalogCandidates: !!catalogCandidatesMessage,
      conversationPhase,
    });

    if (useGateway) {
      return streamViaGateway({
        messages,
        promptVersion,
        plan: currentPlan,
        learnerProfile,
        conversationHistory,
      });
    }
    if (usePoe) {
      return streamViaPoe({ messages, promptVersion });
    }

    return new Response(
      JSON.stringify({
        error:
          'No LLM provider configured. Set AI_GATEWAY_API_KEY (preferred) or POE_API_KEY in .env.local.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'x-penny-prompt-version': promptVersion,
        },
      },
    );
  } catch (error) {
    console.error('[chat] handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'x-penny-prompt-version': getPromptVersion(),
      },
    });
  }
}

// -----------------------------------------------------------------------------
// Gateway path (preferred): Vercel AI SDK → AI Gateway
// -----------------------------------------------------------------------------

function streamViaGateway({
  messages,
  promptVersion,
  plan,
  learnerProfile,
  conversationHistory,
}: {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  promptVersion: string;
  plan: Record<string, unknown> | null;
  learnerProfile: LearnerProfile | null;
  conversationHistory: { role: string; content: string }[];
}): Response {
  // We extract a single primary system message into the dedicated `system`
  // parameter (best practice — increases prompt injection resilience and
  // works across providers that don't accept multiple system messages).
  // Remaining system messages (plan snapshot, learner profile, catalog
  // candidates) stay inline so all context is preserved.
  const [primarySystem, ...rest] = messages;
  const hasPrimarySystem = primarySystem?.role === 'system';
  const systemPrompt = hasPrimarySystem ? primarySystem.content : undefined;
  const remaining = hasPrimarySystem ? rest : messages;

  // {role, content: string} is a valid ModelMessage shape for all roles we use.
  const modelMessages: ModelMessage[] = remaining.map((m) => ({
    role: m.role,
    content: m.content,
  })) as ModelMessage[];

  const settings = TASK_SETTINGS.chat;

  // Capture the most recent text-decision pick so we can append a
  // `[TEXT_OPTIONS]` block to the streamed response. The client parser
  // extracts the block and writes it to `lessonPlan.textOptions`, which:
  //   1. Surfaces the inline `<TextOptionPicker>` UI.
  //   2. Lets `canFinalize()` validate "exactly one selected" later.
  // Without this, Penny's prose options never reach the store and the
  // Finalize button stays disabled even though the picker model already
  // returned 3 valid student-facing choices.
  let lastTextChoices: unknown[] | null = null;

  // Bind tools to the current turn context. The chat model can call
  // pickCatalog mid-turn; that call routes to the picker model and the
  // structured result is fed back into the chat stream automatically.
  const tools = buildPennyTools({
    plan,
    learnerProfile,
    messages: conversationHistory,
    onPick: (input, meta) => {
      console.info('[chat] tool=pickCatalog', {
        decision: input.decision,
        phase: input.phase,
        model: meta.model,
        latencyMs: meta.latencyMs,
      });
    },
    onPickResult: (input, result) => {
      if (input.decision === 'text' && Array.isArray(result.choices) && result.choices.length > 0) {
        lastTextChoices = result.choices;
      }
    },
  });

  const result = streamText({
    model: getModel('chat'),
    system: systemPrompt,
    messages: modelMessages,
    // We deliberately ship multiple inline system messages (plan snapshot,
    // learner profile, catalog candidates) so all context lives in one place.
    // The default warning treats these as a prompt-injection risk; we opt in
    // because our pipeline controls every system message itself.
    allowSystemInMessages: true,
    temperature: settings.temperature,
    ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
    tools,
    // Allow the chat model up to 4 steps so it can: speak → call tool → speak.
    // stepCountIs(N) lets the model take up to N steps before stopping. For
    // a typical turn that's plenty — usually 1 step (no tool), sometimes 3
    // (speak → call tool → speak with the result).
    stopWhen: stepCountIs(4),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'penny.chat',
      metadata: { promptVersion },
    },
    onError({ error }) {
      console.error('[chat] gateway streamText error:', error);
    },
  });

  // Wrap the model's text stream so we can:
  //   1. Append a hidden `[TEXT_OPTIONS]…[/TEXT_OPTIONS]` machine block once
  //      Penny finishes speaking. The block carries the picker's 3 catalog
  //      `choices[]` so the client can populate `lessonPlan.textOptions`
  //      without a second round-trip.
  //   2. When the picker fired for a text decision, REPLACE the chat model's
  //      hand-written options listing (which routinely freelances past the
  //      picker's actual picks — e.g. swaps in a 3rd resource the picker
  //      didn't choose) with a deterministic server-rendered listing built
  //      from the picker's exact `choices[]`. Without this, prose ↔ JSON
  //      diverge and a teacher who clicks "Option 3" gets a different
  //      resourceId than the bullet they read. We buffer the entire chat
  //      output for text-decision turns and emit the corrected, in-sync
  //      response in one shot at the end. Non-text turns stream live as
  //      before.
  // `stripHiddenBlocks()` keeps the JSON block out of the visible bubble.
  const textStream = result.textStream;
  const encoder = new TextEncoder();

  const augmentedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let buffered = '';
        for await (const chunk of textStream) {
          if (!chunk) continue;
          if (lastTextChoices) {
            // Picker has already fired for a text decision. Buffer the rest
            // of the model's prose so we can rewrite the options listing
            // before flushing.
            buffered += chunk;
          } else {
            // Optimistic fast-path: stream live until/unless the picker
            // fires. If `lastTextChoices` becomes set later in this turn,
            // any subsequent chunks will be buffered (above) and the
            // already-streamed prefix becomes the un-rewritable header —
            // which is fine because the picker normally fires BEFORE the
            // model writes its options listing (steps: speak → tool →
            // speak).
            controller.enqueue(encoder.encode(chunk));
          }
        }

        if (lastTextChoices && lastTextChoices.length > 0) {
          const rewritten = rewriteTextOptionsProse(buffered, lastTextChoices);
          controller.enqueue(encoder.encode(rewritten));
          const block = serializeTextOptionsBlock(lastTextChoices);
          if (block) controller.enqueue(encoder.encode(block));
        } else if (buffered.length > 0) {
          // Picker never fired for text but we accumulated buffered chunks
          // (shouldn't happen given the guard above, but flush defensively).
          controller.enqueue(encoder.encode(buffered));
        }
        controller.close();
      } catch (err) {
        console.error('[chat] augmented stream error:', err);
        controller.error(err);
      }
    },
  });

  return new Response(augmentedStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'x-penny-prompt-version': promptVersion,
      'x-penny-provider': 'ai-gateway',
      'x-penny-model': getModelId('chat'),
      'x-penny-tools': 'pickCatalog',
    },
  });
}

/**
 * Rewrite a chat-model text-selection turn so the prose options listing
 * matches the picker's actual `choices[]`. The chat model regularly
 * paraphrases or swaps out catalog entries the picker chose (because the
 * model has its own opinions about subject relevance). When that happens
 * the user sees one set of bullets but the underlying `[TEXT_OPTIONS]`
 * JSON — and the resourceIds the Finalize step actually uses — carry a
 * different set. Teachers click "Option 3" and get the wrong reading.
 *
 * Strategy: take the buffered chat prose, locate the start of the options
 * block (the first `📚 **Option` bullet, or the lead-in "Here are 3 text
 * options" / "text options:" line), drop everything from there on, and
 * append a server-rendered listing built verbatim from `choices[]`. We
 * keep the model's intro line so Penny's voice still leads the turn.
 *
 * The closing trailer ("Which text would you like to build around?") is
 * preserved if present, otherwise a default one is added so the picker UI
 * has clear conversational context.
 */
function rewriteTextOptionsProse(buffered: string, rawChoices: unknown[]): string {
  const options = rawChoices
    .map((c) => normalizeTextChoice(c))
    .filter((c): c is Record<string, unknown> => c !== null);
  if (options.length === 0) return buffered;

  // Find the first sign of an options listing. We try multiple anchors
  // because the chat model isn't consistent about its lead-in line.
  const anchors = [
    /\n?\s*Here\s+are\s+\d+\s+text\s+options[^\n]*\n?/i,
    /\n?\s*\d+\s+text\s+options[^\n]*\n?/i,
    /\n?\s*Below\s+are\s+\d+\s+text\s+options[^\n]*\n?/i,
    /\n?\s*Options:\s*\n/i,
    /\n?\s*[-*]{2,}\s*\n/, // horizontal rule the model often inserts before bullets
    /\n?\s*\uD83D\uDCDA\s*\*\*Option\s*\d+/i, // 📚 **Option N
  ];

  let cutIndex = -1;
  for (const re of anchors) {
    const m = buffered.match(re);
    if (m && typeof m.index === 'number') {
      cutIndex = cutIndex === -1 ? m.index : Math.min(cutIndex, m.index);
    }
  }

  // Look for an explicit closing question to preserve Penny's voice. If
  // present, capture the surrounding sentence so we can re-append after
  // our deterministic listing.
  const trailerMatch = buffered.match(/\n+\s*(Which[^\n?]*\?[^\n]*)\s*$/i);
  const trailer = trailerMatch ? trailerMatch[1].trim() : 'Which text would you like to build around?';

  const intro = (cutIndex === -1 ? buffered : buffered.slice(0, cutIndex)).replace(/\s+$/, '');
  const renderedOptions = renderOptionsListing(options);

  return `${intro}\n\nHere are ${options.length} text options:\n\n${renderedOptions}\n\n${trailer}`;
}

function renderOptionsListing(options: Record<string, unknown>[]): string {
  return options
    .map((o, i) => {
      const num = i + 1;
      const tag = num === 1 ? ' *(Recommended)*' : '';
      const title = String(o.title ?? '').trim();
      const source = String(o.source ?? '').trim();
      const url = String(o.url ?? '').trim();
      const lexile = String(o.lexile ?? '').trim();
      const features = renderFeatures(o);
      const bestFor = renderBestFor(o);

      const lines: string[] = [];
      lines.push(`📚 **Option ${num}: ${title || 'Untitled'}**${tag}`);
      if (source) lines.push(`- Source: ${source}`);
      if (lexile) lines.push(`- Lexile: ${lexile}`);
      if (features) lines.push(`- Features: ${features}`);
      if (bestFor) lines.push(`- Best for: ${bestFor}`);
      if (url) lines.push(`- 🔗 [${url}](${url})`);
      return lines.join('\n');
    })
    .join('\n\n');
}

function renderFeatures(o: Record<string, unknown>): string {
  const acc =
    typeof o.accessibility === 'object' && o.accessibility !== null
      ? (o.accessibility as Record<string, unknown>)
      : {};
  const parts: string[] = [];
  if (acc.audio === true) parts.push('audio');
  if (acc.captions === true) parts.push('captions');
  if (acc.transcript === true) parts.push('transcript');
  if (acc.keyboardNav === true) parts.push('keyboard');
  if (acc.accountRequired === true) parts.push('account required');
  if (acc.accountRequired === false) parts.push('no account');
  return parts.join(' · ');
}

function renderBestFor(o: Record<string, unknown>): string {
  const tags = Array.isArray(o.representationTags)
    ? (o.representationTags as unknown[])
        .filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  if (tags.length === 0) return '';
  return tags.slice(0, 3).join(', ');
}

/**
 * Map the picker's `choices[]` (raw catalog text records) into the shape
 * `extractTextOptions()` expects on the client. The append happens AFTER
 * the model finishes speaking, so we don't risk Penny mis-interpreting the
 * block mid-turn.
 */
function serializeTextOptionsBlock(rawChoices: unknown[]): string | null {
  const options = rawChoices
    .map((c) => normalizeTextChoice(c))
    .filter((c): c is Record<string, unknown> => c !== null);
  if (options.length === 0) return null;
  return `\n\n[TEXT_OPTIONS]\n${JSON.stringify({ options })}\n[/TEXT_OPTIONS]`;
}

function normalizeTextChoice(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title : '';
  if (!title) return null;

  // Catalog rows may carry either a flat `accessibility` object or
  // sibling boolean fields (`captions`, `transcript`, `audio`, etc.).
  // Coalesce both shapes so the client gets a single uniform record.
  const flatAccessibility =
    typeof r.accessibility === 'object' && r.accessibility !== null
      ? (r.accessibility as Record<string, unknown>)
      : {};
  const accessibility = {
    audio:
      typeof flatAccessibility.audio === 'boolean'
        ? flatAccessibility.audio
        : typeof r.audio === 'boolean'
          ? r.audio
          : undefined,
    captions:
      typeof flatAccessibility.captions === 'boolean'
        ? flatAccessibility.captions
        : typeof r.captions === 'boolean'
          ? r.captions
          : undefined,
    transcript:
      typeof flatAccessibility.transcript === 'boolean'
        ? flatAccessibility.transcript
        : typeof r.transcript === 'boolean'
          ? r.transcript
          : undefined,
    keyboardNav:
      typeof flatAccessibility.keyboardNav === 'boolean'
        ? flatAccessibility.keyboardNav
        : undefined,
    accountRequired:
      typeof flatAccessibility.accountRequired === 'boolean'
        ? flatAccessibility.accountRequired
        : typeof r.account_required === 'boolean'
          ? r.account_required
          : undefined,
  };

  return {
    resourceId: typeof r.id === 'string' ? r.id : undefined,
    title,
    source: typeof r.source === 'string' ? r.source : '',
    url: typeof r.url === 'string' ? r.url : '',
    lexile: typeof r.lexile === 'string' ? r.lexile : '',
    rationale:
      typeof r.rationale === 'string'
        ? r.rationale
        : typeof r.summary === 'string'
          ? r.summary
          : '',
    representationTags: Array.isArray(r.representation_tags)
      ? r.representation_tags.filter((t): t is string => typeof t === 'string')
      : Array.isArray(r.representationTags)
        ? r.representationTags.filter((t): t is string => typeof t === 'string')
        : undefined,
    accessibility: Object.values(accessibility).some((v) => v !== undefined)
      ? accessibility
      : undefined,
  };
}

// -----------------------------------------------------------------------------
// Legacy Poe fallback. Kept verbatim from pre-migration code so behavior is
// identical when AI_GATEWAY_API_KEY is unavailable.
// -----------------------------------------------------------------------------

async function streamViaPoe({
  messages,
  promptVersion,
}: {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  promptVersion: string;
}): Promise<Response> {
  const response = await fetch('https://api.poe.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${POE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: POE_BOT_NAME,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[chat] Poe API error:', response.status, errorText);
    return new Response(
      JSON.stringify({ error: `Failed to get response from Poe: ${response.status}` }),
      {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'x-penny-prompt-version': promptVersion,
          'x-penny-provider': 'poe',
        },
      },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      try {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) controller.enqueue(encoder.encode(content));
              } catch {
                // Skip non-JSON heartbeats
              }
            }
          }
        }
      } catch (error) {
        console.error('[chat] Stream error:', error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'x-penny-prompt-version': promptVersion,
      'x-penny-provider': 'poe',
      'x-penny-model': POE_BOT_NAME,
    },
  });
}
