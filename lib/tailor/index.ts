import {
  getCachedOrSynthesizePersona,
  type ProfileWithPersonaCache,
} from "@/lib/persona";
import { prisma } from "@/lib/core/prisma";
import {
  calculateElasticPageBudget,
  isCareerSwitcherOrEarlyTenure,
} from "@/lib/resume-draft";
import type { MasterProfileInput } from "@/lib/validations/profile";
import {
  defaultCoverLetter,
  fallbackStrategyRationale,
  generateAgnosticExecutiveSummary,
  synthesizeAgnosticExecutiveSummary,
  reorderSkillsForTarget,
  sanitizeCoverLetterGreeting,
  sanitizeTailoredSummary,
  scrubDraftPunctuation,
} from "./auxiliary";
import {
  assembleWithinPageBudget,
  dedupeAndCapProjectBullets,
  dedupeExperienceBullets,
} from "./assembler";
import { distillJobContext } from "./distiller";
import { rankProfileAgainstJob } from "./ranker";
import { executeBulletReframe } from "./reframe";
import {
  buildHierarchicalProfileTree,
  hydrateSelectedFromTree,
} from "./tree";
import type {
  TailorOptions,
  TailorResult,
} from "./schema.ssot";

export * from "./schema.ssot";
export * from "./tree";
export * from "./distiller";
export * from "./assembler";
export * from "./ranker";
export * from "./reframe";
export * from "./auxiliary";
export * from "./email";
export * from "./legacy";

function parseFlexibleYearMonth(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (/present|current|now/i.test(value)) return new Date();
  const iso = /^(\d{4})(?:-(\d{1,2}))?/.exec(value);
  if (iso) {
    const year = Number(iso[1]);
    const month = iso[2] ? Number(iso[2]) - 1 : 0;
    if (year >= 1970 && year <= 2100) return new Date(year, month, 1);
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

export function estimateCareerYears(profile: MasterProfileInput): number {
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const exp of profile.experiences) {
    const start = parseFlexibleYearMonth(exp.startDate);
    const end = parseFlexibleYearMonth(exp.endDate) ?? new Date();
    if (!start) continue;
    if (!earliest || start < earliest) earliest = start;
    if (!latest || end > latest) latest = end;
  }
  if (!earliest || !latest) return 0;
  const ms = latest.getTime() - earliest.getTime();
  return Math.max(0, ms / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Public resume tailoring pipeline orchestrator.
 * 1. Distills job requirements into JobTargetContext.
 * 2. Builds HierarchicalProfileTree ensuring zero stranding/mismatching.
 * 3. Evaluates relevance via Hierarchical Matrix Ranker (with heuristic failover).
 * 4. Deterministically allocates exact page slots with calculateElasticPageBudget.
 * 5. Reframes surviving bullets into Google XYZ format.
 */
export async function tailorResumeForJob(
  jobRequirements: string[],
  profile: MasterProfileInput,
  options: TailorOptions = {}
): Promise<TailorResult> {
  const disabledSections = options.accountRules?.resumePreferences?.disabledSections ?? [];
  const includeSummary =
    (options.includeSummary ?? options.accountRules?.resumePreferences?.includeSummary ?? true) &&
    !disabledSections.includes("summary");
  const projectsDisabled = disabledSections.includes("projects");

  const profileWithPersona = profile as ProfileWithPersonaCache;
  const persona = await getCachedOrSynthesizePersona(profileWithPersona, options.dbClient ?? null);

  const careerYears = estimateCareerYears(profile);
  const switcherOrEarlyTenure = isCareerSwitcherOrEarlyTenure(persona, profile);
  const roleCount = profile.experiences.length;
  const inventMetrics = options.inventMetrics ?? options.accountRules?.resumePreferences?.inventMetrics ?? false;

  let effectiveOllamaModel = options.ollamaModel;
  let effectiveLocalOllamaUrl = options.localOllamaUrl;
  if ((!effectiveOllamaModel || !effectiveLocalOllamaUrl) && options.accountId) {
    try {
      const client = (options.dbClient ?? prisma) as typeof prisma;
      const settings = await client.accountSettings?.findUnique({
        where: { accountId: options.accountId },
        select: { ollamaModel: true, localOllamaUrl: true },
      });
      if (settings) {
        if (!effectiveOllamaModel && settings.ollamaModel) effectiveOllamaModel = settings.ollamaModel;
        if (!effectiveLocalOllamaUrl && settings.localOllamaUrl) effectiveLocalOllamaUrl = settings.localOllamaUrl;
      }
    } catch {
      // Ignore DB lookup errors
    }
  }

  const rawTarget = options.targetPages ?? options.accountRules?.targetPageBudget ?? options.accountRules?.resumePreferences?.maxPages ?? "auto";
  const targetPagesPref: "auto" | 1 | 2 = rawTarget === 2 || rawTarget === "2" ? 2 : rawTarget === 1 || rawTarget === "1" ? 1 : "auto";

  const inclusionMode: "AI_OPTIMAL" | "MANUAL" =
    options.contentInclusionMode ??
    (options.accountRules?.enableAiTailoringDefaults
      ? "AI_OPTIMAL"
      : (options.accountRules?.contentInclusionMode ??
         options.accountRules?.resumePreferences?.inclusionMode ??
         "AI_OPTIMAL"));

  // 1. Build Deterministic Hierarchical Profile Tree
  const tree = buildHierarchicalProfileTree(profile, {
    excludeProjects: projectsDisabled,
  });

  // 2. Distill Job Requirements into standard JobTargetContext
  const jobTarget = distillJobContext({
    roleTitle: options.roleTitle,
    companyName: options.companyName,
    jobRequirements,
    jobText: options.jobText,
  });

  // 3. Calculate Deterministic Page Budget (SSOT)
  const totalSourceBullets = tree.experiences.reduce(
    (sum, exp) => sum + exp.bullets.length,
    0
  );
  let budget = calculateElasticPageBudget({
    targetPages: targetPagesPref,
    careerYears,
    roleCount,
    projectCount: tree.projects.length,
    hasSummary: includeSummary,
    totalSourceBullets,
    matchedRequirementsCount: jobTarget.coreCompetencies.length,
    isCareerSwitcher: switcherOrEarlyTenure,
    educationCount: tree.education.length,
    credentialCount: tree.certifications.length,
    disabledSections,
  });

  // 4. Hierarchical Matrix Evaluation
  const rankings = await rankProfileAgainstJob(tree, jobTarget, {
    ...options,
    ollamaModel: effectiveOllamaModel,
    localOllamaUrl: effectiveLocalOllamaUrl,
  });

  // Value-First Elasticity & Auto-Snapping
  // In "auto" mode, if candidate was provisionally budgeted for 2 pages but high-signal bullets (score >= 3)
  // are insufficient (< 12), auto-snap down to 1 page to avoid 1.2-page spill and low-value dilution.
  const highSignalBullets =
    rankings.rankedExperiences.reduce((sum, r) => {
      return sum + (r.relevanceScore >= 3 ? Math.max(r.topBulletIds.length, 2) : r.topBulletIds.length);
    }, 0) +
    rankings.rankedProjects.reduce((sum, p) => {
      return sum + (p.relevanceScore >= 3 ? Math.max(p.topBulletIds.length, 2) : p.topBulletIds.length);
    }, 0);

  if (targetPagesPref === "auto" && budget.targetPages === 2 && highSignalBullets < 12) {
    budget = calculateElasticPageBudget({
      targetPages: 1,
      careerYears,
      roleCount,
      projectCount: tree.projects.length,
      hasSummary: includeSummary,
      totalSourceBullets,
      matchedRequirementsCount: jobTarget.coreCompetencies.length,
      isCareerSwitcher: switcherOrEarlyTenure,
      educationCount: tree.education.length,
      credentialCount: tree.certifications.length,
      disabledSections,
    });
    budget.warningFlags.push("AUTO_SNAPPED_TO_ONE_PAGE");
  } else if (targetPagesPref === 2 && highSignalBullets < 12) {
    if (!budget.warningFlags.includes("PAGE_BUDGET_SPARSE_WARNING")) {
      budget.warningFlags.push("PAGE_BUDGET_SPARSE_WARNING");
    }
  }

  // 5. Deterministic Budget Assembly (Zero Page Overflow)
  const selection = assembleWithinPageBudget(tree, rankings, budget, {
    contentInclusionMode: inclusionMode,
    includeSummary,
    isCareerSwitcherOrEarlyTenure: switcherOrEarlyTenure,
    projectsDisabled,
    experiencesDisabled: disabledSections.includes("experience"),
    disabledSections,
    previousSelectedBulletIds: (options.previousSelectedBulletIds || []).filter(Boolean),
  });

  // 6. Stage B: Reframe Surviving Bullets
  const { selectedExperience: preliminaryExp, selectedProjects: preliminaryProj } =
    hydrateSelectedFromTree({
      tree,
      originalProfile: profile,
      selectedBulletIds: selection.selectedBulletIds,
      projectBulletMap: selection.projectBulletMap,
    });

  const bulletsToReframe = [
    ...preliminaryExp.flatMap((exp, expIdx) =>
      exp.bullets.map((b, bIdx) => ({
        id: `exp_${expIdx}_b${bIdx}`,
        rawText: b.rawText,
        kind: "experience" as const,
        role: exp.role,
        company: exp.company,
      }))
    ),
    ...preliminaryProj.flatMap((proj, pIdx) =>
      proj.bullets.map((text, idx) => ({
        id: proj.id ? `${proj.id}-b-${idx}` : `proj_${pIdx}_b${idx}`,
        rawText: text,
        kind: "project" as const,
        projectName: proj.name,
      }))
    ),
  ];

  const reframedMap = await executeBulletReframe({
    bullets: bulletsToReframe,
    companyName: options.companyName,
    roleTitle: options.roleTitle,
    jobText: options.jobText,
    jobRequirements,
    inventMetrics,
    seniorityTier: persona.seniorityTier,
    options: {
      ...options,
      ollamaModel: effectiveOllamaModel,
      localOllamaUrl: effectiveLocalOllamaUrl,
    },
  });

  // Apply reframed text with tree ID indexing and deduplicate identical lines
  const selectedExperience = preliminaryExp.map((exp, expIdx) => ({
    ...exp,
    bullets: dedupeExperienceBullets(
      exp.bullets.map((b, bIdx) => {
        const treeKey = `exp_${expIdx}_b${bIdx}`;
        const reframed =
          reframedMap.get(treeKey) ??
          reframedMap.get(treeKey.toLowerCase()) ??
          reframedMap.get(b.id) ??
          reframedMap.get(b.id.toLowerCase()) ??
          b.rawText;
        return {
          ...b,
          rawText: reframed,
        };
      })
    ),
  })).filter((exp) => exp.bullets.length > 0);

  const selectedProjects = preliminaryProj.map((proj, pIdx) => ({
    ...proj,
    bullets: dedupeAndCapProjectBullets(
      proj.bullets.map((text, idx) => {
        const primaryId = proj.id ? `${proj.id}-b-${idx}` : `proj-${pIdx}-b-${idx}`;
        const legacyNameId = `${proj.name}-b-${idx}`;
        return (
          reframedMap.get(primaryId) ??
          reframedMap.get(primaryId.toLowerCase()) ??
          reframedMap.get(legacyNameId) ??
          text
        );
      }),
      proj.bullets.length
    ),
  }));

  const selectedBullets = selectedExperience.flatMap((e) =>
    e.bullets.map((b) => b.rawText)
  );

  const rawSummary = includeSummary ? profile.summary ?? null : null;
  let tailoredSummary = sanitizeTailoredSummary(rawSummary);

  if (includeSummary && !tailoredSummary && profile.experiences.length > 0) {
    tailoredSummary = await synthesizeAgnosticExecutiveSummary({
      roleTitle: options.roleTitle,
      companyName: options.companyName,
      experiences: profile.experiences,
      skills: profile.skills,
      targetCompetencies: jobTarget.coreCompetencies,
      persona,
      isCareerSwitcherOrEarlyTenure: switcherOrEarlyTenure,
      options,
    });
  }

  const tailoredSkills =
    inclusionMode === "MANUAL"
      ? profile.skills
      : reorderSkillsForTarget(profile.skills, rankings.matchedSkillKeywords, {
          targetPages: budget.targetPages,
        });

  const strategyRationale = fallbackStrategyRationale(
    options.companyName,
    options.roleTitle,
    inventMetrics
  );

  const rawCover = defaultCoverLetter(profile, jobRequirements, options.companyName);
  const coverLetter = scrubDraftPunctuation(
    sanitizeCoverLetterGreeting(rawCover, profile.fullName)
  );

  return {
    selectedExperience,
    selectedProjects,
    tailoredSummary,
    tailoredSkills,
    strategyRationale,
    coverLetter,
    selectedBullets,
    jobRequirements,
    warningFlags: budget.warningFlags,
  };
}
