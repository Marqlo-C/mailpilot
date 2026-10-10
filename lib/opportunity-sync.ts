import { GaxiosError } from "gaxios";
import type { gmail_v1 } from "googleapis";

import { buildJobSearchQuery } from "@/lib/constants/job-sources";
import {
  getGmailClientForAccount,
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import {
  classifyEmail,
  extractMessageBody,
  loadCandidateProfileSummary,
  sanitizeEmailBody,
  shouldClassifyEmail,
  type LlmProvider,
} from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { logStory, syncLog } from "@/lib/logging";
import {
  parseFromHeader,
  persistClassifiedEmail,
  processInboxDelta,
  resolveIngestionRules,
} from "@/lib/sync";

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
  /** True when Gmail History API returned expired startHistoryId (404). */
  historyExpired: boolean;
};

const JOB_QUERY_BASE = buildJobSearchQuery({ excludeTrashAndSpam: true });

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
  historyExpired: boolean;
  lookbackDays: number;
  lastSyncedAt: Date | null;
}): { query: string; windowLabel: string } {
  let query = JOB_QUERY_BASE;

  // Wide lookback when force-rescanning or after History API expiry (gap cannot
  // be replayed via historyId — fall back to time search).
  if (input.forceRescan || input.historyExpired || !input.lastSyncedAt) {
    const reason = input.forceRescan
      ? "force rescan"
      : input.historyExpired
        ? "history tip expired"
        : "no lastSyncedAt yet";
    query += ` newer_than:${input.lookbackDays}d`;
    return {
      query,
      windowLabel: `lookback newer_than:${input.lookbackDays}d (${reason})`,
    };
  }

  // Incremental: only mail newer than last sync (10-minute overlap buffer).
  const afterTimestamp =
    Math.floor(input.lastSyncedAt.getTime() / 1000) -
    INCREMENTAL_OVERLAP_SECONDS;
  query += ` after:${afterTimestamp}`;
  return {
    query,
    windowLabel: `incremental after:${afterTimestamp} (lastSyncedAt − 10m overlap)`,
  };
}

/**
 * Delta-first inbox opportunity sync.
 *
 * Pipeline (owned by Sync Inbox / `syncInboxOpportunities`):
 * 1. `processInboxDelta` — subscriptions + history catch-up; advances `historyId`
 *    only (never `lastSyncedAt`).
 * 2. Job Gmail search (`after:lastSyncedAt` or lookback) + ≤10 `PENDING_AI` drain.
 * 3. Classify / persist job candidates (heartbeat renewed per chunk; unchanged).
 *
 * `lastSyncedAt` is stamped by the caller with the pre-run `runStartedAt` snapshot
 * after this function returns successfully — not here, not inside the delta.
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
      logStory(
        syncLog,
        "Account has no linked profile. Match scoring will use generic defaults.",
        { mailbox: account.email },
        "warn"
      );
    }

    logStory(syncLog, "Sync Inbox starting", {
      mailbox: account.email,
      mode: forceRescan ? "force rescan" : "incremental",
      "max job-query messages": maxMessages,
      "previous lastSyncedAt":
        account.lastSyncedAt?.toISOString() ?? "(never)",
    });

    // ── Step 1: History delta first (Pub/Sub catch-up + subscriptions) ─────
    const delta = await processInboxDelta(
      account.email,
      account.historyId ?? "1"
    );
    const historyExpired = delta.historyExpired;
    const deltaIdSet = new Set(delta.messageIds);

    const gmail = await getGmailClientForAccount(account);
    const { query, windowLabel } = buildSyncQuery({
      forceRescan,
      historyExpired,
      lookbackDays,
      lastSyncedAt: account.lastSyncedAt,
    });

    logStory(syncLog, "Step 2/4 — Job search + PENDING_AI drain", {
      window: windowLabel,
      "skipping delta ids": deltaIdSet.size,
    });

    // ── Step 2: Job search + PENDING_AI; dedupe vs delta + known rows ───────
    const listedIds = await listGmailMessageIds(gmail, query, maxMessages);
    // Delta already digested these; skip re-fetch (PENDING_AI still drained below).
    const gmailMessageIds = listedIds.filter((id) => !deltaIdSet.has(id));
    const skippedAsDeltaDupes = listedIds.length - gmailMessageIds.length;

    // Pull up to 10 backlogged PENDING_AI emails so Sync Inbox drains the queue.
    const pendingRows = await prisma.emailMessage.findMany({
      where: {
        accountId,
        emailCategory: "PENDING_AI",
      },
      select: { messageId: true },
      take: 10,
    });
    const pendingIds = pendingRows.map((r) => r.messageId);

    const combinedCandidateIds = Array.from(
      new Set([...gmailMessageIds, ...pendingIds])
    );

    logStory(syncLog, "Candidate scoop", {
      "Gmail job search hits": listedIds.length,
      "already digested in delta (skipped)": skippedAsDeltaDupes,
      "fresh from search": gmailMessageIds.length,
      "PENDING_AI backlog pulled": pendingIds.length,
      "combined unique": combinedCandidateIds.length,
    });

    if (combinedCandidateIds.length === 0) {
      logStory(
        syncLog,
        "Nothing left to classify — inbox already caught up. Step 3/4 skipped; Step 4 will stamp lastSyncedAt on success."
      );
      return {
        processed: 0,
        opportunitiesUpserted: 0,
        skipped: 0,
        historyExpired,
      };
    }

    let targetIds = combinedCandidateIds;
    if (!forceRescan) {
      // Dedup against EmailMessage + JobApplication (Gmail ids).
      // Keep PENDING_AI so offline-parked mail gets classified when AI returns.
      const [processedEmail, processedApps] = await Promise.all([
        prisma.emailMessage.findMany({
          where: {
            accountId,
            messageId: { in: combinedCandidateIds },
            emailCategory: { not: "PENDING_AI" },
          },
          select: { messageId: true },
        }),
        prisma.jobApplication.findMany({
          where: {
            accountId,
            messageId: { in: combinedCandidateIds },
          },
          select: { messageId: true },
        }),
      ]);
      const processedSet = new Set([
        ...processedEmail.map((row) => row.messageId),
        ...processedApps.map((row) => row.messageId),
      ]);
      // PENDING_AI rows must still run even if a JobApplication row exists.
      const pendingSet = new Set(pendingIds);
      targetIds = combinedCandidateIds.filter(
        (id) => pendingSet.has(id) || !processedSet.has(id)
      );
      logStory(
        syncLog,
        "After DB dedupe (keep PENDING_AI, skip known EmailMessage/JobApplication)",
        {
          "still to classify": targetIds.length,
          "skipped as already known":
            combinedCandidateIds.length - targetIds.length,
        }
      );
    }

    if (targetIds.length === 0) {
      logStory(
        syncLog,
        "All candidates were already known — nothing to classify."
      );
      return {
        processed: 0,
        opportunitiesUpserted: 0,
        skipped: combinedCandidateIds.length,
        historyExpired,
      };
    }

    const rules = await resolveIngestionRules(
      accountId,
      account.settings?.rules
    );
    const llmProvider = normalizeProvider(account.settings?.llmProvider);
    const candidateProfile = await loadCandidateProfileSummary(accountId);

    let opportunitiesUpserted = 0;

    logStory(syncLog, `Step 3/4 — Classifying ${targetIds.length} message(s)`, {
      "AI provider": llmProvider,
      "batch size": llmProvider === "LOCAL_OLLAMA" ? 1 : BATCH_SIZE,
    });

    // Serialize local Ollama inference to avoid concurrent queue timeouts.
    const effectiveBatchSize = llmProvider === "LOCAL_OLLAMA" ? 1 : BATCH_SIZE;
    for (let i = 0; i < targetIds.length; i += effectiveBatchSize) {
      const currentState = await prisma.account.findUnique({
        where: { id: accountId },
        select: { isSyncing: true },
      });

      // If the user clicked Cancel, isSyncing will be false. Abort the loop safely.
      if (!currentState?.isSyncing) {
        logStory(
          syncLog,
          "Stopped early — sync was cancelled (isSyncing cleared).",
          { "classified so far": `${i} / ${targetIds.length}` },
          "warn"
        );
        break;
      }

      const chunkLabel = `${Math.min(i + effectiveBatchSize, targetIds.length)} / ${targetIds.length}`;
      logStory(syncLog, `Classifying chunk … ${chunkLabel}`);

      const chunk = targetIds.slice(i, i + effectiveBatchSize);
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
              if (classification) {
                // LLM successfully ran and determined it is not a job -> clear from PENDING_AI
                await prisma.emailMessage.updateMany({
                  where: { accountId, messageId },
                  data: {
                    emailCategory: "IRRELEVANT",
                    rawBody:
                      fullRawBody.trim().length > 0 ? fullRawBody : null,
                  },
                });
              } else if (
                shouldClassifyEmail({
                  subject,
                  body: cleanedText,
                  fromEmail: sender?.email ?? null,
                })
              ) {
                // LLM was offline or failed -> park as PENDING_AI
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
                    rawBody:
                      fullRawBody.trim().length > 0 ? fullRawBody : null,
                  },
                  update: {
                    emailCategory: "PENDING_AI",
                    rawBody:
                      fullRawBody.trim().length > 0 ? fullRawBody : null,
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
              rawBody: fullRawBody,
              sender,
              emailDate,
              classification,
              rules,
            });

            return result.opportunitiesUpserted + (result.applicationTouched ? 1 : 0);
          } catch (error) {
            syncLog.error(
              { err: error, messageId },
              "Opportunity sync failed for message"
            );
            if (isRateLimited(error)) {
              await sleep(RATE_LIMIT_BASE_MS * 2);
            }
            return 0;
          }
        })
      );

      opportunitiesUpserted += results.reduce((sum, n) => sum + n, 0);

      await prisma.account.update({
        where: { id: accountId },
        data: { syncHeartbeatAt: new Date() },
      });
    }

    logStory(syncLog, "Step 3/4 done — classification finished", {
      "messages attempted": targetIds.length,
      "opportunities touched": opportunitiesUpserted,
      "skipped earlier as known":
        combinedCandidateIds.length - targetIds.length,
    });

    return {
      processed: targetIds.length,
      opportunitiesUpserted,
      skipped: combinedCandidateIds.length - targetIds.length,
      historyExpired,
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
