import { generateTailoredResumePdf } from "@/lib/pdf-generator";
import { prisma } from "@/lib/prisma";
import { compileResumeDocx } from "@/lib/resume-docx";
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
import {
  loadMasterProfile,
  loadStoredDraft,
  normalizeProvider,
  persistOpportunityResumeCache,
  previewFromCache,
  renderDraftPdf,
  resolveOpportunityContext,
  saveDraft,
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
  } = {}
): Promise<OpportunityResumePreview | null> {
  const includeSummary = options.includeSummary === true;
  const forceRegenerate = options.forceRegenerate === true;

  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    select: {
      id: true,
      title: true,
      company: true,
      description: true,
      tailoredResumePdf: true,
      tailoredResumeData: true,
      tailorConfig: true,
    },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  if (!forceRegenerate) {
    const cached = previewFromCache(opportunity);
    if (cached) {
      return cached;
    }
    return null;
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  const profile = await loadMasterProfile(accountId);
  const accountRules = parseAccountRules(account?.settings?.rules);

  const { context } = await resolveOpportunityContext(opportunityId);

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
      allowCloudFallback: accountRules.allowCloudFallback,
      customInstruction: options.customInstruction,
      previousSelectedBulletIds: options.previousSelectedBulletIds,
      dbClient: prisma,
      includeSummary,
    }
  );

  const filename = `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`;
  const draft = digestTailoredResume({
    opportunityId,
    profile,
    tailored,
    includeSummary,
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

  await persistOpportunityResumeCache(opportunityId, preview);
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
 * Digest the master profile and job into an editable draft.
 * Without forceRegenerate, returns the cached draft or null (no model call, no PDF).
 */
export async function prepareOpportunityResume(
  accountId: string,
  opportunityId: string,
  options: {
    includeSummary?: boolean;
    forceRegenerate?: boolean;
  } = {}
): Promise<OpportunityResumePreview | null> {
  return buildOpportunityResumePreview(accountId, opportunityId, {
    includeSummary: options.includeSummary === true,
    forceRegenerate: options.forceRegenerate === true,
  });
}

/** Re-tailor the resume using a free-form instruction and prior bullet selection. */
export async function refineOpportunityResume(
  accountId: string,
  opportunityId: string,
  instruction: string,
  previousExperiences?: WorkExperienceInput[] | null,
  includeSummary = false
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
    forceRegenerate: true,
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
