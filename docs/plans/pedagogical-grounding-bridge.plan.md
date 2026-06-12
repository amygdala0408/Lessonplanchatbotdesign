# Pedagogical-Grounding Bridge Plan

**Status:** planned, not implemented. Authored to make Penny's generations
actually informed by the curated research corpus in `catalog-sources/`.

**Date drafted:** May 16, 2026
**Sequence:** ships AFTER the picker-navigation fix and BEFORE the
procedure-detail enhancement (`procedure-detail-enhancement.plan.md`).

---

## 1. Problem we're solving

Today there is a wide gap between what's curated in the catalog and what the
LLMs actually see at generation time:

| Layer | What's in the corpus | What reaches the LLM today |
|---|---|---|
| Scaffold record | `teacher_moves`, `student_tasks`, `supports_list`, `fade_plan`, `when_not_to_use`, `formative_checks`, `evidence_citation_keys`, `udl_hlp_tags` | `{ id, name, type, dok }` (4 fields of 12) |
| Accommodation record | `teacherPrompt`, `evidence` citation, `appliesWhen` rules, fade plan, `udlHlpTags` | `{ id, teacherPrompt }` (truncated to 200 chars) |
| EQuIP+UDL rubric | 6 dimensions × 4 levels with prose descriptors | Used only for `passThreshold` numbers; descriptors never reach the judge |
| Research citations (~100) | `claim_summary`, `weight`, `focus_area`, URL | Never injected into any prompt |
| Opener templates | Verbatim hook + probe + intention stem + research tags | `{ id, type, topic, dokFloor }` (4 fields) |
| Exit slip archetypes | Full `criteria_0_3` rubric + misconception `probe` | `{ id, subject, dokFloor, prompt-truncated-160 }` |
| Instructional model phases | Per-phase `example_teacher_moves` + `expected_strategy_types` | The model name string only |
| Lesson phase manifest | `text_slots`, `default_minutes_min/max` | Not exposed to chat/generator at all |

Result: the LLMs are picking IDs from the user's catalog, then improvising
the *content* of teacher moves, accommodations prose, rubric judgments, and
exit slip criteria from pretraining. The pedagogical depth the user curated
is sitting on the floor.

## 2. Design principles (read this before reviewing the commits)

1. **In-context grounding, not just IDs.** The bridge ships verbatim
   research-anchored exemplars to the model, not just selector keys.

2. **Character-budget discipline.** Total `CATALOG_CANDIDATES` payload must
   stay under ~12,000 chars (≈3000 tokens) for the chat lane and ~18,000
   chars (≈4500 tokens) for the generator lane. We trim with these
   defaults:
   - Top-3 scaffolds per phase (not top-6).
   - Top-3 accommodations per phase (not top-6).
   - Truncation lengths defined per field in commit 1 below.

3. **The judge sees the rubric verbatim.** Replace "score 0–3 across six
   dimensions" with the actual descriptor language from
   `equip_udl_rubric.json` so GPT-5.5 isn't grading against its imagined
   rubric.

4. **The generator sees research anchors.** Top 3–5 `claim_summary` strings
   from `research_citations.json` selected by standard framework + learner
   profile, injected as a `RESEARCH ANCHORS` block at generation time.

5. **The artifact lane uses scaffolds, not improvisation.** When the lesson
   plan references scaffold IDs, the artifact generator ships the full
   scaffold's `teacher_moves` + `supports_list` + `fade_plan` into the
   prompt so the resulting discussion protocol / organizer / stems align
   with the named scaffold rather than freelance.

6. **Soft fallbacks.** When a field is missing from a record, fall through
   gracefully — never block on schema completeness mid-rollout.

7. **Promptversion bumps per commit.** Each commit increments
   `meta.promptVersion` so the telemetry can correlate scoring changes to
   the bridge work.

## 3. Commits (in order)

### Commit 1 — Widen `CATALOG_CANDIDATES.scaffolds`

**Files touched:**
- `src/lib/catalogContext.ts` — `CandidateBlock.scaffolds` shape + emission.
- `src/lib/catalog/types.ts` — confirm `ScaffoldRecord` already has the
  required fields (it does).
- `src/lib/catalogContext.test.ts` — new test fixture.
- `PENNY_OPERATOR_NOTES.md` — note the new fields and what they're for.

**Schema change in the JSON block emitted to the LLM:**

```ts
// new shape for each scaffold entry
{
  id: string,
  name: string,
  type: string,             // existing
  dok: number,              // existing
  teacherMoves: string[],   // NEW — exact moves from catalog (top 3, ≤120 chars each)
  studentTasks: string[],   // NEW — top 3, ≤120 chars each
  supports: string[],       // NEW — top 3, ≤100 chars each
  fadePlan: string,         // NEW — ≤200 chars
  whenNotToUse: string,     // NEW — ≤120 chars
  formativeChecks: string[],// NEW — top 2, ≤100 chars each
  udlHlpTags: string[],     // NEW — normalized codes (commit 7)
  evidenceKeys: string[],   // NEW — top 2 citation keys
}
```

**Budget impact:** ~6 scaffolds × ~700 chars = +4,200 chars in the chat
lane. To stay under budget, drop scaffold candidates from 6→3 per phase.

**Test:** assert the operator-notes scaffold ID `ela.academic_discourse_rubric`
emits with all 9 fields populated, and that the total candidate-block size
stays under 12k chars on the acceptance prompt fixture.

---

### Commit 2 — Widen `CATALOG_CANDIDATES.accommodations`

**Files touched:**
- `src/lib/catalogContext.ts` — `block.accommodations` shape + emission.
- `src/lib/accommodations.ts` — confirm `resolveAccommodations` returns
  evidence cite refs.
- `src/data/catalog/accommodations.json` — verify each row has the right
  `evidence` field pointing to a citation_id in `citations.json`. Add if
  missing.

**Schema change:**

```ts
{
  id: string,
  teacherPrompt: string,    // full text, no truncation (avg 180 chars)
  evidenceCite: string,     // NEW — e.g., "NCEO Report 402: extended time…"
  evidenceUrl: string,      // NEW — URL from accommodations_evidence.csv
  fadePlan: string,         // NEW — when this support fades, ≤120 chars
  udlHlpTags: string[],     // NEW
  appliesWhenReason: string,// NEW — why this triggered (e.g., "WIDA 3 + Spanish home language")
}
```

**Budget impact:** ~6 accommodations per phase × ~400 chars = +2400 chars.
Trim phase candidates from 6→3 to stay under budget.

**Test:** for the acceptance prompt (IEP + WIDA 3 + Spanish home language),
assert that `bilingual_glossary_es` and `chunked_directions_steps` ship
with the right evidence cites and `appliesWhenReason` strings.

---

### Commit 3 — Inject EQuIP+UDL rubric descriptors into the judge

**Files touched:**
- `src/lib/qualityScorer.ts` — `JUDGE_SYSTEM` constant.
- `src/data/catalog/equip_udl_rubric.json` — confirm shape; no edits.
- `src/lib/qualityScorer.test.ts` — assert the rubric prose is in the
  prompt.

**Change:** Replace the current 6-line `JUDGE_SYSTEM` with a build that
inlines the 6×4 descriptors:

```
You are an EQuIP+UDL rubric judge for K-12 lesson plans. You score the plan
across exactly six dimensions on a 0–3 scale, using the descriptors below.
Score conservatively. Reserve 3 for genuinely teacher-ready quality.

DIMENSION: alignment_coherence (Alignment & Coherence)
  3 = Objectives, tasks, and assessment align tightly to the standard; canonical ID shown.
  2 = Minor gaps; mostly aligned.
  1 = Significant gaps or unclear alignment.
  0 = Misaligned.

DIMENSION: instructional_design (Instructional Design — Model Fidelity)
  3 = Clear I-We-You or 5E/PBL structure with checks for understanding.
  2 = Structure present with occasional drift.
  1 = Structure weak; minimal checks.
  0 = No coherent structure.

[…all 6 dimensions, ~600 chars total…]

Hard rules:
- Use Layer-A deterministic findings (provided in the user message) as
  ground truth. You may be more critical than Layer A; you may NOT score
  higher than Layer A on a dimension where Layer A proved a structural
  deficit.
- Rationales: 1–2 sentences, cite the specific gap or strength against the
  descriptor above.
- Output a single object matching the schema.
```

**Test:** assert the running prompt contains the substring "I-We-You or
5E/PBL" and "Exit slip includes DOK + misconception + 0–3 criteria"
verbatim from the rubric file.

**Calibration expectation:** Layer B should tighten by ~0.05–0.15 on
average. Today GPT-5.5 is generous; with the rubric in hand it will catch
the "approaches/partial" gradations Penny is currently floating through.

---

### Commit 4 — Add `RESEARCH ANCHORS` block to generator + chat system prompts

**Files touched:**
- `src/lib/researchAnchors.ts` — new file.
- `src/lib/catalogContext.ts` — call into anchor builder.
- `src/data/catalog/citations.json` — confirm `claim_summary` field is
  populated (already is from `research_citations.csv.md`).
- `app/api/finalize-plan/route.ts` — pass anchors into generator prompt.
- `app/api/chat/route.ts` — pass anchors into chat prompt at gathering
  through preview phases.

**Selection rule (`researchAnchors.ts`):** rank top-N citations by
relevance to the standard framework + learner profile flags, capped at 5:

- Always include: 1 UDL Guideline 3.0 anchor (CAST 2024).
- If `hasIEP` or `has504`: include 1 HLP-framework anchor (Aceves/Kennedy
  2024) + 1 HLP scaffolding anchor (Riccomini 2017 or Singleton 2015).
- If `multilingualLevel <= 4`: include 1 SIOP anchor (Echevarría 2017) +
  1 multilingual UDL anchor (Kieran/Anderson 2019).
- If `representationTags` set on any selected text: include 1 CSP/CRT
  anchor (Ladson-Billings 1995/2014 or Hammond 2015).
- If `subject === 'science'`: prefer NGSS-aligned anchors.

**Block shape sent to the model:**

```
RESEARCH ANCHORS (cite these implicitly in your reasoning; do not name them
to the teacher):
1. UDL 3.0 (CAST 2024) — Provides a scientifically-grounded framework for
   proactively designing flexible learning environments…
2. HLP Framework 2nd Ed. (Aceves & Kennedy 2024) — Explicit instruction
   (HLP 16) is a foundational pillar essential for all lesson design…
3. Multilingual UDL (Kieran & Anderson 2019) — UDL checkpoints align with
   culturally responsive teaching practices particularly for multilingual
   learners…
[…]
```

**Budget impact:** ~5 × ~200 chars = +1000 chars. Acceptable.

**Test:** for the acceptance prompt (RL.9-10.1 + 3 WIDA-3 ELs + 2 IEPs),
assert exactly 5 anchors emit, and that the SIOP + multilingual UDL +
HLP-scaffolding + UDL guidelines + Ladson-Billings cites are all selected
(text option `representationTags` includes `Indigenous`).

---

### Commit 5 — Widen `CATALOG_CANDIDATES.openers` + `exitSlips` + `misconceptions`

**Files touched:**
- `src/lib/catalogContext.ts`

**Change for openers** (use the rich `opener_templates.csv` content):

```ts
{
  id: string,
  type: string,
  topic: string,
  dokFloor: number,
  hookText: string,                  // NEW — verbatim, no truncation
  priorKnowledgeProbe: string,       // NEW
  learningIntentionStem: string,     // NEW
  researchTags: string[],            // NEW
  timeMinutes: number,               // NEW
}
```

**Change for exit slips** (use `exit_slip_archetypes.csv` content):

```ts
{
  id: string,
  subject: string,
  dokFloor: number,
  prompt: string,                    // full text, no truncation
  probe: string,                     // NEW — anticipated misconception
  criteria_0_3: string,              // NEW — verbatim 0/1/2/3 rubric prose
}
```

**Change for misconceptions:**

```ts
{
  id: string,
  misconception: string,
  probe: string,
  // No new fields needed; existing emission is OK.
}
```

**Budget impact:** ~3 openers × ~600 chars = +1800; ~3 exit slips × ~500
chars = +1500. Total cumulative budget after commits 1–5: ~13,500 chars.
Within budget.

**Test:** assert that for the acceptance prompt, the exit slip
`exit_textual_evidence_dok3` ships with its full `criteria_0_3` rubric
prose intact.

---

### Commit 6 — Bridge scaffolds into the artifact generator

**Files touched:**
- `app/api/generate-artifacts/route.ts` — extend `summarizePlanForArtifacts`
  and `buildArtifactPrompt`.
- `src/lib/catalog/index.ts` — expose `getScaffoldsByIds(ids: string[])`.

**Change:** when the finalized plan contains `procedure[i].scaffoldIds`,
resolve each scaffold to its full record and inject a
`SCAFFOLDS IN USE` block into the artifact prompt:

```
SCAFFOLDS IN USE (these named pedagogies are already chosen for the lesson;
your artifact MUST align to them, not invent parallel structures):

1. ela.argument_evidence_structure — Historical Argument with Evidence Structure
   Teacher moves:
     - Model evidence sandwich (claim-evidence-analysis-connection) with historical examples
     - Demonstrate selecting evidence strategically for analytical purpose
     - Provide transition and analysis stems emphasizing interpretation over quotation
   Student tasks:
     - Select evidence that directly supports claim
     - Frame quote or paraphrase with context
     - Analyze significance beyond summary
   Supports list:
     - Evidence sandwich graphic organizer (UDL 3.3)
     - Analysis sentence stems (UDL 5.3)
   Fade plan: Phase 1 → 2 → 3 → 4 …
   Evidence: fa_graham_2016_ies_secondary_writing; hlp_hughes_2017_explicit_instruction
```

**Why this matters:** Today the artifact generator produces e.g. a
"Concentric Circles" discussion protocol with improvised roles. With the
scaffold injected, it will produce the protocol the *catalog* says works,
with the rubric/stem language the catalog grounds in.

**Test:** for the acceptance prompt, after this commit, assert that the
generated `discussion_protocol.accountability` artifact references the
"talk move tracker" or "evidence sandwich" pattern named in the scaffold's
supports list, not a freelance accountability artifact.

---

### Commit 7 — Normalize tag dictionaries

**Files touched:**
- `scripts/build-catalog.ts` — add normalization pass.
- `src/lib/catalog/tagNormalizer.ts` — new file.
- `src/data/catalog/tag_dictionary.json` — new file (output of normalizer).
- All scaffold + accommodation JSONs — re-emitted with normalized tags.

**Problem:** today's UDL/HLP/CSP codes are mixed-case and
mixed-format:

- `UDL 3.3` vs `udl 3.3` vs `UDL-CAST-3.0`
- `HLP 16` vs `HLP Explicit Instruction`
- `csp_ladsonbillings_1995_theory` vs `CSP`

This isn't blocking but it makes deterministic Layer-A checks fragile (the
scorer can't reliably count "lessons that use HLP 16") and makes prompts
inconsistent.

**Canonical form:**

```
udl.3.3           — UDL Guideline 3.3 (Patterns / Critical Features)
udl.6.3           — UDL Guideline 6.3 (Managing Information)
hlp.16.explicit_instruction
hlp.15.scaffolded_supports
hlp.22.feedback
csp.cultural_competence
csp.critical_consciousness
crt.ready_for_rigor
siop.feature.05.language_objectives
```

**Approach:** the normalizer is a pure function `string -> CanonicalTag |
null`. It runs over every `udl_hlp_tags`, `csp_tags`, `sel_strand`, and
`evidence_citation_keys` field at catalog build time, drops a
`tag_dictionary.json` with the canonical → display mapping (so the UI can
still show "UDL 3.3" while the prompt ships `udl.3.3`).

**Test:** assert the normalizer produces a stable canonical form for the
top 50 most-used raw tags in `scaffolds_ela.json`.

---

## 4. Expected scoring impact

Compared to last night's 2.83/3.0 baseline:

| Dimension | Likely change | Why |
|---|---|---|
| alignment_coherence | +0.1 (3→3, more cleanly) | Anchors keep model from drifting |
| instructional_design | +0.1–0.2 | Scaffold `teacher_moves` make I-We-You explicit |
| access_supports | +0.1 (already 3) | Accommodation evidence cites tighten rationale |
| assessment_for_learning | +0.2 | Exit slip `criteria_0_3` ships verbatim |
| materials_licensing | unchanged (depends on URL discipline) | Already 3 in real UI |
| tone_clarity | +0.1 | Scaffold prose anchors authentic teacher voice |
| **Layer B average** | **2.83 → ~3.00** (within rubric noise) | All the above |

The bigger effect is **qualitative**: lessons begin reading like they were
written by a coach who knows your school's library, your rubric, your
scaffolds, and your evidence base — because they were, via the bridge.

## 5. Rollout / test plan

For each commit:

1. Land with the existing 63-test unit suite green + new tests added.
2. Re-run `scripts/finalize-acceptance-prompt.mjs` and record:
   - EQuIP+UDL Layer B score
   - Total prompt token count for chat + generator + judge + artifact
   - One full diff of the generated plan vs. the prior commit
3. Re-run `scripts/artifacts-acceptance-prompt.mjs` after Commit 6 and
   verify the discussion protocol + sentence stems now reference the
   scaffold's named patterns, not improvisations.
4. Stop and review with the user before chaining to the next commit if
   anything regresses on Layer A or token budget exceeds caps.

## 6. Out of scope for this plan (deferred to other docs)

- Adding new fields to scaffolds (covered in
  `research-content-additions.plan.md`).
- Procedure-detail `teacherMoves` schema (covered in
  `procedure-detail-enhancement.plan.md`).
- Bridging artifacts to the printable bundle (covered in
  `accommodations-artifacts-audit.md`).

---

**Decision recorded:** plan only. No code changes from this document yet.
Sequencing after the picker-navigation fix and live UI verification, then
this bridge, then the procedure-detail enhancement, then the artifacts
print bridge.
