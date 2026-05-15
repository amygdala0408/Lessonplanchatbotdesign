#!/usr/bin/env node
/**
 * Drives the acceptance prompt through `/api/finalize-plan` end-to-end so we
 * exercise the same generator path (Opus 4.7), structural validator, catalog-ID
 * validator, and EQuIP+UDL scorer (Layer A + GPT-5.5 judge) that the UI uses.
 *
 * Run with: `node scripts/finalize-acceptance-prompt.mjs` (dev server must be
 * running on :3000).
 */

const ACCEPTANCE_PROMPT =
  '9th grade ELA, CCSS.ELA-LITERACY.RL.9-10.1, 60 minutes. 28 students, 3 ELs at WIDA 3, 2 IEPs (anxiety + organization + reading).';

const learnerProfile = {
  hasIEP: true,
  has504: false,
  multilingualLevel: 3,
  homeLanguages: ['Spanish'],
  needsTags: ['anxiety', 'organization', 'reading_support'],
  classSize: 28,
  notes: '',
};

// A realistic 3-turn conversation that satisfies the topic-confirm beat and
// has the teacher pick a text. We seed the plan state with grade/subject/
// duration/standard plus a selected text option so the generator has the
// same shape it sees post-picker in the live UI.
const conversationHistory = [
  { role: 'assistant', content: "Hi, I'm Penny. Drop your standard, lesson idea, or teaching dilemma." },
  { role: 'user', content: ACCEPTANCE_PROMPT },
  {
    role: 'assistant',
    content:
      "Got it — 9th grade ELA, RL.9-10.1, 60 minutes. One thing before I pull texts: is this a hook into a new unit, mid-unit deepening, or a transfer / assessment day?",
  },
  { role: 'user', content: 'Mid-unit deepening, theme of identity and belonging.' },
  {
    role: 'assistant',
    content:
      "Then I'd lead with The Leap by Louise Erdrich — short enough for 60 minutes, rich enough for DOK 3 evidence work, concrete imagery before the abstract claim work for your WIDA-3 readers. Other options: Two Kinds by Amy Tan (interior monologue) and Marigolds by Eugenia Collier (higher rigor).",
  },
  { role: 'user', content: 'Option 1: The Leap.' },
];

const plan = {
  subject: 'ELA',
  gradeLevel: '9th Grade',
  duration: '60 minutes',
  standard: {
    framework: 'CCSS',
    code: 'CCSS.ELA-LITERACY.RL.9-10.1',
    description:
      'Cite strong and thorough textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text.',
  },
  textOptions: [
    {
      title: 'The Leap',
      source: 'Louise Erdrich (in Harper\'s)',
      lexile: '1010L',
      url: '',
      rationale:
        'Short literary fiction at grade-level complexity; concrete imagery gives WIDA-3 readers an entry point before claim work.',
      selected: true,
      representationTags: ['Indigenous', 'multigenerational'],
    },
    {
      title: 'Two Kinds',
      source: 'Amy Tan (The Joy Luck Club)',
      lexile: '1000L',
      url: '',
      rationale: 'Interior monologue; alternative for readers who like quieter texts.',
      selected: false,
      representationTags: ['AAPI', 'immigrant'],
    },
    {
      title: 'Marigolds',
      source: 'Eugenia Collier',
      lexile: '1110L',
      url: '',
      rationale: 'Higher rigor; assumes more reading stamina.',
      selected: false,
      representationTags: ['Black', 'rural'],
    },
  ],
};

async function main() {
  const startedAt = Date.now();
  console.error('[acceptance] POST /api/finalize-plan …');

  const res = await fetch('http://localhost:3000/api/finalize-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan,
      learnerProfile,
      messages: conversationHistory,
    }),
  });

  const elapsedMs = Date.now() - startedAt;
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('[acceptance] non-JSON response (status', res.status, '):', text.slice(0, 500));
    process.exit(2);
  }

  console.error(
    `[acceptance] HTTP ${res.status} in ${elapsedMs}ms — ok=${data.ok} structuralOk=${data.structuralOk} model=${data.meta?.model} promptVersion=${data.meta?.promptVersion}`,
  );
  if (data.errors?.length) {
    console.error('[acceptance] validation errors:');
    for (const e of data.errors) console.error(`  ${e.severity}: ${e.path}: ${e.message}`);
  }

  process.stdout.write(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('[acceptance] fatal:', err);
  process.exit(1);
});
