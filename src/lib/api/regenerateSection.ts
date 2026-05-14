/**
 * Client helper for /api/regenerate-section.
 *
 * Used by the hover affordance on each lesson section. The endpoint returns
 * a single section's fresh value; the caller merges it back into the lesson
 * plan and (optionally) triggers a re-score.
 */

import type { LessonPlanData } from '../../types';

export type RegenerableSectionId =
  | 'objectives'
  | 'successCriteria'
  | 'procedure'
  | 'exitSlip'
  | 'rubric'
  | 'equityNotes'
  | 'supports'
  | 'assessment'
  | 'materials';

export interface RegenerateSectionResult<T = unknown> {
  ok: boolean;
  section: RegenerableSectionId;
  value?: T;
  error?: string;
  meta?: { model?: string; latencyMs?: number };
}

export async function regenerateSection<T = unknown>(args: {
  plan: Partial<LessonPlanData>;
  section: RegenerableSectionId;
  teacherNote?: string;
  scorerRationale?: string;
  signal?: AbortSignal;
}): Promise<RegenerateSectionResult<T>> {
  try {
    const resp = await fetch('/api/regenerate-section', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: args.plan,
        section: args.section,
        teacherNote: args.teacherNote,
        scorerRationale: args.scorerRationale,
      }),
      signal: args.signal,
    });
    const data = (await resp.json().catch(() => null)) as RegenerateSectionResult<T> | null;
    if (!resp.ok || !data?.ok) {
      return {
        ok: false,
        section: args.section,
        error: data?.error ?? `Regenerate failed (HTTP ${resp.status}).`,
        meta: data?.meta,
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      section: args.section,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
