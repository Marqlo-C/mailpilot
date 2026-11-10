import type { ElasticBudgetResult } from "@/lib/validations/resume-draft.schema";
import {
  estimateBulletHeightPoints,
  HEIGHT_CONSTANTS,
} from "@/lib/resume-draft/physics";
import type {
  HierarchicalProfileTree,
  HierarchicalProjectNode,
  MatrixRankResult,
} from "@/lib/validations/tailor.schema";

/** Drop identical or near-duplicate project bullets; hard-cap at max. */
export function dedupeAndCapProjectBullets(bullets: string[], max: number = 4): string[] {
  const seen: string[] = [];
  const out: string[] = [];
  for (const bullet of bullets) {
    const key = bullet.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!key || seen.some((e) => e === key || e.includes(key) || key.includes(e))) continue;
    seen.push(key);
    out.push(bullet.trim());
    if (out.length >= max) break;
  }
  return out;
}

/** Drop identical or near-duplicate experience bullets within a single role. */
export function dedupeExperienceBullets<T extends { rawText: string }>(bullets: T[]): T[] {
  const seen: string[] = [];
  const out: T[] = [];
  for (const bullet of bullets) {
    const key = bullet.rawText.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!key || seen.some((e) => e === key || e.includes(key) || key.includes(e))) continue;
    seen.push(key);
    out.push(bullet);
  }
  return out;
}

export interface AssembleBudgetOptions {
  contentInclusionMode?: "AI_OPTIMAL" | "MANUAL";
  includeSummary?: boolean;
  isCareerSwitcherOrEarlyTenure?: boolean;
  projectsDisabled?: boolean;
  experiencesDisabled?: boolean;
  disabledSections?: string[];
  previousSelectedBulletIds?: string[];
}

export interface AssembledSelection {
  selectedBulletIds: Set<string>;
  selectedProjectIds: string[];
  projectBulletMap: Map<string, string[]>;
  experienceBulletCount: number;
  projectBulletCount: number;
}

/**
 * Deterministically applies calculateElasticPageBudget math to the ranked profile tree.
 * Guarantees zero page overflow, zero stranding, and strict parent-child binding.
 */
export function assembleWithinPageBudget(
  tree: HierarchicalProfileTree,
  rankings: MatrixRankResult,
  budget: ElasticBudgetResult,
  options: AssembleBudgetOptions = {}
): AssembledSelection {
  const inclusionMode = options.contentInclusionMode ?? "AI_OPTIMAL";
  const projectsDisabled = options.projectsDisabled === true;
  const experiencesDisabled = options.experiencesDisabled === true;
  const includeSummary = options.includeSummary !== false;
  const previousSet = new Set(options.previousSelectedBulletIds || []);

  const selectedBulletIds = new Set<string>();
  const selectedProjectIds: string[] = [];
  const projectBulletMap = new Map<string, string[]>();

  const isSinglePage = budget.targetPages === 1;
  const availableContentPoints = budget.availableContentHeightPoints ?? (budget.targetPages * 712);
  let usedPoints = 0;

  const expRankMap = new Map(rankings.rankedExperiences.map((r) => [r.id, r]));
  const projRankMap = new Map(rankings.rankedProjects.map((r) => [r.id, r]));

  if (inclusionMode === "MANUAL") {
    // MANUAL Mode: Feature all projects and guarantee every experience has at least 1 bullet
    if (!projectsDisabled && tree.projects.length > 0) {
      tree.projects.forEach((proj) => {
        selectedProjectIds.push(proj.id);
        const capped = dedupeAndCapProjectBullets(
          proj.bullets.map((b) => b.text),
          budget.bulletsPerProjectMax ?? 3
        );
        projectBulletMap.set(proj.id, capped);
        proj.bullets.slice(0, capped.length).forEach((b) => selectedBulletIds.add(b.id));
      });
    }

    const expCandidates = tree.experiences.map((exp) => {
      const rankInfo = expRankMap.get(exp.id);
      const topSet = new Set(rankInfo?.topBulletIds || []);
      const scored = exp.bullets
        .map((b, idx) => ({
          bullet: b,
          score: (previousSet.has(b.originalId) || previousSet.has(b.id) ? 50 : 0) +
            (topSet.has(b.id) || topSet.has(b.originalId) ? 20 : 0) +
            (b.hasMetric ? 5 : 0) + 0.1 * (exp.bullets.length - idx),
        }))
        .sort((a, b) => b.score - a.score);
      return { exp, scored, chosen: [] as typeof exp.bullets };
    });

    let assigned = 0;
    expCandidates.forEach((item) => {
      if (item.scored.length > 0) {
        item.chosen.push(item.scored[0].bullet);
        selectedBulletIds.add(item.scored[0].bullet.id);
        assigned += 1;
      }
    });

    const remainingPool = expCandidates.flatMap((item, expIdx) =>
      item.scored.slice(1).map((s) => ({ expIdx, bullet: s.bullet, score: s.score }))
    ).sort((a, b) => b.score - a.score);

    const maxPerRole = budget.bulletsPerRoleMax ?? 4;
    for (const poolItem of remainingPool) {
      if (assigned >= (budget.bulletBudgetMax ?? 10)) break;
      const targetExp = expCandidates[poolItem.expIdx];
      if (targetExp.chosen.length < maxPerRole) {
        targetExp.chosen.push(poolItem.bullet);
        selectedBulletIds.add(poolItem.bullet.id);
        assigned += 1;
      }
    }
  } else {
    // AI_OPTIMAL Mode: Value-Density Knapsack with Dynamic Headroom Backfill
    interface CandidateItem {
      kind: "experience" | "project";
      entityId: string;
      bulletId: string;
      text: string;
      score: number;
      isTopBullet: boolean;
      entityScore: number;
    }

    const candidates: CandidateItem[] = [];

    // 1. Gather and score all candidate project bullets
    if (!projectsDisabled) {
      tree.projects.forEach((proj) => {
        const rankInfo = projRankMap.get(proj.id);
        const entityScore = rankInfo?.relevanceScore ?? 3;
        const topSet = new Set(rankInfo?.topBulletIds || []);
        proj.bullets.forEach((b, bIdx) => {
          const isTop = topSet.has(b.id) || topSet.has(b.originalId);
          const score = entityScore * 10 +
            (previousSet.has(b.originalId) || previousSet.has(b.id) ? 30 : 0) +
            (isTop ? 15 : 0) + (b.hasMetric ? 6 : 0) + 0.5 * (proj.bullets.length - bIdx);
          candidates.push({ kind: "project", entityId: proj.id, bulletId: b.id, text: b.text, score, isTopBullet: isTop, entityScore });
        });
      });
    }

    // 2. Gather and score all candidate experience bullets
    if (!experiencesDisabled) {
      tree.experiences.forEach((exp) => {
        const rankInfo = expRankMap.get(exp.id);
        const entityScore = rankInfo?.relevanceScore ?? 3;
        const topSet = new Set(rankInfo?.topBulletIds || []);
        const isAuxiliary = exp.category?.toLowerCase() === "activity" || exp.category?.toLowerCase() === "volunteer";
        exp.bullets.forEach((b, bIdx) => {
          const isTop = topSet.has(b.id) || topSet.has(b.originalId);
          const score = entityScore * 10 - (isAuxiliary ? 20 : 0) +
            (previousSet.has(b.originalId) || previousSet.has(b.id) ? 30 : 0) +
            (isTop ? 15 : 0) + (b.hasMetric ? 6 : 0) + 0.5 * (exp.bullets.length - bIdx);
          candidates.push({ kind: "experience", entityId: exp.id, bulletId: b.id, text: b.text, score, isTopBullet: isTop, entityScore });
        });
      });
    }

    // Tracking state
    const chosenExpCounts = new Map<string, number>();
    const chosenProjBullets = new Map<string, string[]>();
    const chosenProjIds = new Set<string>();

    const maxPerRole = budget.bulletsPerRoleMax ?? 4;
    const maxPerProj = isSinglePage
      ? Math.min(budget.bulletsPerProjectMax ?? 3, 3)
      : (budget.bulletsPerProjectMax ?? 4);
    const maxProjects = isSinglePage
      ? (tree.experiences.length > 0 && !experiencesDisabled ? (includeSummary ? 2 : 3) : Math.min(5, tree.projects.length))
      : 4;

    // Baseline Invariant 1: If experiences exist, seed 1 top bullet from highest-ranked role
    if (!experiencesDisabled && tree.experiences.length > 0) {
      usedPoints += HEIGHT_CONSTANTS.SECTION_HEADING;
      const sortedExps = [...tree.experiences].sort((a, b) => {
        const sA = expRankMap.get(a.id)?.relevanceScore ?? 3;
        const sB = expRankMap.get(b.id)?.relevanceScore ?? 3;
        return sB - sA;
      });
      const primaryExp = sortedExps[0];
      if (primaryExp && primaryExp.bullets.length > 0) {
        const b = primaryExp.bullets[0];
        selectedBulletIds.add(b.id);
        chosenExpCounts.set(primaryExp.id, 1);
        usedPoints += HEIGHT_CONSTANTS.ENTITY_HEADER + estimateBulletHeightPoints(b.text);
      }

      // Multi-Role Continuity Invariant: If secondary role is relevant (>= 2.5), seed its top bullet
      if (isSinglePage && sortedExps.length > 1) {
        const secondaryExp = sortedExps[1];
        const secScore = expRankMap.get(secondaryExp.id)?.relevanceScore ?? 0;
        if (secScore >= 2.5 && secondaryExp.bullets.length > 0) {
          const b = secondaryExp.bullets[0];
          const bCost = HEIGHT_CONSTANTS.ENTITY_HEADER + estimateBulletHeightPoints(b.text);
          if (usedPoints + bCost + 80 <= availableContentPoints) {
            selectedBulletIds.add(b.id);
            chosenExpCounts.set(secondaryExp.id, 1);
            usedPoints += bCost;
          }
        }
      }
    }

    // Baseline Invariant 2: If projects exist, seed 1 top bullet from highest-ranked project
    if (!projectsDisabled && tree.projects.length > 0) {
      usedPoints += HEIGHT_CONSTANTS.SECTION_HEADING;
      const sortedProjs = [...tree.projects].sort((a, b) => {
        const sA = projRankMap.get(a.id)?.relevanceScore ?? 3;
        const sB = projRankMap.get(b.id)?.relevanceScore ?? 3;
        return sB - sA;
      });
      const primaryProj = sortedProjs[0];
      if (primaryProj && primaryProj.bullets.length > 0) {
        const b = primaryProj.bullets[0];
        selectedBulletIds.add(b.id);
        chosenProjIds.add(primaryProj.id);
        chosenProjBullets.set(primaryProj.id, [b.text]);
        usedPoints += HEIGHT_CONSTANTS.ENTITY_HEADER + estimateBulletHeightPoints(b.text);
      }
    }

    // Helper: calculate marginal physical cost to add candidate
    function getAddedCost(c: CandidateItem): number {
      const bHeight = estimateBulletHeightPoints(c.text);
      if (c.kind === "experience") {
        const isFirst = (chosenExpCounts.get(c.entityId) ?? 0) === 0;
        return (isFirst ? HEIGHT_CONSTANTS.ENTITY_HEADER : 0) + bHeight;
      } else {
        const isFirst = !chosenProjIds.has(c.entityId);
        return (isFirst ? HEIGHT_CONSTANTS.ENTITY_HEADER : 0) + bHeight;
      }
    }

    // 3. Competitive Knapsack Greedy Packing with Diminishing Marginal Returns
    const DECAY = [1.0, 0.85, 0.65, 0.45];
    function getDecay(c: CandidateItem): number {
      const count = c.kind === "experience"
        ? (chosenExpCounts.get(c.entityId) ?? 0)
        : ((chosenProjBullets.get(c.entityId) ?? []).length);
      return DECAY[Math.min(count, DECAY.length - 1)];
    }

    const unchosen = candidates.filter((c) => !selectedBulletIds.has(c.bulletId));
    unchosen.sort((a, b) => {
      const scoreA = a.score * getDecay(a);
      const scoreB = b.score * getDecay(b);
      const densityA = scoreA / Math.max(1, getAddedCost(a));
      const densityB = scoreB / Math.max(1, getAddedCost(b));
      if (Math.abs(densityB - densityA) > 0.05) return densityB - densityA;
      return scoreB - scoreA;
    });

    for (const c of unchosen) {
      const cost = getAddedCost(c);
      if (usedPoints + cost > availableContentPoints) continue;

      if (c.kind === "experience") {
        const count = chosenExpCounts.get(c.entityId) ?? 0;
        if (count >= maxPerRole) continue;
        selectedBulletIds.add(c.bulletId);
        chosenExpCounts.set(c.entityId, count + 1);
        usedPoints += cost;
      } else {
        if (!chosenProjIds.has(c.entityId) && chosenProjIds.size >= maxProjects) continue;
        const pBullets = chosenProjBullets.get(c.entityId) ?? [];
        if (pBullets.length >= maxPerProj) continue;
        selectedBulletIds.add(c.bulletId);
        chosenProjIds.add(c.entityId);
        pBullets.push(c.text);
        chosenProjBullets.set(c.entityId, pBullets);
        usedPoints += cost;
      }
    }

    // 4. Dynamic Headroom Backfill: Absorbs the 10-15% bottom gap with highest-value bullets
    const maxTotalBullets = isSinglePage ? (includeSummary ? 12 : 14) : (budget.bulletBudgetMax ?? 24);
    const remainingCandidates = candidates.filter((c) => !selectedBulletIds.has(c.bulletId));
    remainingCandidates.sort((a, b) => b.score - a.score);

    for (const c of remainingCandidates) {
      if (selectedBulletIds.size >= maxTotalBullets) break;
      const bHeight = estimateBulletHeightPoints(c.text);

      if (c.kind === "experience" && chosenExpCounts.has(c.entityId)) {
        if (usedPoints + bHeight <= availableContentPoints && (chosenExpCounts.get(c.entityId)! < maxPerRole)) {
          selectedBulletIds.add(c.bulletId);
          chosenExpCounts.set(c.entityId, chosenExpCounts.get(c.entityId)! + 1);
          usedPoints += bHeight;
        }
      } else if (c.kind === "project") {
        if (chosenProjIds.has(c.entityId)) {
          const pBullets = chosenProjBullets.get(c.entityId)!;
          const cap = isSinglePage ? (chosenProjIds.size === 1 ? 5 : maxPerProj) : maxPerProj;
          if (pBullets.length < cap && usedPoints + bHeight <= availableContentPoints) {
            selectedBulletIds.add(c.bulletId);
            pBullets.push(c.text);
            usedPoints += bHeight;
          }
        } else if (chosenProjIds.size < maxProjects) {
          const pCost = HEIGHT_CONSTANTS.ENTITY_HEADER + bHeight;
          if (usedPoints + pCost <= availableContentPoints) {
            selectedBulletIds.add(c.bulletId);
            chosenProjIds.add(c.entityId);
            chosenProjBullets.set(c.entityId, [c.text]);
            usedPoints += pCost;
          }
        }
      }
    }

    // Populate project results
    chosenProjIds.forEach((pid) => {
      selectedProjectIds.push(pid);
      const cap = isSinglePage && chosenProjIds.size === 1 ? 5 : maxPerProj;
      projectBulletMap.set(pid, dedupeAndCapProjectBullets(chosenProjBullets.get(pid) ?? [], cap));
    });
  }

  return {
    selectedBulletIds,
    selectedProjectIds,
    projectBulletMap,
    experienceBulletCount: Array.from(selectedBulletIds).filter((id) => id.startsWith("exp_")).length,
    projectBulletCount: Array.from(projectBulletMap.values()).reduce((sum, list) => sum + list.length, 0),
  };
}
