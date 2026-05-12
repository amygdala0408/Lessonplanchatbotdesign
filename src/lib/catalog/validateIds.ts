/**
 * Catalog ID cross-validation.
 *
 * After Penny emits a lesson plan, we verify that any catalog IDs she used
 * actually exist in our compiled catalogs. This catches hallucinated IDs that
 * structural Zod validation can't detect.
 *
 * Server-only — depends on the filesystem-backed catalog loader.
 */

import type { LessonPlanData, ValidationError } from '../../types';

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

interface CatalogIdSets {
  resources: Set<string>;
  openers: Set<string>;
  exitSlips: Set<string>;
  scaffolds: Set<string>;
  accommodations: Set<string>;
  misconceptions: Set<string>;
  citations: Set<string>;
  standards: Set<string>;
  instructionalModels: Set<string>;
}

let cached: CatalogIdSets | null = null;

function getKnownIds(): CatalogIdSets {
  if (cached) return cached;
  const scaffoldIds = new Set<string>();
  for (const s of getScaffoldsForSubject('all')) scaffoldIds.add(s.id);
  cached = {
    resources: new Set(getResources().map((r) => r.id)),
    openers: new Set(getOpeners().map((o) => o.id)),
    exitSlips: new Set(getExitSlips().map((e) => e.id)),
    scaffolds: scaffoldIds,
    accommodations: new Set(getAccommodations().map((a) => a.id)),
    misconceptions: new Set(getMisconceptions().map((m) => m.id)),
    citations: new Set(getCitations().map((c) => c.id)),
    standards: new Set(getStandards().map((s) => s.id.toUpperCase())),
    instructionalModels: new Set(getInstructionalModels().map((p) => p.model)),
  };
  return cached;
}

/** Reset the in-process cache (tests). */
export function clearCatalogIdsCache(): void {
  cached = null;
}

function checkSet(
  ids: string[] | undefined,
  known: Set<string>,
  path: string,
  errors: ValidationError[],
): void {
  if (!ids) return;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) continue;
    if (!known.has(id)) {
      errors.push({
        path: `${path}[${i}]`,
        message: `Unknown catalog id "${id}" — pick one from CATALOG_CANDIDATES.`,
        severity: 'error',
      });
    }
  }
}

/**
 * Check every emitted catalog ID against the known sets and return errors for
 * unknown ones. Doesn't require any IDs to be present — only validates the
 * ones Penny chose to emit.
 */
export function validateCatalogIds(plan: Partial<LessonPlanData>): ValidationError[] {
  const errors: ValidationError[] = [];
  const known = getKnownIds();

  // Top-level scalar IDs.
  if (plan.openerId && !known.openers.has(plan.openerId)) {
    errors.push({
      path: 'openerId',
      message: `Unknown opener id "${plan.openerId}" — pick one from CATALOG_CANDIDATES.openers.`,
      severity: 'error',
    });
  }
  if (plan.exitSlipId && !known.exitSlips.has(plan.exitSlipId)) {
    errors.push({
      path: 'exitSlipId',
      message: `Unknown exit slip id "${plan.exitSlipId}" — pick one from CATALOG_CANDIDATES.exitSlips.`,
      severity: 'error',
    });
  }
  if (
    plan.instructionalModel &&
    !known.instructionalModels.has(plan.instructionalModel)
  ) {
    errors.push({
      path: 'instructionalModel',
      message: `Unknown instructional model "${plan.instructionalModel}".`,
      severity: 'error',
    });
  }

  // Top-level array IDs.
  checkSet(plan.resourceIds, known.resources, 'resourceIds', errors);
  checkSet(plan.misconceptionIds, known.misconceptions, 'misconceptionIds', errors);
  checkSet(plan.evidenceCitationKeys, known.citations, 'evidenceCitationKeys', errors);

  // textOptions[].resourceId
  if (Array.isArray(plan.textOptions)) {
    plan.textOptions.forEach((opt, i) => {
      if (opt.resourceId && !known.resources.has(opt.resourceId)) {
        errors.push({
          path: `textOptions[${i}].resourceId`,
          message: `Unknown resource id "${opt.resourceId}".`,
          severity: 'error',
        });
      }
    });
  }

  // procedure[].scaffoldIds and procedure[].accommodationIds
  if (Array.isArray(plan.procedure)) {
    plan.procedure.forEach((step, i) => {
      checkSet(step.scaffoldIds, known.scaffolds, `procedure[${i}].scaffoldIds`, errors);
      checkSet(
        step.accommodationIds,
        known.accommodations,
        `procedure[${i}].accommodationIds`,
        errors,
      );
    });
  }

  // standard.code (when structured) — only enforced for CCSS / NGSS / C3 codes
  // present in our standards catalog. Free-form / state codes are accepted.
  if (plan.standard && typeof plan.standard === 'object') {
    const code = (plan.standard.code || '').toUpperCase();
    if (
      code &&
      (plan.standard.framework === 'CCSS' ||
        plan.standard.framework === 'NGSS' ||
        plan.standard.framework === 'C3') &&
      !known.standards.has(code)
    ) {
      // Soft warning: many state-level CCSS codes aren't in our anchor-only
      // catalog yet. Treat as warning so finalize doesn't block.
      errors.push({
        path: 'standard.code',
        message: `Standard code "${plan.standard.code}" not found in the catalog (using as-provided).`,
        severity: 'warning',
      });
    }
  }

  return errors;
}
