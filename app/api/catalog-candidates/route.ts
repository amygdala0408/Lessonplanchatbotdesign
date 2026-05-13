/**
 * /api/catalog-candidates
 *
 * Returns selector output (instructional models, texts, openers, exit slips,
 * standards, accommodations) for the *client* UI components — model chooser,
 * text picker, scaffolds preview, etc.
 *
 * Server-only catalog access; the client never imports the catalog directly.
 */

import { NextRequest } from 'next/server';

import {
  selectExitSlips,
  selectInstructionalModelCandidates,
  selectMisconceptions,
  selectOpeners,
  selectStandards,
  selectTexts,
} from '@/lib/catalog/selectors';
import { resolveAccommodations, groupAccommodationsByPhase } from '@/lib/accommodations';
import { buildSelectionContext } from '@/lib/catalogContext';
import type { LearnerProfile } from '@/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ctx = buildSelectionContext({
      currentPlan: body.plan ?? null,
      learnerProfile: body.learnerProfile ?? null,
      conversationHistory: body.messages ?? [],
    });

    const profile = body.learnerProfile as LearnerProfile | undefined;
    const accommodations =
      profile && (profile.hasIEP || profile.has504 || (profile.multilingualLevel ?? 0) <= 4)
        ? groupAccommodationsByPhase(resolveAccommodations(profile, {}))
        : null;

    return new Response(
      JSON.stringify({
        instructionalModels: selectInstructionalModelCandidates(ctx, 3).map((m) => ({
          model: m.model,
          rationale: m.rationale,
          phaseCount: m.phases.length,
        })),
        texts: selectTexts(ctx, 6).map((t) => ({
          id: t.id,
          title: t.title,
          source: t.source,
          url: t.url,
          license: t.license,
          licenseClass: t.licenseClass,
          audience: t.audience,
          format: t.format,
          captions: t.captions,
          transcript: t.transcript,
          audio: t.audio,
          keyboardNav: t.keyboardNav,
          account: t.account,
          score: t.score,
        })),
        openers: selectOpeners(ctx, 3).map((o) => ({
          id: o.id,
          subject: o.subject,
          openerType: o.openerType,
          dokFloor: o.dokFloor,
          hookText: o.hookText,
        })),
        exitSlips: selectExitSlips(ctx, 3).map((e) => ({
          id: e.id,
          subject: e.subject,
          dokFloor: e.dokFloor,
          prompt: e.prompt,
        })),
        misconceptions: selectMisconceptions(ctx, 3).map((m) => ({
          id: m.id,
          misconception: m.misconception,
          probe: m.probe,
        })),
        standards: selectStandards(ctx, 5).map((s) => ({
          id: s.id,
          strand: s.strand,
          description: s.description,
        })),
        accommodations,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[catalog-candidates] handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
