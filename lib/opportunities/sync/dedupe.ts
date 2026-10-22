import type { gmail_v1 } from "googleapis";

import { prisma } from "@/lib/core/prisma";
import { logCompactSyncCard } from "@/lib/logging";
import {
  persistClassifiedEmail,
  type ClassifiableAccount,
  type SenderInfo,
} from "@/lib/gmail/sync";
import type { JobClassification } from "@/lib/llm/classification";
import type { parseAccountRules } from "@/lib/validations/rules";

export type PersistSyncOpportunityParams = {
  gmail: gmail_v1.Gmail;
  account: ClassifiableAccount;
  messageId: string;
  threadId: string;
  subject: string;
  cleanedText: string;
  sender: SenderInfo | null;
  emailDate: Date;
  classification: JobClassification;
  rules: ReturnType<typeof parseAccountRules>;
  classificationMethod: "AI" | "HEURISTIC" | "HYBRID";
  index: number;
  total: number;
};

export type PersistSyncOpportunityResult = {
  opportunitiesUpserted: number;
  createdCount: number;
  updatedCount: number;
};

/**
 * 3-tier idempotent opportunity deduplication and persistence.
 * Upserts the classified email into EmailMessage, maps JobApplication or JobOpportunity,
 * and outputs the compact sync log card.
 */
export async function persistSyncOpportunity(
  params: PersistSyncOpportunityParams
): Promise<PersistSyncOpportunityResult> {
  const {
    gmail,
    account,
    messageId,
    threadId,
    subject,
    cleanedText,
    sender,
    emailDate,
    classification,
    rules,
    classificationMethod,
    index,
    total,
  } = params;

  const firstJob = classification.jobs?.[0];
  const isDirectEmail =
    firstJob?.applicationType === "DIRECT_EMAIL" ||
    classification.email_category === "DIRECT_RECRUITER" ||
    Boolean(
      firstJob?.recipientEmail &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(firstJob.recipientEmail)
    );

  const resolvedRecipientEmail =
    firstJob?.recipientEmail ||
    (classification.email_category === "DIRECT_RECRUITER" && sender?.email
      ? sender.email
      : null);

  const resolvedRecipientName =
    firstJob?.recipientName || sender?.name || null;

  const result = await persistClassifiedEmail({
    gmail,
    account,
    messageId,
    threadId,
    subject,
    body: cleanedText,
    rawBody: null,
    sender,
    emailDate,
    classification,
    rules,
    classificationMethod,
  });

  await prisma.emailMessage.updateMany({
    where: { accountId: account.id, messageId },
    data: {
      emailCategory: classification.email_category,
      rawBody: null,
    },
  });

  // Link the source email and persist drafting contact metadata
  const emailMessageRecord = await prisma.emailMessage.findUnique({
    where: {
      accountId_messageId: {
        accountId: account.id,
        messageId,
      },
    },
    select: { id: true },
  });

  const targetCompany =
    firstJob?.company || classification.company_name || "";
  const targetTitle =
    firstJob?.title || classification.role_title || "";

  if (isDirectEmail && targetCompany && targetCompany.toLowerCase() !== "unknown company") {
    await prisma.jobOpportunity.updateMany({
      where: {
        accountId: account.id,
        company: { equals: targetCompany, mode: "insensitive" },
        ...(targetTitle
          ? { title: { equals: targetTitle, mode: "insensitive" } }
          : {}),
      },
      data: {
        ...(emailMessageRecord
          ? { emailMessageId: emailMessageRecord.id }
          : {}),
        ...(resolvedRecipientEmail
          ? {
              recipientEmail: resolvedRecipientEmail,
              recipientName: resolvedRecipientName,
              applicationType: "DIRECT_EMAIL",
            }
          : {}),
      },
    });
  }

  const opportunitiesUpserted =
    result.opportunitiesUpserted + (result.applicationTouched ? 1 : 0);
  const createdCount = result.createdCount;
  const updatedCount = result.updatedCount;

  const matchScore = firstJob?.matchScore;
  const matchTier =
    matchScore !== undefined
      ? matchScore >= 75
        ? "HIGH"
        : matchScore >= 50
          ? "MID"
          : "LOW"
      : "MID";
  const matchSource = classificationMethod === "HEURISTIC" ? "Heur" : "AI";
  const dedupeOutcomeText =
    result.lastAction ||
    (result.createdCount > 0
      ? "Created new opportunity record"
      : "Updated / deduped opportunity record");

  logCompactSyncCard({
    index,
    total,
    subject,
    messageId,
    isJob: true,
    routing: classification.routingLines ?? [],
    company:
      firstJob?.company || classification.company_name || "Unknown",
    role: firstJob?.title || classification.role_title || "Role",
    location: firstJob?.location,
    salary: firstJob?.salary,
    status: classification.status,
    matchScore,
    matchTier,
    matchSource,
    databaseAction: dedupeOutcomeText,
  });

  return {
    opportunitiesUpserted,
    createdCount,
    updatedCount,
  };
}
