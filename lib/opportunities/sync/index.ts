import {
  getGmailClientForAccount,
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/gmail/google";
import {
  isOllamaCircuitTripped,
  loadCandidateProfileSummary,
  type LlmProvider,
} from "@/lib/llm";
import { prisma } from "@/lib/core/prisma";
import {
  logStory,
  syncLog,
  logSyncSummaryBanner,
} from "@/lib/logging";
import { resolveIngestionRules } from "@/lib/gmail/sync";
import {
  purgeExpiredDismissed,
  pruneHeuristicOpportunities,
} from "@/lib/opportunities/cleanup";
import {
  gatherSyncCandidates,
  isRateLimited,
  sleep,
  RATE_LIMIT_BASE_MS,
} from "./candidates";
import { processSyncMessage } from "./processor";
import { refreshScrapingAntUsageAfterSync } from "@/lib/scraping/scrapingant";

export * from "./candidates";
export * from "./dedupe";
export * from "./processor";

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

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

/**
 * Delta-first inbox opportunity sync orchestrator.
 *
 * Pipeline:
 * 1. `processInboxDelta` — subscriptions + history catch-up.
 * 2. Job Gmail search (`after:lastSyncedAt` or lookback) + ≤10 `PENDING_AI` drain.
 * 3. Classify / persist job candidates with 350ms pacing & real-time counter updates.
 * 4. Commit `lastSyncedAt` watermark and emit sync summary.
 */
export async function runOpportunitySync(
  accountId: string,
  options: OpportunitySyncOptions = {}
): Promise<OpportunitySyncResult> {
  const forceRescan = options.forceRescan === true;
  const lookbackDays = options.lookbackDays ?? 14;
  const maxMessages = options.maxMessages ?? 25;
  const runStartedAt = new Date();

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

    // Purge legacy heuristic opportunities and re-queue their source emails as PENDING_AI
    try {
      const { prunedCount } = await pruneHeuristicOpportunities(accountId);
      if (prunedCount > 0) {
        logStory(syncLog, `Pruned ${prunedCount} legacy heuristic opportunities for AI re-evaluation.`);
      }
    } catch {
      // Non-fatal cleanup error
    }

    const gmail = await getGmailClientForAccount(account);

    const { targetIds, combinedCandidateIds, historyExpired } =
      await gatherSyncCandidates({
        gmail,
        account,
        forceRescan,
        lookbackDays,
        maxMessages,
      });

    if (combinedCandidateIds.length === 0 || targetIds.length === 0) {
      logStory(
        syncLog,
        targetIds.length === 0 && combinedCandidateIds.length > 0
          ? "All candidates were already known — nothing to classify."
          : "Nothing left to classify — inbox already caught up."
      );
      await prisma.account.update({
        where: { id: accountId },
        data: {
          lastSyncedAt: runStartedAt,
          isSyncing: false,
          syncError: null,
          lastSyncProcessed: 0,
          syncTotal: null,
        },
      });
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
    let ollamaCount = 0;
    let cloudCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const batchStartTime = Date.now();

    const configuredOllamaUrl = account.settings?.localOllamaUrl ?? "";
    let ollamaDownForSync = false;
    if (
      llmProvider === "LOCAL_OLLAMA" &&
      !rules.allowCloudFallback &&
      isOllamaCircuitTripped(configuredOllamaUrl)
    ) {
      ollamaDownForSync = true;
      logStory(
        syncLog,
        "Local Ollama is offline (circuit open). Fast-parking messages as PENDING_AI.",
        { url: configuredOllamaUrl },
        "warn"
      );
    }

    logStory(syncLog, "Step 3/4 — Classifying candidate messages", {
      "candidates to evaluate": targetIds.length,
      fallbackToCloud: rules.allowCloudFallback,
      provider: llmProvider,
    });

    // Record candidate total so live UI telemetry renders numerator and denominator (# / #)
    await prisma.account.update({
      where: { id: accountId },
      data: {
        syncTotal: targetIds.length,
        lastSyncProcessed: 0,
      },
    });

    let didUseScrapingAnt = false;

    for (let i = 0; i < targetIds.length; i++) {
      const messageId = targetIds[i];

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
        await prisma.account
          .update({
            where: { id: accountId },
            data: { syncTotal: null },
          })
          .catch(() => {});
        break;
      }

      try {
        const processResult = await processSyncMessage({
          gmail,
          account,
          messageId,
          index: i + 1,
          total: targetIds.length,
          rules,
          candidateProfile,
          ollamaDownForSync,
        });

        opportunitiesUpserted += processResult.opportunitiesUpserted;
        createdCount += processResult.createdCount;
        updatedCount += processResult.updatedCount;
        skippedCount += processResult.skippedCount;
        ollamaDownForSync = processResult.ollamaDownForSync;
        if (processResult.usedScrapingAnt) {
          didUseScrapingAnt = true;
        }

        if (processResult.tier === "OLLAMA") {
          ollamaCount++;
        } else if (processResult.tier === "CLOUD") {
          cloudCount++;
        }
      } catch (error) {
        syncLog.error(
          { err: error, messageId },
          "Opportunity sync failed for message"
        );
        if (isRateLimited(error)) {
          await sleep(RATE_LIMIT_BASE_MS * 2);
        }
      }

      // Real-time progress update for the header pill
      await prisma.account.update({
        where: { id: accountId },
        data: {
          syncHeartbeatAt: new Date(),
          lastSyncProcessed: i + 1,
        },
      });

      // Throttled pacing: 350ms delay between emails to avoid burst rate limits
      if (i < targetIds.length - 1) {
        await sleep(350);
      }
    }

    // Purge expired dismissed rows (retention compliance)
    try {
      await purgeExpiredDismissed(accountId);
    } catch {
      // Non-fatal cleanup error
    }

    await prisma.account.update({
      where: { id: accountId },
      data: {
        lastSyncedAt: runStartedAt,
        isSyncing: false,
        syncError: null,
        lastSyncProcessed: targetIds.length,
        syncTotal: null,
      },
    });

    if (didUseScrapingAnt) {
      void refreshScrapingAntUsageAfterSync(accountId);
    }

    logStory(syncLog, "Step 3/4 done — classification finished", {
      "messages attempted": targetIds.length,
      "opportunities touched": opportunitiesUpserted,
      "skipped earlier as known":
        combinedCandidateIds.length - targetIds.length,
    });

    logSyncSummaryBanner({
      total: targetIds.length,
      durationMs: Date.now() - batchStartTime,
      ollamaCount,
      cloudCount,
      createdCount,
      updatedCount,
      skippedCount,
      watermark: new Date().toISOString(),
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
  } finally {
    // Guarantee isSyncing is never left stuck in the database if process errors or aborts
    try {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          isSyncing: false,
          syncTotal: null,
        },
      });
    } catch {
      // Non-fatal finalize catch
    }
  }
}
