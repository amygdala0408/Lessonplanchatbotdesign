/**
 * Tests for research anchors (bridge commit 4) and the rubric-grounded judge
 * prompt (bridge commit 3).
 */

import { describe, it, expect } from 'vitest';

import { selectResearchAnchors, buildResearchAnchorsMessage } from './researchAnchors';
import { buildJudgeSystem } from './qualityScorer';
import { getEquipUdlRubric } from './catalog';
import type { LearnerProfile } from '../types';

const mlIepProfile: LearnerProfile = {
  hasIEP: true,
  has504: false,
  multilingualLevel: 3,
  homeLanguages: ['Spanish'],
  needsTags: ['anxiety_support', 'organization_support', 'reading_support'],
  classSize: 28,
};

describe('selectResearchAnchors', () => {
  it('returns 5 anchors with claim summaries', () => {
    const anchors = selectResearchAnchors({
      plan: { subject: 'ELA', standard: { framework: 'CCSS', code: 'RL.9-10.1', description: '' } },
      learnerProfile: mlIepProfile,
    });
    expect(anchors).toHaveLength(5);
    for (const a of anchors) {
      expect(a.claimSummary.trim().length).toBeGreaterThan(0);
      expect(a.id.trim().length).toBeGreaterThan(0);
    }
  });

  it('prioritizes ML/EL-relevant research when the class has multilingual learners', () => {
    const anchors = selectResearchAnchors({
      plan: { subject: 'ELA' },
      learnerProfile: mlIepProfile,
    });
    const joined = anchors.map((a) => `${a.focusArea} ${a.sourceTitle}`.toLowerCase()).join(' | ');
    expect(joined).toMatch(/multilingual|ell|english learner|culturally responsive|siop|language/);
  });

  it('prioritizes math research for a math lesson', () => {
    const anchors = selectResearchAnchors({
      plan: { subject: 'Math' },
      learnerProfile: null,
    });
    const joined = anchors.map((a) => `${a.focusArea} ${a.sourceTitle}`.toLowerCase()).join(' | ');
    expect(joined).toMatch(/math|algebra/);
  });
});

describe('buildResearchAnchorsMessage', () => {
  it('renders a RESEARCH ANCHORS block with ids and claims', () => {
    const msg = buildResearchAnchorsMessage({
      plan: { subject: 'ELA' },
      learnerProfile: mlIepProfile,
    });
    expect(msg).toBeTruthy();
    expect(msg).toContain('RESEARCH ANCHORS');
    expect(msg).toContain('evidenceCitationKeys');
    // At least 5 bullet lines with [id] citations.
    const bullets = msg!.split('\n').filter((l) => l.startsWith('- ['));
    expect(bullets.length).toBe(5);
  });
});

describe('buildJudgeSystem (rubric-grounded judge)', () => {
  it('inlines every rubric descriptor verbatim', () => {
    const system = buildJudgeSystem();
    const rubric = getEquipUdlRubric();
    for (const criterion of rubric.criteria) {
      expect(system).toContain(`DIMENSION: ${criterion.id}`);
      for (const level of criterion.levels) {
        expect(system).toContain(level.descriptor);
      }
    }
  });

  it('keeps the Layer-A ground-truth rule', () => {
    const system = buildJudgeSystem();
    expect(system).toMatch(/Layer-A deterministic findings/);
    expect(system).toMatch(/may NOT score higher than Layer A/);
  });
});
