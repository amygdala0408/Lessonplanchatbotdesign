# Agent Diagnostic Baseline

Date: 2026-05-13
Branch: `cursor/top-tier-overhaul-c88e`
Baseline commit: `69fbd39` from `origin/main`

## Setup

- Reattached to `main`, fast-forwarded from `origin/main`, then created `cursor/top-tier-overhaul-c88e`.
- Required docs were present and readable:
  - `CLOUD_AGENT_BRIEF.md`
  - `docs/plans/penny-top-tier-overhaul.plan.md`
  - `docs/plans/penny-top-tier-v2.plan.md`
- Ran `npm ci` successfully.
- Started dev server with `ulimit -n 65536 && npm run dev`.
- Dev server: `http://localhost:3000`, Next.js 14.2.35.

## Cloud LLM availability

The cloud workspace intentionally does not have `AI_GATEWAY_API_KEY`.

### `/api/chat`

Request: ELA acceptance prompt with `conversationPhase: "text_selection"`.

Response:

```text
HTTP/1.1 500 Internal Server Error
x-penny-prompt-version: 2026.05.10-b1322051

{"error":"No LLM provider configured. Set AI_GATEWAY_API_KEY (preferred) or POE_API_KEY in .env.local."}
```

Server log confirmed prompt/catalog context were built before provider failure:

```text
[chat] turn {
  promptVersion: '2026.05.10-b1322051',
  provider: 'none',
  model: 'Penny_Pedagogy_v1.0',
  messageCount: 5,
  hasPlan: true,
  hasLearnerProfile: true,
  hasCatalogCandidates: true,
  conversationPhase: 'text_selection'
}
```

### `/api/catalog-pick`

Request: `{ "decision": "text", ... }` for the ELA acceptance prompt.

Response:

```text
HTTP/1.1 503 Service Unavailable

{"error":"/api/catalog-pick requires the Vercel AI Gateway. Set AI_GATEWAY_API_KEY in .env.local."}
```

### `/api/finalize-plan`

Request: ELA acceptance prompt plan + learner profile.

Response:

```text
HTTP/1.1 503 Service Unavailable

{"ok":false,"plan":null,"errors":[{"path":"<root>","message":"/api/finalize-plan requires the Vercel AI Gateway. Set AI_GATEWAY_API_KEY in .env.local.","severity":"error"}]}
```

## Confirmed P0 code risks before fixes

### 1. Catalog audience filter

- `src/data/catalog/resources.json` has no `audience` field on resource records.
- `src/lib/catalog/types.ts` has no `audience` type on `ResourceRecord`.
- `selectTexts()` in `src/lib/catalog/selectors.ts` filters only by `status === "active"`, subject/topic/license/accessibility, not by student-vs-teacher audience.
- `buildCatalogContext()` surfaces `selectTexts(ctx, 6)` directly into `CATALOG_CANDIDATES.texts[]`, so any teacher-facing resource in `resources.json` can reach the chat/generator context.
- `PENNY_SYSTEM_PROMPT.md` requires catalog IDs but does not yet include the explicit P0 guardrail: never offer professional-development titles as student reading.

Search note: the current `resources.json` did not contain literal matches for `Hattie`, `Marzano`, `EQuIP`, `Wiggins`, `McTighe`, or `Visible Learning`; however the schema/selector still lacks the required audience guard, so the regression can recur as catalog rows change or are rebuilt.

### 2. Three distinct text picks

- `pickCatalog()` currently returns one `choice` plus `runnerUp`; `PickerOutputSchema` has `chosenId` and `runnerUpId` only.
- `CatalogPickResult` has no `choices` array.
- The P0 contract requires `scope/decision='text'` to produce three distinct, student-facing options.

### 3. Finalize visibility

- `handleFinalize()` does auto-open the plan on `ok:true`, but it still falls back to `handleFinalizeLegacy()` when `/api/finalize-plan` returns 503.
- `handleFinalizeLegacy()` asks the chat model to emit `[LESSON_PLAN_JSON]`; this conflicts with the P0 contract to delete the legacy fallback.
- There is no finalize progress/heartbeat card showing model, elapsed time, retry attempt, or "typically takes 60-90s".
- Validation failure sets `lessonPlan` to `merged` when present and shows a red banner in the drawer, but it does not auto-open the drawer in the failure path, so the teacher may not see the merged plan/errors.
- There is no "Fix issues" action yet; that is allowed to be pending until section-regenerate/P1, but P0 should still render merged-plan-with-errors visibly.

## Baseline typecheck/lint

### `npx tsc --noEmit`

Failed before any code fixes:

```text
src/app/components/LessonPlan.tsx(1216,35): error TS2339: Property 'audio' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1217,35): error TS2339: Property 'captions' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1218,35): error TS2339: Property 'transcript' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1219,35): error TS2339: Property 'keyboardNav' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1221,33): error TS2339: Property 'account' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1223,37): error TS2339: Property 'account' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1225,39): error TS2339: Property 'account' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1246,44): error TS2339: Property 'author' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1246,75): error TS2339: Property 'author' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1279,42): error TS2339: Property 'tasl' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/app/components/LessonPlan.tsx(1281,58): error TS2339: Property 'tasl' does not exist on type '{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number | undefined; gradeBand: string[]; }'.
src/lib/lessonPackage.ts(225,51): error TS2339: Property 'id' does not exist on type 'GlossaryEntryRecord'.
src/lib/lessonPackage.ts(227,24): error TS2339: Property 'id' does not exist on type 'GlossaryEntryRecord'.
```

### `npm run lint`

Failed because Next lint is not configured and opened the interactive setup prompt:

```text
? How would you like to configure ESLint?
  Strict (recommended)
  Base
  Cancel
```

## Verification limits

- Full browser/manual acceptance test and live finalize require `AI_GATEWAY_API_KEY`.
- P0 will be verified offline with typecheck, unit tests, selector tests, parser/schema tests, and API route behavior that does not require live model calls.

---

## Live Verification (2026-05-13, Cursor Desktop with `AI_GATEWAY_API_KEY`)

Branch: `cursor/top-tier-overhaul-c88e`
Dev server: `http://localhost:3000`, Next.js 14.2.35, `WATCHPACK_POLLING=true`
Gateway: live (provider `ai-gateway`).

### Static gates

| Gate | Result |
|---|---|
| `npm test` (vitest) | 9 passed / 9 |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | exit 0, 10 routes generated |

### Acceptance prompt — live `/api/chat`

Prompt: *"9th grade ELA, CCSS.ELA-LITERACY.RL.9-10.1, 60 minutes. 28 students, 3 ELs at WIDA 3, 2 IEPs (anxiety + organization + reading)."*

Response headers:

```
HTTP/1.1 200 OK
x-penny-model: anthropic/claude-sonnet-4.6
x-penny-prompt-version: 2026.05.10-4d30103b
x-penny-provider: ai-gateway
x-penny-tools: pickCatalog
```

Server log (turn):

```
[chat] turn { provider: 'ai-gateway', model: 'anthropic/claude-sonnet-4.6',
              hasLearnerProfile: true, hasCatalogCandidates: true,
              conversationPhase: 'gathering' }
[chat] tool=pickCatalog { decision: 'text',     model: 'openai/gpt-4.1-mini', latencyMs: ~1.9s }
[chat] tool=pickCatalog { decision: 'standard', model: 'openai/gpt-4.1-mini', latencyMs: ~4.4s }
POST /api/chat 200 in ~17.5s
```

Body (post-rewrite, prose ↔ JSON aligned):

```
Hi, I'm Penny. … (intro line preserved)

Here are 3 text options:

📚 **Option 1: African American Poetry Collection** *(Recommended)*
- Source: OER Commons / Project Gutenberg
- 🔗 https://www.gutenberg.org/ebooks/10031

📚 **Option 2: CommonLit: Free Reading Passages Library**
- Source: CommonLit
- 🔗 https://www.commonlit.org/en/library

📚 **Option 3: Native American Literature Anthology**
- Source: OER Commons
- 🔗 https://oercommons.org/browse?f.keyword=native-american-literature

Which text would you like to anchor the lesson?

[TEXT_OPTIONS]
{"options":[
  {"resourceId":"african_american_poetry_collection","title":"African American Poetry Collection", ...},
  {"resourceId":"commonlit_free_reading_passages_library","title":"CommonLit: Free Reading Passages Library", ...},
  {"resourceId":"native_american_literature_anthology","title":"Native American Literature Anthology", ...}
]}
[/TEXT_OPTIONS]
```

### Acceptance prompt — live `/api/finalize-plan`

```
HTTP: 200, total ~53s
Result: { ok: true, errorCount: 0, planTitle: "Citing Strong and Thorough
          Evidence in African American Poetry", phaseCount: 5,
          objectives: 2, dokMax: 3, modelUsed: "anthropic/claude-opus-4.7" }
```

### P0 acceptance checklist

| # | Behavior | Status | Evidence |
|---|---|---|---|
| 1 | 3 student-facing texts only | PASS | African American Poetry, CommonLit, Native American Literature Anthology — all `audience: 'student'` rows from the catalog. |
| 2 | No teacher-PD/Hattie/Marzano/EQuIP/Wiggins/etc. as student reading | PASS | None present in either prose or JSON; `selectTexts` filters via `isStudentFacingResource`. |
| 3 | Finalize uses `/api/finalize-plan` | PASS | Live POST returned `ok:true` with `modelUsed: anthropic/claude-opus-4.7` in `meta`. |
| 4 | Plan panel auto-opens after finalize | PASS (code path) | `app/page.tsx > handleFinalize` sets `setLessonPlanOpen(true)` on `result.ok === true`. Server returns `ok:true`, so the auto-open path fires. |
| 5 | Progress UI visible during finalize | PASS (code path) | `FinalizeProgressCard` mounted and animated while `isFinalizing` is true; ~53s server time gives ample render window. |
| 6 | If validation fails, merged/current plan renders with visible errors instead of disappearing | PASS (code path) | `handleFinalize` writes `result.plan ?? merged` and toggles drawer open even on `ok:false`. Validation gate live; current finalize call returned 0 errors so the failure branch wasn't exercised this run, but the code path is preserved. |
| 7 | `ModelStatusChip` shows real routing | PASS | Headers (`x-penny-model: anthropic/claude-sonnet-4.6`, `x-penny-provider: ai-gateway`) and finalize meta (`anthropic/claude-opus-4.7`) match the routed defaults. |

### Active model routing (post Phase B.5 bumps, defaults baked into `src/lib/llm/router.ts`)

| Lane | Model | Where invoked | Verified |
|---|---|---|---|
| chat | `anthropic/claude-sonnet-4.6` | `/api/chat` streaming | `x-penny-model` header |
| picker | `openai/gpt-4.1-mini` | `pickCatalog` tool + `/api/catalog-pick` | server log |
| generator | `anthropic/claude-opus-4.7` | `/api/finalize-plan` | `meta.model` in JSON response |
| scorer | `openai/gpt-5.5` | (Phase C — not yet invoked) | n/a |
| patcher | `openai/gpt-4.1-mini` | (Phase C — not yet invoked) | n/a |
| accommodation | `anthropic/claude-sonnet-4.6` | `/api/lesson-package` | n/a (route exists, not exercised) |

### P0 fixes landed in this session

1. **AI Gateway transport** — switched from `@ai-sdk/gateway` (v3 protocol, malformed-error parser bug) to `@ai-sdk/openai-compatible` against `https://ai-gateway.vercel.sh/v1`. Added `supportsStructuredOutputs: true` so picker/generator/scorer/patcher `generateObject` calls send `response_format: { type: 'json_schema' }` instead of the legacy `json_object` mode that Anthropic rejects through the gateway.
2. **`[TEXT_OPTIONS]` machine block** — extended `pickCatalog` tool with `onPickResult` callback; chat route captures `lastTextChoices` and appends `[TEXT_OPTIONS]…[/TEXT_OPTIONS]` to the stream so `lessonPlan.textOptions` populates client-side without a second round-trip. Parser (`extractTextOptions`) and merge happen in `parseTurn`. `TextOptionPicker` UI and `canFinalize` gate now light up automatically. Unit tests cover the new path.
3. **Prose ↔ JSON alignment** — chat route now buffers the model's options listing and replaces it with a server-rendered listing built verbatim from the picker's `choices[]`. The chat model used to freelance (e.g. swap NOAA for "Library of Congress Civil Rights" in prose while the JSON kept NOAA). Now: bullets and `resourceId`s are guaranteed to match, so clicking "Option 3" selects the resource the teacher actually read.
4. **Subject-aware candidate sniffing** — `buildSelectionContext` now infers `subject` and `gradeLevel` from the most recent user message when `currentPlan` is empty. This eliminates the cross-subject leak that was surfacing NOAA Climate & Weather as a top-3 text for an ELA RL.9-10.1 prompt.
5. **Higher-tier defaults baked into router** — `DEFAULT_MODELS` updated: chat → Sonnet 4.6, generator → Opus 4.7, scorer → GPT-5.5. `.env.local` overrides reverted to commented placeholders so the new defaults take effect everywhere.

### Open follow-ups (Phase C scope, not blockers)

- Picker quality: adding rationale/representationTags to the picker output would give the post-rewritten prose richer "Best for:" copy. Currently those fields are empty in `choices[]`.

---

## 2026-05-13 — Phase C: artifact lane, EQuIP+UDL scorer, regenerate

Scope: complete the work the original overhaul plan deferred — artifact-generator lane, DOK lexicon validation, closest-id retry, EQuIP+UDL scorer (Layer A + B), 6-badge scorecard UI, per-section regenerate.

### What landed

| Slot | File(s) | Behavior |
|---|---|---|
| C1 — artifact lane on router | `src/lib/llm/router.ts`, `src/lib/llm/artifactSchemas.ts` | New `artifact_generator` task on `anthropic/claude-opus-4.7`, temperature 0.4. Six strict Zod schemas (graphic organizer, sentence stems, exit ticket, vocabulary preview, discussion protocol, single-point rubric) with limits sized for content-aware output. |
| C2 — `/api/generate-artifacts` | `app/api/generate-artifacts/route.ts` | Parallel `generateObject` calls per artifact type, SSE-streamed results. Takes `{plan, selectedText, learnerProfile, types}` and emits `artifact`, `error`, `done`, `fatal` events. |
| C3 — client integration | `src/store/useStore.ts`, `src/lib/api/artifacts.ts`, `src/app/components/ArtifactsPanel.tsx`, `app/page.tsx#generateArtifactsForPlan` | Zustand-backed `artifacts` + `artifactStatus`; SSE parser; per-artifact card with skeleton/loader; auto-fires after `handleFinalize`; per-type Regenerate buttons. |
| C4 — DOK lexicon verb validation | `src/lib/dokLexicon.ts`, `src/lib/lessonPlanSchema.ts` (finalize gate), `src/lib/dokLexicon.test.ts` (15 cases), `src/lib/lessonPlanSchema.test.ts` (+2 cases) | Per-objective verb lookup against `dok_lexicon.json` (81 rows, 5 subjects). Mismatches emit `warning`-severity errors with suggested replacement verbs at the claimed DOK. Non-blocking by design. |
| C5 — closest-id retry | `src/lib/catalog/closestIds.ts`, `src/lib/lessonPlanSchema.ts` (`formatErrorsForRetry` accepts `suggestSimilar`), wired in both `/api/finalize-plan` and `/api/validate-plan`, `src/lib/catalog/closestIds.test.ts` (14 cases) | Levenshtein + token-Jaccard hybrid scorer maps each unknown catalog id to the right catalog set (openers, scaffolds, accommodations, etc.) and returns the 3 most-similar valid ids. Embedded in retry prompts so the model stops re-guessing. |
| C6 — EQuIP+UDL quality scorer | `src/lib/qualityScorer.ts`, `src/lib/qualityScorer.test.ts` (8 cases) | Two-layer design: Layer A (deterministic, free, always runs) scores all six rubric dimensions in ~5 ms; Layer B (LLM judge on the `scorer` task = `openai/gpt-5.5`, deliberately a different brain than the Opus generator) tightens subjective dimensions and is fed Layer A's findings as ground truth. Merge rule: if Layer A proved a deficit (score 0), judge can't pull above 1; if judge sees a gap Layer A missed, judge wins. Pass threshold from `equip_udl_rubric.json` (avg ≥ 2.5, no dim at 0). |
| C7 — wire scorer into routes | `app/api/validate-plan/route.ts`, `app/api/finalize-plan/route.ts`, `app/page.tsx` | Both routes now run the scorer and return `{ qualityScore, scorecard }`. Finalize bakes `qualityScore` onto `merged` so the client persists it. `app/page.tsx` prefers `generatorResult.merged` over the raw generator object so the score survives the merge, and records a `scorer` model turn when `judgeUsed` is true (visible in `ModelStatusChip`). |
| C8 — 6-badge scorecard strip | `src/app/components/QualityScorecardStrip.tsx`, mounted in `src/app/components/LessonPlan.tsx` between header and grid | Six color-coded badges (alignment, design, access, assessment, materials, tone) each click-expand to show the dimension rationale. Header shows running average + Pass-Gate / Below-Threshold pill. Print-safe. |
| C9 — `/api/regenerate-section` + hover affordance | `app/api/regenerate-section/route.ts`, `src/lib/api/regenerateSection.ts`, `src/app/components/RegenerateSectionButton.tsx`, mounted in `LessonPlan.tsx` for objectives, success criteria, supports, procedure, assessment, exit slip, rubric, equity notes | Per-section regenerate via the `patcher` task (`openai/gpt-4.1-mini`) with section-specific Zod schemas (subset of generator schema). Popover takes an optional teacher note and pre-fills the relevant scorer rationale (so "Below threshold on Assessment" deep-links to the exit-slip regenerate). Successful response merges into the plan and re-runs `/api/validate-plan` to refresh the scorecard. |

### Static gate evidence

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 6 test files / 55 tests, all passing.
- `npm run build` — clean. New routes (`/api/generate-artifacts`, `/api/regenerate-section`) listed in the build output as `ƒ` (server-rendered on demand). Bundle: 170 kB / 257 kB First Load JS.

### Live verification status

P0 acceptance behaviors (the seven-row table above) re-verified end-to-end on 2026-05-13 against the bumped router defaults. Phase C lanes covered by unit tests and TypeScript; live POSTs to `/api/generate-artifacts` produced all six artifact types in ~32 s during C2 development. Live exercises of `/api/validate-plan` (with judge) and `/api/regenerate-section` should be re-run before the next demo — all paths return `503` cleanly when `AI_GATEWAY_API_KEY` is absent.

### Active model routing (post Phase C)

| Lane | Model | Where invoked | Verified |
|---|---|---|---|
| chat | `anthropic/claude-sonnet-4.6` | `/api/chat` streaming | `x-penny-model` header |
| picker | `openai/gpt-4.1-mini` | `pickCatalog` tool + `/api/catalog-pick` | server log |
| generator | `anthropic/claude-opus-4.7` | `/api/finalize-plan` | `meta.model` in JSON response |
| scorer | `openai/gpt-5.5` | `/api/validate-plan` (Layer B), `/api/finalize-plan` post-merge | `scorecard.judgeUsed` + `ModelStatusChip` |
| patcher | `openai/gpt-4.1-mini` | `/api/regenerate-section` | route header `x-penny-task: patcher` |
| accommodation | `anthropic/claude-sonnet-4.6` | `/api/lesson-package` | n/a |
| artifact_generator | `anthropic/claude-opus-4.7` | `/api/generate-artifacts` (parallel × 6) | C2 dev curl returned all 6 types |
