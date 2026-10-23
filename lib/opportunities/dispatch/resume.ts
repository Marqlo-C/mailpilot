import { generateTailoredResumePdf } from "@/lib/document/pdf-generator";
import { prisma } from "@/lib/core/prisma";
import { compileResumeDocx } from "@/lib/document/resume-docx";
import {
  digestTailoredResume,
  draftToPdfInput,
  moveResumeNode,
  refineResumeLine,
} from "@/lib/resume-draft";
import { storedResumeDraftSchema } from "@/lib/types/resume-draft";
import { tailorResumeForJob } from "@/lib/resume-tailor";
import type { WorkExperienceInput } from "@/lib/validations/profile";
import {
  DEFAULT_RESUME_PREFERENCES,
  parseAccountRules,
} from "@/lib/validations/rules";
import { resolveDecryptedHasDataKey } from "@/lib/llm/vault";
import { fetchViaHasData } from "@/lib/opportunities/context/hasdata";
import { refreshHasDataUsageAfterUse } from "@/lib/scraping/hasdata";
import { normalizeSalaryDisplay, parseSalaryMax } from "@/lib/ai/classifier";
import { loadCandidateProfileSummary } from "@/lib/llm/classification";
import {
  extractMatchCandidateLens,
  evaluateOpportunityMatch,
} from "@/lib/matching";
import {
  isUnspecifiedPostedAt,
  normalizePostedAt,
  resolveJobOpportunity,
} from "@/lib/opportunities/context";
import {
  loadMasterProfile,
  loadStoredDraft,
  normalizeProvider,
  persistOpportunityResumeCache,
  previewFromCache,
  renderDraftPdf,
  resolveOpportunityContext,
  saveDraft,
  tailorConfigSchema,
  type OpportunityResumePreview,
  type OpportunityResumeState,
} from "./composer";

export async function buildOpportunityResumePreview(
  accountId: string,
  opportunityId: string,
  options: {
    customInstruction?: string | null;
    previousSelectedBulletIds?: string[] | null;
    includeSummary?: boolean;
    forceRegenerate?: boolean;
    inventMetrics?: boolean;
    devModelOverride?: string | null;
  } = {}
): Promise<OpportunityResumePreview | null> {
  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    select: {
      id: true,
      title: true,
      company: true,
      description: true,
      applyUrl: true,
      salary: true,
      location: true,
      postedAt: true,
      tailoredResumePdf: true,
      tailoredResumeData: true,
      tailorConfig: true,
    },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  const accountRules = parseAccountRules(account?.settings?.rules);

  const includeSummary =
    options.includeSummary !== undefined
      ? options.includeSummary
      : (accountRules.resumePreferences?.includeSummary ?? false);
  const inventMetrics =
    options.inventMetrics !== undefined
      ? options.inventMetrics
      : (accountRules.resumePreferences?.inventMetrics ?? false);
  const forceRegenerate = options.forceRegenerate === true;

  if (!forceRegenerate) {
    const cached = previewFromCache(opportunity);
    if (cached) {
      const config = tailorConfigSchema.safeParse(opportunity.tailorConfig ?? {});
      const cachedIncludeSummary = config.success
        ? config.data.includeSummary
        : cached.includeSummary;
      const cachedInventMetrics = config.success
        ? config.data.inventMetrics
        : undefined;

      const summaryMatches = cachedIncludeSummary === includeSummary;
      const metricsMatch =
        cachedInventMetrics === undefined || cachedInventMetrics === inventMetrics;

      if (summaryMatches && metricsMatch) {
        return cached;
      }
    }
  }

  const profile = await loadMasterProfile(accountId);

  let { context } = await resolveOpportunityContext(opportunityId);

  // On-demand HasData hydration for Glassdoor and Indeed when context is MINIMAL_LEAD
  const targetUrl = context.applyUrl || opportunity.applyUrl;
  const isGlassdoorOrIndeed = Boolean(
    targetUrl && /glassdoor\.com|indeed\.com/i.test(targetUrl)
  );

  if (context.richness === "MINIMAL_LEAD" && isGlassdoorOrIndeed && targetUrl) {
    const hasDataApiKey = resolveDecryptedHasDataKey(accountRules);
    if (hasDataApiKey) {
      try {
        const platform = /glassdoor\.com/i.test(targetUrl)
          ? "glassdoor"
          : "indeed";
        const hasDataResult = await fetchViaHasData(
          targetUrl,
          hasDataApiKey,
          platform
        );
        if (
          hasDataResult.data?.description &&
          hasDataResult.data.description.length > (context.jobDescription?.length ?? 0)
        ) {
          const newSalary = normalizeSalaryDisplay(hasDataResult.data.salary);
          const shouldUpdateSalary = Boolean(
            newSalary && (!opportunity.salary || !normalizeSalaryDisplay(opportunity.salary))
          );
          const newPostedAt = normalizePostedAt(
            hasDataResult.data.datePosted,
            hasDataResult.data.description
          );
          const shouldUpdatePostedAt = Boolean(
            newPostedAt && isUnspecifiedPostedAt(opportunity.postedAt)
          );

          let newScore: number | undefined;
          let newReason: string | undefined;
          try {
            const candidateProfile = await loadCandidateProfileSummary(accountId);
            if (candidateProfile) {
              const candidateLens = extractMatchCandidateLens(
                candidateProfile,
                candidateProfile.persona
              );
              const normalized = resolveJobOpportunity({
                company: hasDataResult.data.company || opportunity.company,
                title: context.roleTitle,
                description: hasDataResult.data.description,
                location: hasDataResult.data.location || opportunity.location,
                salary: shouldUpdateSalary && newSalary ? newSalary : opportunity.salary,
                postedAt: shouldUpdatePostedAt && newPostedAt ? newPostedAt : opportunity.postedAt,
                applyUrl: targetUrl,
              });
              const evaluated = evaluateOpportunityMatch({
                opportunity: normalized,
                candidate: candidateLens,
                mode: "HEURISTIC",
              });
              newScore = evaluated.score;
              newReason = evaluated.reason;
            }
          } catch {
            // Non-fatal match re-evaluation
          }

          await prisma.jobOpportunity.update({
            where: { id: opportunityId },
            data: {
              description: hasDataResult.data.description,
              ...(newScore !== undefined
                ? { matchScore: newScore, classificationMethod: "HEURISTIC" }
                : {}),
              ...(newReason ? { matchReason: newReason } : {}),
              ...(shouldUpdateSalary && newSalary
                ? { salary: newSalary, salaryMax: parseSalaryMax(newSalary) }
                : {}),
              ...(shouldUpdatePostedAt && newPostedAt
                ? { postedAt: newPostedAt }
                : {}),
              ...(hasDataResult.data.location && !opportunity.location
                ? { location: hasDataResult.data.location }
                : {}),
              ...(hasDataResult.data.company &&
              (!opportunity.company || opportunity.company === "Unknown Company")
                ? { company: hasDataResult.data.company }
                : {}),
            },
          });
          const reResolved = await resolveOpportunityContext(opportunityId);
          context = reResolved.context;
          refreshHasDataUsageAfterUse(accountId).catch((err) => {
            console.warn("[resume] Background HasData usage refresh failed:", err);
          });
        }
      } catch (err) {
        console.warn("[resume] On-demand HasData hydration failed:", err);
      }
    }
  }

  const tailored = await tailorResumeForJob(
    [context.roleTitle, context.company, context.jobDescription],
    profile,
    {
      companyName: context.company,
      roleTitle: context.roleTitle,
      jobText: context.jobDescription,
      llmProvider: normalizeProvider(account?.settings?.llmProvider),
      localOllamaUrl: account?.settings?.localOllamaUrl,
      ollamaModel: account?.settings?.ollamaModel,
      devModelOverride: options.devModelOverride,
      allowCloudFallback: accountRules.allowCloudFallback,
      customInstruction: options.customInstruction,
      previousSelectedBulletIds: options.previousSelectedBulletIds,
      dbClient: prisma,
      includeSummary,
      inventMetrics,
      targetPages:
        accountRules.targetPageBudget ??
        accountRules.resumePreferences?.maxPages ??
        "auto",
      contentInclusionMode: accountRules.contentInclusionMode,
      accountId,
      accountRules,
    }
  );

  const filename = `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`;
  const draft = digestTailoredResume({
    opportunityId,
    profile,
    tailored,
    includeSummary,
    rules: accountRules,
  });
  const compiled = draftToPdfInput(draft, profile);

  const preview: OpportunityResumePreview = {
    filename,
    pdfBase64: "",
    experiences: compiled.experiences,
    projects: compiled.projects,
    tailoredSummary: compiled.tailoredSummary,
    strategyRationale: tailored.strategyRationale,
    includeSummary,
    draft,
  };

  await persistOpportunityResumeCache(opportunityId, preview, { inventMetrics });
  return preview;
}

/** Load cached resume + account default includeSummary (never calls Ollama). */
export async function getOpportunityResumeState(
  accountId: string,
  opportunityId: string
): Promise<OpportunityResumeState> {
  const [opportunity, account] = await Promise.all([
    prisma.jobOpportunity.findFirst({
      where: { id: opportunityId, accountId },
      select: {
        tailoredResumePdf: true,
        tailoredResumeData: true,
        tailorConfig: true,
      },
    }),
    prisma.account.findUnique({
      where: { id: accountId },
      include: { settings: true },
    }),
  ]);
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  const rules = parseAccountRules(account?.settings?.rules);
  const prefs = rules.resumePreferences ?? DEFAULT_RESUME_PREFERENCES;
  const defaultIncludeSummary = prefs.includeSummary;
  const defaultAttachPdf = prefs.attachPdfByDefault;
  const resume = previewFromCache(opportunity);

  return { resume, defaultIncludeSummary, defaultAttachPdf };
}

/**
 * On-demand spec hydration helper for an opportunity.
 * Upgrades a MINIMAL_LEAD on Glassdoor or Indeed to RICH_SPEC using the account's HasData BYOK key.
 */
export async function hydrateOpportunitySpec(
  accountId: string,
  opportunityId: string
): Promise<{ ok: boolean; upgraded: boolean; message: string }> {
  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    select: {
      id: true,
      applyUrl: true,
      description: true,
      salary: true,
      location: true,
      company: true,
      postedAt: true,
    },
  });
  if (!opportunity) {
    return { ok: false, upgraded: false, message: "Opportunity not found" };
  }

  const { context } = await resolveOpportunityContext(opportunityId);
  const targetUrl = context.applyUrl || opportunity.applyUrl;
  if (!targetUrl || !/glassdoor\.com|indeed\.com/i.test(targetUrl)) {
    return {
      ok: true,
      upgraded: false,
      message: "Not a Glassdoor or Indeed listing",
    };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  const rules = parseAccountRules(account?.settings?.rules);
  const hasDataKey = resolveDecryptedHasDataKey(rules);
  if (!hasDataKey) {
    return {
      ok: false,
      upgraded: false,
      message: "No HasData API key configured in Settings",
    };
  }

  const platform = /glassdoor\.com/i.test(targetUrl) ? "glassdoor" : "indeed";
  const result = await fetchViaHasData(targetUrl, hasDataKey, platform);
  if (
    result.data?.description &&
    result.data.description.length > (context.jobDescription?.length ?? 0)
  ) {
    const newSalary = normalizeSalaryDisplay(result.data.salary);
    const shouldUpdateSalary = Boolean(
      newSalary && (!opportunity.salary || !normalizeSalaryDisplay(opportunity.salary))
    );
    const newPostedAt = normalizePostedAt(
      result.data.datePosted,
      result.data.description
    );
    const shouldUpdatePostedAt = Boolean(
      newPostedAt && isUnspecifiedPostedAt(opportunity.postedAt)
    );

    let newScore: number | undefined;
    let newReason: string | undefined;

    try {
      const candidateProfile = await loadCandidateProfileSummary(accountId);
      if (candidateProfile) {
        const candidateLens = extractMatchCandidateLens(
          candidateProfile,
          candidateProfile.persona
        );
        const normalized = resolveJobOpportunity({
          company: result.data.company || opportunity.company,
          title: context.roleTitle,
          description: result.data.description,
          location: result.data.location || opportunity.location,
          salary: shouldUpdateSalary && newSalary ? newSalary : opportunity.salary,
          postedAt: shouldUpdatePostedAt && newPostedAt ? newPostedAt : opportunity.postedAt,
          applyUrl: targetUrl,
        });
        const evaluated = evaluateOpportunityMatch({
          opportunity: normalized,
          candidate: candidateLens,
          mode: "HEURISTIC",
        });
        newScore = evaluated.score;
        newReason = evaluated.reason;
      }
    } catch {
      // Non-fatal match re-evaluation
    }

    await prisma.jobOpportunity.update({
      where: { id: opportunityId },
      data: {
        description: result.data.description,
        ...(newScore !== undefined
          ? { matchScore: newScore, classificationMethod: "HEURISTIC" }
          : {}),
        ...(newReason ? { matchReason: newReason } : {}),
        ...(shouldUpdateSalary && newSalary
          ? { salary: newSalary, salaryMax: parseSalaryMax(newSalary) }
          : {}),
        ...(shouldUpdatePostedAt && newPostedAt
          ? { postedAt: newPostedAt }
          : {}),
        ...(result.data.location && !opportunity.location
          ? { location: result.data.location }
          : {}),
        ...(result.data.company &&
        (!opportunity.company || opportunity.company === "Unknown Company")
          ? { company: result.data.company }
          : {}),
      },
    });
    refreshHasDataUsageAfterUse(accountId).catch((err) => {
      console.warn("[resume] Background HasData usage refresh failed:", err);
    });
    return {
      ok: true,
      upgraded: true,
      message: `Successfully hydrated ${result.data.description.length} chars via HasData`,
    };
  }

  return {
    ok: false,
    upgraded: false,
    message: result.errorMsg || "Failed to extract spec from HasData",
  };
}

/**
 * Digest the master profile and job into an editable draft.
 * Without forceRegenerate, returns the cached draft or null (no model call, no PDF).
 */
export async function prepareOpportunityResume(
  accountId: string,
  opportunityId: string,
  options: {
    includeSummary?: boolean;
    forceRegenerate?: boolean;
    inventMetrics?: boolean;
    devModelOverride?: string | null;
  } = {}
): Promise<OpportunityResumePreview | null> {
  return buildOpportunityResumePreview(accountId, opportunityId, {
    includeSummary: options.includeSummary,
    forceRegenerate: options.forceRegenerate === true,
    inventMetrics: options.inventMetrics,
    devModelOverride: options.devModelOverride,
  });
}

/** Re-tailor the resume using a free-form instruction and prior bullet selection. */
export async function refineOpportunityResume(
  accountId: string,
  opportunityId: string,
  instruction: string,
  previousExperiences?: WorkExperienceInput[] | null,
  includeSummary = false,
  inventMetrics?: boolean,
  devModelOverride?: string | null
): Promise<OpportunityResumePreview> {
  const trimmed = instruction.trim();
  if (!trimmed) {
    throw new Error("Refinement instruction is required");
  }

  const previousSelectedBulletIds =
    previousExperiences?.flatMap((exp) => exp.bullets.map((b) => b.id)) ?? [];

  const preview = await buildOpportunityResumePreview(accountId, opportunityId, {
    customInstruction: trimmed,
    previousSelectedBulletIds,
    includeSummary,
    inventMetrics,
    forceRegenerate: true,
    devModelOverride,
  });
  if (!preview) {
    throw new Error("Failed to refine resume");
  }
  return preview;
}

export async function updateResumeDraftNode(
  accountId: string,
  opportunityId: string,
  nodeId: string,
  patch: { content?: string; selected?: boolean }
): Promise<OpportunityResumePreview> {
  const { draft } = await loadStoredDraft(accountId, opportunityId);
  const nodes = draft.nodes.map((item) => {
    if (item.id !== nodeId) return item;
    return {
      ...item,
      content: patch.content !== undefined ? patch.content : item.content,
      selected: patch.selected !== undefined ? patch.selected : item.selected,
    };
  });
  if (!nodes.some((item) => item.id === nodeId)) {
    throw new Error("Resume line not found");
  }
  return saveDraft(accountId, opportunityId, { ...draft, nodes });
}

export async function reorderResumeDraftNode(
  accountId: string,
  opportunityId: string,
  nodeId: string,
  direction: "up" | "down"
): Promise<OpportunityResumePreview> {
  const { draft } = await loadStoredDraft(accountId, opportunityId);
  return saveDraft(
    accountId,
    opportunityId,
    moveResumeNode(draft, nodeId, direction)
  );
}

export async function refineSingleResumeNode(
  accountId: string,
  opportunityId: string,
  nodeId: string,
  instruction: string
): Promise<OpportunityResumePreview> {
  const { draft } = await loadStoredDraft(accountId, opportunityId);
  const target = draft.nodes.find((item) => item.id === nodeId);
  if (!target) {
    throw new Error("Resume line not found");
  }
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  const rules = parseAccountRules(account?.settings?.rules);

  const content = await refineResumeLine({
    content: target.content,
    instruction,
    llmProvider: normalizeProvider(account?.settings?.llmProvider),
    localOllamaUrl: account?.settings?.localOllamaUrl,
    ollamaModel: account?.settings?.ollamaModel,
    allowCloudFallback: rules.allowCloudFallback,
  });
  const nodes = draft.nodes.map((item) =>
    item.id === nodeId ? { ...item, content } : item
  );
  return saveDraft(accountId, opportunityId, { ...draft, nodes });
}

/** Compile checked draft nodes into a PDF or DOCX. PDF is cached; DOCX is returned only. */
export async function compileResumeDocument(
  accountId: string,
  opportunityId: string,
  format: "pdf" | "docx" = "pdf"
): Promise<OpportunityResumePreview> {
  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    select: { tailoredResumeData: true },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }
  const stored = storedResumeDraftSchema.safeParse(opportunity.tailoredResumeData);
  if (!stored.success) {
    throw new Error("No editable resume draft for this opportunity");
  }
  const profile = await loadMasterProfile(accountId);
  const filenameBase = profile.fullName.replace(/\s+/g, "_");
  const compiled = draftToPdfInput(stored.data.draft, profile);
  if (format === "docx") {
    const docx = await compileResumeDocx(stored.data.draft);
    return {
      filename:
        stored.data.filename?.replace(/\.pdf$/i, ".docx") ??
        `${filenameBase}_Resume.docx`,
      pdfBase64: "",
      docxBase64: docx.toString("base64"),
      experiences: compiled.experiences,
      projects: compiled.projects,
      tailoredSummary: compiled.tailoredSummary,
      strategyRationale: stored.data.strategyRationale,
      includeSummary: compiled.includeSummary,
      draft: stored.data.draft,
    };
  }
  const pdf = await renderDraftPdf(profile, stored.data.draft);
  const filename = stored.data.filename ?? `${filenameBase}_Resume.pdf`;
  const preview: OpportunityResumePreview = {
    filename,
    pdfBase64: pdf.toString("base64"),
    experiences: compiled.experiences,
    projects: compiled.projects,
    tailoredSummary: compiled.tailoredSummary,
    strategyRationale: stored.data.strategyRationale,
    includeSummary: compiled.includeSummary,
    draft: stored.data.draft,
  };
  await persistOpportunityResumeCache(opportunityId, preview, { writePdf: true });
  return preview;
}
