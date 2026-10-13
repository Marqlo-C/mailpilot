import type { gmail_v1 } from "googleapis";

import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import {
  classifyEmail,
  extractMessageBody,
  isOllamaCircuitTripped,
  shouldClassifyEmail,
  type LlmProvider,
} from "@/lib/llm";
import type { JobClassification } from "@/lib/llm/classification";
import type { CandidateProfileSummary } from "@/lib/ai/classifier";
import { logCompactSyncCard, logStory, syncLog } from "@/lib/logging";
import {
  extractCleanSnippet,
  scrapeJobPostingJsonLd,
  unwrapTrackingUrl,
} from "@/lib/opportunities/context";
import { JOB_BOARD_KEYWORDS } from "@/lib/constants/job-sources";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { parseFromHeader, type ClassifiableAccount } from "@/lib/sync";
import type { parseAccountRules } from "@/lib/validations/rules";
import { withRateLimitRetry } from "./candidates";
import { persistSyncOpportunity } from "./dedupe";

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | undefined {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    undefined
  );
}

export type ProcessSyncMessageInput = {
  gmail: gmail_v1.Gmail;
  account: ClassifiableAccount;
  messageId: string;
  index: number;
  total: number;
  rules: ReturnType<typeof parseAccountRules>;
  candidateProfile: CandidateProfileSummary | null;
  ollamaDownForSync: boolean;
};

export type ProcessSyncMessageResult = {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  opportunitiesUpserted: number;
  tier: "OLLAMA" | "CLOUD" | "NONE";
  ollamaDownForSync: boolean;
};

export async function processSyncMessage(
  params: ProcessSyncMessageInput
): Promise<ProcessSyncMessageResult> {
  const {
    gmail,
    account,
    messageId,
    index,
    total,
    rules,
    candidateProfile,
  } = params;

  let ollamaDownForSync = params.ollamaDownForSync;
  const accountId = account.id;

  let message: gmail_v1.Schema$Message;
  try {
    const res = await withRateLimitRetry(() =>
      gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      })
    );
    message = res.data;
  } catch (fetchErr: unknown) {
    const is404 =
      (typeof fetchErr === "object" &&
        fetchErr !== null &&
        (("status" in fetchErr &&
          (fetchErr as { status?: number }).status === 404) ||
          ("code" in fetchErr &&
            (fetchErr as { code?: number }).code === 404))) ||
      (fetchErr instanceof Error &&
        fetchErr.message.toLowerCase().includes("notfound"));

    if (is404) {
      await prisma.emailMessage.updateMany({
        where: { accountId, messageId },
        data: {
          emailCategory: "IRRELEVANT",
          rawBody: null,
        },
      });

      logCompactSyncCard({
        index,
        total,
        subject: "(Message deleted or moved)",
        messageId,
        isJob: false,
        routing: [],
        skipReason: "Message not found in Gmail (404)",
      });

      return {
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 1,
        opportunitiesUpserted: 0,
        tier: "NONE",
        ollamaDownForSync,
      };
    }
    throw fetchErr;
  }

  const headers = message.payload?.headers;
  const subject = getHeader(headers, "Subject") ?? "";
  const from = getHeader(headers, "From");
  const sender = from ? parseFromHeader(from) : null;
  const fullRawBody = extractMessageBody(message.payload);
  const cleanedText = cleanEmailPayload(
    fullRawBody.trim().length > 0
      ? fullRawBody
      : message.snippet ?? subject
  );

  // Fast-path: Filter out promotional & marketing emails without LLM invocation
  if (
    !shouldClassifyEmail({
      subject,
      body: cleanedText,
      fromEmail: sender?.email ?? null,
    })
  ) {
    await prisma.emailMessage.updateMany({
      where: { accountId, messageId },
      data: {
        emailCategory: "IRRELEVANT",
        rawBody: null,
      },
    });

    logCompactSyncCard({
      index,
      total,
      subject,
      messageId,
      isJob: false,
      routing: [],
      skipReason: "Non-Job / Marketing or Newsletter",
    });

    return {
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      opportunitiesUpserted: 0,
      tier: "NONE",
      ollamaDownForSync,
    };
  }

  const llmProvider = normalizeProvider(account.settings?.llmProvider);
  const configuredOllamaUrl = account.settings?.localOllamaUrl ?? "";

  let classification: JobClassification | null = null;

  const shouldFastFailLocalOllama =
    llmProvider === "LOCAL_OLLAMA" &&
    !rules.allowCloudFallback &&
    (ollamaDownForSync || isOllamaCircuitTripped(configuredOllamaUrl));

  if (!shouldFastFailLocalOllama) {
    try {
      classification = await classifyEmail({
        llmProvider,
        localOllamaUrl: account.settings?.localOllamaUrl,
        ollamaModel: account.settings?.ollamaModel,
        subject,
        body: cleanedText,
        fromEmail: sender?.email ?? null,
        candidateProfile,
        allowCloudFallback: rules.allowCloudFallback,
        accountId: account.id,
        accountRules: rules,
      });
    } catch (err) {
      syncLog.warn(
        { err, messageId },
        "AI classification failed — parking as PENDING_AI"
      );
      classification = null;
    }

    if (
      llmProvider === "LOCAL_OLLAMA" &&
      !rules.allowCloudFallback &&
      isOllamaCircuitTripped(configuredOllamaUrl) &&
      !ollamaDownForSync
    ) {
      ollamaDownForSync = true;
      logStory(
        syncLog,
        "Local Ollama detected offline during sync pass. Fast-parking remaining messages as PENDING_AI.",
        { url: configuredOllamaUrl },
        "warn"
      );
    }
  }

  const routingLines =
    classification?.routingLines && classification.routingLines.length > 0
      ? classification.routingLines
      : [
          llmProvider === "LOCAL_OLLAMA"
            ? shouldFastFailLocalOllama
              ? "Tier 1: LOCAL_OLLAMA -> BYPASSED (Circuit Open) [0ms]"
              : "Tier 1: LOCAL_OLLAMA -> FAILED"
            : "Tier 1: LOCAL_OLLAMA -> NOT CONFIGURED",
          rules.allowCloudFallback
            ? "Tier 2: CLOUD_BYOK   -> FAILED / SKIPPED"
            : "Tier 2: CLOUD_BYOK   -> DISABLED (allowCloudFallback=false)",
        ];

  let tier: "OLLAMA" | "CLOUD" | "NONE" = "NONE";
  if (classification?.sourceTier === "TIER 1 (OLLAMA)") {
    tier = "OLLAMA";
  } else if (classification?.sourceTier === "TIER 2 (CLOUD)") {
    tier = "CLOUD";
  } else if (classification) {
    tier = llmProvider === "LOCAL_OLLAMA" ? "OLLAMA" : "CLOUD";
  }

  if (
    !classification ||
    !classification.is_job_related ||
    !classification.jobs ||
    classification.jobs.length === 0 ||
    classification.email_category === "IRRELEVANT"
  ) {
    let skipReason = "Non-Job / Marketing or Newsletter";

    if (classification) {
      // Evaluated and confirmed not a job -> clear from PENDING_AI
      await prisma.emailMessage.updateMany({
        where: { accountId, messageId },
        data: {
          emailCategory: "IRRELEVANT",
          rawBody: null,
        },
      });
      skipReason = "Confirmed Non-Job / IRRELEVANT";
    } else {
      // Both Ollama and Cloud were unavailable or rate-limited -> park as PENDING_AI
      const threadId = message.threadId ?? messageId;
      const emailDate = message.internalDate
        ? new Date(Number(message.internalDate))
        : new Date();

      await prisma.emailMessage.upsert({
        where: {
          accountId_messageId: {
            accountId,
            messageId,
          },
        },
        create: {
          accountId,
          messageId,
          threadId,
          subject,
          fromEmail: sender?.email ?? null,
          fromName: sender?.name ?? null,
          emailCategory: "PENDING_AI",
          emailDate,
          snippet: extractCleanSnippet(cleanedText, 500, 1500),
          rawBody: null,
        },
        update: {
          emailCategory: "PENDING_AI",
          snippet: extractCleanSnippet(cleanedText, 500, 1500),
          rawBody: null,
        },
      });
      skipReason = "Parked as PENDING_AI (Model Unavailable)";
    }

    logCompactSyncCard({
      index,
      total,
      subject,
      messageId,
      isJob: false,
      routing: routingLines,
      skipReason,
    });

    // Keep heartbeat fresh so background sync lock never becomes stale during skips/parking
    try {
      await prisma.account.update({
        where: { id: accountId },
        data: { syncHeartbeatAt: new Date() },
      });
    } catch {
      // Non-fatal heartbeat update
    }

    return {
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      opportunitiesUpserted: 0,
      tier,
      ollamaDownForSync,
    };
  }

  const threadId = message.threadId ?? messageId;
  const emailDate = message.internalDate
    ? new Date(Number(message.internalDate))
    : new Date();

  // Unpack tracking redirects and normalize URLs for all jobs in classification
  for (const job of classification.jobs) {
    if (job.applyUrl) {
      job.applyUrl = unwrapTrackingUrl(job.applyUrl);
    }
  }

  // Link Parser Enrichment: hydrate thin jobs (< 300 chars) via public JSON-LD in parallel pools
  const thinJobs = classification.jobs.filter(
    (job) =>
      (!job.description || job.description.length < 300) &&
      Boolean(job.applyUrl && /^https?:\/\//i.test(job.applyUrl))
  );

  if (thinJobs.length > 0) {
    let jinaApiKey: string | null = null;
    if (rules.encryptedJinaApiKey) {
      try {
        jinaApiKey = decryptToken(rules.encryptedJinaApiKey).trim() || null;
      } catch {
        jinaApiKey = null;
      }
    }

    const CONCURRENCY = 5;
    for (let i = 0; i < thinJobs.length; i += CONCURRENCY) {
      const batch = thinJobs.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (job) => {
          try {
            const { data: enriched, telemetry } = await scrapeJobPostingJsonLd(
              job.applyUrl!,
              2500,
              jinaApiKey
            );

            console.log(`  ├─ LinkParser: ${telemetry}`);

            if (enriched) {
              if (
                enriched.description &&
                enriched.description.length > (job.description?.length ?? 0)
              ) {
                job.description = enriched.description;
              }
              if (enriched.applyUrl) {
                job.applyUrl = enriched.applyUrl;
              }
              const isStillAggregator = JOB_BOARD_KEYWORDS.some((kw) =>
                (job.company || "").toLowerCase().includes(kw)
              );
              if (
                enriched.company &&
                (!job.company ||
                  job.company === "Unknown Company" ||
                  isStillAggregator)
              ) {
                job.company = enriched.company;
              }
              if (
                enriched.location &&
                (!job.location || /unspecified/i.test(job.location))
              ) {
                job.location = enriched.location;
              }
              if (enriched.salary && !job.salary) {
                job.salary = enriched.salary;
              }
            }
          } catch {
            console.log(`  ├─ LinkParser: Skipped (Network Error)`);
          }
        })
      );
    }
  }

  const dedupeResult = await persistSyncOpportunity({
    gmail,
    account,
    messageId,
    threadId,
    subject,
    cleanedText,
    sender,
    emailDate,
    classification: {
      ...classification,
      routingLines: classification.routingLines ?? routingLines,
    },
    rules,
    classificationMethod: "AI",
    index,
    total,
  });

  return {
    createdCount: dedupeResult.createdCount,
    updatedCount: dedupeResult.updatedCount,
    skippedCount: 0,
    opportunitiesUpserted: dedupeResult.opportunitiesUpserted,
    tier,
    ollamaDownForSync,
  };
}
