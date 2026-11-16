import type { gmail_v1 } from "googleapis";

import { prisma } from "@/lib/core/prisma";
import { logCompactSyncCard } from "@/lib/logging";
import {
  persistClassifiedEmail,
  type ClassifiableAccount,
  type SenderInfo,
} from "@/lib/gmail/sync";
import type { JobClassification } from "@/lib/ai/classification";
import type { parseAccountRules } from "@/lib/validations/rules.schema";
import { resolveEffectiveScoringEngine } from "@/lib/matching";

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
  syncStartedAt?: number;
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

  const emailMessageId = result.emailMessageId;

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
        ...(emailMessageId
          ? { emailMessageId }
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

  const engineUsed =
    firstJob?.scoringEngineUsed ??
    resolveEffectiveScoringEngine(rules);

  let matchSource = "AI";
  if (engineUsed === "embedded") {
    matchSource = "Vector AI";
  } else if (engineUsed === "hybrid") {
    matchSource = "Hybrid 50/50";
  } else if (engineUsed === "heuristic") {
    matchSource = "Heuristic";
  } else if (classificationMethod === "HEURISTIC") {
    matchSource = "Heur";
  }

  let scoringDetails: string | undefined;
  if (firstJob?.scoringDetails) {
    scoringDetails = firstJob.scoringDetails;
  } else if (engineUsed === "embedded") {
    const prov = rules?.embeddingProvider ?? "local_ollama";
    scoringDetails = `Semantic crossover embedding match via ${prov}`;
  } else if (engineUsed === "hybrid") {
    scoringDetails = `50% heuristic profile overlap + 50% vector semantic crossover`;
  } else if (engineUsed === "heuristic") {
    scoringDetails = `Deterministic heuristic rule evaluation (role, seniority & skills)`;
  }

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
    scoringDetails,
    databaseAction: dedupeOutcomeText,
    syncStartedAt: params.syncStartedAt,
  });

  return {
    opportunitiesUpserted,
    createdCount,
    updatedCount,
  };
}
