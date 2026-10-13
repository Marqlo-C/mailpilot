import { randomBytes } from "crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import { getGmailClientForAccount } from "@/lib/google";
import { extractMessageBody, type LlmProvider } from "@/lib/llm";
import { generateTailoredResumePdf } from "@/lib/pdf-generator";
import { prisma } from "@/lib/prisma";
import { loadMasterProfileForDraft } from "@/lib/master-profile";
import { draftToPdfInput, touchDraft } from "@/lib/resume-draft";
import {
  storedResumeDraftSchema,
  type TailoredResumeDraft,
} from "@/lib/types/resume-draft";
import type { TailorResult } from "@/lib/resume-tailor";
import {
  projectInputSchema,
  skillsSchema,
  workExperienceInputSchema,
  type MasterProfileInput,
  type ProjectInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile";
import {
  resolveJobOpportunity,
  type NormalizedJobOpportunity,
} from "@/lib/opportunities/context";

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

export type MimeAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export const strategyRationaleCacheSchema = z.object({
  roleFitAnalysis: z.string(),
  selectedSkillsReasoning: z.string(),
  featuredExperiencesReasoning: z.string(),
  featuredProjectsReasoning: z.string(),
});

export const tailoredResumeDataSchema = z.object({
  filename: z.string().optional(),
  tailoredSummary: z.string().nullable().optional(),
  tailoredSkills: skillsSchema.optional(),
  selectedExperience: z.array(workExperienceInputSchema).default([]),
  selectedProjects: z.array(projectInputSchema).default([]),
  strategyRationale: strategyRationaleCacheSchema.optional(),
});

export const tailorConfigSchema = z.object({
  includeSummary: z.boolean().default(false),
});

export function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

/** Prefer full stored body (cleaned) over short list snippet for drafting. */
export function emailBodyForDraft(emailMessage?: {
  rawBody?: string | null;
  snippet?: string | null;
} | null): string {
  const raw = emailMessage?.rawBody?.trim();
  if (raw) return cleanEmailPayload(raw);
  return emailMessage?.snippet?.trim() ?? "";
}

export const emailMessageDraftSelect = {
  snippet: true,
  rawBody: true,
  emailCategory: true,
  fromName: true,
  fromEmail: true,
  subject: true,
} as const;

export function encodeRaw(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function safeMimeFilename(name: string): string {
  return name.replace(/[\r\n"/\\]/g, "_").slice(0, 180) || "attachment";
}

export function buildMimeMessage(input: {
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

export async function loadMasterProfile(accountId: string) {
  return loadMasterProfileForDraft(accountId);
}

/**
 * Loads context from database record and optional on-demand Gmail fetch,
 * mapping through the anti-corruption resolveJobOpportunity lens.
 */
export async function resolveOpportunityContext(opportunityId: string): Promise<{
  context: NormalizedJobOpportunity;
  sourceEmailId?: string | null;
}> {
  const opp = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    include: {
      account: true,
      emailMessage: { select: emailMessageDraftSelect },
    },
  });

  if (!opp) throw new Error("Opportunity not found");

  let inboundRaw = emailBodyForDraft(opp.emailMessage);

  // If stored description or email body is missing and emailMessageId exists, fetch on-demand via Gmail API
  if (!inboundRaw && opp.emailMessageId && opp.account) {
    try {
      const gmail = await getGmailClientForAccount(opp.account);
      const res = await gmail.users.messages.get({
        userId: "me",
        id: opp.emailMessageId,
        format: "full",
      });
      const raw = extractMessageBody(res.data.payload);
      inboundRaw = cleanEmailPayload(raw || res.data.snippet || "");
    } catch {
      // Fallback to description
    }
  }

  const context = resolveJobOpportunity(opp, inboundRaw);
  return { context, sourceEmailId: opp.emailMessageId };
}

/**
 * Backward-compatible helper returning the scrubbed snippet.
 */
export async function resolveInboundContext(opportunityId: string): Promise<{
  snippet: string;
  sourceEmailId?: string | null;
}> {
  const { context, sourceEmailId } = await resolveOpportunityContext(opportunityId);
  return { snippet: context.inboundSnippet, sourceEmailId };
}

export function previewFromStoredDraft(
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

export function previewFromCache(row: {
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

export async function persistOpportunityResumeCache(
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

export async function renderDraftPdf(
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
      certifications: compiled.certifications,
      awards: compiled.awards,
      interests: compiled.interests,
    }
  );
}

export async function loadStoredDraft(
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

export async function saveDraft(
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
