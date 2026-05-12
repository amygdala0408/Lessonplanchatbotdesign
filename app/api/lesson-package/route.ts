/**
 * /api/lesson-package
 *
 * Resolves a finalized plan's catalog references into full records (resources,
 * scaffolds-by-phase, accommodations-by-phase, misconceptions, citations,
 * glossary, opener, exit slip).
 *
 * The client persists the package on the lesson plan so the print package can
 * render real, curated content instead of placeholders.
 */

import { NextRequest } from 'next/server';

import { resolveLessonPackage } from '@/lib/lessonPackage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pkg = resolveLessonPackage(body.plan ?? {}, body.learnerProfile ?? null);

    return new Response(JSON.stringify(pkg), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[lesson-package] handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
