import { GaxiosError } from "gaxios";
import type { gmail_v1 } from "googleapis";

import {
  getGmailClientForAccount,
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { cleanEmailPayload } from "@/lib/email/cleaner";
import {
  classifyEmail,
  extractMessageBody,
  loadCandidateProfileSummary,
  matchesJobEmailKeywords,
  sanitizeEmailBody,
  type LlmProvider,
} from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { parseFromHeader, persistClassifiedEmail } from "@/lib/sync";
import { parseAccountRules } from "@/lib/validations/rules";

export type OpportunitySyncOptions = {
  forceRescan?: boolean;
  lookbackDays?: number;
  /** Cap Gmail list size (Hobby / free-tier friendly). */
  maxMessages?: number;
};

export type OpportunitySyncResult = {
  processed: number;
  opportunitiesUpserted: number;
  skipped: number;
};

const JOB_QUERY_BASE =
  "(" +
  'subject:(job OR career OR role OR hiring OR interview OR opportunity OR application OR applied OR alert OR "thank you for applying" OR "application received" OR "application was sent" OR offer)' +
  " OR from:(glassdoor OR linkedin OR indeed OR lever OR greenhouse OR dice OR workday OR ashbyhq OR smartrecruiters OR icims OR myworkdayjobs)" +
  ") -in:trash -in:spam";

const BATCH_SIZE = 4;
const RATE_LIMIT_BASE_MS = 800;
/** Overlap buffer so boundary emails are not dropped between incremental runs. */
const INCREMENTAL_OVERLAP_SECONDS = 10 * 60;

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
      await sleep(RATE_LIMIT_BASE_MS * 2 ** attempt);
      return withRateLimitRetry(operation, attempt + 1);
    }
    throw error;
  }
}

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

async function listGmailMessageIds(
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
      if (message.id) ids.push(message.id);
      if (ids.length >= maxResults) break;
    }

    pageToken =
      ids.length >= maxResults
        ? undefined
        : (listed.data.nextPageToken ?? undefined);
  } while (pageToken);

  return ids;
}

function buildSyncQuery(input: {
  forceRescan: boolean;
  lookbackDays: number;
  lastSyncedAt: Date | null;
}): string {
  let query = JOB_QUERY_BASE;

  if (!input.forceRescan && input.lastSyncedAt) {
    // Incremental: only mail newer than last sync (10-minute overlap buffer).
    const afterTimestamp =
      Math.floor(input.lastSyncedAt.getTime() / 1000) -
      INCREMENTAL_OVERLAP_SECONDS;
    query += ` after:${afterTimestamp}`;
  } else {
    query += ` newer_than:${input.lookbackDays}d`;
  }

  return query;
}

/**
 * Fast incremental opportunity sync, or forced lookback rescan/backfill.
 * Uses cleaned payloads + batched concurrency (4) to cut AI latency.
 */
export async function runOpportunitySync(
  accountId: string,
  options: OpportunitySyncOptions = {}
): Promise<OpportunitySyncResult> {
  const forceRescan = options.forceRescan === true;
  const lookbackDays = options.lookbackDays ?? 14;
  const maxMessages = options.maxMessages ?? 25;

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        settings: true,
        profile: {
          include: {
            experiences: { orderBy: { displayOrder: "asc" }, take: 4 },
            education: true,
            projects: { take: 4 },
          },
        },
      },
    });

    if (!account || !account.isActive) {
      throw new Error("Account not found or inactive");
    }

    if (!account.profile) {
      console.warn(
        "Sync warning: Account has no linked profile. Match scoring will use generic profile defaults."
      );
    }

    const gmail = await getGmailClientForAccount(account);
    const query = buildSyncQuery({
      forceRescan,
      lookbackDays,
      lastSyncedAt: account.lastSyncedAt,
    });

    const messageIds = await listGmailMessageIds(gmail, query, maxMessages);

    if (messageIds.length === 0) {
      return { processed: 0, opportunitiesUpserted: 0, skipped: 0 };
    }

    let targetIds = messageIds;
    if (!forceRescan) {
      // Dedup against EmailMessage.messageId (Gmail ids), not JobOpportunity cuid FKs.
      // Re-process PENDING_AI rows so offline-parked mail gets classified when AI returns.
      const processed = await prisma.emailMessage.findMany({
        where: {
          accountId,
          messageId: { in: messageIds },
          emailCategory: { not: "PENDING_AI" },
        },
        select: { messageId: true },
      });
      const processedSet = new Set(processed.map((row) => row.messageId));
      targetIds = messageIds.filter((id) => !processedSet.has(id));
    }

    if (targetIds.length === 0) {
      return {
        processed: 0,
        opportunitiesUpserted: 0,
        skipped: messageIds.length,
      };
    }

    const rules = parseAccountRules(account.settings?.rules);
    const llmProvider = normalizeProvider(account.settings?.llmProvider);
    const candidateProfile = await loadCandidateProfileSummary(accountId);

    let opportunitiesUpserted = 0;

    for (let i = 0; i < targetIds.length; i += BATCH_SIZE) {
      const chunk = targetIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        chunk.map(async (messageId) => {
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
            const rawBody = extractMessageBody(message.data.payload);
            const cleanedText = cleanEmailPayload(
              rawBody.trim().length > 0
                ? rawBody
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
            });

            if (
              !classification ||
              !classification.is_job_related ||
              classification.email_category === "IRRELEVANT"
            ) {
              if (
                !classification &&
                matchesJobEmailKeywords(subject, cleanedText)
              ) {
                const threadId = message.data.threadId ?? messageId;
                const emailDate = message.data.internalDate
                  ? new Date(Number(message.data.internalDate))
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
                    snippet: sanitizeEmailBody(cleanedText).slice(0, 500),
                  },
                  update: {
                    emailCategory: "PENDING_AI",
                  },
                });
              }
              return 0;
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
              sender,
              emailDate,
              classification,
              rules,
            });

            return result.opportunitiesUpserted + (result.applicationTouched ? 1 : 0);
          } catch (error) {
            console.error(`Opportunity sync failed for ${messageId}`, error);
            if (isRateLimited(error)) {
              await sleep(RATE_LIMIT_BASE_MS * 2);
            }
            return 0;
          }
        })
      );

      opportunitiesUpserted += results.reduce((sum, n) => sum + n, 0);
    }

    return {
      processed: targetIds.length,
      opportunitiesUpserted,
      skipped: messageIds.length - targetIds.length,
    };
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
