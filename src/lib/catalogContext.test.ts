/**
 * Tests for the pedagogical-grounding bridge: the CATALOG_CANDIDATES block
 * must ship curated catalog CONTENT (teacher moves, supports, fade plans,
 * evidence cites, rubric prose) to the model — not just selector IDs — while
 * holding the character budget.
 */

import { describe, it, expect } from 'vitest';

import { buildCatalogContext } from './catalogContext';
import { getTeacherLanguageExemplars, getWhyForTeacherRationales } from './curated';
import type { LearnerProfile } from '../types';

// The May 15 acceptance prompt context: 9th grade ELA, RL.9-10.1, 60 min,
// 28 students, 3 ELs at WIDA 3 (Spanish), 2 IEPs.
const acceptanceProfile: LearnerProfile = {
  hasIEP: true,
  has504: false,
  multilingualLevel: 3,
  homeLanguages: ['Spanish'],
  needsTags: ['anxiety_support', 'organization_support', 'reading_support', 'language_support'],
  classSize: 28,
};

const acceptanceArgs = {
  currentPlan: {
    subject: 'ELA',
    gradeLevel: '9th Grade',
    duration: '60 minutes',
    title: 'Citing textual evidence in The Leap',
    objectives: [
      { text: 'Students will cite strong textual evidence to support an inferred theme.', dok: 3 as const },
    ],
  },
  learnerProfile: acceptanceProfile,
  conversationHistory: [
    {
      role: 'user',
      content:
        '9th grade ELA, CCSS.ELA-LITERACY.RL.9-10.1, 60 minutes. 28 students, 3 ELs at WIDA 3, 2 IEPs.',
    },
  ],
};

function parseBlock(systemMessage: string): Record<string, unknown> {
  const match = systemMessage.match(/```json\n([\s\S]*?)\n```/);
  expect(match).toBeTruthy();
  return JSON.parse(match![1]);
}

describe('buildCatalogContext — pedagogical-grounding bridge', () => {
  it('emits widened scaffoldDetails with curated content fields', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'drafting',
    });
    expect(systemMessage).toBeTruthy();
    const block = parseBlock(systemMessage!);

    const details = block.scaffoldDetails as Array<Record<string, unknown>>;
    expect(Array.isArray(details)).toBe(true);
    expect(details.length).toBeGreaterThan(0);

    for (const d of details) {
      expect(typeof d.id).toBe('string');
      expect(Array.isArray(d.phases)).toBe(true);
      expect(Array.isArray(d.teacherMoves)).toBe(true);
      expect(Array.isArray(d.studentTasks)).toBe(true);
      expect(Array.isArray(d.supports)).toBe(true);
      expect(typeof d.fadePlan).toBe('string');
      expect(Array.isArray(d.udlHlpTags)).toBe(true);
      expect(Array.isArray(d.evidenceKeys)).toBe(true);
    }

    // At least one detail entry must carry real curated prose (not all empty).
    const withMoves = details.filter((d) => (d.teacherMoves as string[]).length > 0);
    expect(withMoves.length).toBeGreaterThan(0);

    // Every per-phase scaffold ID has a matching detail entry (unless the
    // budget trimmer dropped trailing entries — details is allowed to be a
    // relevance-ranked subset, but never empty when scaffolds exist).
    const scaffolds = block.scaffolds as Record<string, Array<{ id: string }>>;
    const phaseIds = Object.values(scaffolds).flat().map((s) => s.id);
    expect(phaseIds.length).toBeGreaterThan(0);
  });

  it('emits accommodationDetails with evidence cites and trigger reasons', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'drafting',
    });
    const block = parseBlock(systemMessage!);

    const details = block.accommodationDetails as Array<Record<string, unknown>>;
    expect(Array.isArray(details)).toBe(true);
    expect(details.length).toBeGreaterThan(0);

    for (const d of details) {
      expect(typeof d.teacherPrompt).toBe('string');
      expect((d.teacherPrompt as string).length).toBeGreaterThan(0);
      expect(typeof d.appliesWhenReason).toBe('string');
    }

    // The acceptance class (WIDA 3 + Spanish + language_support) must trigger
    // the Spanish bilingual glossary with a human-readable reason.
    const glossary = details.find((d) => d.id === 'bilingual_glossary_es');
    expect(glossary).toBeTruthy();
    expect((glossary!.appliesWhenReason as string).length).toBeGreaterThan(0);
    expect(glossary!.appliesWhenReason as string).toMatch(/multilingual level 3|language support/i);

    // At least some accommodations carry research evidence cites.
    const withEvidence = details.filter((d) => (d.evidenceCite as string).length > 0);
    expect(withEvidence.length).toBeGreaterThan(0);
  });

  it('emits exit slips with full prompt, probe, and verbatim 0-3 criteria', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'drafting',
    });
    const block = parseBlock(systemMessage!);

    const slips = block.exitSlips as Array<Record<string, unknown>>;
    expect(slips.length).toBeGreaterThan(0);
    for (const s of slips) {
      expect(typeof s.prompt).toBe('string');
      // Full prompt, not the legacy 160-char truncation.
      expect((s.prompt as string).endsWith('…')).toBe(false);
      expect(Array.isArray(s.criteria0to3)).toBe(true);
    }
    const withRubric = slips.filter((s) => (s.criteria0to3 as string[]).length === 4);
    expect(withRubric.length).toBeGreaterThan(0);
  });

  it('emits openers with verbatim hook text and probes', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'drafting',
    });
    const block = parseBlock(systemMessage!);

    const openers = block.openers as Array<Record<string, unknown>>;
    expect(openers.length).toBeGreaterThan(0);
    const withHook = openers.filter((o) => (o.hookText as string).length > 0);
    expect(withHook.length).toBeGreaterThan(0);
    for (const o of openers) {
      expect(o).toHaveProperty('priorKnowledgeProbe');
      expect(o).toHaveProperty('learningIntentionStem');
    }
  });

  it('holds the generator-lane character budget (18k)', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'drafting',
    });
    const block = systemMessage!.match(/```json\n([\s\S]*?)\n```/)![1];
    expect(block.length).toBeLessThanOrEqual(18_000);
  });

  it('holds the chat-lane character budget (12k) during preview', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'preview',
    });
    expect(systemMessage).toBeTruthy();
    const block = systemMessage!.match(/```json\n([\s\S]*?)\n```/)![1];
    expect(block.length).toBeLessThanOrEqual(12_000);
  });

  it('wires curated teacher-language exemplars into scaffoldDetails', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'drafting',
    });
    const block = parseBlock(systemMessage!);
    const bank = getTeacherLanguageExemplars();
    const details = block.scaffoldDetails as Array<Record<string, unknown>>;

    // Every detail entry whose scaffold the draft bank covers must carry
    // the curated verbatim teacher talk (capped at 2 lines).
    const covered = details.filter((d) => (bank[d.id as string] ?? []).length > 0);
    expect(covered.length).toBeGreaterThan(0);
    for (const d of covered) {
      const lines = d.teacherLanguageExemplars as string[];
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length).toBeGreaterThan(0);
    }

    // Uncovered scaffolds must omit the field entirely (no empty arrays).
    const uncovered = details.filter((d) => (bank[d.id as string] ?? []).length === 0);
    for (const d of uncovered) {
      expect(d).not.toHaveProperty('teacherLanguageExemplars');
    }

    // The instruction preamble tells Penny how to use the exemplars.
    expect(systemMessage).toContain('teacherLanguageExemplars');
  });

  it('wires curated whyForTeacher rationales into accommodationDetails', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'drafting',
    });
    const block = parseBlock(systemMessage!);
    const rationales = getWhyForTeacherRationales();
    const details = block.accommodationDetails as Array<Record<string, unknown>>;

    const covered = details.filter((d) => rationales[d.id as string]);
    expect(covered.length).toBeGreaterThan(0);
    for (const d of covered) {
      expect(typeof d.whyForTeacher).toBe('string');
      expect((d.whyForTeacher as string).length).toBeGreaterThan(0);
    }

    // The acceptance class always triggers the Spanish bilingual glossary,
    // which the draft rationale bank covers.
    const glossary = details.find((d) => d.id === 'bilingual_glossary_es');
    expect(glossary).toBeTruthy();
    expect(typeof glossary!.whyForTeacher).toBe('string');

    expect(systemMessage).toContain('whyForTeacher');
  });

  it('still emits compact per-phase scaffold lists for placement', () => {
    const { systemMessage } = buildCatalogContext({
      ...acceptanceArgs,
      conversationPhase: 'drafting',
    });
    const block = parseBlock(systemMessage!);
    const scaffolds = block.scaffolds as Record<string, Array<Record<string, unknown>>>;
    for (const phase of ['launch', 'model', 'guided_practice', 'independent_practice', 'exit_slip']) {
      expect(scaffolds).toHaveProperty(phase);
      for (const s of scaffolds[phase]) {
        expect(typeof s.id).toBe('string');
        expect(typeof s.name).toBe('string');
      }
    }
  });
});
