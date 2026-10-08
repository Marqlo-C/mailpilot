import { randomBytes } from "crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { canDraftDirectEmail } from "@/lib/application-method";
import { cleanEmailPayload } from "@/lib/email/cleaner";
import {
  cleanRecruiterFirstName,
  extractSenderTitle,
} from "@/lib/email-utils";
import {
  getGmailClientForAccount,
  rethrowIfInsufficientScope,
} from "@/lib/google";
import type { LlmProvider } from "@/lib/llm";
import { generateTailoredResumePdf } from "@/lib/pdf-generator";
import { prisma } from "@/lib/prisma";
import { loadMasterProfileForDraft } from "@/lib/master-profile";
import { compileResumeDocx } from "@/lib/resume-docx";
import {
  digestTailoredResume,
  draftToPdfInput,
  moveResumeNode,
  refineResumeLine,
  touchDraft,
} from "@/lib/resume-draft";
import {
  storedResumeDraftSchema,
  type TailoredResumeDraft,
} from "@/lib/types/resume-draft";
import {
  buildSlimCandidate,
  draftContextualEmail,
  tailorResumeForJob,
  type TailorResult,
} from "@/lib/resume-tailor";
import {
  projectInputSchema,
  skillsSchema,
  workExperienceInputSchema,
  type MasterProfileInput,
  type ProjectInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile";
import {
  DEFAULT_RESUME_PREFERENCES,
  parseAccountRules,
} from "@/lib/validations/rules";

export type OpportunityResumePreview = {
  filename: string;
  pdfBase64: string;
  experiences: WorkExperienceInput[];
  projects?: ProjectInput[];
  tailoredSummary?: string | null;
  tailoredSkills?: MasterProfileInput["skills"];
  strategyRationale?: TailorResult["strategyRationale"];
  includeSummary?: boolean;
  /** Line-addressable draft. Present after digestion, before or after PDF export. */
  draft?: TailoredResumeDraft | null;
  docxBase64?: string;
};

export type OpportunityResumeState = {
  resume: OpportunityResumePreview | null;
  defaultIncludeSummary: boolean;
  defaultAttachPdf: boolean;
};

const strategyRationaleCacheSchema = z.object({
  roleFitAnalysis: z.string(),
  selectedSkillsReasoning: z.string(),
  featuredExperiencesReasoning: z.string(),
  featuredProjectsReasoning: z.string(),
});

const tailoredResumeDataSchema = z.object({
  filename: z.string().optional(),
  tailoredSummary: z.string().nullable().optional(),
  tailoredSkills: skillsSchema.optional(),
  selectedExperience: z.array(workExperienceInputSchema).default([]),
  selectedProjects: z.array(projectInputSchema).default([]),
  strategyRationale: strategyRationaleCacheSchema.optional(),
});

const tailorConfigSchema = z.object({
  includeSummary: z.boolean().default(false),
});

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

/** Prefer full stored body (cleaned) over short list snippet for drafting. */
function emailBodyForDraft(emailMessage?: {
  rawBody?: string | null;
  snippet?: string | null;
} | null): string {
  const raw = emailMessage?.rawBody?.trim();
  if (raw) return cleanEmailPayload(raw);
  return emailMessage?.snippet?.trim() ?? "";
}

const emailMessageDraftSelect = {
  snippet: true,
  rawBody: true,
  emailCategory: true,
  fromName: true,
  fromEmail: true,
  subject: true,
} as const;

function encodeRaw(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type MimeAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

function safeMimeFilename(name: string): string {
  return name.replace(/[\r\n"/\\]/g, "_").slice(0, 180) || "attachment";
}

function buildMimeMessage(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments: MimeAttachment[];
}): string {
  const boundary = `mailpilot_${randomBytes(12).toString("hex")}`;
  const lines: string[] = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.body,
    "",
  ];

  for (const attachment of input.attachments) {
    const filename = safeMimeFilename(attachment.filename);
    const contentType =
      attachment.contentType.trim() || "application/octet-stream";
    const base64 = attachment.content
      .toString("base64")
      .replace(/(.{76})/g, "$1\r\n");
    lines.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      base64,
      ""
    );
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

async function loadMasterProfile(accountId: string) {
  return loadMasterProfileForDraft(accountId);
}

/**
 * Builds an in-app draft for a JobOpportunity using the fast contextual email path.
 */
export async function prepareOpportunityDraft(
  accountId: string,
  opportunityId: string
): Promise<{ subject: string; body: string; recipient: string | null }> {
  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    include: {
      emailMessage: {
        select: emailMessageDraftSelect,
      },
    },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });

  const profile = await loadMasterProfile(accountId);
  const slim = await buildSlimCandidate(profile, prisma);
  const inboundBody = emailBodyForDraft(opportunity.emailMessage);

  const recruiterName = cleanRecruiterFirstName(
    opportunity.emailMessage?.fromName ?? opportunity.recipientName,
    opportunity.emailMessage?.fromEmail ?? opportunity.recipientEmail,
    [inboundBody, opportunity.description].filter(Boolean).join("\n")
  );

  const recruiterTitle = extractSenderTitle(
    [
      opportunity.emailMessage?.fromName,
      inboundBody,
      opportunity.description,
      opportunity.recipientName,
    ]
      .filter(Boolean)
      .join("\n")
  );

  const inboundSnippet = [
    opportunity.emailMessage?.subject
      ? `Subject: ${opportunity.emailMessage.subject}`
      : null,
    opportunity.emailMessage?.fromName
      ? `From: ${opportunity.emailMessage.fromName} <${opportunity.emailMessage.fromEmail ?? ""}>`
      : null,
    inboundBody,
    opportunity.description,
    opportunity.title,
    opportunity.company,
    opportunity.location,
    opportunity.salary,
  ]
    .filter(Boolean)
    .join("\n");

  const draft = await draftContextualEmail({
    candidate: slim,
    profile,
    dbClient: prisma,
    sender: {
      cleanFirstName: recruiterName,
      titleOrPersona: recruiterTitle,
      companyName: opportunity.company,
      roleLabel: opportunity.title,
    },
    inboundSnippet,
    llmConfig: {
      provider: normalizeProvider(account?.settings?.llmProvider),
      localOllamaUrl: account?.settings?.localOllamaUrl,
      ollamaModel: account?.settings?.ollamaModel,
      allowCloudFallback: parseAccountRules(account?.settings?.rules).allowCloudFallback,
    },
  });

  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      draftSubject: draft.subject,
      draftBody: draft.body,
      status: "REVIEW_READY",
    },
  });

  return {
    subject: draft.subject,
    body: draft.body,
    recipient: opportunity.recipientEmail,
  };
}

/**
 * Re-drafts an opportunity email with a free-form refinement instruction.
 */
export async function refineOpportunityDraft(
  accountId: string,
  opportunityId: string,
  instruction: string
): Promise<{ subject: string; body: string }> {
  const trimmed = instruction.trim();
  if (!trimmed) {
    throw new Error("Refinement instruction is required");
  }

  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    include: {
      emailMessage: {
        select: emailMessageDraftSelect,
      },
    },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });

  const profile = await loadMasterProfile(accountId);
  const slim = await buildSlimCandidate(profile, prisma);
  const inboundBody = emailBodyForDraft(opportunity.emailMessage);

  const recruiterName = cleanRecruiterFirstName(
    opportunity.emailMessage?.fromName ?? opportunity.recipientName,
    opportunity.emailMessage?.fromEmail ?? opportunity.recipientEmail,
    [inboundBody, opportunity.description].filter(Boolean).join("\n")
  );
  const recruiterTitle = extractSenderTitle(
    [
      opportunity.emailMessage?.fromName,
      inboundBody,
      opportunity.description,
    ]
      .filter(Boolean)
      .join("\n")
  );

  const inboundSnippet = [
    opportunity.draftBody,
    opportunity.draftSubject,
    inboundBody,
    opportunity.description,
  ]
    .filter(Boolean)
    .join("\n---\n");

  const draft = await draftContextualEmail({
    candidate: slim,
    profile,
    dbClient: prisma,
    sender: {
      cleanFirstName: recruiterName,
      titleOrPersona: recruiterTitle,
      companyName: opportunity.company,
      roleLabel: opportunity.title,
    },
    inboundSnippet,
    customInstruction: trimmed,
    llmConfig: {
      provider: normalizeProvider(account?.settings?.llmProvider),
      localOllamaUrl: account?.settings?.localOllamaUrl,
      ollamaModel: account?.settings?.ollamaModel,
      allowCloudFallback: parseAccountRules(account?.settings?.rules).allowCloudFallback,
    },
  });

  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      draftSubject: draft.subject,
      draftBody: draft.body,
      status: "REVIEW_READY",
    },
  });

  return draft;
}

function previewFromStoredDraft(
  row: {
    tailoredResumePdf: string | null;
    tailorConfig: unknown;
  },
  stored: z.infer<typeof storedResumeDraftSchema>
): OpportunityResumePreview {
  const config = tailorConfigSchema.safeParse(row.tailorConfig ?? {});
  const includeSummary = config.success
    ? config.data.includeSummary
    : stored.draft.exportConfig.includeSummary;
  const compiled = draftToPdfInput(stored.draft);
  return {
    filename: stored.filename ?? "Resume.pdf",
    pdfBase64: row.tailoredResumePdf ?? "",
    experiences: compiled.experiences,
    projects: compiled.projects,
    tailoredSummary: compiled.tailoredSummary,
    strategyRationale: stored.strategyRationale,
    includeSummary,
    draft: stored.draft,
  };
}

function previewFromCache(row: {
  tailoredResumePdf: string | null;
  tailoredResumeData: unknown;
  tailorConfig: unknown;
}): OpportunityResumePreview | null {
  const stored = storedResumeDraftSchema.safeParse(row.tailoredResumeData);
  if (stored.success) {
    return previewFromStoredDraft(row, stored.data);
  }
  if (!row.tailoredResumePdf || !row.tailoredResumeData) return null;
  const data = tailoredResumeDataSchema.safeParse(row.tailoredResumeData);
  if (!data.success) return null;
  const config = tailorConfigSchema.safeParse(row.tailorConfig ?? {});
  const includeSummary = config.success
    ? config.data.includeSummary
    : false;
  return {
    filename: data.data.filename ?? "Resume.pdf",
    pdfBase64: row.tailoredResumePdf,
    experiences: data.data.selectedExperience,
    projects: data.data.selectedProjects,
    tailoredSummary: data.data.tailoredSummary ?? null,
    tailoredSkills: data.data.tailoredSkills,
    strategyRationale: data.data.strategyRationale,
    includeSummary,
  };
}

async function persistOpportunityResumeCache(
  opportunityId: string,
  preview: OpportunityResumePreview,
  options: { writePdf?: boolean } = {}
): Promise<void> {
  const writePdf = options.writePdf === true && Boolean(preview.pdfBase64);
  const payload = preview.draft
    ? {
        version: 2 as const,
        filename: preview.filename,
        draft: preview.draft,
        strategyRationale: preview.strategyRationale,
      }
    : {
        filename: preview.filename,
        tailoredSummary: preview.tailoredSummary ?? null,
        tailoredSkills: preview.tailoredSkills,
        selectedExperience: preview.experiences,
        selectedProjects: preview.projects ?? [],
        strategyRationale: preview.strategyRationale,
      };
  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      ...(writePdf
        ? { tailoredResumePdf: preview.pdfBase64 }
        : preview.draft
          ? { tailoredResumePdf: null }
          : { tailoredResumePdf: preview.pdfBase64 }),
      tailoredResumeData: payload as Prisma.InputJsonValue,
      tailoredAt: new Date(),
      tailorConfig: {
        includeSummary: preview.includeSummary === true,
      } as Prisma.InputJsonValue,
    },
  });
}

async function renderDraftPdf(
  profile: MasterProfileInput,
  draft: TailoredResumeDraft
): Promise<Buffer> {
  const compiled = draftToPdfInput(draft, profile);
  return generateTailoredResumePdf(
    profile,
    compiled.experiences,
    compiled.projects,
    compiled.tailoredSummary,
    undefined,
    compiled.includeSummary,
    {
      headerName: compiled.headerName,
      contactLine: compiled.contactLine,
      education: compiled.education,
      skillGroups: compiled.skillGroups,
    }
  );
}

async function buildOpportunityResumePreview(
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

  const tailored = await tailorResumeForJob(
    [opportunity.title, opportunity.company, opportunity.description ?? ""],
    profile,
    {
      companyName: opportunity.company,
      roleTitle: opportunity.title,
      jobText: opportunity.description ?? undefined,
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

async function loadStoredDraft(
  accountId: string,
  opportunityId: string
): Promise<{ draft: TailoredResumeDraft; filename: string }> {
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
  return {
    draft: stored.data.draft,
    filename: stored.data.filename ?? "Resume.pdf",
  };
}

async function saveDraft(
  accountId: string,
  opportunityId: string,
  draft: TailoredResumeDraft
): Promise<OpportunityResumePreview> {
  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    select: {
      tailoredResumePdf: true,
      tailoredResumeData: true,
      tailorConfig: true,
    },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }
  const previous = storedResumeDraftSchema.safeParse(opportunity.tailoredResumeData);
  const next = touchDraft(draft);
  const compiled = draftToPdfInput(next);
  const preview: OpportunityResumePreview = {
    filename: previous.success ? previous.data.filename ?? "Resume.pdf" : "Resume.pdf",
    pdfBase64: "",
    experiences: compiled.experiences,
    projects: compiled.projects,
    tailoredSummary: compiled.tailoredSummary,
    strategyRationale: previous.success ? previous.data.strategyRationale : undefined,
    includeSummary: next.exportConfig.includeSummary,
    draft: next,
  };
  await persistOpportunityResumeCache(opportunityId, preview);
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

export async function updateOpportunityRecipient(
  accountId: string,
  opportunityId: string,
  recipientEmail: string
): Promise<{ recipientEmail: string }> {
  const email = recipientEmail.trim().toLowerCase();
  if (!canDraftDirectEmail(email)) {
    throw new Error("Invalid recipient email address");
  }

  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    select: { id: true },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      recipientEmail: email,
      applicationType: "DIRECT_EMAIL",
    },
  });

  return { recipientEmail: email };
}

export async function updateOpportunityDraft(
  accountId: string,
  opportunityId: string,
  input: { subject: string; body: string; recipientEmail?: string }
): Promise<void> {
  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  const nextRecipient =
    input.recipientEmail !== undefined
      ? input.recipientEmail.trim().toLowerCase()
      : opportunity.recipientEmail;

  if (input.recipientEmail !== undefined && nextRecipient) {
    if (!canDraftDirectEmail(nextRecipient)) {
      throw new Error("Invalid recipient email address");
    }
  }

  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      draftSubject: input.subject.trim(),
      draftBody: input.body.trim(),
      status: "REVIEW_READY",
      ...(input.recipientEmail !== undefined
        ? {
            recipientEmail: nextRecipient || null,
            ...(nextRecipient
              ? { applicationType: "DIRECT_EMAIL" as const }
              : {}),
          }
        : {}),
    },
  });
}

export async function dispatchOpportunityEmail(
  accountId: string,
  opportunityId: string,
  options: {
    createDraftOnly?: boolean;
    /** Extra user-selected files (never includes the tailored resume). */
    extraAttachments?: MimeAttachment[];
    /** When set, skip re-tailoring and use this reviewed experience selection. */
    reviewedExperiences?: WorkExperienceInput[] | null;
    reviewedProjects?: ProjectInput[] | null;
    reviewedSummary?: string | null;
    reviewedSkills?: MasterProfileInput["skills"] | null;
    includeSummary?: boolean;
    /**
     * When false, outbound mail omits the tailored resume PDF.
     * Defaults to account resumePreferences.attachPdfByDefault.
     */
    attachResume?: boolean;
  } = {}
): Promise<{ mode: "draft" | "sent" }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account?.isActive) {
    throw new Error("Account not found or inactive");
  }

  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
    include: {
      emailMessage: {
        select: emailMessageDraftSelect,
      },
    },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }
  if (!canDraftDirectEmail(opportunity.recipientEmail)) {
    throw new Error(
      "No recruiter email address — refusing to create or send an email draft."
    );
  }

  const profile = await loadMasterProfile(accountId);
  const subject =
    opportunity.draftSubject?.trim() ||
    `Application: ${opportunity.title} at ${opportunity.company}`;
  const accountRules = parseAccountRules(account.settings?.rules);
  const resumePrefs =
    accountRules.resumePreferences ?? DEFAULT_RESUME_PREFERENCES;
  const attachResume =
    typeof options.attachResume === "boolean"
      ? options.attachResume
      : resumePrefs.attachPdfByDefault;
  const includeSummary =
    typeof options.includeSummary === "boolean"
      ? options.includeSummary
      : resumePrefs.includeSummary;

  let body = opportunity.draftBody?.trim() ?? "";
  if (!body) {
    const slim = await buildSlimCandidate(profile, prisma);
    const inboundBody = emailBodyForDraft(opportunity.emailMessage);
    const draft = await draftContextualEmail({
      candidate: slim,
      profile,
      dbClient: prisma,
      sender: {
        cleanFirstName: cleanRecruiterFirstName(
          opportunity.recipientName,
          opportunity.recipientEmail,
          [inboundBody, opportunity.description].filter(Boolean).join("\n")
        ),
        titleOrPersona: null,
        companyName: opportunity.company,
        roleLabel: opportunity.title,
      },
      inboundSnippet: [
        inboundBody,
        opportunity.description,
        opportunity.title,
      ]
        .filter(Boolean)
        .join("\n"),
      llmConfig: {
        provider: normalizeProvider(account.settings?.llmProvider),
        localOllamaUrl: account.settings?.localOllamaUrl,
        ollamaModel: account.settings?.ollamaModel,
        allowCloudFallback: accountRules.allowCloudFallback,
      },
    });
    body = draft.body;
  }

  const attachments: MimeAttachment[] = [...(options.extraAttachments ?? [])];

  if (attachResume) {
    const cachedPreview = previewFromCache({
      tailoredResumePdf: opportunity.tailoredResumePdf,
      tailoredResumeData: opportunity.tailoredResumeData,
      tailorConfig: opportunity.tailorConfig,
    });

    // Prefer reviewed selection, then persisted cache, then live tailor.
    let pdf: Buffer;
    let filename = `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`;
    if (options.reviewedExperiences && options.reviewedExperiences.length > 0) {
      pdf = await generateTailoredResumePdf(
        profile,
        options.reviewedExperiences,
        options.reviewedProjects ?? undefined,
        includeSummary ? options.reviewedSummary : null,
        options.reviewedSkills,
        includeSummary
      );
    } else if (cachedPreview?.draft) {
      pdf = await renderDraftPdf(profile, cachedPreview.draft);
      filename = cachedPreview.filename || filename;
    } else if (cachedPreview?.pdfBase64) {
      pdf = Buffer.from(cachedPreview.pdfBase64, "base64");
      filename = cachedPreview.filename || filename;
    } else {
      const tailored = await tailorResumeForJob(
        [opportunity.title, opportunity.company],
        profile,
        {
          companyName: opportunity.company,
          roleTitle: opportunity.title,
          llmProvider: normalizeProvider(account.settings?.llmProvider),
          localOllamaUrl: account.settings?.localOllamaUrl,
          ollamaModel: account.settings?.ollamaModel,
          allowCloudFallback: accountRules.allowCloudFallback,
          dbClient: prisma,
          includeSummary,
        }
      );
      const digested = digestTailoredResume({
        opportunityId,
        profile,
        tailored,
        includeSummary,
      });
      pdf = await renderDraftPdf(profile, digested);
      filename = `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`;
      const compiled = draftToPdfInput(digested, profile);
      await persistOpportunityResumeCache(
        opportunityId,
        {
          filename,
          pdfBase64: pdf.toString("base64"),
          experiences: compiled.experiences,
          projects: compiled.projects,
          tailoredSummary: compiled.tailoredSummary,
          strategyRationale: tailored.strategyRationale,
          includeSummary,
          draft: digested,
        },
        { writePdf: true }
      );
    }
    attachments.unshift({
      filename,
      contentType: "application/pdf",
      content: pdf,
    });
  }

  const raw = buildMimeMessage({
    from: account.email,
    to: opportunity.recipientEmail!,
    subject,
    body,
    attachments,
  });

  const gmail = await getGmailClientForAccount(account);
  const createDraftOnly = options.createDraftOnly === true;

  try {
    if (createDraftOnly) {
      await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw: encodeRaw(raw) } },
      });
    } else {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeRaw(raw) },
      });
    }
  } catch (error) {
    rethrowIfInsufficientScope(error);
  }

  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      draftSubject: subject,
      draftBody: body,
      status: createDraftOnly ? "REVIEW_READY" : "APPLIED",
      ...(createDraftOnly ? {} : { appliedAt: new Date() }),
    },
  });

  return { mode: createDraftOnly ? "draft" : "sent" };
}

export async function countSendsToday(accountId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [apps, opps] = await Promise.all([
    prisma.jobApplication.count({
      where: {
        accountId,
        OR: [
          { dispatchStatus: "SENT", sentAt: { gte: start } },
          { opportunityStatus: "SENT", sentAt: { gte: start } },
        ],
      },
    }),
    prisma.jobOpportunity.count({
      where: {
        accountId,
        status: "APPLIED",
        updatedAt: { gte: start },
        applicationType: "DIRECT_EMAIL",
      },
    }),
  ]);
  return apps + opps;
}

export async function getDailySendLimit(accountId: string): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      settings: true,
      persistentProfile: { include: { permanentSettings: true } },
    },
  });

  if (account?.persistentProfile?.permanentSettings) {
    return account.persistentProfile.permanentSettings.maxAutoSendsPerDay;
  }

  return parseAccountRules(account?.settings?.rules).maxAutoSendsPerDay;
}
