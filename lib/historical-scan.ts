import { GaxiosError } from "gaxios";
import type { gmail_v1 } from "googleapis";

import { getGmailClientForAccount } from "@/lib/google";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import {
  classifyEmail,
  sanitizeEmailBody,
  type LlmProvider,
} from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { applyRejectionAction, mapClassificationStatus, parseFromHeader } from "@/lib/sync";
import { parseListUnsubscribeHeaders } from "@/lib/unsubscribe";
import { parseAccountRules } from "@/lib/validations/rules";
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

const JOB_CANDIDATE_LIMIT = 25;
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

function parseDeadline(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
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

  const results = await mapPool(messageIds, METADATA_CONCURRENCY, async (messageId) => {
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
        return 0;
      }

      const sender = parseFromHeader(from);
      if (!sender) return 0;

      const targets = parseListUnsubscribeHeaders(
        listUnsubscribe,
        getHeader(headers, "List-Unsubscribe-Post")
      );

      if (
        !targets.unsubHttpUrl &&
        !targets.unsubPostUrl &&
        !targets.unsubMailto
      ) {
        return 0;
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

      return 1;
    } catch (error) {
      console.error(`Historical subscription scan failed for ${messageId}`, error);
      return 0;
    }
  });

  return results.reduce<number>((sum, n) => sum + n, 0);
}

async function scanJobCandidates(
  gmail: gmail_v1.Gmail,
  account: {
    id: string;
    settings: {
      llmProvider: string;
      localOllamaUrl: string | null;
      rules: unknown;
    } | null;
  },
  days: ScanDays
): Promise<number> {
  const query = `newer_than:${days}d (subject:(application OR applied OR interview OR status OR assessment OR hackerrank OR coderpad OR "thank you") OR "thank you for applying")`;
  const messageIds = await listMessageIds(gmail, query, JOB_CANDIDATE_LIMIT);

  const existing = await prisma.jobApplication.findMany({
    where: {
      accountId: account.id,
      messageId: { in: messageIds },
    },
    select: { messageId: true },
  });
  const existingIds = new Set(existing.map((row) => row.messageId));
  const candidates = messageIds.filter((id) => !existingIds.has(id));

  const rules = parseAccountRules(account.settings?.rules);
  const llmProvider = normalizeProvider(account.settings?.llmProvider);
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
      const snippet = sanitizeEmailBody(message.data.snippet ?? "");
      const body =
        snippet.length > 0
          ? snippet.slice(0, 1200)
          : sanitizeEmailBody(
              // Prefer snippet; fall back to minimal header-derived text
              `${subject}`
            ).slice(0, 1200);

      const classification = await classifyEmail({
        llmProvider,
        localOllamaUrl: account.settings?.localOllamaUrl,
        subject,
        body,
      });

      if (!classification || !classification.is_job_related) {
        await sleep(200);
        continue;
      }

      const threadId = message.data.threadId ?? messageId;
      const emailDate = message.data.internalDate
        ? new Date(Number(message.data.internalDate))
        : new Date();

      const mappedStatus = mapClassificationStatus(classification.status);
      let isTrashed = false;
      let isArchived = false;

      if (mappedStatus === "REJECTION") {
        const action = await applyRejectionAction(gmail, messageId, rules);
        isTrashed = action.isTrashed;
        isArchived = action.isArchived;
      }

      const actionRequired =
        mappedStatus === "INTERVIEW" || mappedStatus === "OA"
          ? true
          : classification.action_required;

      await prisma.jobApplication.create({
        data: {
          accountId: account.id,
          messageId,
          threadId,
          companyName: classification.company_name,
          roleTitle: classification.role_title,
          status: mappedStatus,
          dispatchType: classification.action_url ? "PORTAL" : "EMAIL",
          dispatchStatus: "PENDING_REVIEW",
          actionRequired,
          actionSummary: classification.action_summary,
          actionUrl: classification.action_url,
          deadlineAt: parseDeadline(classification.deadline_iso),
          emailDate,
          isTrashed,
          isArchived,
        },
      });

      jobsFound += 1;
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
