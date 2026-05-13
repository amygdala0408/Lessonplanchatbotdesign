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

  return result.toTextStreamResponse({
    headers: {
      'x-penny-prompt-version': promptVersion,
      'x-penny-provider': 'ai-gateway',
      'x-penny-model': getModelId('chat'),
      'x-penny-tools': 'pickCatalog',
    },
  });
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
