/**
 * /api/catalog-pick
 *
 * Thin wrapper over `pickCatalog()` (src/lib/llm/pickCatalog.ts). The real
 * logic lives there so the chat model can also call it as a tool — see
 * src/lib/llm/tools.ts and the `tools` field in app/api/chat/route.ts.
 */

import { NextRequest } from 'next/server';
import { pickCatalog, type CatalogPickInput } from '@/lib/llm/pickCatalog';
import { isGatewayConfigured, getModelId } from '@/lib/llm/router';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isGatewayConfigured()) {
    return new Response(
      JSON.stringify({
        error:
          '/api/catalog-pick requires the Vercel AI Gateway. Set AI_GATEWAY_API_KEY in .env.local.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: CatalogPickInput;
  try {
    body = (await request.json()) as CatalogPickInput;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body?.decision && !body?.scope) {
    return new Response(JSON.stringify({ error: 'Missing `decision` field.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await pickCatalog(body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-penny-provider': 'ai-gateway',
        'x-penny-model': getModelId('picker'),
        'x-penny-task': 'picker',
      },
    });
  } catch (err) {
    console.error('[catalog-pick] handler error:', err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
