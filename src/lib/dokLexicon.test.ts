import { describe, expect, it } from 'vitest';

import {
  extractObjectiveVerb,
  lookupVerbDok,
  normalizeDokSubject,
  suggestVerbsForDok,
  validateObjectiveDok,
} from './dokLexicon';

describe('extractObjectiveVerb', () => {
  it('strips the "Students will" stem', () => {
    expect(extractObjectiveVerb('Students will analyze the speaker\'s tone in two stanzas.')).toBe('analyze');
  });

  it('strips the "I can" stem', () => {
    expect(extractObjectiveVerb('I can compare two characters using textual evidence.')).toBe('compare');
  });

  it('strips "Students will be able to" stem', () => {
    expect(extractObjectiveVerb('Students will be able to evaluate competing claims about climate.')).toBe('evaluate');
  });

  it('strips "By the end of class" prefix', () => {
    expect(
      extractObjectiveVerb('By the end of class, students will design an experiment to test the hypothesis.'),
    ).toBe('design');
  });

  it('returns null for empty input', () => {
    expect(extractObjectiveVerb('')).toBeNull();
  });
});

describe('normalizeDokSubject', () => {
  it('maps ELA aliases to ela', () => {
    expect(normalizeDokSubject('English Language Arts')).toBe('ela');
    expect(normalizeDokSubject('reading')).toBe('ela');
    expect(normalizeDokSubject('literacy')).toBe('ela');
  });

  it('maps math aliases to math', () => {
    expect(normalizeDokSubject('Algebra II')).toBe('math');
    expect(normalizeDokSubject('Geometry')).toBe('math');
  });

  it('maps science aliases to science', () => {
    expect(normalizeDokSubject('Biology')).toBe('science');
  });

  it('maps social studies aliases', () => {
    expect(normalizeDokSubject('US History')).toBe('social_studies');
  });

  it('returns null for unknown subject', () => {
    expect(normalizeDokSubject('underwater basket weaving')).toBeNull();
  });
});

describe('lookupVerbDok', () => {
  it('returns the canonical DOK level for "list"', () => {
    const m = lookupVerbDok('list');
    expect(m.bestDok).toBe(1);
    expect(m.candidates.length).toBeGreaterThan(0);
  });

  it('returns DOK 3 for "analyze"', () => {
    const m = lookupVerbDok('analyze', 'ela');
    expect(m.bestDok).toBe(3);
  });

  it('returns DOK 4 for "synthesize"', () => {
    const m = lookupVerbDok('synthesize', 'ela');
    expect(m.bestDok).toBe(4);
  });

  it('returns null for an unknown verb', () => {
    const m = lookupVerbDok('xyzzy');
    expect(m.bestDok).toBeNull();
    expect(m.candidates).toEqual([]);
  });
});

describe('suggestVerbsForDok', () => {
  it('returns DOK 1 verbs for ELA', () => {
    const verbs = suggestVerbsForDok(1, 'ela', 4);
    expect(verbs.length).toBeGreaterThan(0);
    expect(verbs.length).toBeLessThanOrEqual(4);
  });

  it('returns DOK 3 verbs for science', () => {
    const verbs = suggestVerbsForDok(3, 'science', 4);
    expect(verbs.length).toBeGreaterThan(0);
  });
});

describe('validateObjectiveDok', () => {
  it('passes silently when verb matches claimed DOK', () => {
    const errors = validateObjectiveDok({
      objectiveText: 'Students will analyze how textual evidence supports an interpretation.',
      claimedDok: 3,
      subject: 'ELA',
    });
    expect(errors).toHaveLength(0);
  });

  it('flags low-DOK verb claimed at high DOK', () => {
    const errors = validateObjectiveDok({
      objectiveText: 'Students will list the main characters in the poem.',
      claimedDok: 3,
      subject: 'ELA',
      pathPrefix: 'objectives[0].dok',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].path).toBe('objectives[0].dok');
    expect(errors[0].message).toContain('list');
    expect(errors[0].message).toContain('DOK 1');
    expect(errors[0].message).toContain('DOK 3');
  });

  it('flags high-DOK verb claimed at DOK 1', () => {
    const errors = validateObjectiveDok({
      objectiveText: 'Students will evaluate competing claims using evidence.',
      claimedDok: 1,
      subject: 'ELA',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].message).toMatch(/evaluate/);
  });

  it('emits an info-level warning for unknown verbs', () => {
    const errors = validateObjectiveDok({
      objectiveText: 'Students will frobnicate the lesson materials.',
      claimedDok: 2,
      subject: 'ELA',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].message).toContain('frobnicate');
  });

  it('does not flag a within-1 drift (DOK 2 verb at DOK 3)', () => {
    const errors = validateObjectiveDok({
      objectiveText: 'Students will compare the two speakers across the stanzas.',
      claimedDok: 3,
      subject: 'ELA',
    });
    // "compare" is DOK 2; claimed DOK 3 is within 1 -> no warning.
    expect(errors).toHaveLength(0);
  });

  it('flags missing leading verb gracefully', () => {
    const errors = validateObjectiveDok({
      objectiveText: '...',
      claimedDok: 2,
      subject: 'ELA',
    });
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].severity).toBe('warning');
  });
});
