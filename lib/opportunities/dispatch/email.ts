import { canDraftDirectEmail } from "@/lib/opportunities/application-method";
import {
  cleanRecruiterFirstName,
  extractSenderTitle,
} from "@/lib/gmail/email-utils";
import {
  getGmailClientForAccount,
  rethrowIfInsufficientScope,
} from "@/lib/gmail/google";
import { generateTailoredResumePdf } from "@/lib/document/pdf-generator";
import { prisma } from "@/lib/core/prisma";
import {
  buildSlimCandidate,
  draftContextualEmail,
} from "@/lib/resume-tailor";
import type {
  MasterProfileInput,
  ProjectInput,
  WorkExperienceInput,
} from "@/lib/validations/profile";
import {
  DEFAULT_RESUME_PREFERENCES,
  parseAccountRules,
} from "@/lib/validations/rules";
import {
  buildMimeMessage,
  encodeRaw,
  loadMasterProfile,
  normalizeProvider,
  previewFromCache,
  renderDraftPdf,
  resolveOpportunityContext,
  type MimeAttachment,
} from "./composer";
import { buildOpportunityResumePreview } from "./resume";

/**
 * Builds an in-app draft for a JobOpportunity using the fast contextual email path.
 */
export async function prepareOpportunityDraft(
  accountId: string,
  opportunityId: string
): Promise<{ subject: string; body: string; recipient: string | null }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account) {
    throw new Error("Account not found");
  }

  const { context } = await resolveOpportunityContext(opportunityId);

  const profile = await loadMasterProfile(accountId);
  const slim = await buildSlimCandidate(profile, prisma);

  const recruiterName = cleanRecruiterFirstName(
    context.contactName,
    context.contactEmail,
    context.jobDescription
  );

  const recruiterTitle = extractSenderTitle(
    [context.contactName, context.jobDescription, context.roleTitle]
      .filter(Boolean)
      .join("\n")
  );

  const draft = await draftContextualEmail({
    candidate: slim,
    profile,
    dbClient: prisma,
    sender: {
      cleanFirstName: recruiterName,
      titleOrPersona: recruiterTitle,
      companyName: context.company,
      roleLabel: context.roleTitle,
    },
    inboundSnippet: context.inboundSnippet,
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
    recipient: context.contactEmail ?? null,
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
    select: { draftBody: true, draftSubject: true },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });

  const { context } = await resolveOpportunityContext(opportunityId);

  const profile = await loadMasterProfile(accountId);
  const slim = await buildSlimCandidate(profile, prisma);

  const recruiterName = cleanRecruiterFirstName(
    context.contactName,
    context.contactEmail,
    context.jobDescription
  );
  const recruiterTitle = extractSenderTitle(
    [context.contactName, context.jobDescription]
      .filter(Boolean)
      .join("\n")
  );

  const inboundSnippet = [
    opportunity.draftBody,
    opportunity.draftSubject,
    context.inboundSnippet,
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
      companyName: context.company,
      roleLabel: context.roleTitle,
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
    select: {
      id: true,
      title: true,
      company: true,
      recipientEmail: true,
      recipientName: true,
      draftSubject: true,
      draftBody: true,
      tailoredResumePdf: true,
      tailoredResumeData: true,
      tailorConfig: true,
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
    const { context } = await resolveOpportunityContext(opportunityId);
    const slim = await buildSlimCandidate(profile, prisma);
    const draft = await draftContextualEmail({
      candidate: slim,
      profile,
      dbClient: prisma,
      sender: {
        cleanFirstName: cleanRecruiterFirstName(
          context.contactName,
          context.contactEmail,
          context.jobDescription
        ),
        titleOrPersona: null,
        companyName: context.company,
        roleLabel: context.roleTitle,
      },
      inboundSnippet: context.inboundSnippet,
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
      const generated = await buildOpportunityResumePreview(
        accountId,
        opportunityId,
        {
          includeSummary,
          forceRegenerate: true,
        }
      );
      if (generated?.draft) {
        pdf = await renderDraftPdf(profile, generated.draft);
        filename = generated.filename || filename;
      } else {
        pdf = Buffer.from(generated?.pdfBase64 ?? "", "base64");
        filename = generated?.filename || filename;
      }
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
