# Accommodations Artifacts — Audit

**Date:** May 16, 2026
**Question that prompted this:** *"What do the accommodations artifacts look
like for the teacher — bilingual glossary, sentence stems — and how are they
generated specific to the skill being taught and the reading? Lesson plan
evaluators said they didn't have those materials but I had assumed it was
just because we didn't include them with the initial lesson plan we took to
score."*

## TL;DR

**Penny has *two parallel* accommodations-artifact pipelines today, and the
better one is invisible in the print bundle. That's the root cause of the
evaluator gap.**

| Pipeline | What it produces | Where it surfaces | Text-specific? |
|---|---|---|---|
| **A. Opus 4.7 Artifact Generator** (new, May 2026) | Six rich, schema-bound artifacts — graphic organizer, sentence stems, exit ticket, vocabulary preview, discussion protocol, single-point rubric | `<ArtifactsPanel>` in the on-screen lesson drawer only | ✅ Yes — references actual paragraphs, quotes, named characters, learner-specific cognates |
| **B. Heuristic Print Pack** (legacy, predates the artifact lane) | Catalog-resolved scaffolds + bilingual glossary + differentiation map + misconception alerts | The PDF / print output (`LessonPlan.tsx`) | ⚠️ Partially — uses catalog entries matched by verb / objective, not by the chosen text |

When evaluators were handed the lesson plan, they got **Pipeline B**
(heuristic print pack). They never saw **Pipeline A** (the Opus-generated
artifacts) because those don't go to print.

## What evaluators actually saw (Pipeline B)

`src/lib/lessonPackage.ts` resolves a `ResolvedLessonPackage` from the
finalized plan envelope. Its bilingual glossary builder
(`buildLessonPackage` → glossary section):

```ts
// Prefer learner-profile home languages; default to en+es so we *always*
// surface a bilingual reference pair. The print package looks dramatically
// thinner without a glossary, and the catalog has 1000+ curated entries.
const vocab = new Set(inferVocabFromPlan(plan));
const allGlossary = getBilingualGlossary();
let glossary = allGlossary.filter(
  (g) => wantedLangs.has(g.language) && vocab.has(g.term.toLowerCase()),
);

if (glossary.length < 6) {
  const PRIORITY_TERMS = ['analyze', 'argue', 'cite', 'compare', 'contrast',
                          'evaluate', ...];
  // top up with generic ELA verbs so the page isn't empty
}
```

`inferVocabFromPlan` extracts tokens from `plan.materials`, `plan.objectives`,
and a few other plan fields, then matches them to a curated 1000-entry
bilingual glossary CSV. The result is real Spanish translations, but the
*selection* is driven by what's in the plan envelope and falls back to
generic academic verbs — **it does NOT look at the chosen text's vocabulary
or named characters**. For "The Leap," this means evaluators saw a bilingual
glossary with terms like *analyze, evidence, cite, compare* in Spanish — not
*trapeze, blindfold, extreme elements, Avalon, surviving*.

The print pack also includes (all heuristic, not text-specific):

- **Graphic organizer** — chosen by `pickReadingTaskKind(objectives)` from a
  small set of standard templates (CER, evidence grid, comparison, theme
  tracker). Cells are pre-defined.
- **Sentence frames** — pulled from `plan.supports.all` / `plan.supports.el`
  produced by the lesson generator (these *are* text-aware, since they come
  from the generator's view of the whole plan, but they're prose blurbs, not
  schema-bound differentiated stems).
- **Differentiation map** — accommodations grouped by phase from the catalog
  (`groupAccommodationsByPhase`). Real catalog entries, real evidence cites,
  but the *selection* is by catalog ID, not by the chosen text.
- **Exit slip worksheet** — uses `plan.exitSlip` (a single string from the
  generator) embedded in a printable template.

So the legacy print pack IS shipping accommodations, and they are pedagogically
reasonable — they're just generic enough that an evaluator scoring the lesson
for "is the bilingual glossary specific to *this* text" would say no.

## What the new pipeline actually produces (Pipeline A)

Documented in detail in `src/lib/llm/artifactSchemas.ts` and exercised by
`scripts/artifacts-acceptance-prompt.mjs`. Sample output for the May 15
acceptance prompt is saved at `scripts/sample-outputs/artifacts-the-leap.json`.

For "The Leap" + RL.9-10.1 + a 28-student class with 3 WIDA-3 Spanish
ELs + 2 IEPs, the Opus 4.7 lane generated in ~34 seconds:

1. **Vocabulary preview** with text-specific terms:
   - *trapeze* / trapecio (Spanish cognate)
   - *blindfold* / **false cognate flagged** — Spanish *venda* (blindfold)
     vs. *blindar* (to shield with armor)
   - *extreme elements* with the quote *"lives comfortably in extreme
     elements"* from the story
   - *surviving* / sobrevivir, anchored to the line *"the surviving half of
     a blindfold trapeze act"*
   - 8 terms total, each with student-friendly definition + Spanish cognate
     + a quick-check question grounded in a specific paragraph

2. **Sentence stems** with **seven differentiated rows**, including:
   - `el_developing` row: *"In Spanish I would say ___, and in English the
     author uses the word ___ to show ___."*
   - `el_emerging` row: *"I see the word ___ in paragraph ___. It means ___
     (cognate: ___)."*
   - `iep_504` row tied to the CER organizer's labeled boxes
   - All stems reference Anna by name and the specific narrative beats

3. **Graphic organizer** (CER layout) with six text-specific cells —
   each prompt names paragraphs 1-4 of "The Leap," the trapeze imagery, the
   fire rescue, and Anna's traits (*resilient, protective, attentive*) — and
   teacherNotes that explicitly call out the WIDA-3 Spanish cognate
   pre-teach and the IEP organization scaffolds.

4. **Discussion protocol** (concentric circles) with three named roles
   (Evidence Spotter, Inference Builder, Evidence Challenger), each with 3
   prompt stems quoting Erdrich, an accountability artifact (Talk Tracker
   stapled to the CER organizer), and a 4-sentence WIDA-3 + IEP support note
   naming specific cognates and pass-once accommodations.

5. **Single-point rubric** with four criteria — Inference About Identity,
   Evidence Selection, Reasoning and Explanation, Organization and
   Conventions — each with proficient / growth cue / extension cue, all
   referencing Anna and the bilingual glossary.

6. **Exit ticket** ❌ — failed schema validation on this run. Known
   issue; see "Gap #3" below.

This is the level of specificity the evaluators said was missing.

## Gaps to close

### Gap #1 — Pipeline A artifacts never reach print

`<ArtifactsPanel>` renders artifacts on screen in the lesson drawer (right
column, mounted at `app/page.tsx:998`). The print path (`LessonPlan.tsx`)
walks `lessonPackage` (Pipeline B) and never reads from the artifact store.

**Fix (planned, not implemented):**

1. Extend `LessonPlan.tsx` to accept an `artifacts` prop (the
   `Record<ArtifactType, ArtifactPayload['data']>` from the store).
2. For each artifact type, render a `print:break-before-page` block using
   the rich artifact data when present, falling back to the heuristic
   Pipeline B template when absent (e.g., a quick-running plan that never
   triggered the artifact lane).
3. Pipeline A's vocabulary preview becomes the bilingual glossary page;
   the heuristic glossary becomes the fallback.
4. Pipeline A's sentence stems become the sentence-frames page; the prose
   `plan.supports` blocks remain the fallback.
5. Pipeline A's discussion protocol gets its own print page (today not in
   the print pack at all).
6. The single-point rubric replaces the generator's `plan.rubric` array on
   the rubric page when present.

### Gap #2 — Pipeline A is invisible to evaluators in any export path

Even on screen, the artifact panel is in a side column. If an evaluator was
sent a screenshot or a PDF, they may not have scrolled the panel. The print
fix above resolves this. For the in-app share-link path (not yet built),
artifacts must also be included in the serialized plan envelope.

### Gap #3 — Exit ticket schema occasionally fails

In the May 16 acceptance run, 5 of 6 artifacts succeeded; the exit ticket
returned `No object generated: response did not match schema`. The route
isolates failures (each artifact is its own `generateObject` call) so the
other five rendered fine, but a teacher seeing 5/6 instead of 6/6 will
notice. Likely causes:

- The `exitTicketSchema` requires at least one DOK ≥ 3 question; the model
  may have produced a DOK 2 ticket and bailed.
- The schema bans the literal string "What did you learn today?" The model
  may have hit that ban and not retried.

**Fix (planned, not implemented):** add a single retry inside `generateOne`
that bumps temperature by 0.1 and prepends a one-line corrective hint when
the failure mode matches a known schema-violation pattern.

### Gap #4 — Bilingual glossary fallback list is too generic

The PRIORITY_TERMS top-up list (`analyze, argue, cite, compare, contrast,
evaluate, …`) is fine as a backstop but should never trigger when Pipeline
A has produced a text-specific vocabulary preview. Closing Gap #1 closes
this automatically.

## How to read this with the procedure-detail enhancement plan

Both documents describe enhancements; they're independent but sequenced:

1. **First**: ship the picker-panel navigation fix + live UI verification
   (already queued).
2. **Second** (recommended next): close Gap #1 — bridge Pipeline A artifacts
   into the print bundle. This is the *visible* unblocker that will move the
   evaluator score on accommodations.
3. **Third**: implement the procedure-detail enhancement
   (`docs/plans/procedure-detail-enhancement.plan.md`). This raises the
   *lesson body* score on implementation recipe clarity.

We document both now so any code we write between today and those commits
stays forward-compatible.

---

**Decision recorded:** audit only, plan only. No code changes from this
document yet.
