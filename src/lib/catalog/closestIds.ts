/**
 * Closest-catalog-ID suggester.
 *
 * When `validateCatalogIds` rejects an ID, the retry prompt should hand the
 * model the 3 most-similar valid IDs from the right catalog so it doesn't
 * have to re-guess. This module:
 *
 *   1. Extracts the unknown id from a `Unknown ... id "<id>" — ...` error
 *      message OR accepts the id directly.
 *   2. Picks the right catalog set based on the error path
 *      (openerId, procedure[2].accommodationIds[1], textOptions[0].resourceId,
 *      etc.).
 *   3. Ranks candidates by a Levenshtein + token-set hybrid score so we catch
 *      the common "vocab_preview_embedded" ↔ "embedded-vocab-preview"
 *      separator/order swaps.
 *
 * Server-only — relies on the catalog loader.
 */

import {
  getAccommodations,
  getCitations,
  getExitSlips,
  getInstructionalModels,
  getMisconceptions,
  getOpeners,
  getResources,
  getScaffoldsForSubject,
  getStandards,
} from './index';

type CatalogKey =
  | 'openers'
  | 'exitSlips'
  | 'instructionalModels'
  | 'resources'
  | 'misconceptions'
  | 'citations'
  | 'scaffolds'
  | 'accommodations'
  | 'standards';

let catalogCache: Partial<Record<CatalogKey, string[]>> = {};

export function clearClosestIdsCache(): void {
  catalogCache = {};
}

function loadCatalog(key: CatalogKey): string[] {
  if (catalogCache[key]) return catalogCache[key]!;
  let ids: string[] = [];
  switch (key) {
    case 'openers':
      ids = getOpeners().map((o) => o.id);
      break;
    case 'exitSlips':
      ids = getExitSlips().map((e) => e.id);
      break;
    case 'instructionalModels':
      ids = getInstructionalModels().map((p) => p.model);
      break;
    case 'resources':
      ids = getResources().map((r) => r.id);
      break;
    case 'misconceptions':
      ids = getMisconceptions().map((m) => m.id);
      break;
    case 'citations':
      ids = getCitations().map((c) => c.id);
      break;
    case 'scaffolds':
      ids = getScaffoldsForSubject('all').map((s) => s.id);
      break;
    case 'accommodations':
      ids = getAccommodations().map((a) => a.id);
      break;
    case 'standards':
      ids = getStandards().map((s) => s.id);
      break;
  }
  catalogCache[key] = ids;
  return ids;
}

/**
 * Map a validation error path to the catalog it draws from.
 * Returns null when the path isn't a catalog-ID lookup.
 */
export function catalogKeyForPath(path: string): CatalogKey | null {
  if (path === 'openerId') return 'openers';
  if (path === 'exitSlipId') return 'exitSlips';
  if (path === 'instructionalModel') return 'instructionalModels';
  if (path === 'standard.code') return 'standards';
  if (path.startsWith('resourceIds')) return 'resources';
  if (path.startsWith('misconceptionIds')) return 'misconceptions';
  if (path.startsWith('evidenceCitationKeys')) return 'citations';
  if (/^textOptions\[\d+\]\.resourceId/.test(path)) return 'resources';
  if (/^procedure\[\d+\]\.scaffoldIds/.test(path)) return 'scaffolds';
  if (/^procedure\[\d+\]\.accommodationIds/.test(path)) return 'accommodations';
  return null;
}

/** Standard ASCII Levenshtein distance, with O(n*m) memory. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Tokenize an id into normalized lowercase tokens (split on - _ . space). */
function tokens(id: string): string[] {
  return id
    .toLowerCase()
    .split(/[-_.\s]+/)
    .filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

/** Lower is better. Combines normalized Levenshtein with token Jaccard. */
function score(badId: string, candidate: string): number {
  const a = badId.toLowerCase().replace(/[-_.\s]/g, '');
  const b = candidate.toLowerCase().replace(/[-_.\s]/g, '');
  const lev = levenshtein(a, b);
  const norm = lev / Math.max(a.length, b.length, 1); // 0..1, lower better
  const jac = jaccard(tokens(badId), tokens(candidate)); // 0..1, higher better
  // Lower score wins. Levenshtein dominates; Jaccard breaks ties for swapped
  // separators / token order.
  return norm * 0.7 + (1 - jac) * 0.3;
}

/**
 * Return up to `limit` closest valid IDs from the catalog implied by `path`.
 * Empty array when the path doesn't map to a known catalog or no candidates
 * are similar enough.
 */
export function suggestSimilarCatalogId(args: {
  id: string;
  path: string;
  limit?: number;
}): string[] {
  const limit = Math.max(1, Math.min(args.limit ?? 3, 10));
  const key = catalogKeyForPath(args.path);
  if (!key) return [];
  const pool = loadCatalog(key);
  if (pool.length === 0) return [];

  const ranked = pool
    .map((candidate) => ({ candidate, score: score(args.id, candidate) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);

  return ranked.map((r) => r.candidate);
}

/**
 * Convenience: pull the bad id out of a `Unknown ... id "<id>" — ...` style
 * message. Returns null when no quoted id is present.
 */
export function extractIdFromMessage(message: string): string | null {
  const m = message.match(/"([^"]+)"/);
  return m ? m[1] : null;
}
