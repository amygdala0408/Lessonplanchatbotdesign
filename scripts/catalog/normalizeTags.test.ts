import { describe, it, expect } from 'vitest';

import { normalizeUdlHlpTag, TagDictionary } from './normalizeTags';

describe('normalizeUdlHlpTag', () => {
  it('normalizes UDL checkpoint variants', () => {
    expect(normalizeUdlHlpTag('UDL 3.3')).toBe('udl.3.3');
    expect(normalizeUdlHlpTag('udl 3.3')).toBe('udl.3.3');
    expect(normalizeUdlHlpTag('UDL3.3')).toBe('udl.3.3');
    expect(normalizeUdlHlpTag('UDL Checkpoint 6.3')).toBe('udl.6.3');
    expect(normalizeUdlHlpTag('UDL 7')).toBe('udl.7');
  });

  it('normalizes numbered HLP variants', () => {
    expect(normalizeUdlHlpTag('HLP 16')).toBe('hlp.16');
    expect(normalizeUdlHlpTag('HLP16')).toBe('hlp.16');
    expect(normalizeUdlHlpTag('HLP #14')).toBe('hlp.14');
  });

  it('maps named HLPs to their canonical number', () => {
    expect(normalizeUdlHlpTag('HLP Explicit Instruction')).toBe('hlp.16.explicit_instruction');
    expect(normalizeUdlHlpTag('HLP Flexible Grouping')).toBe('hlp.17.flexible_grouping');
    expect(normalizeUdlHlpTag('HLP Scaffolded Supports')).toBe('hlp.15.scaffolded_supports');
  });

  it('falls back to a stable slug for unknown names', () => {
    expect(normalizeUdlHlpTag('HLP Exemplars')).toBe('hlp.exemplars');
    expect(normalizeUdlHlpTag('SEL self-management')).toBe('sel_self_management');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeUdlHlpTag('')).toBe('');
    expect(normalizeUdlHlpTag('   ')).toBe('');
  });
});

describe('TagDictionary', () => {
  it('accumulates labels and occurrence counts per canonical tag', () => {
    const dict = new TagDictionary();
    dict.normalizeAll(['UDL 3.3', 'HLP 16']);
    dict.normalizeAll(['udl 3.3', 'HLP Explicit Instruction']);
    const records = dict.toRecords();

    const udl = records.find((r) => r.canonical === 'udl.3.3');
    expect(udl).toBeTruthy();
    expect(udl!.occurrences).toBe(2);
    expect(udl!.labels).toEqual(['UDL 3.3', 'udl 3.3']);

    expect(records.map((r) => r.canonical)).toContain('hlp.16');
    expect(records.map((r) => r.canonical)).toContain('hlp.16.explicit_instruction');
  });
});
