# Penny Pedagogy Lesson Plan Generator - Build Log

**Project:** Lessonplanchatbotdesign
**Last updated:** June 11, 2026 (Top-Tier Quality Restoration — all four documented quality plans implemented; live scored run blocked on gateway billing)
**Active branch:** `cursor/top-tier-overhaul-c88e`
**Latest commit:** `0c2b318` — docs: log generator pipeline live-verified at 2.83/3.0 EQuIP+UDL (restoration work is uncommitted on top)

---

## Overview

Penny Pedagogy is an equity-centered AI instructional design partner for high school educators (grades 9-12). The application started as a Vite/Poe build, migrated to Next.js with Poe, and is now a multi-LLM choreography on the Vercel AI Gateway (Claude Sonnet 4.6 / Opus 4.7, GPT-5.5, GPT-4.1-mini).

---

## ▶ Resume point — Top-Tier Quality Restoration (June 11, 2026; code complete, live scoring blocked on billing)

All four documented quality plans are now implemented in working tree (uncommitted). Static gates are fully green: **100/100 unit tests** (up from 63), `tsc --noEmit` clean, production `next build` clean (all 10 routes).

| Phase | Work | Status |
|-------|------|--------|
| 0 | Silent procedure-summarizer bug fix in `generate-artifacts` (read `step`/`description`/`durationMin/Max`, not the nonexistent `phase.steps[]`) | ✅ |
| 0 | Picker/chat navigation: `TextOptionPicker` + `InstructionalModelChooser` auto-collapse after lock-in, "show again" affordance | ✅ |
| 0 | Prompt-voice pass on `PENNY_SYSTEM_PROMPT.md` worked examples (flags listed in session log below) | ✅ |
| 1 | Pedagogical-grounding bridge, all 7 commits: widened `scaffoldDetails`/`accommodationDetails`/openers/exit slips in `CATALOG_CANDIDATES`, verbatim 6×4 rubric descriptors in the judge, `researchAnchors.ts` RESEARCH ANCHORS block, `SCAFFOLDS IN USE` block in the artifact lane, canonical UDL/HLP tag normalizer + `tag_dictionary.json` | ✅ |
| 2 | Artifacts-to-print bridge: all five Pipeline A artifacts render as print pages in `LessonPlan.tsx` (vocabulary preview, sentence stems, graphic organizer, discussion protocol, single-point rubric) with heuristic Pipeline B fallback; one-shot exit-ticket retry (temp +0.1 + corrective hint) | ✅ |
| 3 | Procedure `teacherMoves` (Option B): required six-field block (launch/duringWork/checkForUnderstanding/ifStuck/ifAhead/transition) in the generator schema, operator-notes contract, validator checks (thin fields + markdown = error; missing block / sparse quoted language = warning), deterministic `proceduralSpecificity` + judge-scored Implementation Recipe Clarity, 2-column print-safe micro-grid renderer, artifact-lane pass-through | ✅ |
| 4 | Curated content drafts (pending teacher voice review): `equip_udl_exemplars.json` (24 annotated score anchors, wired into judge), `teacher_language_exemplars.json` (81 scaffolds, wired into candidate block as `teacherLanguageExemplars`), `why_for_teacher.json` (99 accommodation rationales, wired as `whyForTeacher`) — all behind graceful fallbacks in `src/lib/curated/` | ✅ |
| — | **Live scored runs (baseline, bridge-verify, final acceptance)** | ⛔ **BLOCKED** — gateway key `vck_3ybT…` is free-tier: `anthropic/claude-sonnet-4.6` and `openai/gpt-5.5` return 403 "Free tier users do not have access to this model." Re-probed June 11 11:56 PM; unchanged. |

### To resume after credits top-up

1. `npm run dev`, run the May 15 acceptance prompt end-to-end (chat → picker → finalize → artifacts → print); confirm the 6 verification behaviors.
2. Run `scripts/artifacts-acceptance-prompt.mjs` — expect 6/6 artifacts (exit-ticket retry now in place) and text-specific print pages.
3. Record fresh EQuIP+UDL score — target ≥ 2.85 overall (prior baseline 2.83), ≥ 2/3 Implementation Recipe Clarity.
4. Review the three draft curated files in `src/data/curated/` for voice; they're clearly marked `"status": "draft"`.

---

## Session log — June 11, 2026 (Top-Tier Quality Restoration)

### What shipped (working tree, uncommitted)

- **Phase 0.** Artifact-summarizer bug fix (`summarizePlanForArtifacts` now reads the real `step`/`description`/`durationMin/Max` fields — every prior artifact ran with an empty PROCEDURE block). Picker auto-collapse + "show again" links for `TextOptionPicker` and `InstructionalModelChooser`, mirroring the `classProfileExpanded` pattern.
- **Phase 1 (bridge, 7 commits' worth).** `CATALOG_CANDIDATES` now ships curated CONTENT, not IDs: `scaffoldDetails` (teacherMoves/studentTasks/supports/fadePlan/whenNotToUse/formativeChecks/tags/evidence, 3 per phase), `accommodationDetails` (full teacherPrompt, evidence cite + URL, `appliesWhenReason`), openers with verbatim hook/probe/intention stems, exit slips with full 0-3 rubric prose. Verbatim 6×4 EQuIP+UDL descriptors inlined into the GPT-5.5 judge. New `src/lib/researchAnchors.ts` injects a top-5 RESEARCH ANCHORS block by framework + learner profile. `SCAFFOLDS IN USE` block in the artifact generator. Canonical tag normalizer (`scripts/catalog/normalizeTags.ts`) + `tag_dictionary.json` at catalog build. Budgets held: 18k generator / 12k chat, trimmed by relevance-ranked detail pops.
- **Phase 2 (print bridge).** `LessonPlan.tsx` accepts the Pipeline A artifact record; all five artifact print pages render text-specific content with per-artifact heuristic fallback (`LessonPlan.print-bridge.test.tsx`, 8 tests). One-shot exit-ticket retry on schema failure (temp +0.1 + corrective hint from the validator complaint).
- **Phase 3 (teacherMoves).** Required six-field recipe block on every generated procedure step; lenient intake schema keeps legacy plans valid. Validator: thin fields/markdown = error, missing block or <3 phases with quoted teacher language = warning. Scorer: deterministic `scoreProceduralSpecificity` (Layer A) + judge-scored Implementation Recipe Clarity, merged conservatively; low clarity surfaces as a finalize warning. Renderer: 2-column print-safe micro-grid under each step. Artifact lane sees the moves.
- **Phase 4 (curated drafts).** Three draft banks in `src/data/curated/` behind the graceful `src/lib/curated/` loader: 24 score-calibration exemplars (judge prompt), teacher-language exemplars for 81 scaffolds (candidate block, max 2 per scaffold), 99 `why_for_teacher` rationales (accommodation details). All keys validated against the catalogs.

### Verification

- `npx vitest run`: **100/100** across 11 files (was 63/63 at session start).
- `npx tsc --noEmit`: clean. `npx next build`: clean, all 10 routes.
- Live scored run: **blocked.** Gateway probe at 11:56 PM returned 403 ("Free tier users do not have access to this model") for `anthropic/claude-sonnet-4.6` and `openai/gpt-5.5`; `gpt-4.1-mini` is reachable. Needs a credits top-up on the Vercel AI Gateway account, then the resume steps above.

### Prompt-voice flags for your review (PENNY_SYSTEM_PROMPT.md — not changed)

1. **Default pronoun:** "You sit beside her" (line 4) and "render in the drawer beside her" (line 153) assume the teacher is a woman. Intentional voice choice or generalize?
2. **Closer:** the sign-off "Good lesson." (line 159) is clipped — confirm it sounds like the school, not like a bot.
3. **Factual claims inside worked examples:** the text-selection example asserts "Audio available; we can pre-teach four words" about *The Leap* and characterizes *Two Kinds* / *Marigolds* by rigor and stamina. These strings become Penny's stylistic anchor; confirm the claims are ones you'd stand behind, since the model will imitate the pattern of asserting text features.
4. **"Anxiety-aware partner pairing"** (finalize example) — compact coach-jargon; consider plainer phrasing if it doesn't match your voice.
5. **Pushback example** (lines 29-32) leans on "DOK 2 anchor that sets up tomorrow's transfer" — more jargon-dense than the "plain language" rule the same file sets.

---

## ▶ Resume point — Penny Pedagogy-First Rebuild (code complete, live verification pending)

The plan had 6 commits total. All six have landed. Live verification is the only step left, and it's gated on a quick prompt-voice review (see below).

| # | Title | Status | Commit |
|---|-------|--------|--------|
| 1 | Smoke-test AI Gateway model slugs | ✅ done (no-op) | — all 4 slugs returned 200 |
| 2 | Catalog curation — `kind` field + selector hygiene | ✅ done | `c023e1c` |
| 3 | Pedagogy-first system prompt + operator notes split | ✅ done | `05088b0` |
| 4 | Phase-machine guard + always-invoke `pickCatalog` | ✅ done | `f96c84a` |
| 5 | Reframe picker reasoning around teacher decision criteria | ✅ done | `3520975` |
| 6 | Surface generator transport errors into validation banner | ✅ done | `c95fedb` |
| — | Live verification (acceptance prompt browser test) | ⏳ pending prompt review | run all 6 verification behaviors end-to-end |

**Static gates green after Commits 4–6:** `npx tsc --noEmit` clean, **63/63** unit tests pass (8 new phase-machine tests).

### Two queued tasks for tomorrow's session

1. **Prompt-voice review** of `PENNY_SYSTEM_PROMPT.md` (see below) before live UI verification.
2. **Chat / picker panel navigation fix.** Surfaced during tonight's live-server check: the right-side column stacks the class profile, the text-option picker, and the instructional-model chooser ABOVE the chat scroll area, and none of those panes collapse after the teacher is done with them. The chat window ends up as a small scroll viewport even though there's empty space below; there's no clear affordance to minimize a picker after a pick is locked in. Likely fix touches `app/page.tsx` (already has a `classProfileExpanded` state that auto-collapses past `gathering` — extend that pattern to `TextOptionPicker` and `InstructionalModelChooser`, plus add a "Show picker again" link in the preview drawer for the rare case a teacher wants to re-open). Will solve together tomorrow before the acceptance-prompt walk-through.

### Four future-build plans documented (May 16) — no code changes yet

These are written down now so any commits between today and their build window
stay forward-compatible. All four are explicitly **not** implemented yet.

1. **Procedure-detail enhancement** (`docs/plans/procedure-detail-enhancement.plan.md`).
   Recommended Option B: add a structured `teacherMoves` block to each
   procedure phase (launch / duringWork / checkForUnderstanding / ifStuck /
   ifAhead / transition), update prompt + validator + scorer + renderer,
   target ≥ 2/3 on a new *Implementation Recipe Clarity* judge dimension.
   Lift ~1.5 days. Builds AFTER the picker-navigation fix, the
   accommodations-artifact bridge, AND the pedagogical-grounding bridge.

2. **Accommodations-artifact bridge** (`docs/accommodations-artifacts-audit.md`).
   The Opus 4.7 artifact-generator lane is already shipping six high-quality,
   text-specific artifacts (graphic organizer, sentence stems, exit ticket,
   vocabulary preview, discussion protocol, single-point rubric) into
   `<ArtifactsPanel>` — but they never reach the print bundle, which is what
   evaluators actually scored. The fix is to extend `LessonPlan.tsx` to
   render Pipeline A artifacts in the printable pages, with the existing
   heuristic Pipeline B pack as fallback. Sample run for the May 15
   acceptance prompt is saved at `scripts/sample-outputs/artifacts-the-leap.json`
   (5 of 6 artifacts succeeded in ~34s; the exit-ticket schema validation
   needs a one-shot retry — Gap #3 in the audit doc).

3. **Pedagogical-grounding bridge** (`docs/plans/pedagogical-grounding-bridge.plan.md`).
   Addresses the discovery that today's `CATALOG_CANDIDATES` strips the
   curated catalog down to IDs + 1-2 fields, forcing the LLMs to improvise
   pedagogical depth from pretraining instead of drawing from the
   `scaffolds_{subject}` `teacher_moves` / `student_tasks` / `supports_list`,
   the EQuIP+UDL rubric descriptors, and `research_citations.json`. Plan
   defines 7 commits that widen the candidate block, ship the rubric
   descriptors to the GPT-5.5 judge, inject a `RESEARCH ANCHORS` block per
   generation, bridge scaffolds into the artifact generator, and normalize
   UDL/HLP/CSP tag codes. Token budgets and tests defined per commit.
   Expected scoring lift: ~2.83 → ~3.00 on EQuIP+UDL Layer B. Lift ~2 days.

4. **Research-content additions** (`docs/plans/research-content-additions.plan.md`).
   Companion to the bridge plan. Identifies (a) tagging structure
   refinements that should land with the bridge (canonical UDL/HLP/CSP
   codes, `evidence_citation_keys` on accommodations, `appliesWhen`
   rationale strings) and (b) ranked-by-ROI list of NEW curated content
   the user could author to push generations to genuine top-tier. Top
   recommendations: EQuIP+UDL exemplar bank (~12h), `teacher_language_exemplars`
   field on scaffolds (~13h for top 80), anchor lessons exemplar set
   (~60h for 20 anchor lessons) — together ~85h of authoring time =
   permanent, transformational quality lift that no competing product
   would match.

**Revised sequencing recommendation:**
(1) picker-navigation fix + live UI verification →
(2) pedagogical-grounding bridge (commits 1–7; raises baseline scoring
   and unlocks downstream depth) →
(3) accommodations-artifact bridge to print (visible unblocker on
   evaluator scores) →
(4) procedure-detail enhancement (raises implementation-recipe clarity,
   benefits from the bridge being in place first).

Optional content authoring (research-content additions plan) runs in
parallel — none of it blocks shipping; all of it amplifies the bridge.

### Tonight's static + generator verification (no UI run)

Production build is clean. All 10 routes compiled, `npm test` 63/63 green, `tsc --noEmit` clean. The generator + scorer pipeline was exercised end-to-end via `scripts/finalize-acceptance-prompt.mjs` against the live server, seeded with the acceptance-prompt context. Result: Opus 4.7 produced a complete *The Leap* / Workshop Model lesson plan in 80.9s; EQuIP+UDL Layer A + Layer B (GPT-5.5 judge) scored it **2.83 / 3.00 — PASSED**, with 5/6 dimensions at 3/3 and `materials_licensing` at 2/3 (artifact of the test harness — no URL was passed for the seed text; live UI carries the catalog URL through). Two non-blocking DOK-lexicon warnings (`cite`, `distinguish` not in lexicon). The chat + picker + phase-machine pipeline (Commits 4 and 5) was NOT exercised tonight; that's what tomorrow's UI run covers.

### Read PENNY_SYSTEM_PROMPT.md before kicking off live verification

Commit 3 was landed without a teacher-voice review. Before the live run, read `PENNY_SYSTEM_PROMPT.md` (159 lines) end-to-end — especially the **three worked examples** (lines ~79–118):

- First-turn topic-confirm response
- Text-selection lead-with-why pattern
- Finalize confirmation summary

Flag anything that doesn't sound like the school's voice (cadence, vocabulary, the specific texts named in the example, the "rigor without access is gatekeeping" anchor framing). Easy to revise — these strings become the model's stylistic anchor for every conversation.

---

## Session log — May 13, 2026 (late-night)

### Goal
Implement the 6-commit pedagogy-first rebuild defined in `.cursor/plans/penny_pedagogy-first_rebuild_a608bd3b.plan.md`. The plan was written after a Square One Audit revealed Penny's overhaul (commit `dc8bec5`) regressed live behavior despite passing all 55 unit tests + clean TypeScript build. Specific symptoms: text options returned as resource collections instead of single readings, off-subject leaks, internal vocabulary ("catalog," "the app") bleeding into chat, no end-to-end lesson plan produced.

### Commit 1 — Smoke-test gateway model slugs (no-op)
Curled each of the four production slugs with a 5-token request against `https://ai-gateway.vercel.sh/v1/chat/completions`:

| Slug | HTTP | Notes |
|------|------|-------|
| `anthropic/claude-sonnet-4.6` | 200 | Live |
| `anthropic/claude-opus-4.7` | 200 | Live |
| `openai/gpt-5.5` | 200 | Live (OpenAI requires `max_tokens >= 16`; initial smoke at 5 failed gateway-level validation, not routing) |
| `openai/gpt-4.1-mini` | 200 | Live (same caveat) |

All four routable. No revert needed. No code change committed.

### Commit 2 — Catalog curation (`c023e1c`)
**Problem.** `resources.json` had 333 rows mixing single student readings (e.g., "The Leap by Louise Erdrich"), browseable libraries ("CommonLit: Free Reading Passages Library"), and teacher-PD hubs (IRIS Center, NCII), all carrying `audience: "student"` indiscriminately. The picker had no way to tell them apart.

**Solution: data-model lane separation, not just a filter.**
- Added `kind: 'student_reading' | 'collection' | 'teacher_reference' | 'interactive'` to `ResourceRecord` in `src/lib/catalog/types.ts`.
- Added `inferResourceKind()` in `src/lib/catalog/audience.ts` with three pattern groups (collection, teacher_reference, interactive); evaluated at build time alongside the existing `inferResourceAudience`. Title-only patterns are kept separate from haystack patterns so end-anchored matches like `\bresources?\s*$` don't misfire on URL/accessibility tails.
- Wired into `scripts/build-catalog.ts`: collections + teacher_reference rows are force-flipped to `audience: 'teacher'` so the picker can't accidentally surface them via the audience filter either.
- Updated `src/lib/catalog/selectors.ts` `selectTexts()`: primary gate is now `kind === 'student_reading'`; removed the `subjectTags.includes('all')` wildcard bypass in both the +4 subject boost and the -5 off-subject penalty.
- Added defense-in-depth patterns to legacy `TEACHER_PD_PATTERNS` (anthology, database, archive) in case a future row escapes the kind classifier.

**Result of `npm run catalog:build`:**
- 333 rows reclassified: **138 student_reading / 106 collection / 49 teacher_reference / 40 interactive** (0 warnings).
- Picker pool after both filters: **104 specific student readings** (9 ELA, 18 math, 26 science, 46 social-studies).
- All 10 named "Collection/Library/Anthology" rows from the plan correctly flipped to `kind: collection, audience: teacher` and excluded from picker results.

Verification: 55/55 tests pass; `tsc --noEmit` clean.

### Commit 3 — Pedagogy-first prompt + operator notes split (`05088b0`)
**Problem.** Old `PENNY_SYSTEM_PROMPT.md` (~400 lines) mixed identity, voice, phase machine, JSON schema, catalog contract, and retry protocol in one file. Sonnet 4.6 read it as an API spec and behaved like one.

**Solution: two-file structure injected as two separate system messages.**

**`PENNY_SYSTEM_PROMPT.md` (159 lines, teacher-facing pedagogy only):**
1. Identity & belief — Dr. Childs's "rigor without access is gatekeeping; access without rigor is abandonment," anchored in UDL, HLPs, CSP.
2. How she talks — one question per turn, plain language, no re-interrogation, never fabricate.
3. How she partners — listen for the whole opening move, ask about unit context before texts, recommend rather than enumerate, commit and close.
4. Three worked examples — first turn (with topic-confirm), text-selection turn (lead with the choice + why), finalize confirmation (tight 4-bullet summary).
5. What she never says — explicit internal-vocabulary guardrail (`catalog`, `CATALOG_CANDIDATES`, `pickCatalog`, `the app`, `the gateway`, machine-block tags, etc.).

**`PENNY_OPERATOR_NOTES.md` (242 lines, machine-facing only):**
- Phase machine semantics, catalog rules with the hard "single specific readings only" prohibition, `pickCatalog` workflow, quick-reply chip schema + canonical sets, `[TEXT_OPTIONS]` handling, finalize schema with all hard validation rules, re-emission contract.

**`src/lib/promptInjector.ts`:**
- Now reads both files, caches both, version-stamps a SHA-256 of the concatenation (`2026.05.13-<hash>`).
- Injects the pedagogy prompt first as the model's identity/voice context, then operator notes as a separate system message before the plan/learner/catalog payloads.

Verification: 55/55 tests pass; `tsc --noEmit` clean. Live verification deferred to post-Commit 4.

---

## Session log — May 15, 2026 (Commits 4–6)

### Commit 4 — Phase-machine guard + always-invoke `pickCatalog` (`f96c84a`)
**Two coupled mechanics so Penny can't race subject+grade+duration → texts in one turn.**

- **`src/lib/phaseMachine.ts`** — added `messages?` to `PhaseContext` and a `hasUnitContextBeat(messages)` heuristic. When `current === 'gathering'` and the turn presents text options, the machine refuses to transition to `text_selection` unless a prior Penny turn (a) ends with `?`, (b) mentions unit-context vocabulary (`hook | mid-unit | transfer | assessment day | where this lands | earlier/later in the unit | new unit | deepening`), and (c) was followed by a teacher reply before the text-options turn. When the guard fires, phase stays at `gathering` (Finalize stays gated) and a toast names the regression. Permissive default when `messages` is omitted so legacy callers don't break.
- **`app/page.tsx`** — pass the conversation history (user history + current assistant `visibleContent`) to `nextPhase`.
- **`PENNY_OPERATOR_NOTES.md`** — lifted the two non-negotiables ("confirm unit context before texts" + "always invoke `pickCatalog` before any text decision") into a new section above the phase machine. The pickCatalog workflow section now lists which decisions trigger the tool, plus a one-line rejection of "I'll just suggest one from memory" as an excuse to skip it.
- **`src/lib/phaseMachine.test.ts`** — new file. 8 tests: guard blocks the premature jump, allows the transition after a topic-confirm beat (`?` + unit-context vocab + teacher reply), recognizes "where this lesson lands in the unit" phrasing, doesn't block when phase is past gathering, falls through permissively when `messages` is omitted, plus regression coverage on the existing transitions.

### Commit 5 — Picker reframe (`3520975`)
**`src/lib/llm/pickCatalog.ts`** — rewrote `DECISION_PROMPTS.text` and the rules block in `buildTextPickerPrompt`.

Old prompt read as a content-filter checklist (audience=student, diversity-across-axes). New prompt names the four teacher decision criteria in order: **(1) rigor** — does the text carry the standard's cognitive demand; **(2) access** — can the readers in *this* room actually engage with it (using the live learner profile, not as background); **(3) representation** — whose perspective is centered as expert; **(4) classroom variety** — meaningful choice, not three near-clones. The lead pick is the one Penny would recommend; the rationale anchors on that pick's fit.

Collection prohibition is now an explicit **ABSOLUTE PROHIBITION** block with an enumerated disqualifier list (library / anthology / hub / archive / database / collection / curated set / framework / standards doc / PD reading / practice guide / teacher-reference site / platform homepage). The schema-conflict case (fewer than three single readings in candidates) is handled honestly — pick three, set `confidence: "low"`, let the rationale flag the thinness — never smuggle a collection into the third slot. Existing audience-filtering test still passes.

### Commit 6 — Surface generator transport errors (`c95fedb`)
**`app/api/finalize-plan/route.ts`** — after the two-attempt generator loop, when `!generated && lastModelError`, prepend a top-level `ValidationError` (path `<root>`, severity `error`, message `Lesson generator transport failure: <message>`) to `validation.errors`. The client's existing "Quality gate flagged issues" banner renders it verbatim. Closes the silent-failure gap where gateway 404s / schema-parse failures / rate-limits left the teacher staring at an empty banner with only a toast.

---

## How to resume — live verification

1. **First**, re-read `PENNY_SYSTEM_PROMPT.md` (159 lines), focusing on the three worked examples (~lines 79–118). Flag any vocabulary, cadence, or anchor framing that doesn't match the school's voice — these strings shape every conversation. Easy to revise before live verification.
2. Start the dev server (`npm run dev`) and confirm `AI_GATEWAY_API_KEY` is set in `.env.local`.
3. Run the acceptance prompt in the browser end-to-end:
   > *"9th grade ELA, CCSS.ELA-LITERACY.RL.9-10.1, 60 minutes. 28 students, 3 ELs at WIDA 3, 2 IEPs (anxiety + organization + reading)."*
4. Confirm all 6 verification behaviors:
   - **Unit-context turn first.** Penny mirrors the opening, then asks one short question about hook / mid-unit / transfer before any text options. (Phase guard catches regressions: if Penny jumps to texts, conversation pins at `gathering` and the "Penny jumped ahead" toast fires.)
   - **Three specific student readings**, not collections / libraries / anthologies. Picker returns three `kind: 'student_reading'` candidates with `audience: 'student'`.
   - **No internal vocabulary** in Penny's prose (`catalog`, `pickCatalog`, `the app`, `the gateway`, bracket tags, etc. — guarded by the prompt's "what you never say" section).
   - **Picker click advances phase** from `text_selection` → `instructional_model`.
   - **Model click enables Finalize** (advances to `preview`).
   - **Finalize produces complete drawer**: 5 procedure phases in canonical order, embedded accommodations on every step, rubric (4 rows, scores 0–3), DOK-aligned exit slip, supports populated. Any transport failure now surfaces as a concrete banner message instead of empty UI.

---

## Build Sessions Summary

### Session 1-3: Foundation & Migration
- **Framework Migration:** Vite → Next.js 14 with App Router
- **API Integration:** Poe API (OpenAI-compatible endpoint) with streaming SSE
- **State Management:** Zustand with localStorage persistence
- **Styling:** Tailwind CSS v3 with custom vintage/modern aesthetic

### Session 4: Bug Fixes & Enhancements
- **Fixed:** JSON parsing error from corrupted Next.js cache
- **Fixed:** Hyperlinks not clickable in chat (added react-markdown)
- **Fixed:** Lorem ipsum placeholder text replaced with dynamic content
- **Fixed:** PDF print cutoffs (added CSS page breaks)
- **Fixed:** `msg.timestamp.toLocaleTimeString` error (timestamp serialization)
- **Fixed:** Hyperlinks not clickable in LessonPlan view
- **Added:** QR codes for text sources (qrcode.react)

### Session 5: Layout & Usability Improvements
- **Improved:** Procedure section formatting with FormattedText helper
- **Added:** "How to Use This Lesson Pack" reference page
- **Added:** Reading Passage placeholder page for teachers
- **Added:** Penny Pedagogy avatar image

---

## Technical Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| State | Zustand + localStorage |
| AI Backend | Poe API (Claude Sonnet 4.5) |
| Markdown | react-markdown |
| QR Codes | qrcode.react |
| Icons | Lucide React |

---

## Key Features

### Chat Interface
- Real-time streaming responses from Penny
- Markdown rendering with clickable hyperlinks
- Message history with timestamps
- "New Conversation" reset button
- Lesson plan extraction from AI responses

### Lesson Plan Viewer
- Structured sections matching Penny's output format
- Print-optimized layout with page breaks
- QR codes for digital text access
- Vintage/modern aesthetic design

### Lesson Plan Sections
1. **Header:** Title, Grade Level, Subject, Duration, Standard
2. **Objectives:** Learning goals with DOK levels
3. **Success Criteria:** Student-facing checkpoints
4. **Materials:** Checklist format
5. **Supports & Scaffolds:** All Students / EL / IEP-504
6. **Procedure:** 5-phase lesson flow with formatted steps
7. **Assessment:** Exit slip with rubric
8. **Equity Notes:** Representation tags
9. **Teacher Modifications:** Adaptation suggestions
10. **Text Selection:** 3 options with URLs

### Print Package (Student Materials)
1. **Exit Slip Worksheet** - With 0-3 rubric
2. **Graphic Organizer** - Visual thinking tool
3. **Sentence Frames** - Writing scaffolds
4. **Text Sources** - QR codes for digital access
5. **How to Use Guide** - Account requirements (CommonLit, Newsela, etc.)
6. **Reading Passage Placeholder** - For teacher-attached text

---

## File Structure

```
Lessonplanchatbotdesign/
├── app/
│   ├── api/chat/route.ts      # Poe API endpoint
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Main page
├── public/
│   └── penny-avatar.jpg       # Penny Pedagogy image
├── src/
│   ├── app/components/
│   │   ├── ChatInterface.tsx  # Chat UI with markdown
│   │   ├── LessonPlan.tsx     # Full lesson plan renderer
│   │   └── PennyFrame.tsx     # Avatar frame component
│   ├── data/
│   │   └── defaults.ts        # Default lesson plan data
│   ├── lib/
│   │   ├── lessonPlanParser.ts # JSON extraction from AI
│   │   └── utils.ts           # Utility functions
│   ├── store/
│   │   └── useStore.ts        # Zustand state management
│   ├── styles/
│   │   ├── globals.css        # Tailwind imports
│   │   └── index.css          # Custom styles
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── next.config.js             # Next.js configuration
├── package.json               # Dependencies
├── postcss.config.js          # PostCSS config
├── tailwind.config.js         # Tailwind config
└── tsconfig.json              # TypeScript config
```

---

## Environment Variables

```env
POE_API_KEY=your_poe_api_key_here
```

---

## Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

---

## Known Issues / Future Considerations

1. **Text Extraction:** Cannot automatically extract copyrighted text from CommonLit/Newsela for hard copies. Reading Passage placeholder page provided as workaround.

2. **Webpack Cache Warnings:** Occasional cache file rename errors during development (non-blocking).

3. **TypeScript Lint Warnings:** Minor type issues in `lessonPlanParser.ts` (functional, non-breaking).

---

## Git Commit History (most recent first)

```
05088b0 prompt: rewrite Penny as a teacher-coach, split mechanics into operator notes
c023e1c catalog: classify resources by kind so picker only offers single readings
dc8bec5 feat(penny): Phase B + C — gateway transport fix, artifact lane, EQuIP+UDL scorer, regenerate-section
3341d5e fix: relax resource format typing
3a8831c fix: tighten catalog audience heuristics
774eee2 fix: enforce student-facing text selection
3ccaedb docs: capture top-tier overhaul diagnostic baseline
69fbd39 feat: P0 + P0.5 top-tier overhaul — multi-LLM choreography, audience-aware print pack
c6f4ed9 feat: Wire Zeno LX content engine into Penny end-to-end
…
5bd284b feat: Next.js migration with Poe API integration and enhanced lesson plan features
```

---

## Credits

- **AI Model:** Penny Pedagogy v1.0 (Claude Sonnet 4.5 via Poe)
- **Design:** Vintage modern aesthetic with Oswald typography
- **Framework:** Next.js by Vercel

---

*Build log generated February 17, 2026*
