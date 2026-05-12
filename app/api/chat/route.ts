import { NextRequest } from 'next/server';
import { buildMessages, getPromptVersion } from '@/lib/promptInjector';
import { buildCatalogContext } from '@/lib/catalogContext';

const POE_API_KEY = process.env.POE_API_KEY;
// Default Poe bot. Once Penny's instructional contract lives in the repo we
// can point this at a base model (e.g. 'Claude-Sonnet-4.5') and the repo
// becomes the source of truth. Until then either works; the system prompt
// from the repo is always injected in addition to whatever the bot has.
const POE_BOT_NAME = process.env.POE_BOT_NAME || 'Penny_Pedagogy_v1.0';

export const runtime = 'nodejs'; // We use the Node fs API in promptInjector.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const conversationHistory = Array.isArray(body.messages) ? body.messages : [];
    const currentPlan = body.currentPlan ?? null;
    const learnerProfile = body.learnerProfile ?? null;
    const conversationPhase = body.conversationPhase ?? null;

    if (!POE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'POE_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Resolve catalog candidates server-side so Penny picks from the curated
    // library instead of inventing IDs. Falls back to no-op when the request
    // lacks enough context to score candidates (cold start / vague prompt).
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
      // Catalog should never block a turn; surface a warning and continue.
      console.warn('[chat] catalog context build failed, continuing without it:', err);
    }

    const { messages, promptVersion } = buildMessages({
      conversationHistory,
      currentPlan,
      learnerProfile,
      catalogCandidatesMessage,
    });

    // Light-touch logging so we can correlate runtime behavior with prompt edits.
    console.info('[chat] turn', {
      promptVersion,
      bot: POE_BOT_NAME,
      messageCount: messages.length,
      hasPlan: !!currentPlan,
      hasLearnerProfile: !!learnerProfile,
      hasCatalogCandidates: !!catalogCandidatesMessage,
      conversationPhase,
    });

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
                  if (content) {
                    controller.enqueue(encoder.encode(content));
                  }
                } catch {
                  // Skip non-JSON lines (heartbeats, etc.)
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
      },
    });
  } catch (error) {
    console.error('[chat] handler error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'x-penny-prompt-version': getPromptVersion(),
        },
      },
    );
  }
}
