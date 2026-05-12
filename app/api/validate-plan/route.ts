/**
 * /api/validate-plan
 *
 * Cross-validates a finalized lesson plan against:
 *   1. The Zod structural schema (`validateLessonPlan` with the requested gate).
 *   2. Catalog ID existence (`validateCatalogIds`) — server-only, since the
 *      catalogs are filesystem-loaded.
 *
 * Used by `app/page.tsx#handleFinalize` after streaming completes to decide
 * whether to advance to `complete` or auto-retry with a fix prompt.
 */

import { NextRequest } from 'next/server';

import { validateLessonPlan, formatErrorsForRetry, type ValidationGate } from '@/lib/lessonPlanSchema';
import { validateCatalogIds } from '@/lib/catalog/validateIds';
import type { ValidationError } from '@/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const plan = body.plan ?? {};
    const gate: ValidationGate = (body.gate as ValidationGate) ?? 'finalize';

    const structural = validateLessonPlan(plan, gate);
    const catalogErrors: ValidationError[] = validateCatalogIds(plan);

    const errors = [...structural.errors, ...catalogErrors];
    const ok = !errors.some((e) => e.severity === 'error');
    const retryPrompt = ok ? '' : formatErrorsForRetry(errors);

    return new Response(JSON.stringify({ ok, errors, retryPrompt }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[validate-plan] handler error:', err);
    return new Response(
      JSON.stringify({
        ok: false,
        errors: [
          {
            path: '<root>',
            message: 'Validation endpoint failed; falling back to client-side check',
            severity: 'warning' as const,
          },
        ],
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
