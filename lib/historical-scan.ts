import { GaxiosError } from "gaxios";
import type { gmail_v1 } from "googleapis";

import { buildHistoricalJobSearchQuery } from "@/lib/constants/job-sources";
import { getGmailClientForAccount } from "@/lib/google";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import {
  classifyEmail,
  extractMessageBody,
  loadCandidateProfileSummary,
  type LlmProvider,
} from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { parseFromHeader, persistClassifiedEmail } from "@/lib/sync";
import { parseListUnsubscribeHeaders } from "@/lib/unsubscribe";
import { resolveIngestionRules } from "@/lib/sync";
import type { ScanDays } from "@/lib/scan-types";

export type { ScanDays } from "@/lib/scan-types";
export { SCAN_DAY_OPTIONS } from "@/lib/scan-types";

export type HistoricalScanSummary = {
  subscriptionsFound: number;
  jobsFound: number;
};

const SUBSCRIPTION_HEADERS = [
  "List-Unsubscribe",
  "List-Unsubscribe-Post",
  "From",
  "Subject",
  "Date",
] as const;

const JOB_CANDIDATE_LIMIT = 30;
const METADATA_CONCURRENCY = 5;
const RATE_LIMIT_BASE_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(error: unknown): boolean {
  if (error instanceof GaxiosError) {
    return error.response?.status === 429;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number | string }).code === 429
  ) {
    return true;
  }
  return false;
}

async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  attempt = 0
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isRateLimited(error) && attempt < 4) {
      const delay = RATE_LIMIT_BASE_MS * 2 ** attempt;
      await sleep(delay);
      return withRateLimitRetry(operation, attempt + 1);
    }
    throw error;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function run(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run()
  );
  await Promise.all(runners);
  return results;
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

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

/**
 * Scans recent Gmail history for newsletter unsubscribe headers and
 * job-application candidates (metadata-first, rate-limit aware).
 */
export async function scanHistoricalEmails(
  accountId: string,
  days: ScanDays
): Promise<HistoricalScanSummary> {
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { settings: true },
    });

    if (!account || !account.isActive) {
      throw new Error("Account not found or inactive");
    }

    const gmail = await getGmailClientForAccount(account);

    const subscriptionsFound = await scanSubscriptions(gmail, accountId, days);
    const jobsFound = await scanJobCandidates(gmail, account, days);

    return { subscriptionsFound, jobsFound };
  } catch (error) {
    if (
      error instanceof InsufficientScopeError ||
      isInsufficientScopeError(error)
    ) {
      throw new InsufficientScopeError(REAUTH_REQUIRED_MESSAGE);
    }
    throw error;
  }
}

async function listMessageIds(
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults: number
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const remaining = maxResults - ids.length;
    if (remaining <= 0) break;

    const listed = await withRateLimitRetry(() =>
      gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: Math.min(100, remaining),
        pageToken,
      })
    );

    for (const message of listed.data.messages ?? []) {
      if (message.id) {
        ids.push(message.id);
      }
      if (ids.length >= maxResults) break;
    }

    pageToken =
      ids.length >= maxResults
        ? undefined
        : (listed.data.nextPageToken ?? undefined);
  } while (pageToken);

  return ids;
}

async function scanSubscriptions(
  gmail: gmail_v1.Gmail,
  accountId: string,
  days: ScanDays
): Promise<number> {
  const query = `newer_than:${days}d unsubscribe`;
  // Cap volume to keep Hobby serverless under timeout
  const messageIds = await listMessageIds(gmail, query, 150);
  const uniqueSenders = new Set<string>();

  await mapPool(messageIds, METADATA_CONCURRENCY, async (messageId) => {
    try {
      const message = await withRateLimitRetry(() =>
        gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "metadata",
          metadataHeaders: [...SUBSCRIPTION_HEADERS],
        })
      );

      const headers = message.data.payload?.headers;
      const from = getHeader(headers, "From");
      const listUnsubscribe = getHeader(headers, "List-Unsubscribe");
      if (!from || !listUnsubscribe) {
        return;
      }

      const sender = parseFromHeader(from);
      if (!sender) return;

      const targets = parseListUnsubscribeHeaders(
        listUnsubscribe,
        getHeader(headers, "List-Unsubscribe-Post")
      );

      if (
        !targets.unsubHttpUrl &&
        !targets.unsubPostUrl &&
        !targets.unsubMailto
      ) {
        return;
      }

      const receivedAt = message.data.internalDate
        ? new Date(Number(message.data.internalDate))
        : new Date();

      await prisma.subscription.upsert({
        where: {
          accountId_senderEmail: {
            accountId,
            senderEmail: sender.email,
          },
        },
        create: {
          accountId,
          senderName: sender.name,
          senderEmail: sender.email,
          unsubHttpUrl: targets.unsubHttpUrl,
          unsubPostUrl: targets.unsubPostUrl,
          unsubPostBody: targets.unsubPostBody,
          unsubMailto: targets.unsubMailto,
          status: "ACTIVE",
          emailCount: 1,
          lastReceivedAt: receivedAt,
        },
        update: {
          senderName: sender.name ?? undefined,
          unsubHttpUrl: targets.unsubHttpUrl ?? undefined,
          unsubPostUrl: targets.unsubPostUrl ?? undefined,
          unsubPostBody: targets.unsubPostBody ?? undefined,
          unsubMailto: targets.unsubMailto ?? undefined,
          emailCount: { increment: 1 },
          lastReceivedAt: receivedAt,
        },
      });

      uniqueSenders.add(sender.email.toLowerCase());
    } catch (error) {
      console.error(`Historical subscription scan failed for ${messageId}`, error);
    }
  });

  return uniqueSenders.size;
}

async function scanJobCandidates(
  gmail: gmail_v1.Gmail,
  account: {
    id: string;
    email: string;
    persistentProfileId: string | null;
    settings: {
      llmProvider: string;
      localOllamaUrl: string | null;
      ollamaModel: string | null;
      rules: unknown;
    } | null;
  },
  days: ScanDays
): Promise<number> {
  const query = buildHistoricalJobSearchQuery(days);
  const messageIds = await listMessageIds(gmail, query, JOB_CANDIDATE_LIMIT);

  const [existingApps, existingMessages] = await Promise.all([
    prisma.jobApplication.findMany({
      where: {
        accountId: account.id,
        messageId: { in: messageIds },
      },
      select: { messageId: true },
    }),
    prisma.emailMessage.findMany({
      where: {
        accountId: account.id,
        messageId: { in: messageIds },
      },
      select: { messageId: true },
    }),
  ]);
  const existingIds = new Set([
    ...existingApps.map((row) => row.messageId),
    ...existingMessages.map((row) => row.messageId),
  ]);
  const candidates = messageIds.filter((id) => !existingIds.has(id));

  const rules = await resolveIngestionRules(
    account.id,
    account.settings?.rules
  );
  const llmProvider = normalizeProvider(account.settings?.llmProvider);
  const candidateProfile = await loadCandidateProfileSummary(account.id);
  let jobsFound = 0;

  // Sequential LLM calls to respect free-tier limits
  for (const messageId of candidates) {
    try {
      const message = await withRateLimitRetry(() =>
        gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        })
      );

      const headers = message.data.payload?.headers;
      const subject = getHeader(headers, "Subject") ?? "";
      const from = getHeader(headers, "From");
      const sender = from ? parseFromHeader(from) : null;
      const fullRawBody = extractMessageBody(message.data.payload);
      const cleanedText = cleanEmailPayload(
        fullRawBody.trim().length > 0
          ? fullRawBody
          : message.data.snippet ?? subject
      );

      const classification = await classifyEmail({
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

      if (
        !classification ||
        !classification.is_job_related ||
        classification.email_category === "IRRELEVANT"
      ) {
        await sleep(200);
        continue;
      }

      const threadId = message.data.threadId ?? messageId;
      const emailDate = message.data.internalDate
        ? new Date(Number(message.data.internalDate))
        : new Date();

      const result = await persistClassifiedEmail({
        gmail,
        account,
        messageId,
        threadId,
        subject,
        body: cleanedText,
        rawBody: fullRawBody,
        sender,
        emailDate,
        classification,
        rules,
      });

      jobsFound +=
        result.opportunitiesUpserted + (result.applicationTouched ? 1 : 0);
      await sleep(350);
    } catch (error) {
      console.error(`Historical job scan failed for ${messageId}`, error);
      if (isRateLimited(error)) {
        await sleep(RATE_LIMIT_BASE_MS * 2);
      }
    }
  }

  return jobsFound;
}
