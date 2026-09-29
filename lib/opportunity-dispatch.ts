import { randomBytes } from "crypto";

import { canDraftDirectEmail } from "@/lib/application-method";
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
import {
  buildSlimCandidate,
  draftContextualEmail,
  tailorResumeForJob,
} from "@/lib/resume-tailor";
import { parseAccountRules } from "@/lib/validations/rules";

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
        select: {
          snippet: true,
          emailCategory: true,
          fromName: true,
          fromEmail: true,
          subject: true,
        },
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

  const recruiterName = cleanRecruiterFirstName(
    opportunity.emailMessage?.fromName ?? opportunity.recipientName,
    opportunity.emailMessage?.fromEmail ?? opportunity.recipientEmail,
    [
      opportunity.emailMessage?.snippet,
      opportunity.description,
    ]
      .filter(Boolean)
      .join("\n")
  );

  const recruiterTitle = extractSenderTitle(
    [
      opportunity.emailMessage?.fromName,
      opportunity.emailMessage?.snippet,
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
    opportunity.emailMessage?.snippet,
    opportunity.description,
    opportunity.title,
    opportunity.company,
    opportunity.location,
    opportunity.salary,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1500);

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
        select: {
          snippet: true,
          emailCategory: true,
          fromName: true,
          fromEmail: true,
        },
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

  const recruiterName = cleanRecruiterFirstName(
    opportunity.emailMessage?.fromName ?? opportunity.recipientName,
    opportunity.emailMessage?.fromEmail ?? opportunity.recipientEmail,
    [
      opportunity.emailMessage?.snippet,
      opportunity.description,
    ]
      .filter(Boolean)
      .join("\n")
  );
  const recruiterTitle = extractSenderTitle(
    [
      opportunity.emailMessage?.fromName,
      opportunity.emailMessage?.snippet,
      opportunity.description,
    ]
      .filter(Boolean)
      .join("\n")
  );

  const inboundSnippet = [
    opportunity.draftBody,
    opportunity.draftSubject,
    opportunity.emailMessage?.snippet,
    opportunity.description,
  ]
    .filter(Boolean)
    .join("\n---\n")
    .slice(0, 1500);

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
  options: { createDraftOnly?: boolean } = {}
): Promise<{ mode: "draft" | "sent" }> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.isActive) {
    throw new Error("Account not found or inactive");
  }

  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
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
  let body = opportunity.draftBody?.trim() ?? "";
  if (!body) {
    const accountSettings = await prisma.accountSettings.findUnique({
      where: { accountId },
    });
    const slim = await buildSlimCandidate(profile, prisma);
    const draft = await draftContextualEmail({
      candidate: slim,
      profile,
      dbClient: prisma,
      sender: {
        cleanFirstName: cleanRecruiterFirstName(
          opportunity.recipientName,
          opportunity.recipientEmail,
          opportunity.description
        ),
        titleOrPersona: null,
        companyName: opportunity.company,
        roleLabel: opportunity.title,
      },
      inboundSnippet: [opportunity.description, opportunity.title]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1500),
      llmConfig: {
        provider: normalizeProvider(accountSettings?.llmProvider),
        localOllamaUrl: accountSettings?.localOllamaUrl,
        ollamaModel: accountSettings?.ollamaModel,
      },
    });
    body = draft.body;
  }

  // PDF still needs bullet selection — separate from the fast email path
  const tailored = await tailorResumeForJob(
    [opportunity.title, opportunity.company],
    profile,
    {
      companyName: opportunity.company,
      roleTitle: opportunity.title,
    }
  );

  const pdf = await generateTailoredResumePdf(
    profile,
    tailored.selectedExperience.length > 0
      ? tailored.selectedExperience
      : profile.experiences
  );

  const filename = `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`;
  const raw = buildMimeMessage({
    from: account.email,
    to: opportunity.recipientEmail!,
    subject,
    body,
    pdf,
    filename,
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
