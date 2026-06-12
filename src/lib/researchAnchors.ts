/**
 * Research anchors (pedagogical-grounding bridge, commit 4).
 *
 * The catalog ships 76 curated research citations (`citations.json`) with
 * teacher-readable `claimSummary` strings — but until this module existed,
 * no LLM lane ever saw them. This selector picks the top-5 citations most
 * relevant to the lesson being planned (subject, standard framework, and
 * learner profile) and renders them as a `RESEARCH ANCHORS` system block
 * for the chat and generator lanes.
 *
 * Why this matters pedagogically: when the model can quote "guided notes
 * boost note-taking accuracy for students who struggle" with a real source,
 * the lesson rationale stops being vibes and starts being evidence —
 * exactly the EQuIP "access & supports rationale shown" bar.
 *
 * Server-only (depends on the catalog loader).
 */

import type { LearnerProfile, LessonPlanData } from '../types';

import { getCitations } from './catalog';
import type { CitationRecord } from './catalog/types';

export interface ResearchAnchorContext {
  plan?: Partial<LessonPlanData> | null;
  learnerProfile?: Partial<LearnerProfile> | null;
}

const WEIGHT_SCORE: Record<CitationRecord['weight'], number> = {
  gold: 3,
  silver: 2,
  bronze: 1,
  unknown: 0,
};

function frameworkOf(plan: Partial<LessonPlanData> | null | undefined): string {
  const s = plan?.standard;
  if (!s) return '';
  if (typeof s === 'string') return s;
  return `${s.framework ?? ''} ${s.code ?? ''}`;
}

/**
 * Relevance scoring is keyword-based over `focusArea` + `sourceTitle`.
 * Deliberately simple: the citation bank is small (~76 rows) and curated,
 * so a transparent additive heuristic beats an opaque embedding lookup.
 */
export function selectResearchAnchors(
  ctx: ResearchAnchorContext,
  limit = 5,
): CitationRecord[] {
  const subject = (ctx.plan?.subject ?? '').toLowerCase();
  const framework = frameworkOf(ctx.plan).toLowerCase();
  const lp = ctx.learnerProfile;

  const hasML = lp?.multilingualLevel != null && lp.multilingualLevel <= 4;
  const hasIEP504 = !!(lp?.hasIEP || lp?.has504);
  const needs = (lp?.needsTags ?? []) as string[];
  const hasSEL = needs.some((t) => /anxiety|social_emotional/.test(t));
  const hasEF = needs.some((t) => /organization|executive_function|attention/.test(t));

  const scored = getCitations()
    .filter((c) => c.claimSummary && c.claimSummary.trim().length > 0)
    .map((c) => {
      const hay = `${c.focusArea} ${c.sourceTitle}`.toLowerCase();
      let score = WEIGHT_SCORE[c.weight] ?? 0;

      // Foundational frameworks are always in play.
      if (/udl (framework|guidelines)|high-leverage|all 22 hlp|foundational/.test(hay)) score += 2;

      // Learner-profile matches are worth the most: they're what makes the
      // supports section specific instead of generic.
      if (hasML && /multilingual|ell|english learner|culturally responsive|siop|language/.test(hay)) score += 4;
      if (hasIEP504 && /disabilit|special education|iep|504|inclusive|hlp 15|scaffold/.test(hay)) score += 4;
      if (hasSEL && /sel\b|self-regulat|equity & sel|engagement/.test(hay)) score += 3;
      if (hasEF && /executive function|self-regulat|checkpoint 6/.test(hay)) score += 3;

      // Subject / standard-framework matches.
      if (subject.includes('math') && /math|algebra/.test(hay)) score += 3;
      if (subject.includes('science') && /science/.test(hay)) score += 3;
      if (/ngss/.test(framework) && /science/.test(hay)) score += 2;
      if (subject.includes('sel') && /sel|equity/.test(hay)) score += 3;

      // Assessment anchors: every Penny plan carries an exit slip + rubric,
      // so formative-assessment evidence is broadly useful.
      if (/formative assessment|feedback|success criteria|dok|depth of knowledge/.test(hay)) score += 1;

      return { c, score };
    })
    .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id));

  return scored.slice(0, limit).map((s) => s.c);
}

/**
 * Render the anchors as a system-message block, or null when nothing scored
 * (e.g., empty catalog in a degraded build — graceful fallback, never throw).
 */
export function buildResearchAnchorsMessage(
  ctx: ResearchAnchorContext,
  limit = 5,
): string | null {
  let anchors: CitationRecord[];
  try {
    anchors = selectResearchAnchors(ctx, limit);
  } catch (err) {
    console.warn('[researchAnchors] selection failed:', err);
    return null;
  }
  if (anchors.length === 0) return null;

  const lines = anchors.map((a) => {
    const cite = [a.sourceOrg, a.year].filter(Boolean).join(', ');
    return `- [${a.id}] ${a.sourceTitle}${cite ? ` (${cite})` : ''}: ${a.claimSummary}`;
  });

  return [
    'RESEARCH ANCHORS (the evidence base for this lesson. Ground scaffold and',
    'accommodation rationale in these claims — paraphrase them in plain teacher',
    'language when you explain WHY a move fits this class. When the plan schema',
    'asks for evidenceCitationKeys, use these ids. Do not invent citations.):',
    ...lines,
  ].join('\n');
}
