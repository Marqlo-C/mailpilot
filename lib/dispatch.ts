import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";

import {
  getGmailClientForAccount,
  rethrowIfInsufficientScope,
} from "@/lib/google";
import { generateTailoredResumePdf } from "@/lib/pdf-generator";
import { prisma } from "@/lib/prisma";
import { loadMasterProfileForDraft } from "@/lib/master-profile";
import {
  buildSlimCandidate,
  draftContextualEmail,
  tailorResumeForJob,
} from "@/lib/resume-tailor";
import {
  canDraftDirectEmail,
  extractRecruiterEmail,
} from "@/lib/application-method";
import { cleanRecruiterFirstName } from "@/lib/email-utils";
import type { LlmProvider } from "@/lib/llm";
import type { OpportunityStatus } from "@/lib/validations/profile";
import { tailoredDataSchema } from "@/lib/validations/profile";
import { parseAccountRules } from "@/lib/validations/rules";

const NO_RECRUITER_EMAIL_ERROR =
  "No recruiter email address — email drafts are forbidden without a direct contact.";

export { extractRecruiterEmail };

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

function encodeRaw(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMimeMessage(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  pdf: Buffer;
  filename: string;
}): string {
  const boundary = `mailpilot_${randomBytes(12).toString("hex")}`;
  const pdfBase64 = input.pdf.toString("base64").replace(/(.{76})/g, "$1\r\n");

  return [
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
    `--${boundary}`,
    `Content-Type: application/pdf; name="${input.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${input.filename}"`,
    "",
    pdfBase64,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

async function loadMasterProfile(accountId: string) {
  return loadMasterProfileForDraft(accountId);
}

/** Extracts a recruiter email from job fields. Never invents or falls back to the account. */
function requireRecruiterEmail(input: {
  toEmail?: string | null;
  actionSummary?: string | null;
  actionUrl?: string | null;
  applyUrl?: string | null;
}): string {
  const email = extractRecruiterEmail(input);
  if (!email) {
    throw new Error(NO_RECRUITER_EMAIL_ERROR);
  }
  return email;
}

export type DispatchOptions = {
  createDraftOnly?: boolean;
  toEmail?: string;
  /** When true, use persisted draftSubject/draftBody instead of regenerating. */
  usePreparedDraft?: boolean;
};

/**
 * Generates (or reuses) a tailored draft and either creates a Gmail draft or sends.
 */
export async function dispatchApplicationEmail(
  accountId: string,
  applicationId: string,
  options: DispatchOptions = {}
): Promise<{ mode: "draft" | "sent"; gmailDraftId?: string | null }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account || !account.isActive) {
    throw new Error("Account not found or inactive");
  }

  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, accountId },
  });
  if (!application) {
    throw new Error("Application not found");
  }

  const recipient = requireRecruiterEmail({
    toEmail: options.toEmail,
    actionSummary: application.actionSummary,
    actionUrl: application.actionUrl,
    applyUrl: application.applyUrl,
  });

  const profile = await loadMasterProfile(accountId);
  const existingTailored = application.tailoredData
    ? tailoredDataSchema.safeParse(application.tailoredData)
    : null;

  const requirements =
    existingTailored?.success &&
    existingTailored.data.jobRequirements.length > 0
      ? existingTailored.data.jobRequirements
      : [
          application.roleTitle ?? "role",
          application.companyName ?? "company",
          application.actionSummary ?? "",
        ].filter(Boolean);

  const usePrepared =
    options.usePreparedDraft === true &&
    Boolean(application.draftSubject?.trim() && application.draftBody?.trim());

  const tailored = usePrepared
    ? {
        selectedExperience: profile.experiences,
        selectedProjects: profile.projects,
        coverLetter: application.draftBody!,
        selectedBullets:
          existingTailored?.success
            ? existingTailored.data.selectedBullets
            : [],
        jobRequirements: requirements,
      }
    : await tailorResumeForJob(requirements, profile, {
        jobText: application.actionSummary ?? undefined,
        companyName: application.companyName,
        roleTitle: application.roleTitle,
        llmProvider: normalizeProvider(account.settings?.llmProvider),
        localOllamaUrl: account.settings?.localOllamaUrl,
        ollamaModel: account.settings?.ollamaModel,
        allowCloudFallback: parseAccountRules(account.settings?.rules).allowCloudFallback,
      });

  const pdf = await generateTailoredResumePdf(
    profile,
    tailored.selectedExperience.length > 0
      ? tailored.selectedExperience
      : profile.experiences,
    tailored.selectedProjects,
    "tailoredSummary" in tailored ? tailored.tailoredSummary : undefined,
    "tailoredSkills" in tailored ? tailored.tailoredSkills : undefined
  );

  const subject =
    usePrepared && application.draftSubject
      ? application.draftSubject
      : `Application: ${application.roleTitle ?? "Role"} at ${
          application.companyName ?? "Your Company"
        }`;

  const filename = `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`;
  const raw = buildMimeMessage({
    from: account.email,
    to: recipient,
    subject,
    body: tailored.coverLetter,
    pdf,
    filename,
  });

  const gmail = await getGmailClientForAccount(account);
  const createDraftOnly = options.createDraftOnly === true;
  let gmailDraftId: string | null = application.gmailDraftId;
  let gmailMessageId: string | null = application.gmailMessageId;

  try {
    if (createDraftOnly) {
      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: { raw: encodeRaw(raw) },
        },
      });
      gmailDraftId = draft.data.id ?? gmailDraftId;
    } else {
      const sent = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeRaw(raw) },
      });
      gmailMessageId = sent.data.id ?? gmailMessageId;
    }
  } catch (error) {
    rethrowIfInsufficientScope(error);
  }

  const now = new Date();
  const opportunityStatus: OpportunityStatus = createDraftOnly
    ? "DRAFT_SAVED_GMAIL"
    : "SENT";

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      draftSubject: subject,
      draftBody: tailored.coverLetter,
      gmailDraftId,
      gmailMessageId,
      opportunityStatus,
      tailoredData: {
        selectedBullets: tailored.selectedBullets,
        coverLetter: tailored.coverLetter,
        jobRequirements: tailored.jobRequirements,
      } as Prisma.InputJsonValue,
      ...(createDraftOnly
        ? {
            dispatchStatus: "PENDING_REVIEW",
          }
        : {
            dispatchStatus: "SENT",
            status: "APPLIED",
            sentAt: now,
            appliedAt: now,
          }),
    },
  });

  return {
    mode: createDraftOnly ? "draft" : "sent",
    gmailDraftId,
  };
}

/**
 * Generates an in-app draft (subject + body) and persists it without touching Gmail yet.
 */
export async function prepareApplicationDraft(
  accountId: string,
  applicationId: string
): Promise<{
  subject: string;
  body: string;
  recipient: string | null;
  opportunityStatus: OpportunityStatus;
}> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account || !account.isActive) {
    throw new Error("Account not found or inactive");
  }

  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, accountId },
  });
  if (!application) {
    throw new Error("Application not found");
  }

  const recipient = extractRecruiterEmail({
    actionSummary: application.actionSummary,
    actionUrl: application.actionUrl,
    applyUrl: application.applyUrl,
  });

  const profile = await loadMasterProfile(accountId);
  const slim = await buildSlimCandidate(profile, prisma);
  const recruiterName = cleanRecruiterFirstName(
    null,
    recipient,
    application.actionSummary
  );
  const draft = await draftContextualEmail({
    candidate: slim,
    profile,
    dbClient: prisma,
    sender: {
      cleanFirstName: recruiterName,
      titleOrPersona: "Recruiter",
      companyName: application.companyName ?? "Company",
      roleLabel: application.roleTitle,
    },
    inboundSnippet: [
      application.actionSummary,
      application.roleTitle,
      application.companyName,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500),
    llmConfig: {
      provider: normalizeProvider(account.settings?.llmProvider),
      localOllamaUrl: account.settings?.localOllamaUrl,
      ollamaModel: account.settings?.ollamaModel,
      allowCloudFallback: parseAccountRules(account.settings?.rules).allowCloudFallback,
    },
  });

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      draftSubject: draft.subject,
      draftBody: draft.body,
      opportunityStatus: "DRAFT_PREPARED",
      tailoredData: {
        selectedBullets: [],
        coverLetter: draft.body,
        jobRequirements: [
          application.roleTitle ?? "",
          application.companyName ?? "",
        ].filter(Boolean),
      } as Prisma.InputJsonValue,
    },
  });

  return {
    subject: draft.subject,
    body: draft.body,
    recipient,
    opportunityStatus: "DRAFT_PREPARED",
  };
}

export async function refineApplicationDraft(
  accountId: string,
  applicationId: string,
  instruction: string
): Promise<{ subject: string; body: string }> {
  const trimmed = instruction.trim();
  if (!trimmed) {
    throw new Error("Refinement instruction is required");
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account?.isActive) {
    throw new Error("Account not found or inactive");
  }

  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, accountId },
  });
  if (!application) {
    throw new Error("Application not found");
  }

  const profile = await loadMasterProfile(accountId);
  const slim = await buildSlimCandidate(profile, prisma);
  const recruiterName = cleanRecruiterFirstName(
    null,
    extractRecruiterEmail({
      actionSummary: application.actionSummary,
      actionUrl: application.actionUrl,
      applyUrl: application.applyUrl,
    }),
    [application.draftBody, application.actionSummary].filter(Boolean).join("\n")
  );
  const draft = await draftContextualEmail({
    candidate: slim,
    profile,
    dbClient: prisma,
    sender: {
      cleanFirstName: recruiterName,
      titleOrPersona: "Recruiter",
      companyName: application.companyName ?? "Company",
      roleLabel: application.roleTitle,
    },
    inboundSnippet: [
      application.draftBody,
      application.draftSubject,
      application.actionSummary,
    ]
      .filter(Boolean)
      .join("\n---\n")
      .slice(0, 1500),
    customInstruction: trimmed,
    llmConfig: {
      provider: normalizeProvider(account.settings?.llmProvider),
      localOllamaUrl: account.settings?.localOllamaUrl,
      ollamaModel: account.settings?.ollamaModel,
      allowCloudFallback: parseAccountRules(account.settings?.rules).allowCloudFallback,
    },
  });

  const existingTailored = application.tailoredData
    ? tailoredDataSchema.safeParse(application.tailoredData)
    : null;

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      draftSubject: draft.subject,
      draftBody: draft.body,
      opportunityStatus: "DRAFT_PREPARED",
      tailoredData: {
        selectedBullets: existingTailored?.success
          ? existingTailored.data.selectedBullets
          : [],
        coverLetter: draft.body,
        jobRequirements: existingTailored?.success
          ? existingTailored.data.jobRequirements
          : [],
      } as Prisma.InputJsonValue,
    },
  });

  return draft;
}

export async function updateApplicationRecipient(
  accountId: string,
  applicationId: string,
  recipientEmail: string
): Promise<{ recipientEmail: string }> {
  const email = recipientEmail.trim().toLowerCase();
  if (!canDraftDirectEmail(email)) {
    throw new Error("Invalid recipient email address");
  }

  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, accountId },
    select: { id: true },
  });
  if (!application) {
    throw new Error("Application not found");
  }

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      applyUrl: `mailto:${email}`,
      applicationMethod: "DIRECT_EMAIL",
      dispatchType: "EMAIL",
    },
  });

  return { recipientEmail: email };
}

export async function updatePreparedDraft(
  accountId: string,
  applicationId: string,
  input: { subject: string; body: string; recipientEmail?: string }
): Promise<void> {
  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, accountId },
  });
  if (!application) {
    throw new Error("Application not found");
  }

  const existingTailored = application.tailoredData
    ? tailoredDataSchema.safeParse(application.tailoredData)
    : null;

  let applyUrlUpdate: { applyUrl?: string; applicationMethod?: string; dispatchType?: string } =
    {};
  if (input.recipientEmail !== undefined) {
    const email = input.recipientEmail.trim().toLowerCase();
    if (email) {
      if (!canDraftDirectEmail(email)) {
        throw new Error("Invalid recipient email address");
      }
      applyUrlUpdate = {
        applyUrl: `mailto:${email}`,
        applicationMethod: "DIRECT_EMAIL",
        dispatchType: "EMAIL",
      };
    }
  }

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      draftSubject: input.subject.trim(),
      draftBody: input.body.trim(),
      opportunityStatus: "DRAFT_PREPARED",
      ...applyUrlUpdate,
      tailoredData: {
        selectedBullets: existingTailored?.success
          ? existingTailored.data.selectedBullets
          : [],
        coverLetter: input.body.trim(),
        jobRequirements: existingTailored?.success
          ? existingTailored.data.jobRequirements
          : [],
      } as Prisma.InputJsonValue,
    },
  });
}

export async function countSendsToday(accountId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.jobApplication.count({
    where: {
      accountId,
      OR: [
        { dispatchStatus: "SENT", sentAt: { gte: start } },
        { opportunityStatus: "SENT", sentAt: { gte: start } },
      ],
    },
  });
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
