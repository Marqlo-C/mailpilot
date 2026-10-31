import type {
  ElasticBudgetParams,
  ElasticBudgetResult,
} from "./schema.ssot";
import {
  estimateFixedSectionsHeight,
  calculateAvailableContentPoints,
} from "./physics";

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
  const isEarlyOrSwitcher =
    params.isCareerSwitcher === true ||
    (params.inFieldRoleCount !== undefined && params.inFieldRoleCount <= 2);

  const rawTarget = params.targetPages as unknown;
  const resolvedPages: 1 | 2 =
    rawTarget === 2 || rawTarget === "2"
      ? 2
      : rawTarget === 1 || rawTarget === "1"
        ? 1
        : isEarlyOrSwitcher
          ? 1
          : params.careerYears >= 7 && params.roleCount >= 4
            ? 2
            : 1;

  // 2. Classify profile density
  let density: "SPARSE" | "BALANCED" | "DENSE" = "BALANCED";

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

  // Vertical fixed section height deduction
  // US Letter 720pt printable height: Contact (50pt) + Skills (45pt) + Headers (75pt) = ~170pt baseline
  const extraSectionPenalty =
    (params.educationCount ?? 1) >= 2 || (params.credentialCount ?? 0) >= 2 ? 1 : 0;

  if (resolvedPages === 1) {
    if (density === "SPARSE") {
      // Expand to comfortably fill the sheet without spilling (strictly <= 10 bullets with summary)
      bulletBudgetMax = Math.max(7, (params.hasSummary ? 10 : 12) - extraSectionPenalty);
      bulletsPerRoleMax = 5;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 3;
    } else if (density === "DENSE") {
      // Allow healthy bullet density (up to 10-12 bullets) while keeping per-role bounded
      bulletBudgetMax = Math.max(8, (params.hasSummary ? 10 : 12) - extraSectionPenalty);
      bulletsPerRoleMax = 3;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 3;

      if (params.roleCount >= 6) {
        warningFlags.push("PAGE_BUDGET_OVERFLOW");
      }
    } else {
      // Balanced
      bulletBudgetMax = Math.max(7, (params.hasSummary ? 9 : 12) - extraSectionPenalty);
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
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 4;
    } else if (density === "DENSE") {
      bulletBudgetMax = params.hasSummary ? 18 : 20;
      bulletsPerRoleMax = 4;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 3;
    } else {
      bulletBudgetMax = params.hasSummary ? 16 : 18;
      bulletsPerRoleMax = 5;
      bulletsPerRoleMin = 2;
      bulletsPerProjectMax = 4;
    }
  }

  // Dynamic capacity adaptation when user turns off or lacks jobs or projects
  const hasJobs = params.roleCount > 0 && !params.disabledSections?.includes("experience");
  const hasProjects = params.projectCount > 0 && !params.disabledSections?.includes("projects");

  if (!hasJobs && hasProjects) {
    // Portfolio-centric resume: Projects absorb the full content height
    bulletsPerProjectMax = resolvedPages === 1 ? 4 : 5;
  } else if (!hasProjects && hasJobs) {
    // Experience-centric resume: Roles absorb the full content height
    bulletsPerRoleMax = resolvedPages === 1 ? 5 : 6;
  }

  const fixedSectionsHeight = estimateFixedSectionsHeight({
    hasSummary: params.hasSummary,
    educationCount: params.educationCount ?? 1,
    certificationsCount: params.credentialCount,
    disabledSections: params.disabledSections,
  });

  const availableContentHeightPoints = calculateAvailableContentPoints({
    targetPages: resolvedPages,
    fixedSectionsHeight,
  });

  return {
    targetPages: resolvedPages,
    bulletBudgetMax,
    density,
    bulletsPerRoleMax,
    bulletsPerRoleMin,
    bulletsPerProjectMax,
    warningFlags,
    availableContentHeightPoints,
  };
}
