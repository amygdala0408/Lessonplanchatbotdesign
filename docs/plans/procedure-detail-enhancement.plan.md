# Procedure-Detail Enhancement Plan

**Status:** planned, not implemented. Documented now so any code we write before
the enhancement can be forward-compatible.

**Date drafted:** May 16, 2026
**Author:** Penny build session
**Target commit window:** after the picker-panel navigation fix + live UI
verification land, before the artifact-bundle work.

---

## 1. Problem we're solving

In the May 15 acceptance run on RL.9-10.1 + "The Leap" + a 28-student class with
3 WIDA-3 ELs and 2 IEPs, the generator produced a structurally clean,
EQuIP+UDL-2.83/3.0 plan, BUT lesson-plan evaluators flagged that the
**procedure steps describe *what happens* without describing *what the teacher
does to make it happen*.**

Concretely, today a step reads:

> "Whole-class shared annotation of paragraphs 2-4. Students mark evidence
> in pairs on shared text."

A teacher reading this in the building knows the *activity* but not the
*moves* that make it work:

- How does the teacher launch the annotation? With what model question?
- What does the teacher say when she pairs students? What's the grouping rule?
- What's the "if students get stuck" move? The "if students finish early" move?
- How does the teacher check for understanding before transitioning?
- What does the teacher *write down* (anchor chart, board, exit data) during
  this phase?

The pedagogy is right. The execution recipe is too thin.

## 2. Why this is structural, not promptable

The current schema (`src/lib/llm/generatorSchema.ts` →
`generatorProcedureStepSchema`) gives the model:

- `step` — short label with minutes
- `description` — **"2-4 complete sentences"** plain prose
- `accommodations` — 1-3 sentence accommodations rider
- `scaffoldIds[]` / `accommodationIds[]` — catalog refs
- duration min/max

The 2-4 sentence ceiling on `description` is the structural cap. We could
prompt the model harder for moves, but it has nowhere structured to put them,
so they collapse into the same paragraph and the renderer flattens them. The
fix is at the schema level.

## 3. Two implementation options

### Option A — Widen `description` (small lift, modest gain)

Loosen the cap on `description` to ~6-10 sentences and explicitly instruct the
model to include teacher moves, student moves, the check-for-understanding,
and the transition. Update `LessonPlan.tsx` to render the longer prose with
paragraph breaks instead of a single block.

- **Lift:** ~half a day. Schema bump, prompt rewrite, prose-rendering tweak,
  one new evaluator pass.
- **Risk:** Output regresses into wall-of-text. Hard to scan during teaching.
  Hard to score (the EQuIP+UDL judge would need to be retuned to find moves
  inside prose).
- **Recommendation:** ❌ Don't.

### Option B — Introduce a structured `teacherMoves` block on each phase (recommended)

Add a new optional-then-required field on each `generatorProcedureStep`:

```ts
teacherMoves: z.object({
  launch: z.string().min(20).describe(
    'The exact teacher-facing kickoff: 1-2 sentences of what the teacher SAYS or DOES to open this phase. Include the model question or directive verbatim, in quotation marks.',
  ),
  duringWork: z.string().min(20).describe(
    'What the teacher does while students work. 2-3 sentences. Name the conferring move, the data the teacher collects, and the specific student talk to listen for.',
  ),
  checkForUnderstanding: z.string().min(15).describe(
    'How the teacher knows the phase landed before transitioning. Name the artifact, signal, or evidence (cold call, sticky-note check, thumbs, organizer scan, exit-ticket preview). 1-2 sentences.',
  ),
  ifStuck: z.string().min(15).describe(
    'The pre-planned move if a student or pair freezes. Tied to the accommodation lanes from the learner profile. 1-2 sentences.',
  ),
  ifAhead: z.string().min(15).describe(
    'The pre-planned stretch move if a pair finishes early. Aligned to the highest-DOK objective. 1-2 sentences.',
  ),
  transition: z.string().min(15).describe(
    'How the teacher closes this phase and routes into the next one. 1-2 sentences. Name the signal (chime, slide change, anchor-chart pivot).',
  ),
}).describe('Concrete teacher moves for this phase. Plain text, no markdown.'),
```

Six fields, each 1-3 sentences, each focused on one teacher decision point.
The 2-4 sentence `description` stays — it becomes the *what* summary, and the
six moves become the *how* recipe.

- **Lift:** ~1.5 days end-to-end (schema, prompt, renderer, scorer pass,
  validator updates, snapshot tests).
- **Risk:** Output becomes more rigorous but also more verbose. We'll need to
  visually condense it in the printable plan (Option B-1, below).
- **Recommendation:** ✅ Do this.

## 4. Implementation order, when we're ready to build

1. **Schema** (`src/lib/llm/generatorSchema.ts`)
   - Add `teacherMoves` block to `generatorProcedureStepSchema`.
   - Keep it optional in the Zod type for one commit so existing fixtures
     still pass; flip to required in commit 2.

2. **Prompt** (`src/lib/llm/router.ts`, `app/api/finalize-plan/route.ts`,
   `PENNY_OPERATOR_NOTES.md`)
   - Add a "TEACHER MOVES — non-negotiable" section to the operator notes.
   - Add 1 worked example showing the difference between *what* and *how*.
   - Bump `promptVersion` (we use it in telemetry).

3. **Validator** (`src/lib/lessonPlanValidator.ts`)
   - For each phase, assert all six `teacherMoves` strings are non-empty,
     ≥ 15 chars, no markdown leakage.
   - Add a soft check: at least 3 of the 6 strings reference the chosen
     text by title (or a quoted phrase from it). Otherwise log a warning.

4. **Scorer** (`src/lib/qualityScorer.ts`)
   - Layer A: add `proceduralSpecificity` (deterministic): count how many
     `teacherMoves.launch` strings contain a quoted question or directive;
     count how many `duringWork` strings name a conferring move from a small
     allowlist (confer, listen for, ask, redirect, push, etc.).
   - Layer B (GPT-5.5 judge): extend the rubric prompt to score
     *Implementation Recipe Clarity* (0-3) on top of the existing
     EQuIP+UDL dimensions. Promote any low score into a top-level
     `<root>` warning.

5. **Renderer** (`src/app/components/LessonPlan.tsx`)
   - Per phase, render `description` as the headline 2-3 sentences.
   - Render `teacherMoves` as a labeled 2-column micro-grid:
     ```
     LAUNCH          | DURING WORK       | CHECK FOR UNDERSTANDING
     IF STUCK        | IF AHEAD          | TRANSITION
     ```
   - Use the existing monospace print stylesheet; each cell is ~3-4 lines.
   - Add a `print:break-inside-avoid` on the phase block so the moves don't
     orphan across pages.

6. **Artifacts lane** (`src/lib/llm/artifactSchemas.ts`,
   `app/api/generate-artifacts/route.ts`)
   - When generating the discussion protocol and the graphic organizer, pass
     the per-phase `teacherMoves` into the prompt so the artifacts stay
     aligned to the actual moves (e.g., the protocol's accountability artifact
     references the same anchor chart named in the moves).

7. **Tests / fixtures**
   - Add `src/lib/qualityScorer.test.ts` cases for `proceduralSpecificity`.
   - Add 2 new acceptance fixtures: one for ELA (RL.9-10.1) and one for
     science (HS-LS1) so we catch subject-specific failure modes.

## 5. Implications for code we're writing before this lands

These are the forward-compat constraints to keep in mind for any work done
between now and this enhancement:

1. **Don't rely on the 2-4 sentence cap.** If the picker / phase machine /
   any UI surface assumes `procedure[i].description` is short, write it to
   tolerate longer prose. (Currently OK; flagging defensively.)

2. **Don't add unrelated optional fields to `generatorProcedureStep`.** When
   we add `teacherMoves`, we want a clean schema diff in the LLM JSON output.
   Extra new fields complicate fixture migration.

3. **Picker panel navigation work**: when the picker collapses post-selection
   and we surface "show picker again," the phase-state read should NOT cache
   the procedure shape. Once `teacherMoves` lands, the lesson drawer should
   re-render fully.

4. **Artifact generator (current Opus 4.7 lane)**: today it summarizes
   procedure steps with just `step.description`. When `teacherMoves` lands,
   `summarizePlanForArtifacts()` in `app/api/generate-artifacts/route.ts`
   must include the moves in the brief so artifacts stay consistent. Leave
   a `TODO(teacher-moves)` comment there now so we don't forget.

5. **EQuIP+UDL scorer (current Layer B prompt)**: today it scores prose
   density implicitly. When we add `proceduralSpecificity`, we want clean
   delta numbers, so keep the current judge prompt frozen between now and
   that commit. Don't tune it mid-window.

## 6. Acceptance for this enhancement (when we DO build)

Re-run the May 15 acceptance prompt. The same plan should:

- Pass structural + catalog-ID + accommodation validation as before.
- Score ≥ 2.85/3.0 on EQuIP+UDL Layer B.
- Score ≥ 2/3 on the new *Implementation Recipe Clarity* dimension.
- Pass the "quoted teacher language" soft check in ≥ 4 of 5 phases.
- Generate a printed plan where a substitute teacher could run the lesson
  cold from the page without asking the original teacher a question.

## 7. Out of scope for this enhancement (deferred)

- Video / audio modeling of teacher moves (e.g., "watch this 90-second clip
  of a teacher launching this prompt"). Belongs in a future content library
  pass, not in the JSON pipeline.
- Per-student micro-conferring scripts. The accommodations lane handles
  named-student supports; we don't want to bloat per-step prose with
  student-specific scripting.
- An AI-generated *post-lesson reflection* artifact. Belongs in a separate
  artifact type once teachers tell us they want one.

---

**Decision recorded:** plan only. No code changes until the picker-panel
navigation fix + live UI verification land first.
