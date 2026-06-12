# Research Content Additions & Tagging Structure Plan

**Status:** planned, not implemented. Captures (a) tagging structure changes
that would improve precision of the bridge, and (b) new curated content the
user could author to push generations from "very good" to genuine
gold-standard in-context exemplar quality.

**Date drafted:** May 16, 2026

**Author's note to the user:** the existing corpus is already large enough
that the bridge plan alone (see `pedagogical-grounding-bridge.plan.md`)
will move scores meaningfully. Everything in this document is **optional
additional leverage** — none of it is required to ship the bridge. Items
are ranked by ROI so you can choose where to invest authoring time.

---

## Part A — Tagging structure refinements (small, high leverage)

These are recommended even if no new content is added.

### A1. Normalize UDL / HLP / CSP / SIOP codes (REQUIRED — covered in bridge plan commit 7)

Adopt a canonical dotted form:

```
udl.3.3
udl.6.3
hlp.16.explicit_instruction
hlp.15.scaffolded_supports
hlp.22.feedback
csp.cultural_competence
csp.critical_consciousness
crt.ready_for_rigor
siop.feature.05.language_objectives
sel.casel.self_management
```

The display dictionary (`tag_dictionary.json`) keeps the human-readable
form ("UDL Guideline 3.3 — Critical Features & Patterns"). The canonical
codes ship in prompts; the display strings ship to the UI.

**Why this matters:** today the judge can't reliably count "did this
lesson use HLP 16?" because that pattern appears as `HLP 16`,
`HLP Explicit Instruction`, `hlp.16`, `Hlp_16` across files. Canonical
codes make Layer-A deterministic and the judge more decisive.

**User action:** none. The normalizer runs automatically at catalog build
time. If new content is authored, just put the canonical code in the
source CSV and the build pipeline will preserve it.

---

### A2. Add `evidence_citation_keys` to accommodations records (REQUIRED — bridge plan commit 2)

`accommodations_evidence.csv.md` already maps every support to NCEO/IRIS/
HLP source + URL. The compiled `accommodations.json` likely doesn't
preserve this. The build script should join the two so each accommodation
record carries:

```json
{
  "id": "extended_time_50pct",
  "evidenceCite": "NCEO Report 402 (2021)",
  "evidenceUrl": "https://nceo.info/Resources/publications/OnlinePubs/Reports/Report402/default.html"
}
```

**User action:** none required if the join is already in `scripts/build-catalog.ts`.

---

### A3. Normalize standards references (LIGHT)

Standards appear in multiple shapes across the corpus:

- `CCSS.ELA-LITERACY.RL.9-10.1`
- `RL.9-10.1`
- `ELA.RL.9-10.1`

Adopt the full dotted form (`ccss.ela.rl.9-10.1`) in catalog records;
display the framework-native form in the UI. Same pattern as A1.

---

### A4. Add `appliesWhen` rationale strings to accommodation triggers (LIGHT)

The `accommodations_rules.csv` already drives which accommodations attach
to which learner profile. Today the rationale is implicit. Add a
`why_for_teacher` field per rule:

```
rule_id,profile_field,profile_value,accommodation_id,why_for_teacher
r_01,multilingualLevel,<=4,bilingual_glossary_es,"WIDA 3+ Spanish home language → SIOP Feature 1 plus UDL 2.4"
```

Penny then says to the teacher: "Because two of your students are WIDA 3
with Spanish at home, I've attached the bilingual glossary (this aligns
with SIOP Feature 1 and UDL Checkpoint 2.4)." Today she'd just attach it
silently.

**User action:** one column add to `accommodations_rules.csv`. ~30
rationale strings to author.

---

## Part B — New schema fields on existing records (medium leverage)

### B1. `teacher_language_exemplars` on scaffolds — HIGHEST ROI

**The problem this fixes:** today `scaffolds_ela.csv.md`
`teacher_moves` reads:

> *"Model evidence sandwich (claim-evidence-analysis-connection) with historical examples; demonstrate selecting evidence strategically for analytical purpose; provide transition and analysis stems emphasizing interpretation over quotation"*

That tells the LLM **what to do** but not **what to say**. The model fills
in the words from pretraining, which is fine but generic.

Compare your own `opener_templates.csv.md` style — that has verbatim
language:

> *"Claudette Colvin was arrested for refusing to give up her bus seat nine months before Rosa Parks. She was 15. Why did the movement choose Parks as the face of the boycott?"*

That second style is what makes openers feel like a real teacher wrote
them. **Imagine if every scaffold also had 2–3 verbatim teacher-language
exemplars.** The lesson plans would read like they came from a coach who
knows the discipline.

**Proposed schema addition to scaffolds_{subject}.csv:**

```
teacher_language_exemplars (pipe-delimited; 2–3 exemplars per scaffold)
```

**Example for `ela.argument_evidence_structure`:**

```
"Watch how I unpack this evidence sandwich. The author writes 'fired upon
the multitude' — that's the EVIDENCE. My CLAIM is that the author wants
us to see the British troops as aggressors. My ANALYSIS: the word
'multitude' frames the crowd as victims, not active participants. My
CONNECTION: this matters because how the author chooses to describe an
action signals their stance — before any explicit argument."
|
"Notice I'm not just dropping the quote and moving on. I'm showing my
work. If you only quote and run, the reader has to do all the
interpretation. The whole point of the sandwich is that YOU do the
analytical labor — the reader gets to evaluate your reasoning, not yours."
|
"Common mistake here is making the analysis just a restatement: 'the
author uses fired upon the multitude to show that troops fired on the
crowd.' That's not analysis, that's translation. Analysis names the
EFFECT or PURPOSE."
```

**Authoring volume needed for gold-standard:** 2 exemplars × ~200
scaffolds in the active set = ~400 exemplars. At 5 min/exemplar, that's
~33 hours of authoring. Suggest prioritizing the 80 highest-use scaffolds
first (~13 hours).

**Build impact:** the bridge plan's `CATALOG_CANDIDATES.scaffolds` block
adds one more field. Budget impact: ~3 candidates × ~400 chars per
exemplar list = ~1200 chars. Within budget after trim from 6→3.

---

### B2. `subject_anchor_examples` on scaffolds (MEDIUM)

For each scaffold, a small dictionary of "if the lesson topic is X, here's
how this scaffold lands":

```
subject_anchor_examples_json
{
  "argumentative_writing": "Apply to debate over whether to remove statues. Evidence sandwich: 'Plaza Mayor city council voted to remove the statue (claim) — the council cited 73% community-survey opposition (evidence) — that 73% threshold matters because…' ",
  "rhetorical_analysis":   "Apply to Dolores Huerta's 'Sí se puede' — claim about ethos, evidence the linguistic pattern, analysis the bilingual rhetorical power",
  "literary_analysis":     "Apply to The Crucible — claim about Proctor's tragic flaw, evidence Act 2 confession scene, analysis the irony of his late-arrived honesty"
}
```

The picker passes one matching example into the generator prompt based on
the chosen text's topic.

**Authoring volume:** 3 anchors × top 80 scaffolds = ~240 anchors. ~20
hours.

---

### B3. `coaching_lens` on scaffolds (LOW–MED)

Translates EQuIP/UDL/HLP rubric into in-the-moment observable behaviors:

```
coaching_lens: "Listen for whether students explain analysis (not just quote).
Watch whether the teacher's think-aloud names the cognitive move ('I'm now
analyzing because…'). At least 60% of students should produce a CEAC
structure by independent practice."
```

This becomes the source for the `teacherMoves.checkForUnderstanding` field
in the procedure-detail enhancement. Today that field is improvised.

**Authoring volume:** ~80 of the top scaffolds × 1 coaching lens each =
~80 prose paragraphs. ~8 hours.

---

### B4. `failure_modes` on scaffolds (LOW–MED)

What does this move look like when it goes wrong? Paired with
`when_not_to_use` (which is about contexts), this captures execution
failures:

```
failure_modes: "Teacher reads aloud the evidence sandwich exemplar without
inviting student replication. OR: organizer is filled in for students
rather than scaffolded. OR: too many scaffolds shipped at once (sentence
stems AND graphic organizer AND modeled exemplar) without choice."
```

Source for `teacherMoves.ifStuck` in the procedure-detail enhancement.

**Authoring volume:** ~80 paragraphs. ~6 hours.

---

### B5. `standard_affinity` on scaffolds (OPTIONAL)

A short list of standards the scaffold pairs naturally with:

```
standard_affinity: ccss.ela.rl.9-10.1; ccss.ela.rl.9-10.3; ccss.ela.w.9-10.1
```

The picker can filter scaffolds by current standard's framework code.
Nice-to-have; the LLM does fine inferring this today.

---

## Part C — Brand new curated sources to author (HIGH leverage)

### C1. EQuIP+UDL exemplar bank — `equip_udl_exemplars.csv` (HIGHEST ROI for scoring)

For each rubric dimension at each level (0/1/2/3), one annotated paragraph
showing what that score actually reads like. The judge ships these as
**calibration exemplars** alongside the descriptors.

**Shape:**

```
dimension,level,exemplar_text,annotation
alignment_coherence,3,"<300-word lesson excerpt that scores 3>","Why this scores 3: objective restates RL.9-10.1 verbatim, all 4 procedure steps cite back to the objective, exit slip rubric uses the same analytical verb"
alignment_coherence,2,"<300-word excerpt that scores 2>","Why this scores 2 not 3: objective is aligned but procedure step 3 drifts into theme analysis without re-anchoring to evidence"
alignment_coherence,1,"<300-word excerpt that scores 1>","Why this scores 1: objective claims evidence analysis but task is plot recall"
…
```

**Volume:** 6 dimensions × 4 levels = 24 annotated exemplars. Each ~300
words + 50-word annotation. ~12 hours of authoring.

**Build impact:** judge prompt gains ~2400 chars. Pushes Layer-B
calibration from "imagined rubric" to "calibrated against your school's
sense of quality." This is the single highest-impact addition in this
document for the scoring number.

---

### C2. Anchor lessons exemplar set — `anchor_lessons.json` (HIGHEST ROI for generation quality)

3–5 fully worked lesson plans per subject that score 3.0 across every
EQuIP+UDL dimension. Each becomes an in-context exemplar passed to the
generator at prompt time.

**Shape:**

```json
{
  "id": "ela.argument_dok3.the_leap",
  "subject": "ela",
  "standard": "ccss.ela.rl.9-10.1",
  "topic": "argumentative_writing",
  "instructional_model": "explicit_instruction",
  "score": 3.0,
  "annotation_for_llm": "This lesson exemplifies tight CEAC-driven evidence analysis with explicit-instruction fidelity and full accommodations integration. Note how the objective verb 'analyze' threads through all 4 procedure steps and the exit slip rubric.",
  "plan": { /* full lesson plan envelope, same shape as generator output */ }
}
```

**Selection rule at generation time:** the prompt builder picks the 1
anchor lesson whose subject + instructional model + DOK band most matches
the current request and inlines it as:

```
EXEMPLAR (this is what a 3.0 lesson looks like for similar requests; align
your structure and density to this quality but use the student-specific
text and profile from the current request):
<full anchor lesson plan, ~2500 chars>
```

**Volume:** start with 5 per subject × 4 subjects = 20 anchor lessons.
Each takes ~2 hours to author (or transcribe from existing teacher work)
+ 1 hour to annotate. ~60 hours total. **High one-time investment,
permanent quality lift.** This is what every "good" AI lesson plan
product is missing.

**Build impact:** generator prompt gains ~3000 chars (one anchor). The
single most consequential addition in this entire document for generated
quality.

---

### C3. Discussion protocol library — `discussion_protocols.csv` (MEDIUM)

Today the artifact generator improvises discussion protocols. A curated
set ensures named, evidence-based protocols.

**Shape:**

```
id,name,group_size,time_min,roles,teacher_facilitation_moves,accountability_artifact,evidence_citation_keys,udl_hlp_tags,when_to_use
dp.socratic_seminar,Socratic Seminar,whole_class,25,inner+outer circle,"open with stem 'What question is the text asking?'; track participation; redirect to text",participation tracker + post-seminar reflection,siop_echevarria_2017; hlp_riccomini_2017_scaffolding,udl.5.3; hlp.18.discussion,when arguing across multiple texts
dp.save_the_last_word,Save the Last Word,partners→small group,15,…,…,…,…,when surfacing varied interpretations
dp.concentric_circles,Concentric Circles (Inside-Outside),whole_class,20,…,…,…,…,when comparing perspectives
dp.philosophical_chairs,Philosophical Chairs,whole_class,30,…,…,…,…,when stakes-laden topics with strong stances
dp.fishbowl,Fishbowl,small+observers,25,…,…,…,…,when modeling discourse moves
dp.four_corners,Four Corners,whole_class,15,…,…,…,…,when pre-discussion stance taking
dp.jigsaw_text,Text-Based Jigsaw,small_groups,30,…,…,…,…,when distributing reading across team experts
dp.turn_and_talk_chain,Turn-and-Talk Chain,partners,8,…,…,…,…,when warming up to whole-group discourse
```

**Volume:** 8–10 protocols × ~10 fields = ~3 hours.

**Build impact:** the artifact generator's `discussion_protocol` lane
shifts from improvisation to picking a named protocol and adapting it
to the text. Higher-fidelity artifact every time.

---

### C4. Sentence stem library — `sentence_stems.csv` (MEDIUM)

Curated by discourse function × audience tier:

**Shape:**

```
id,discourse_function,audience_tier,subject,stems_pipe_delimited,evidence_citation_keys
ss.cite_evidence.emerging.ela,citing_evidence,el_emerging,ela,"The text says ___. | According to the author ___. | On page ___ it states ___.",siop_echevarria_2017
ss.cite_evidence.developing.ela,citing_evidence,el_developing,ela,"The author argues ___ because ___. | Evidence for this is ___, specifically when ___.",siop_echevarria_2017
ss.cite_evidence.all.ela,citing_evidence,all,ela,"The author claims ___ and supports this by ___. | This is significant because ___. | Building on this, ___.",siop_echevarria_2017
ss.make_inference.emerging.ela,making_inference,el_emerging,ela,"I think ___ because the text says ___. | The character feels ___ because ___.",hlp_hughes_2017
ss.disagree_respectfully.all.universal,disagree,all,universal,"I see this differently because ___. | I want to push back on ___. | What if instead ___?",casel_self_management
…
```

**Volume:** ~12 discourse functions × ~4 audience tiers × ~3 subjects =
~120 stem sets, ~6 hours.

**Build impact:** sentence-stem artifact moves from improvisation to
curated language. Particularly important for multilingual fidelity.

---

### C5. Misconception → research-grounded teacher response — `misconception_responses.csv` (MEDIUM)

The misconceptions catalog identifies what students get wrong. What's
missing: what does the research say *shifts* this misconception?

**Shape:**

```
misconception_id,misconception,why_it_persists,research_grounded_response,evidence_citation_keys
mc.argument.claim_eq_topic,Students conflate the claim with the topic,"Pretraining + popular media use 'argument' synonymously with 'opinion' or 'subject'","Distinguish topic (what the text is about) from claim (what the author wants the reader to believe). Use side-by-side examples: 'gun control' (topic) vs. 'Background checks should be universal' (claim). Have students rewrite headlines as claims.",fa_graham_2016_ies_secondary_writing
mc.evidence.quote_dump,Quoting without analysis,"Schools teach 'use evidence' without teaching the analytical move","Model evidence sandwich (claim-evidence-analysis-connection). Build it via gradual release: full model → fill in analysis → fill in connection → student-generated.",hlp_hughes_2017_explicit_instruction
mc.theme.theme_eq_topic,Theme conflated with topic,"Same root cause as claim-conflation","Side-by-side: 'family' (topic) vs. 'family bonds can both hold us and harm us' (theme). Note: theme is a complete sentence, not a noun.",fa_graham_2016_ies_secondary_writing
…
```

**Volume:** ~50 high-frequency misconceptions × ~5 fields = ~5 hours.

**Build impact:** when a misconception is detected (or anticipated by
DOK pattern), the generator can ship the research-grounded response into
the `ifStuck` teacher move with citation.

---

### C6. Coaching observation checklist — `coaching_lens_by_phase.csv` (LOW)

Per instructional model phase, what would a coach watch for? Used by the
judge AND the procedure-detail enhancement.

**Shape:**

```
instructional_model,phase,coaching_observations,evidence_citation_keys
explicit_instruction,modeling,"Teacher uses think-aloud language ('I'm now…'); models a non-example before correcting; checks understanding before moving on",hlp_hughes_2017
explicit_instruction,guided_practice,"At least 60% of students attempt; teacher provides immediate corrective feedback; gradual release evident",hattie_2009
5e_inquiry,explore,"Students generate questions; teacher resists premature explanation; manipulatives or representations available",ngss_2013
…
```

**Volume:** 5 models × 5 phases × ~3 observations = ~75 observations = ~3
hours.

---

### C7. Standards crosswalk — `standards_with_shifts.csv` (LOW unless multi-state expansion)

For each major standard, the instructional shift it represents and the
1–2 evidence-based moves that operationalize it.

**Shape:**

```
standard_code,framework,shift_summary,canonical_moves,evidence_citation_keys
ccss.ela.rl.9-10.1,CCSS-ELA,"Cite strong & thorough textual evidence","Quote selection with annotation; evidence sandwich",fa_graham_2016_ies_secondary_writing
ccss.ela.rl.9-10.3,CCSS-ELA,"Analyze how complex characters develop","Character-evidence T-charts; motive timelines",ncte_2024
ngss.hs-ls3-1,NGSS,"Construct explanations from evidence","Claim-evidence-reasoning frame; gallery walks",ngss_2013
…
```

**Volume:** focus on the ~40 standards Penny actually generates against
most. ~4 hours.

---

## Part D — Stretch goals (consider for v2)

### D1. Annotated EQuIP+UDL anchor rubric scores from real teachers

Not just exemplar paragraphs you author, but actual teacher-scored
lessons with their rubric comments. Most powerful if you can recruit
3–5 master teachers to score 10 anchor lessons each.

### D2. Cultural responsiveness anchor texts — `csp_text_anchors.csv`

Per representation tag, 5–10 anchor texts with sufficient cultural
specificity that the picker can recommend them confidently. Today the
text catalog has representation tags; what's missing is a curated
"these are research-vetted, pedagogically-strong, age-appropriate"
shortlist for the most-requested representation tags
(Black/AfricanAmerican, Latinx, Indigenous, AsianAmerican, LGBTQ+,
multilingual identity, working-class, immigrant, neurodivergent).

### D3. Video micro-models — links by scaffold

Every scaffold gets 1–2 short (2–4 min) video URLs showing the scaffold
in action. Future: the print export becomes a "lesson plan packet" with
QR codes to the micro-models.

---

## Recommended sequence if you want to author content

If the goal is **gold-standard top-tier output** and you're willing to put
in authoring time, suggested order by ROI:

1. **C1 (EQuIP+UDL exemplar bank, ~12h)** — biggest single lift to the
   scoring number; you can't see this content but the judge does.
2. **B1 (`teacher_language_exemplars`, ~13h for top 80)** — biggest single
   lift to the *qualitative feel* of generated lessons.
3. **C2 (anchor lessons exemplar set, ~60h for 20 lessons)** — most
   transformational; this is what no competing product can match.
4. **A4 + B3 + B4 (`why_for_teacher`, `coaching_lens`, `failure_modes`,
   ~14h combined)** — turns improvised teacher moves into expert-anchored
   teacher moves. Required before the procedure-detail enhancement lands.
5. **C5 (misconception responses, ~5h)** — enables expert-grade `ifStuck`
   moves in procedure steps.
6. **C3 + C4 (discussion protocols + sentence stems, ~9h)** — tightens
   artifact generation.
7. **C6 (coaching lens by phase, ~3h)** — small lift, gives judge
   per-phase observable language.
8. **Everything else** — optional polish.

**Minimum to reach gold standard:** items 1–4 = ~40 hours of authoring.
**Comprehensive top-tier:** items 1–6 = ~54 hours.

---

## Build pipeline impact

None of these additions require a database migration or runtime
architecture change. They are CSV/JSON additions consumed by the existing
catalog build script. The bridge plan (`pedagogical-grounding-bridge.plan.md`)
makes Penny ready to consume new fields the moment they're present; the
emitters fall through gracefully when fields are missing.

If you author content in a new shape we haven't planned for, the only
required code change is one additional pass in `scripts/build-catalog.ts`
to copy that field into the compiled JSON. ~30 min per new field type.

---

**Decision recorded:** plan only. The user reviews authoring priorities
and either (a) authors content in priority order, (b) hires writers, or
(c) decides the bridge plan alone is sufficient for now and revisits this
list in a future build phase.
