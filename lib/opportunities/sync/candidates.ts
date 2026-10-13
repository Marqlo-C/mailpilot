import { GaxiosError } from "gaxios";
import type { gmail_v1 } from "googleapis";

import { buildJobSearchQuery } from "@/lib/constants/job-sources";
import { prisma } from "@/lib/prisma";
import { logStory, syncLog } from "@/lib/logging";
import { processInboxDelta } from "@/lib/sync";

export const JOB_QUERY_BASE = buildJobSearchQuery({ excludeTrashAndSpam: true });
export const RATE_LIMIT_BASE_MS = 800;
/** Overlap buffer so boundary emails are not dropped between incremental runs. */
export const INCREMENTAL_OVERLAP_SECONDS = 10 * 60;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRateLimited(error: unknown): boolean {
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

export async function withRateLimitRetry<T>(
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

export function buildSyncQuery(input: {
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

export async function listGmailMessageIds(
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

export type GatherSyncCandidatesInput = {
  gmail: gmail_v1.Gmail;
  account: {
    id: string;
    email: string;
    historyId: string | null;
    lastSyncedAt: Date | null;
  };
  forceRescan: boolean;
  lookbackDays: number;
  maxMessages: number;
};

export type GatherSyncCandidatesResult = {
  targetIds: string[];
  combinedCandidateIds: string[];
  historyExpired: boolean;
};

/**
 * Gathers candidate message IDs for opportunity synchronization:
 * 1. Runs delta sync (processInboxDelta) when historyId is present and not forceRescan.
 * 2. Runs Gmail search query (incremental or wide lookback).
 * 3. Merges up to 10 PENDING_AI backlog messages.
 * 4. Deduplicates against known EmailMessage and JobApplication records in the DB.
 */
export async function gatherSyncCandidates(
  input: GatherSyncCandidatesInput
): Promise<GatherSyncCandidatesResult> {
  const { gmail, account, forceRescan, lookbackDays, maxMessages } = input;

  // ── Step 1: History delta first (Pub/Sub catch-up + subscriptions) ─────
  let historyExpired = false;
  let deltaIdSet = new Set<string>();
  if (account.historyId && !forceRescan) {
    try {
      const delta = await processInboxDelta(account.email, account.historyId);
      historyExpired = delta.historyExpired;
      deltaIdSet = new Set(delta.messageIds);
    } catch (deltaErr) {
      syncLog.warn(
        { err: deltaErr },
        "Delta sync failed; falling back to query sweep"
      );
      historyExpired = true;
    }
  }

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
      accountId: account.id,
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
    return {
      targetIds: [],
      combinedCandidateIds: [],
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
          accountId: account.id,
          messageId: { in: combinedCandidateIds },
          emailCategory: { not: "PENDING_AI" },
        },
        select: { messageId: true },
      }),
      prisma.jobApplication.findMany({
        where: {
          accountId: account.id,
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

  return {
    targetIds,
    combinedCandidateIds,
    historyExpired,
  };
}
