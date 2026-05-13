---
name: penny-top-tier-overhaul
overview: Phased overhaul that fixes Penny's conversation/finalize correctness bugs, moves the system prompt from Poe into the versioned repo, ingests the Zeno LX content engine (scaffolds, accommodations rules, exit-slip archetypes, instructional models, DOK lexicon, bilingual glossary, misconception patterns, research citations, representation tags) as typed catalogs Penny selects from, scores every output against the EQuIP+UDL rubric, and trims dependency/perf/test debt.
todos:
  - id: p0-prompt-injection
    content: Inject PENNY_SYSTEM_PROMPT.md server-side in /api/chat with PROMPT_VERSION + response header; pass currentPlan through
    status: pending
  - id: p0-phase-machine
    content: Refactor ConversationPhase to gathering -> text_selection -> preview -> drafting -> complete; wire isWaitingForTextSelection; gate Finalize to preview
    status: pending
  - id: p0-finalize-validation
    content: Make handleSendMessage return {ok, plan, errors}; only advance to complete when Zod validation + EQuIP rubric pass; auto-retry on failure with structured violation list
    status: pending
  - id: p0-zod-schema
    content: Add src/lib/lessonPlanSchema.ts (Zod) enforcing 5-phase manifest, 3 texts, embedded accommodations, success criteria alignment, rubric 0-3, exit slip DOK alignment, standard regex
    status: pending
  - id: p1-ingest-catalog
    content: Add scripts/build-catalog.ts that normalizes ALL Zeno LX CSVs into typed JSON in src/data/catalog/ (resources, scaffolds_by_subject, accommodations_rules, exit_slip_archetypes, dok_lexicon, instructional_models, opener_templates, misconception_patterns, bilingual_glossary, research_citations, representation_tags, lesson_phase_manifest, equip_udl_rubric)
    status: pending
  - id: p1-instructional-model-step
    content: Add new conversation step where Penny selects an instructional model (Explicit/5E/PBL/Cooperative/Socratic/Workshop/Flipped) before drafting phases; phase descriptions inherit from instructional_models.csv
    status: completed
  - id: p1-catalog-injector
    content: Add src/lib/catalog/ with selectTexts/selectScaffolds/selectExitSlip/selectOpener/selectMisconceptions; inject filtered candidate IDs into system prompt; resolve IDs server-side and rewrite assistant output
    status: pending
  - id: p1-accommodations-engine
    content: Add src/lib/accommodations.ts that evaluates applies_when expressions against a learner-needs vector and emits accommodations bound to phase_scope + slot_targets; replaces flat supports.{all,el,iep504}
    status: pending
  - id: p1-needs-collection
    content: Extend gathering phase with a learner-needs questionnaire (IEP/504, ML level, attention/anxiety/organization tags, home language) so the rules engine has inputs
    status: completed
  - id: p1-explicit-dok-standards
    content: Type DOK as first-class on each objective + procedure step; type standard as {framework, code, description}; validate verbs against dok_lexicon and codes against bundled standards
    status: pending
  - id: p1-render-student-materials
    content: Persist studentMaterials to the existing Zustand slot; render content-specific organizers, scaffolds from bank, bilingual glossary page, misconception alerts, citation footnotes
    status: completed
  - id: p1-representation-csp-enum
    content: Type representationTags + cspTags as enums sourced from representation_tags.csv; surface as filter chips in text selection and as colored pills in equity notes
    status: pending
  - id: p2-equip-rubric-scorer
    content: Implement automatic EQuIP+UDL rubric scoring (0-3 across 6 dimensions) on every finalized plan; require average >= 2.5 with no zeros to mark complete; show scorecard in UI
    status: pending
  - id: p2-section-regenerate
    content: Add hover affordance on each plan section to request a structured JSON patch from Penny; validate the patch against the schema before applying
    status: pending
  - id: p2-telemetry
    content: Add src/lib/telemetry.ts logging promptVersion, phase transitions, validation failures, retries, EQuIP score, finalize timing
    status: pending
  - id: p2-print-extras
    content: Add answer key page, per-phase pacing strip, citationAPA-driven sources page, and bilingual glossary page to the printable packet
    status: pending
  - id: p3-streaming-perf
    content: Throttle streaming via rAF batching; memoize chat bubbles; debounce + slim Zustand persistence; conversation summarization at N>20
    status: pending
  - id: p3-deps-cleanup
    content: Remove Vite, vite.config.ts, index.html, and unused packages (MUI, react-router, react-dnd, react-slick, embla, recharts, react-day-picker, etc.) after depcheck audit
    status: pending
  - id: p3-tests-ci
    content: Add Vitest + tests for schema, parser, catalog selectors, accommodations rules, route, phase machine, finalize success/failure, EQuIP scorer; wire npm test + GitHub Actions
    status: pending
isProject: false
---

# Make Penny Pedagogy top-tier

The build is well-shaped (Next 14, Zustand, react-to-print, streaming SSE) but its instructional core is leaking in three places: the conversation flow doesn't enforce the prompt's contract, the pedagogy lives only on the Poe bot, and the source recommendations are invented prose. The good news: you have a complete sister-product content engine (Zeno LX) sitting in `~/Desktop/TECH_CONTENT_FILES/EDTECH_ Contents for Product Builds_sources/` that turns this from "make Penny better" into "wire the Zeno LX engine into the Penny chat surface." That's the plan.

## Recommendation: take the prompt out of Poe

Inject `PENNY_SYSTEM_PROMPT.md` from the repo on every `/api/chat` call. Stamp `PROMPT_VERSION`, log it with every request, surface as `x-penny-prompt-version` response header, and append a compact JSON snapshot of the current plan + the filtered candidate IDs from the catalogs as a developer message. Repo becomes the source of truth, edits ship through PRs, manual sync goes away.

## What we're ingesting from Zeno LX

| File | What it becomes | What it unlocks |
|---|---|---|
| `resourcebank_v1.csv` | `catalog/resources.json` | Real text/sim/video selection (333 OER rows, TASL, license, captions/transcript flags) |
| `scaffolds_{ela,math,science,sel,social_studies}.csv` | `catalog/scaffolds_by_subject/*.json` | Per-phase scaffold IDs with `when_not_to_use`, fade plans, formative checks, UDL/HLP tags |
| `accommodations_rules.csv` + `accommodations_evidence.csv` + `accommodations_artifacts.csv` | `catalog/accommodations.json` (rules engine) | Conditional accommodations bound to `phase_scope` + `slot_targets`, traceable to evidence |
| `exit_slip_archetypes.csv` | `catalog/exit_slips.json` | DOK-aligned exit slip with `probe` (anticipated misconception) + `criteria_0_3` |
| `dok_lexicon.csv` | `catalog/dok_lexicon.json` | Verb-level DOK validation per subject |
| `instructional_models.csv` | `catalog/instructional_models.json` | 7 models × 5 phases with teacher moves and resources |
| `opener_templates.csv` | `catalog/openers.json` | Hook + prior-knowledge probe + learning-intention stem |
| `misconception_patterns.csv` | `catalog/misconceptions.json` | Anticipated student errors per standard with probes |
| `bilingual_glossary.csv` | `catalog/bilingual_glossary.json` | Term-level translations with pedagogical defs |
| `research_citations.csv` | `catalog/citations.json` | `citation_id` → APA/MLA-ready entries; every claim links here |
| `representation_tags.csv` | `catalog/representation_tags.json` | Canonical `rtag.*` enum (identity / language / pedagogy / media / context) |
| `lesson_phase_manifest.csv` | `catalog/lesson_phases.json` | Authoritative 5-phase schema (`launch / model / guided_practice / independent_practice / exit_slip`) with text slots and timing |
| `lesson_quality_rubric_equip_udl.md` | `catalog/equip_udl_rubric.json` | The 6-dimension 0-3 quality scorecard we run after finalize |
| `qa_checks.csv` | `catalog/qa_checks.json` | Validation rules (citation completeness, AI rewording fidelity, etc.) |
| `*.docx.md` (24 artifacts) | `catalog/printable_artifacts.json` | Pre-authored printables (CER organizer, choice board, task cards, ...) referenced by ID in the packet |

## Architecture after the work

```mermaid
flowchart TD
  user[Teacher] --> page[app/page.tsx]
  page --> phase{Phase Machine}
  phase --> gather[gathering: needs vector]
  phase --> texts[text_selection: 3 candidates]
  phase --> model[instructional_model]
  phase --> preview[preview]
  phase --> draft[drafting]
  phase --> done[complete]
  page --> api[/api/chat]
  api --> sysprompt[PENNY_SYSTEM_PROMPT + PROMPT_VERSION]
  api --> selectors[catalog selectors]
  selectors --> resources[resources]
  selectors --> scaffolds[scaffolds]
  selectors --> exits[exit_slips]
  selectors --> openers[openers]
  selectors --> misc[misconceptions]
  selectors --> mod[instructional_models]
  api --> rules[accommodations rules engine]
  rules --> needs[learner needs vector]
  api --> poe[Poe base model]
  poe --> resolver[ID -> catalog row resolver]
  resolver --> validator[Zod schema + EQuIP rubric scorer]
  validator -->|valid + score >= 2.5| store[Zustand store]
  validator -->|invalid or score < 2.5| retry[Auto-retry with violation list]
  store --> lesson[LessonPlan.tsx]
  store --> packet[Student packet w/ resolved scaffolds, glossary, exit slip, citations]
```

---

## P0 — Correctness & conversation integrity (one pass, blocking everything else)

**Goal:** the app behaves the way `PENNY_SYSTEM_PROMPT.md` claims it does.

1. **Server-side prompt injection.** Read `PENNY_SYSTEM_PROMPT.md` at module init in [app/api/chat/route.ts](app/api/chat/route.ts), prepend as `role: 'system'`, add `const PROMPT_VERSION = '2026.05.10-1'`, log it, and return as response header. Stop ignoring `currentPlan` — append it to the system message as a compact JSON snapshot so Penny edits the live draft.
2. **Phase machine.** Replace `ConversationPhase` in [src/types/index.ts](src/types/index.ts#L8) with `'gathering' | 'text_selection' | 'instructional_model' | 'preview' | 'drafting' | 'complete'`. Wire `isWaitingForTextSelection` ([src/lib/lessonPlanParser.ts](src/lib/lessonPlanParser.ts#L467) — currently dead) into [app/page.tsx](app/page.tsx). Move state transitions into a single `src/lib/phaseMachine.ts` so they're testable.
3. **Phase-gated Finalize.** `canFinalize` requires `phase === 'preview'`, not `'drafting'` ([app/page.tsx](app/page.tsx#L320)). Disabled-button tooltip explains what's missing.
4. **`handleSendMessage` returns `{ ok, plan?, errors? }`.** Today errors get swallowed ([app/page.tsx](app/page.tsx#L136-L149)) and `handleFinalize` advances to `complete` regardless ([app/page.tsx](app/page.tsx#L205-L207)). Only set `complete` when Zod validation **and** the EQuIP rubric scorer pass.
5. **Zod schema** in `src/lib/lessonPlanSchema.ts`:
   - `instructionalModel` ∈ enum from `instructional_models.csv`.
   - `textOptions.length === 3` before selection, exactly one `selected: true` after.
   - `procedure` matches the 5 manifest phases by name + order.
   - Each phase has `accommodationIds: string[]` with `length >= 1` (embedded, resolved server-side from the rules engine).
   - Each phase has `scaffoldIds: string[]` resolvable in the scaffold catalog.
   - `successCriteria.length >= objectives.length`; each objective and each procedure step has explicit `dok: 1|2|3|4`; verb appears in `dok_lexicon.csv` for that subject + level.
   - `rubric.length === 4` (scores 0–3).
   - `exitSlipId` resolves in the archetype catalog and matches the highest-DOK objective.
   - `standard.framework` ∈ `'CCSS'|'NGSS'|'C3'|'state'`; `standard.code` matches framework regex.
   - Every `evidenceCitationKey` resolves in `citations.json`.
6. **Auto-retry on validation failure.** If validation or EQuIP scoring fails, send Penny the structured violation list and ask for a corrected JSON only (no prose). Cap at 2 retries; after that surface a teacher-facing repair dialog.

## P1 — Wire in the Zeno LX engine

**Goal:** Penny picks from typed catalogs, never invents links, and produces lesson plans backed by evidence.

1. **`scripts/build-catalog.ts`.** Reads every CSV in `~/Desktop/TECH_CONTENT_FILES/EDTECH_ Contents for Product Builds_sources/` (or a `catalog-sources/` symlinked dir we create) and emits typed JSON under `src/data/catalog/`. One normalizer per CSV. Backfills the resource bank with `gradeBand`, `lexile`, and `representationTags` via heuristic + a manual `catalog-overrides.json`. Run on `prebuild` and on demand via `npm run catalog:build`.
2. **Catalog query API** — `src/lib/catalog/`:
   - `selectTexts({subject, gradeBand, lexile, learnerNeeds, topic})` → top 3 resources.
   - `selectInstructionalModel({subject, dokTarget, classProfile})` → ranked models with rationale.
   - `selectOpener({subject, topic, dokFloor})` → opener template.
   - `selectScaffoldsForPhase({phase, subject, scaffoldType, learnerNeeds, when_not_to_use_filter})` → scaffold IDs.
   - `selectExitSlip({subject, standardKeyword, dok})` → exit-slip archetype.
   - `selectMisconceptions({subject, standardKeyword})` → patterns to anticipate.
   - `selectGlossary({topic, languages})` → bilingual term list.
   - The `/api/chat` route prepends a "Available IDs" block (≤30 candidate IDs across all selectors, scoped by gathered context) into the system message. Penny picks IDs only. Server resolves IDs to full rows and rewrites the assistant message before streaming the final structured JSON.
3. **Instructional-model selection step.** New phase between text selection and preview. Penny presents 2–3 model candidates with rationale (e.g., "PBL fits because your topic is contemporary civic engagement and you want DOK 4 transfer; Workshop fits if you need sustained writing time"). Selecting a model populates the 5 phases' baseline teacher moves from `instructional_models.csv`.
4. **Accommodations rules engine** — `src/lib/accommodations.ts`:
   - Input: learner-needs vector (`{iep: bool, plan_504: bool, ml_level: 1-5, needs_tags: string[], el_only_languages: string[]}`).
   - Evaluates each rule's `applies_when` expression (lightweight DSL: `==`, `contains`, `AND`, `OR`).
   - Returns accommodations grouped by `phase_scope` and `slot_targets`, each with resolved `default_parameters`, `teacher_prompt`, `student_microcopy`, and `udl_hlp_tags`.
   - Replaces flat `supports.{all, el, iep504}` in [src/types/index.ts](src/types/index.ts#L23-L27) — the schema now stores `accommodationIds` per phase + a `learnerProfile` snapshot.
5. **Learner-needs questionnaire** in the gathering phase. A short structured form (with sensible defaults) collects what the rules engine needs. Stored in the store; sent in the system prompt as JSON.
6. **DOK + standards as first-class types.** Replace the keyword heuristic in [src/app/components/LessonPlan.tsx](src/app/components/LessonPlan.tsx#L19-L33) with `objective.dok` field validated against `dok_lexicon.json`. Type `standard` as `{ framework, code, description }`; bundle a starter `catalog/standards.json` (CCSS ELA + NGSS HS) so the schema can resolve descriptions.
7. **Persist `studentMaterials`** to the existing Zustand slot ([src/store/useStore.ts](src/store/useStore.ts#L11)) — currently `extractStudentMaterials` is called and the result is dropped ([app/page.tsx](app/page.tsx#L126-L129)). Render:
   - Content-specific graphic organizers (replace generic 4-quadrant box at [src/app/components/LessonPlan.tsx](src/app/components/LessonPlan.tsx#L462-L479)).
   - Sentence-frame page populated from `scaffolds_by_subject` (replace 4 hardcoded fallbacks at [src/app/components/LessonPlan.tsx](src/app/components/LessonPlan.tsx#L501-L519)).
   - Bilingual glossary page (currently the type allows `bilingualGlossary` at [src/types/index.ts](src/types/index.ts#L70) but nothing renders it).
   - Misconception alerts in the teacher-facing margin (anticipated errors + probes).
   - Citation footnotes — every pedagogical claim resolved via `citations.json`.
8. **Representation + CSP tags as enums.** Sourced from `representation_tags.csv`. Surface as filter chips in text selection and as colored pills in the equity notes section.
9. **Pre-authored printable artifacts.** Reference `.docx` artifact IDs in the lesson schema (`requiredArtifacts: artifactId[]`). For now the print packet shows artifact name + brief description + "Provided as separate handout"; we can render them in P2+.

## P2 — Quality gate, telemetry, print package

1. **EQuIP+UDL rubric scorer** — `src/lib/qualityScorer.ts`. Implements the 6-dimension 0-3 rubric from `lesson_quality_rubric_equip_udl.md`. Mostly automatic checks (alignment via standard ↔ objective ↔ exit slip; HLP/UDL via tag presence; licensing via TASL field; assessment via exit slip elements). Pass threshold = avg ≥ 2.5 and no zeros. Scorecard renders inline in the lesson view; failed criteria queue auto-retry.
2. **Section-level "Regenerate."** Hover affordance on each section sends a JSON-patch request to Penny. Patch validates against the schema before applying.
3. **Telemetry.** `src/lib/telemetry.ts` (no PII): `{promptVersion, phaseTransitions, validationFailures, retriesUsed, equipScores, sectionsRegenerated, finalizeMs}`. Endpoint: simple POST to a Vercel KV / `/api/telemetry`.
4. **Print package extras:** answer key page, per-phase pacing strip (`5 min · I do · ...`), citation-correct sources page using `citationAPA`, bilingual glossary page, misconception margin notes.

## P3 — Performance, cleanup, tests

1. **Throttle streaming updates** to ~60ms via rAF batching in [app/page.tsx](app/page.tsx#L97-L103); update Zustand once per frame.
2. **Slim persistence.** [src/store/useStore.ts](src/store/useStore.ts#L86-L95): cap persisted messages at last 30, debounce writes 500ms, persist lesson/materials separately from chat churn.
3. **Memoize chat bubbles.** `React.memo` keyed on `id + content.length`.
4. **Conversation summarization** at N>20 messages.
5. **Dependency cleanup.** Remove Vite + `@vitejs/plugin-react` + `@tailwindcss/vite` + `dev:vite` script + `vite.config.ts` + `index.html`. Run `depcheck`; remove MUI, react-router (both), react-dnd + html5-backend, react-slick, embla, recharts, react-day-picker, react-resizable-panels, react-responsive-masonry, vaul, input-otp, cmdk, and unused Radix packages.
6. **Vitest** with tests for:
   - `lessonPlanSchema` — well-formed accept; each violation class rejected.
   - `lessonPlanParser` — JSON-tagged + fenced + markdown-only fixtures; `isWaitingForTextSelection` matrix.
   - `catalog/*` selectors — return only valid IDs, respect filters, never return inactive rows.
   - `accommodations` rules engine — each `applies_when` clause evaluates correctly.
   - `qualityScorer` — known good/bad lessons score as expected.
   - `phaseMachine` — gathering → text_selection → instructional_model → preview → drafting → complete.
   - `route` — system prompt injected; `currentPlan` reaches model; version header set.
   - `finalize` — failed validation does not advance; success does.
7. **CI.** `npm test` script + GitHub Actions workflow.

## File-tree preview after P1

```
src/
  data/
    catalog/
      resources.json
      scaffolds_by_subject/{ela,math,science,sel,social_studies}.json
      accommodations.json
      exit_slips.json
      dok_lexicon.json
      instructional_models.json
      openers.json
      misconceptions.json
      bilingual_glossary.json
      citations.json
      representation_tags.json
      lesson_phases.json
      equip_udl_rubric.json
      qa_checks.json
      printable_artifacts.json
      standards.json
      catalog-overrides.json   # manual backfills
  lib/
    catalog/
      index.ts
      selectTexts.ts
      selectInstructionalModel.ts
      selectOpener.ts
      selectScaffoldsForPhase.ts
      selectExitSlip.ts
      selectMisconceptions.ts
      selectGlossary.ts
    accommodations.ts
    phaseMachine.ts
    lessonPlanSchema.ts
    qualityScorer.ts
    telemetry.ts
    promptInjector.ts
scripts/
  build-catalog.ts
catalog-sources/             # symlink or copy of TECH_CONTENT_FILES
```

## What I still need from you

1. Permission to copy or symlink `~/Desktop/TECH_CONTENT_FILES/EDTECH_ Contents for Product Builds_sources/` into the repo as `catalog-sources/` (kept in `.gitignore`; `build-catalog.ts` reads from it). Or I can vendor a clean copy under `catalog-sources/` committed to the repo if you want it portable.
2. Confirm subject scope. Penny today targets 9–12 ELA-leaning lessons; the scaffolds carry 9–12 across ELA / Math / Science / SEL / Social Studies. I'll surface a subject picker — say "yes" to all 5 or narrow it.
3. Confirm we keep the Poe pipe (just stripped of system-prompt logic) vs swapping to direct Anthropic / OpenAI from `/api/chat`. Poe is fine; swapping is an hour's work later.

## Out of scope

- LMS export (Google Classroom / Canvas) — future.
- Pulling copyrighted text bodies into the print packet — still licensing-blocked; the placeholder page stays.
- Authoring a teacher account/login — future, but the telemetry endpoint is structured to plug into one.
