/**
 * UDL/HLP tag normalizer (pedagogical-grounding bridge, commit 7).
 *
 * The source CSVs spell the same tag a dozen ways: "UDL 3.3", "udl3.3",
 * "HLP 16", "HLP16", "HLP Explicit Instruction". Joins and lookups across
 * scaffolds <-> accommodations <-> rubric silently miss because of it.
 *
 * Canonical grammar:
 *   udl.<guideline>[.<checkpoint>]      e.g. udl.3.3, udl.7
 *   hlp.<number>[.<slug>]               e.g. hlp.16.explicit_instruction
 *   hlp.<slug>                          when no number is known, e.g. hlp.exemplars
 *
 * The original display strings are preserved in the records; canonical forms
 * are emitted alongside them (`udlHlpTagsCanonical`) plus a build-time
 * `tag_dictionary.json` mapping canonical -> display label(s) + occurrences.
 */

/** Named HLPs that appear in the corpus without their number. */
const HLP_NAME_TO_NUMBER: Record<string, number> = {
  explicit_instruction: 16,
  flexible_grouping: 17,
  active_engagement: 18,
  student_engagement: 18,
  scaffolded_supports: 15,
  scaffolded_support: 15,
  assistive_technology: 19,
  intensive_instruction: 20,
  cognitive_strategies: 14,
  metacognitive_strategies: 14,
  feedback: 22,
  positive_feedback: 22,
  assessment: 6,
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Normalize a single raw UDL/HLP tag to canonical form. Unknown shapes are
 * slugified wholesale so they're at least stable for joins.
 */
export function normalizeUdlHlpTag(raw: string): string {
  const t = raw.trim();
  if (!t) return '';

  // UDL <guideline>[.<checkpoint>] — "UDL 3.3", "udl3.3", "UDL Checkpoint 3.3"
  const udl = t.match(/^udl\s*(?:checkpoint\s*)?(\d+)(?:\.(\d+))?$/i);
  if (udl) return udl[2] ? `udl.${udl[1]}.${udl[2]}` : `udl.${udl[1]}`;

  // HLP <number> — "HLP 16", "HLP16", "HLP #16"
  const hlpNum = t.match(/^hlp\s*#?\s*(\d+)$/i);
  if (hlpNum) return `hlp.${parseInt(hlpNum[1], 10)}`;

  // HLP <number> <name> — "HLP 16 Explicit Instruction"
  const hlpNumName = t.match(/^hlp\s*#?\s*(\d+)\s+(.+)$/i);
  if (hlpNumName) return `hlp.${parseInt(hlpNumName[1], 10)}.${slugify(hlpNumName[2])}`;

  // HLP <name> — "HLP Explicit Instruction" → number lookup when known
  const hlpName = t.match(/^hlp\s+(.+)$/i);
  if (hlpName) {
    const slug = slugify(hlpName[1]);
    const num = HLP_NAME_TO_NUMBER[slug];
    return num ? `hlp.${num}.${slug}` : `hlp.${slug}`;
  }

  // Anything else: stable slug (e.g. "SEL self-management" → sel_self_management).
  return slugify(t);
}

export interface TagDictionaryEntry {
  canonical: string;
  labels: string[];
  occurrences: number;
}

/**
 * Accumulates raw→canonical mappings across catalog builds and renders the
 * dictionary records for `tag_dictionary.json`.
 */
export class TagDictionary {
  private entries = new Map<string, { labels: Set<string>; occurrences: number }>();

  /** Normalize a list of raw tags, recording them in the dictionary. */
  normalizeAll(raws: string[]): string[] {
    const out: string[] = [];
    for (const raw of raws) {
      const canonical = normalizeUdlHlpTag(raw);
      if (!canonical) continue;
      out.push(canonical);
      const entry = this.entries.get(canonical) ?? { labels: new Set<string>(), occurrences: 0 };
      entry.labels.add(raw.trim());
      entry.occurrences++;
      this.entries.set(canonical, entry);
    }
    return out;
  }

  toRecords(): TagDictionaryEntry[] {
    return Array.from(this.entries.entries())
      .map(([canonical, e]) => ({
        canonical,
        labels: Array.from(e.labels).sort(),
        occurrences: e.occurrences,
      }))
      .sort((a, b) => a.canonical.localeCompare(b.canonical));
  }
}
