import { describe, expect, it, beforeEach } from 'vitest';

import {
  catalogKeyForPath,
  clearClosestIdsCache,
  extractIdFromMessage,
  levenshtein,
  suggestSimilarCatalogId,
} from './closestIds';

import { formatErrorsForRetry } from '../lessonPlanSchema';

beforeEach(() => {
  clearClosestIdsCache();
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('returns the substitution count for same-length strings', () => {
    expect(levenshtein('abc', 'abd')).toBe(1);
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });
  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('catalogKeyForPath', () => {
  it('maps top-level paths', () => {
    expect(catalogKeyForPath('openerId')).toBe('openers');
    expect(catalogKeyForPath('exitSlipId')).toBe('exitSlips');
    expect(catalogKeyForPath('instructionalModel')).toBe('instructionalModels');
    expect(catalogKeyForPath('standard.code')).toBe('standards');
  });

  it('maps array-indexed paths', () => {
    expect(catalogKeyForPath('resourceIds[0]')).toBe('resources');
    expect(catalogKeyForPath('misconceptionIds[3]')).toBe('misconceptions');
    expect(catalogKeyForPath('evidenceCitationKeys[1]')).toBe('citations');
    expect(catalogKeyForPath('textOptions[2].resourceId')).toBe('resources');
    expect(catalogKeyForPath('procedure[1].scaffoldIds[0]')).toBe('scaffolds');
    expect(catalogKeyForPath('procedure[3].accommodationIds[2]')).toBe('accommodations');
  });

  it('returns null for unknown paths', () => {
    expect(catalogKeyForPath('rubric[0].score')).toBeNull();
    expect(catalogKeyForPath('exitSlip')).toBeNull();
  });
});

describe('extractIdFromMessage', () => {
  it('pulls a quoted id from a validation message', () => {
    expect(
      extractIdFromMessage('Unknown opener id "embedded-vocab-preview" — pick one from CATALOG_CANDIDATES.'),
    ).toBe('embedded-vocab-preview');
  });

  it('returns null when no quoted id is present', () => {
    expect(extractIdFromMessage('Some other message without quotes')).toBeNull();
  });
});

describe('suggestSimilarCatalogId', () => {
  it('returns up to N similar resource ids', () => {
    const suggestions = suggestSimilarCatalogId({
      id: 'commonlit-free-reading',
      path: 'resourceIds[0]',
      limit: 3,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    // The closest match should contain the strongest token overlap
    expect(suggestions[0].toLowerCase()).toContain('commonlit');
  });

  it('handles separator/order swaps for scaffold ids', () => {
    // "ela-vocabulary-context" vs catalog "ela.vocabulary_context_strategy"
    // — same dominant tokens, different separators. Token jaccard plus
    // levenshtein should put a vocabulary scaffold in the top 3.
    const suggestions = suggestSimilarCatalogId({
      id: 'ela-vocabulary-context',
      path: 'procedure[0].scaffoldIds[0]',
      limit: 3,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => /vocabulary/.test(s))).toBe(true);
  });

  it('returns [] for paths that are not catalog lookups', () => {
    expect(
      suggestSimilarCatalogId({ id: 'anything', path: 'rubric[0].score' }),
    ).toEqual([]);
  });
});

describe('formatErrorsForRetry with suggester', () => {
  it('appends closest-id suggestions to unknown-id errors', () => {
    const prompt = formatErrorsForRetry(
      [
        {
          path: 'openerId',
          message: 'Unknown opener id "totally-fake-id" — pick one from CATALOG_CANDIDATES.openers.',
          severity: 'error',
        },
      ],
      { suggestSimilar: suggestSimilarCatalogId },
    );
    expect(prompt).toContain('totally-fake-id');
    expect(prompt).toContain('Closest valid ids:');
  });

  it('does NOT add a suggestion line when no quoted id is present', () => {
    const prompt = formatErrorsForRetry(
      [
        {
          path: 'rubric',
          message: 'Rubric must have exactly 4 rows scored 0-3, got 3',
          severity: 'error',
        },
      ],
      { suggestSimilar: suggestSimilarCatalogId },
    );
    expect(prompt).not.toContain('Closest valid ids:');
  });

  it('returns empty string when there are no blocking errors', () => {
    expect(
      formatErrorsForRetry(
        [{ path: 'objectives[0].dok', message: 'soft warning', severity: 'warning' }],
        { suggestSimilar: suggestSimilarCatalogId },
      ),
    ).toBe('');
  });
});
