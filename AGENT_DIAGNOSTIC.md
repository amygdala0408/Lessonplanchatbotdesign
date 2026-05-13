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
