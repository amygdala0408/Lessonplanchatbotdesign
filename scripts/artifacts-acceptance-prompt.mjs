#!/usr/bin/env node
/**
 * Drives `/api/generate-artifacts` end-to-end using the same lesson plan +
 * selected text + learner profile as `finalize-acceptance-prompt.mjs`, so we
 * can see exactly what student-facing scaffolds Penny produces for a teacher.
 *
 * Server must be running on :3000. Streams SSE; prints each artifact JSON to
 * stdout as it lands plus a final summary to stderr.
 */

const learnerProfile = {
  hasIEP: true,
  has504: false,
  multilingualLevel: 3,
  homeLanguages: ['Spanish'],
  needsTags: ['anxiety', 'organization', 'reading_support'],
  classSize: 28,
  notes: '',
};

const selectedText = {
  title: 'The Leap',
  source: "Louise Erdrich (in Harper's)",
  lexile: '1010L',
  url: '',
  rationale:
    'Short literary fiction at grade-level complexity; concrete imagery gives WIDA-3 readers an entry point before claim work.',
  selected: true,
  representationTags: ['Indigenous', 'multigenerational'],
};

// A compact, realistic plan envelope. The artifact lane only needs the
// teacher-facing brief (standards, objectives, success criteria, phase
// summaries), the chosen text, and the learner profile — not the full
// procedure detail.
const plan = {
  title: 'Citing Strong Evidence on Identity & Belonging in "The Leap"',
  subject: 'ELA',
  gradeLevel: '9th Grade',
  duration: '60 minutes',
  standard: {
    framework: 'CCSS',
    code: 'CCSS.ELA-LITERACY.RL.9-10.1',
    description:
      'Cite strong and thorough textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text.',
  },
  objectives: [
    {
      text:
        'Students will cite at least two pieces of strong textual evidence from "The Leap" to support an inference about how a character\'s past shapes their identity.',
      dok: 3,
    },
    {
      text:
        'Students will explain in writing how their selected evidence supports their inference, using a sentence frame or original wording.',
      dok: 3,
    },
  ],
  successCriteria: [
    {
      text:
        'I can cite two specific quotes from "The Leap" that support my inference about Anna\'s identity.',
    },
    {
      text:
        'I can explain in two sentences why each quote is strong evidence (not just any quote that mentions the topic).',
    },
    {
      text:
        'I can use a sentence frame or my own words to connect my evidence to my inference.',
    },
  ],
  instructionalModel: 'gradual_release',
  textOptions: [{ ...selectedText }],
  procedure: [
    {
      phaseId: 'hook',
      duration: 8,
      steps: [
        {
          description:
            'Quickwrite: "Write about a moment in your life that changed how someone saw you." Pair-share with sentence stem.',
        },
      ],
    },
    {
      phaseId: 'mini_lesson',
      duration: 10,
      steps: [
        {
          description:
            'Model citing strong vs. weak evidence using paragraph 1 of "The Leap." Teacher think-aloud, anchor chart.',
        },
      ],
    },
    {
      phaseId: 'guided_practice',
      duration: 15,
      steps: [
        {
          description:
            'Whole-class shared annotation of paragraphs 2-4. Students mark evidence in pairs on shared text.',
        },
      ],
    },
    {
      phaseId: 'independent_practice',
      duration: 17,
      steps: [
        {
          description:
            'Students complete CER graphic organizer with two pieces of evidence and explanation. Teacher confers with WIDA-3 students using bilingual glossary.',
        },
      ],
    },
    {
      phaseId: 'closure',
      duration: 10,
      steps: [
        {
          description:
            'Exit ticket with a DOK 3 question. Differentiated by audio version and partner-talk option.',
        },
      ],
    },
  ],
};

async function main() {
  const startedAt = Date.now();
  console.error('[artifacts] POST /api/generate-artifacts …');

  const res = await fetch('http://localhost:3000/api/generate-artifacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ plan, selectedText, learnerProfile }),
  });

  console.error(
    `[artifacts] HTTP ${res.status} ${res.statusText} model=${res.headers.get('x-penny-model')} task=${res.headers.get('x-penny-task')}`,
  );

  if (!res.ok || !res.body) {
    console.error('[artifacts] no body, aborting.');
    process.exit(2);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const artifactsByType = {};

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let eventType = 'message';
      let dataLine = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (dataLine) {
        let parsed;
        try {
          parsed = JSON.parse(dataLine);
        } catch {
          parsed = null;
        }
        if (parsed) {
          if (eventType === 'artifact' && parsed.artifact) {
            const elapsedMs = Date.now() - startedAt;
            console.error(`[artifacts] +${elapsedMs}ms ✓ ${parsed.artifact.type}`);
            artifactsByType[parsed.artifact.type] = parsed.artifact.data;
          } else if (eventType === 'error') {
            console.error(`[artifacts] ✗ ${parsed.artifact}: ${parsed.message}`);
          } else if (eventType === 'done') {
            console.error(
              `[artifacts] done ${parsed.latencyMs}ms ok=${parsed.succeeded?.length || 0} fail=${parsed.failed?.length || 0}`,
            );
          } else if (eventType === 'fatal') {
            console.error(`[artifacts] FATAL: ${parsed.message}`);
          }
        }
      }
      sep = buffer.indexOf('\n\n');
    }
  }

  process.stdout.write(JSON.stringify(artifactsByType, null, 2));
}

main().catch((err) => {
  console.error('[artifacts] fatal:', err);
  process.exit(1);
});
