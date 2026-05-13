# Cloud Agent Brief: Restore + Finish Penny Top-Tier Overhaul

> Repo: `/Users/amyhenderson/Desktop/Windsurf Builds/lessonplangeneratorpenny/Lessonplanchatbotdesign`
> Branch: create `agent/top-tier-overhaul` and open a PR when done.
> Goal: make Penny's lesson plan output the **best in the industry** using the curated content catalog we already shipped. Multi-LLM choreography is in place — your job is to make every link of the chain work, then finish P1/P2/P3.

---

## 1) Read this first, in this order

1. `/Users/amyhenderson/.cursor/plans/penny-top-tier-overhaul_0ec9b8ff.plan.md` — **the original overhaul plan**. This is the contract.
2. `/Users/amyhenderson/.cursor/plans/penny-top-tier-v2_b8ab5fde.plan.md` — updated plan (P0.5 multi-LLM strategy, P1/P2/P3).
3. `PENNY_SYSTEM_PROMPT.md` — the system-prompt contract: voice, one-question-per-turn, `[QUICK_REPLIES]`, `pickCatalog` tool guidance.
4. `src/lib/llm/router.ts` — task → model mapping (chat=Anthropic, picker/scorer/patcher=OpenAI mini, generator=Anthropic, accommodation=Anthropic). **Do not change without strong reason.**
5. `src/lib/llm/generatorSchema.ts` — strict Zod schema for finalize. Forbids markdown inside JSON values.
6. `src/lib/llm/pickCatalog.ts` + `src/lib/llm/tools.ts` — the picker model + tool wiring.
7. `app/api/chat/route.ts`, `app/api/finalize-plan/route.ts`, `app/api/catalog-pick/route.ts`, `app/api/lesson-package/route.ts` — the four endpoints.
8. `src/lib/lessonPackage.ts` — catalog resolver (procedure → real records).
9. `src/lib/lessonPlanParser.ts` — STRICT parser (only `[LESSON_PLAN_JSON]` tags or shape-validated JSON code blocks). Has `stripPlanMarkdown` defense.
10. `src/app/components/LessonPlan.tsx` — the print package render. Look for `pickGraphicOrganizerKind`, `pickReadingTaskKind`, `pickPlatformGuides`.
11. `src/data/catalog/*.json` — the actual content library (resources, scaffolds, accommodations, openers, exit slips, misconceptions, citations, glossary, dok_lexicon, equip_udl_rubric).

## 2) Acceptance criteria — what "done" looks like

A teacher types one short prompt into chat: **"9th grade ELA, CCSS.ELA-LITERACY.RL.9-10.1, 60 minutes. 28 students, 3 ELs at WIDA 3, 2 IEPs (anxiety + organization + reading)."** With the AI Gateway key set, the build must:

- [ ] Reach `complete` phase in ≤ 6 user turns (not 12+).
- [ ] Suggest **3 student-facing texts** — articles/poems/primary sources written for students at the target grade. NEVER suggest teacher-PD titles (Hattie's *Visible Learning*, Marzano, EQuIP rubric docs, Wiggins/McTighe, etc.) as student reading.
- [ ] Generate a finalized plan via `/api/finalize-plan` that passes both the Zod schema and `validateLessonPlan(merged, 'finalize')`.
- [ ] Render the plan in `LessonPlan.tsx` with: clean procedure (zero literal `**` characters), real catalog-resolved accommodations grouped by phase, real bilingual glossary, real misconceptions, real citations, a content-aware graphic organizer, an objective-aware reading companion (with QR + note-catcher), a structured exit slip with success-criteria checklist.
- [ ] `ModelStatusChip` shows real model routing: chat=anthropic/claude-sonnet, picker=openai/gpt-4.1-mini, generator=anthropic/claude-sonnet.
- [ ] Print preview produces a coherent PDF — no placeholders, no "[Teacher: attach text here]", no irrelevant platform instructions, no broken numbering.
- [ ] Lighthouse-style smoke: no console errors, no React key warnings, no failed network calls.

## 3) Day-1 diagnostic loop (do this BEFORE writing any code)

Pull the latest, install, run dev:

```bash
git checkout -b agent/top-tier-overhaul
npm ci
ulimit -n 65536 && CHOKIDAR_USEPOLLING=true npm run dev
```

Open `http://localhost:3000`. Click **Start Fresh** in the top-right rail to wipe `localStorage`. Then run the test prompt above end-to-end and capture, for each step:

- **/api/chat** response: status, `x-penny-model`, `x-penny-task` headers, body sample.
- **/api/catalog-pick** invocations: which scope (`text`, `instructional_model`, `opener`, `exit_slip`), what candidate IDs were considered, what was picked, what runner-up was returned. Watch for `audience` mismatches.
- **/api/finalize-plan** response: `ok`, `errors[]`, `meta.modelError`, `meta.latencyMs`, the full validation errors if `ok=false`.
- **/api/lesson-package** response: how many resolved accommodations per phase, how many glossary entries, how many citations.

Write this snapshot to `AGENT_DIAGNOSTIC.md` at the repo root before any fix. That's your baseline.

**Gateway status as of this brief**: `AI_GATEWAY_API_KEY` is present in `.env.local` and verified working. A live smoke test just returned a schema-valid finalized plan from `anthropic/claude-sonnet-4.5` in 82s with zero validation errors. Do NOT spend cycles "fixing missing API key" — that is not the issue. The breakages are in the catalog audience filter and in client-side surfacing of finalize results.

## 4) Known regressions to fix (priority order, P0 → P3)

### P0 — Catalog audience filter (the #1 user complaint)
The picker is offering teacher-PD titles as student reading. Fix:
- Audit `src/data/catalog/resources.json`. Every record needs an `audience` field: `"student"` (something a 9th grader would read/use) or `"teacher"` (PD / reference). If the source data doesn't have this column, infer it from `licenseClass + source + title` heuristically AND back-fill the JSON.
- Change `pickCatalog.ts` to **filter candidates by `audience='student'`** when `scope === 'text'`. Teacher resources are allowed in `scope: 'scaffold'` / `accommodation`, never in `text`.
- Update `buildCatalogContext` so the `CATALOG_CANDIDATES` system message only surfaces audience-appropriate IDs to whatever model is doing the picking.
- Add a one-line guardrail to `PENNY_SYSTEM_PROMPT.md` Phase 3 (text selection): *"You only offer student-facing texts. You never recommend professional development titles (Hattie, Marzano, Wiggins, EQuIP, etc.) as student reading."*
- Add a Vitest unit test asserting that `pickCatalog({ scope: 'text', ... })` cannot return a teacher-PD ID.

### P0 — Finalize "produces nothing" in the UI (server returns a valid plan)
**Confirmed**: `POST /api/finalize-plan` returns `ok:true` with a schema-valid plan in ~80s for the ELA test prompt. So the breakage is **client-side surfacing**, not server-side generation. Likely causes:
- Stale `lessonPlan` in `localStorage` (key: `penny-pedagogy-storage`) renders over the new plan. The new `Start Fresh` button in the header rail clears this — verify it's actually wired and clears all derived state (`lessonPackage`, `studentMaterials`, `validationErrors`, `modelTurns`).
- The 80-second finalize latency is long enough that users assume the build hung. There's no progress indicator with a real heartbeat. Add a streaming-ish progress UI: while finalize is in flight, show the model, elapsed time, and what phase the generator is on.
- When validation does return errors, the UI surfaces a toast but the actual `merged` plan is hidden. Render `merged` anyway with a red banner + per-section error chips so the teacher can fix-and-regen instead of starting over.
- Verify `setLessonPlan(merged)` is being called with the finalize response and the plan panel auto-opens. There may be a race condition where `setLessonPlan` fires before `setLessonPackage`.
- Remove the legacy `[LESSON_PLAN_JSON]` fallback in `handleFinalizeLegacy` entirely — the parser is now strict and that fallback can only produce confusing garbage. Delete the legacy path.

Fix:
- Auto-open the plan panel when finalize returns `ok:true` (currently may require a click).
- Add a finalize progress card that shows model, elapsed time, retry attempt, and a "this typically takes 60-90s" note so teachers don't think it hung.
- When validation fails, render the merged plan with section-level error annotations + a "Fix issues" button that calls `/api/regenerate-section` (P1).

### P0 — Text picks must be 3 distinct, student-facing, level-appropriate options
`/api/catalog-pick` for `scope: 'text'` should return three options that differ on at least one axis (lexile band, format, voice/representation tag). Update `pickCatalog.ts` to ask for three diverse picks, not one + a runner-up.

### P1 — EQuIP-style quality scorer
The whole point of P1 was to never ship a sub-quality plan.
- Build `src/lib/qualityScorer.ts` with **Layer A** (deterministic checks: DOK presence, accommodation-per-phase coverage, success-criteria-to-objective coverage, catalog ID validity) and **Layer B** (LLM judge via the `scorer` task in `router.ts` — OpenAI gpt-4.1-mini).
- Score on the 6 EQuIP dimensions: Alignment, Standards-based Design, Instructional Quality, Equity & Accessibility, Assessment, Differentiation.
- Wire into `/api/validate-plan` and `handleFinalize`. Fail finalize when avg < 2.5 or any dimension is 0; retry once with patcher model (per `router.ts`) using `formatErrorsForRetry`.
- Render a 6-badge scorecard strip at the top of `LessonPlan.tsx`. Color: red 0, amber 1, green 2-3.
- Validate objective verbs against `src/data/catalog/dok_lexicon.json` in the finalize gate. If a verb-to-DOK mismatch, retry with the 3 closest valid verbs surfaced.
- When `validateCatalogIds` rejects an ID, retry with the 3 closest valid IDs (Levenshtein or shared-prefix) embedded in the prompt.

### P1 — Section regenerate
- Add `/api/regenerate-section` accepting `{ plan, section, instructions }`. Use the `patcher` model. Emit JSON Patch validated against the schema, never a full replacement.
- Add hover affordance on each `LessonPlan.tsx` section to trigger regenerate.

### P2 — Print package upgrade
The Reading Companion + Graphic Organizer are now content-aware (just shipped). Finish:
- Per-phase **pacing strip** above the procedure section: tiny horizontal bar showing min-min for each of the 5 phases.
- **Answer Key** print page: combines `successCriteria + rubric + objective[0].verb` to produce a teacher exemplar. Use the `generator` model on a side prompt.
- Always-on bilingual glossary now defaults to en+es — extend to include subject-relevant Tier-2 verbs from `dok_lexicon.json` even when the inferred terms find ≥6 matches (so the page always has classroom-ready vocab).
- Render `representation_tags` as color-coded chips in Equity Notes (use `src/data/catalog/representation_tags.json` for the color map).
- Extend `parseStudentMaterials` to extract `worksheets[]` and `graphicOrganizers[]` from chat content; render as additional print pages.

### P3 — Hardening
- `requestAnimationFrame`-batched `setMessages` while streaming.
- `React.memo` chat bubbles keyed on `id + content.length`.
- Cap persisted `messages` to 30; split `lessonPlan` persistence off the chat-churn store so a chat keystroke doesn't rewrite the plan.
- Summarize messages older than 20 turns into a system message.
- Remove unused deps: Vite, `index.html`, MUI, emotion, react-router (the project is Next.js App Router).
- Add Vitest. Tests for: lesson plan schema, parser, phase machine, scorer, accommodations rules engine, selectors, audience filter (new).
- `npm test` script + GitHub Actions CI workflow (lint + typecheck + vitest).

## 5) Regression guard — DO NOT revert any of these

| Component | Status | Don't |
|---|---|---|
| Vercel AI SDK + AI Gateway via `src/lib/llm/router.ts` | shipped | revert to raw `fetch('https://api.poe.com/...')` |
| Strict parser (`extractLessonPlanFromResponse` only accepts `[LESSON_PLAN_JSON]` or shape-validated `json` code blocks) | shipped | re-enable the markdown miner for chat turns |
| `stripPlanMarkdown` pass on every long-text field | shipped | remove markdown stripping |
| P0 UI: home-language chip multi-select, quick-reply chips, inline structured picker, text option picker | shipped | rip out chips / restore free-form ISO code field |
| `PENNY_SYSTEM_PROMPT.md` Voice & Flow rules (one question per turn, no re-asking learner data) | shipped | reintroduce 12-question gathering |
| `generatorLessonPlanSchema` strict types + "no markdown in JSON" rule | shipped | weaken the schema |
| `ModelStatusChip` + `recordModelTurn` telemetry | shipped | break the chip |
| `LessonPlan.tsx` Reading Companion, content-aware Graphic Organizer, trimmed Lesson Pack instructions, structured Exit Slip, always-on glossary | shipped | revert to generic placeholders |
| `Start Fresh` button that hard-clears `penny-pedagogy-storage` | shipped | remove it |

## 6) How to test without burning API credits

You can do 80% of correctness work offline:
- Snapshot fixtures: dump three real chat→finalize→render runs to `src/__tests__/fixtures/` (one ELA, one math, one science). Run all renderer + parser + scorer + validator tests against fixtures.
- Use the `loadDemoMode()` plan in `src/data/demoData.ts` as a known-good render target — every render change must continue to render the demo plan without console errors.
- Run typecheck on every change: `npx tsc --noEmit`.
- Run lint: `npm run lint` (or `npx eslint . --max-warnings=0`).

## 7) Deliverables on PR

1. **AGENT_DIAGNOSTIC.md** at repo root — your day-1 snapshot before any fix.
2. **PR description** with: what was broken, what's now fixed, what's still pending, screenshots of the rendered plan + print preview for the ELA test prompt above.
3. **Vitest suite** with at least the audience-filter test, schema validation tests, and the parser round-trip tests.
4. **Updated PENNY_SYSTEM_PROMPT.md** with the new audience guardrail and any other prompt tightenings you needed.
5. **No commits that revert any item in §5.**

## 8) Tone & taste

Penny is built by educators for educators. Voice = warm coffee-shop colleague. Plans are research-grounded but jargon-free. The print pack is a finished deliverable the teacher can hand to students, not a draft. Anything generic, any placeholder, any markdown leakage = failure.

If you hit ambiguity, choose the option a National Board Certified teacher would call "the obviously correct one for kids" — not the option that minimizes code change.

---

Open the PR titled `top-tier-overhaul: restore + P1/P2/P3` against `main`. Tag `@amyhenderson` for review.
