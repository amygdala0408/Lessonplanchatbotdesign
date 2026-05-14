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
import { suggestSimilarCatalogId } from '@/lib/catalog/closestIds';
import { scoreLessonPlan, toPersistableQualityScore } from '@/lib/qualityScorer';
import { isGatewayConfigured } from '@/lib/llm/router';
import type { ValidationError } from '@/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const plan = body.plan ?? {};
    const gate: ValidationGate = (body.gate as ValidationGate) ?? 'finalize';
    // Default: only run the LLM judge on the finalize gate, and only when
    // the gateway is configured. Callers can opt in/out via `useJudge`.
    const useJudge =
      typeof body.useJudge === 'boolean'
        ? (body.useJudge as boolean)
        : gate === 'finalize' && isGatewayConfigured();

    const structural = validateLessonPlan(plan, gate);
    const catalogErrors: ValidationError[] = validateCatalogIds(plan);

    const errors = [...structural.errors, ...catalogErrors];
    const structuralOk = !errors.some((e) => e.severity === 'error');
    const retryPrompt = structuralOk
      ? ''
      : formatErrorsForRetry(errors, { suggestSimilar: suggestSimilarCatalogId });

    // Run the EQuIP+UDL scorer on every gate. Layer A is always synchronous +
    // free; Layer B (LLM judge) only fires on finalize when configured.
    let qualityScore: ReturnType<typeof toPersistableQualityScore> | null = null;
    let scorecard:
      | Awaited<ReturnType<typeof scoreLessonPlan>>
      | null = null;
    try {
      scorecard = await scoreLessonPlan(plan, { useJudge });
      qualityScore = toPersistableQualityScore(scorecard);
    } catch (scorerErr) {
      console.warn('[validate-plan] scorer failed:', scorerErr);
    }

    // The plan is `ok` only when both structural validation passes AND the
    // scorer's pass threshold is met (avg >= 2.5, no dim at 0). Layer A by
    // itself is enough to enforce this on the structural side.
    const ok = structuralOk && (qualityScore?.passed ?? true);

    return new Response(
      JSON.stringify(
        {
          ok,
          structuralOk,
          errors,
          retryPrompt,
          qualityScore,
          scorecard,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
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
