import type {
  ElasticBudgetParams,
  ElasticBudgetResult,
} from "./schema.ssot";

/**
 * ============================================================================
 * ELASTIC RESUME PAGE BUDGETING ENGINE
 * 
 * Dynamically calibrates bullet allocations (3-5 bullets per role/project)
 * based on target page budget (1 or 2 pages) and profile content density.
 * ============================================================================
 */

export function calculateElasticPageBudget(
  params: ElasticBudgetParams
): ElasticBudgetResult {
  const warningFlags: string[] = [];

  // 1. Resolve target page count
  const rawTarget = params.targetPages as unknown;
  const resolvedPages: 1 | 2 =
    rawTarget === 2 || rawTarget === "2"
      ? 2
      : rawTarget === 1 || rawTarget === "1"
        ? 1
        : params.careerYears >= 7 && params.roleCount >= 4
          ? 2
          : 1;

  // 2. Classify profile density
  let density: "SPARSE" | "BALANCED" | "DENSE" = "BALANCED";
  const isEarlyOrSwitcher =
    params.isCareerSwitcher === true ||
    (params.inFieldRoleCount !== undefined && params.inFieldRoleCount <= 2);

  if (
    isEarlyOrSwitcher ||
    (params.roleCount <= 2 && params.totalSourceBullets <= 8)
  ) {
    density = "SPARSE";
  } else if (params.roleCount >= 5 || params.totalSourceBullets >= 20) {
    density = "DENSE";
  }

  // 3. Elastic bullet calculation adapting to page budget & density
  let bulletBudgetMax = 8;
  let bulletsPerRoleMax = 4;
  let bulletsPerRoleMin = 2;
  let bulletsPerProjectMax = 3;

  if (resolvedPages === 1) {
    if (density === "SPARSE") {
      // Expand to comfortably fill the sheet
      bulletBudgetMax = params.hasSummary ? 11 : 14;
      bulletsPerRoleMax = 5;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 4;
    } else if (density === "DENSE") {
      // Compress lower-priority bullets toward minimum
      bulletBudgetMax = params.hasSummary ? 7 : 9;
      bulletsPerRoleMax = 3;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 3;

      if (params.roleCount >= 6) {
        warningFlags.push("PAGE_BUDGET_OVERFLOW");
      }
    } else {
      // Balanced
      bulletBudgetMax = params.hasSummary ? 9 : 12;
      bulletsPerRoleMax = 4;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 3;
    }

    // Check if matched requirements overwhelm a 1-page budget
    if (
      params.matchedRequirementsCount !== undefined &&
      params.matchedRequirementsCount > 10
    ) {
      if (!warningFlags.includes("PAGE_BUDGET_OVERFLOW")) {
        warningFlags.push("PAGE_BUDGET_OVERFLOW");
      }
    }
  } else {
    // 2-page budget
    if (density === "SPARSE") {
      bulletBudgetMax = params.hasSummary ? 14 : 16;
      bulletsPerRoleMax = 5;
      bulletsPerRoleMin = 3;
      bulletsPerProjectMax = 4;
    } else if (density === "DENSE") {
      bulletBudgetMax = params.hasSummary ? 18 : 20;
      bulletsPerRoleMax = 4;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 3;
    } else {
      bulletBudgetMax = params.hasSummary ? 15 : 18;
      bulletsPerRoleMax = 5;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 4;
    }
  }

  return {
    targetPages: resolvedPages,
    bulletBudgetMax,
    density,
    bulletsPerRoleMax,
    bulletsPerRoleMin,
    bulletsPerProjectMax,
    warningFlags,
  };
}
