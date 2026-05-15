# Penny Pedagogy Lesson Plan Generator - Build Log

**Project:** Lessonplanchatbotdesign
**Last updated:** May 15, 2026 (commits 4–6 landed; live verification pending prompt review)
**Active branch:** `cursor/top-tier-overhaul-c88e`
**Latest commit:** `c95fedb` — surface generator transport errors into validation banner

---

## Overview

Penny Pedagogy is an equity-centered AI instructional design partner for high school educators (grades 9-12). The application started as a Vite/Poe build, migrated to Next.js with Poe, and is now a multi-LLM choreography on the Vercel AI Gateway (Claude Sonnet 4.6 / Opus 4.7, GPT-5.5, GPT-4.1-mini).

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
