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
  initSyncBatchTelemetry,
  logStory,
  logSyncSummaryBanner,
  syncLog,
} from "@/lib/logging";
import { resolveIngestionRules } from "@/lib/gmail/sync";
import {
  purgeExpiredDismissed,
  pruneHeuristicOpportunities,
} from "@/lib/opportunities/cleanup";
import { parseAccountRules } from "@/lib/validations/rules";
import {
  gatherSyncCandidates,
  isRateLimited,
  sleep,
  RATE_LIMIT_BASE_MS,
} from "./candidates";
import { SYNC_KIND_INBOX } from "./kinds";
import {
  clampPendingAiDrain,
  clampSyncMaxMessages,
  DEFAULT_PENDING_AI_DRAIN,
  DEFAULT_SYNC_MAX_MESSAGES,
} from "./limits";
import { processSyncMessage } from "./processor";
import { refreshScrapingAntUsageAfterSync } from "@/lib/scraping/scrapingant";

export * from "./candidates";
export * from "./dedupe";
export * from "./kinds";
export * from "./limits";
export * from "./pending-drain";
export * from "./processor";

export type OpportunitySyncOptions = {
  forceRescan?: boolean;
  lookbackDays?: number;
  /** Cap Gmail list size (Hobby / free-tier friendly). */
  maxMessages?: number;
  /** Cap PENDING_AI backlog drained into this run. */
  pendingAiDrainLimit?: number;
  syncStartedAt?: number;
};

export type OpportunitySyncResult = {
  processed: number;
  opportunitiesUpserted: number;
  skipped: number;
  /** True when Gmail History API returned expired startHistoryId (404). */
  historyExpired: boolean;
  durationMs?: number;
  ollamaCount?: number;
  cloudCount?: number;
  createdCount?: number;
  updatedCount?: number;
  parsedCount?: number;
};

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

/**
 * Delta-first inbox opportunity sync orchestrator.
 *
 * Pipeline:
 * 1. `processInboxDelta` — subscriptions + history catch-up.
 * 2. PENDING_AI drain (settings cap) then Gmail job search.
 * 3. Classify pending-first, then search hits; dual telemetry counters.
 * 4. Commit `lastSyncedAt` watermark and emit sync summary.
 */
export async function runOpportunitySync(
  accountId: string,
  options: OpportunitySyncOptions = {}
): Promise<OpportunitySyncResult> {
  const forceRescan = options.forceRescan === true;
  const lookbackDays = options.lookbackDays ?? 14;
  const runStartedAt = options.syncStartedAt
    ? new Date(options.syncStartedAt)
    : new Date();
  initSyncBatchTelemetry({ startTime: runStartedAt.getTime() });

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
    const activeAccount = account;

    if (!account.profile) {
      logStory(
        syncLog,
        "Account has no linked profile. Match scoring will use generic defaults.",
        { mailbox: account.email },
        "warn"
      );
    }

    const accountRules = parseAccountRules(account.settings?.rules);
    const configuredMaxMessages = clampSyncMaxMessages(
      accountRules.syncMaxMessages ?? DEFAULT_SYNC_MAX_MESSAGES
    );
    // Callers (e.g. cron) may pass a lower safety ceiling; never raise above account rules.
    const maxMessages =
      options.maxMessages != null
        ? Math.min(
            clampSyncMaxMessages(options.maxMessages),
            configuredMaxMessages
          )
        : configuredMaxMessages;
    const configuredPendingAiDrain = clampPendingAiDrain(
      accountRules.pendingAiDrainLimit ?? DEFAULT_PENDING_AI_DRAIN
    );
    const pendingAiDrainLimit =
      options.pendingAiDrainLimit != null
        ? Math.min(
            clampPendingAiDrain(options.pendingAiDrainLimit),
            configuredPendingAiDrain
          )
        : configuredPendingAiDrain;

    if (!account.isSyncing) {
      await prisma.account.update({
        where: { id: accountId },
        data: { isSyncing: true, syncHeartbeatAt: new Date() },
      });
    }

    logStory(syncLog, "Sync Inbox starting", {
      mailbox: account.email,
      mode: forceRescan ? "force rescan" : "incremental",
      "max job-query messages": maxMessages,
      "pending AI drain": pendingAiDrainLimit,
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

    const { targetIds, combinedCandidateIds, pendingIds, historyExpired } =
      await gatherSyncCandidates({
        gmail,
        account,
        forceRescan,
        lookbackDays,
        maxMessages,
        pendingAiDrainLimit,
      });

    const pendingInBatch = new Set(
      pendingIds.filter((id) => targetIds.includes(id))
    );

    if (combinedCandidateIds.length === 0 || targetIds.length === 0) {
      logStory(
        syncLog,
        targetIds.length === 0 && combinedCandidateIds.length > 0
          ? "All candidates were already known — nothing to classify."
          : "Nothing left to classify — inbox already caught up."
      );
      try {
        logSyncSummaryBanner({
          total: 0,
          durationMs: Date.now() - runStartedAt.getTime(),
          ollamaCount: 0,
          cloudCount: 0,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: combinedCandidateIds.length,
          parsedCount: 0,
          opportunitiesTouched: 0,
          watermark: runStartedAt.toISOString(),
        });
      } catch (bannerErr) {
        console.error("Failed to render sync summary banner:", bannerErr);
      }
      await prisma.account.update({
        where: { id: accountId },
        data: {
          lastSyncedAt: runStartedAt,
          isSyncing: false,
          syncError: null,
          syncKind: null,
          lastSyncProcessed: 0,
          syncTotal: null,
          syncPendingTotal: null,
          lastSyncPendingProcessed: null,
        },
      });
      return {
        processed: 0,
        opportunitiesUpserted: 0,
        skipped: combinedCandidateIds.length,
        historyExpired,
        durationMs: Date.now() - runStartedAt.getTime(),
        ollamaCount: 0,
        cloudCount: 0,
        createdCount: 0,
        updatedCount: 0,
        parsedCount: 0,
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
    let parsedCount = 0;
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

    // Flyout = full batch; sidebar Ace line = PENDING_AI slice only.
    await prisma.account.update({
      where: { id: accountId },
      data: {
        isSyncing: true,
        syncHeartbeatAt: new Date(),
        syncKind: SYNC_KIND_INBOX,
        syncTotal: targetIds.length,
        lastSyncProcessed: 0,
        syncPendingTotal: pendingInBatch.size,
        lastSyncPendingProcessed: 0,
      },
    });

    let didUseScrapingAnt = false;
    let pendingProcessed = 0;
    let processedCount = 0;
    let nextIndex = 0;
    let isCancelled = false;
    let summaryBannerRendered = false;

    // Check cancellation once before kicking off processing
    const initialCheck = await prisma.account.findUnique({
      where: { id: accountId },
      select: { isSyncing: true, syncError: true },
    });
    if (!initialCheck?.isSyncing) {
      if (initialCheck?.syncError?.includes("Auto-reset")) {
        await prisma.account.update({
          where: { id: accountId },
          data: { isSyncing: true, syncError: null, syncHeartbeatAt: new Date() },
        });
      } else {
        isCancelled = true;
      }
    }

    // Bounded concurrency pool: 3 for Cloud LLM (significantly increases throughput safely),
    // 1 for local Ollama (prevents GPU memory exhaustion and thread contention).
    const concurrencyLimit = llmProvider === "LOCAL_OLLAMA" ? 1 : 3;

    async function worker(): Promise<void> {
      while (nextIndex < targetIds.length && !isCancelled) {
        const currentIndex = nextIndex++;
        if (currentIndex >= targetIds.length) break;

        const messageId = targetIds[currentIndex];
        const isPendingSlice = pendingInBatch.has(messageId);

        try {
          const processResult = await processSyncMessage({
            gmail,
            account: activeAccount,
            messageId,
            index: currentIndex + 1,
            total: targetIds.length,
            rules,
            candidateProfile,
            ollamaDownForSync,
            syncStartedAt: runStartedAt.getTime(),
          });

          opportunitiesUpserted += processResult.opportunitiesUpserted;
          createdCount += processResult.createdCount;
          updatedCount += processResult.updatedCount;
          skippedCount += processResult.skippedCount;
          parsedCount += processResult.parsedCount ?? 0;
          if (processResult.ollamaDownForSync) {
            ollamaDownForSync = true;
          }
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

        if (isPendingSlice) {
          pendingProcessed += 1;
        }
        processedCount += 1;

        // Emit summary banner immediately on final message completion in the active worker
        // stack before committing the final progress count that triggers the poller / router.refresh
        const isFinalMessage =
          currentIndex + 1 >= targetIds.length ||
          processedCount >= targetIds.length;

        if (isFinalMessage && !summaryBannerRendered) {
          summaryBannerRendered = true;
          try {
            logSyncSummaryBanner({
              total: targetIds.length,
              durationMs: Date.now() - batchStartTime,
              ollamaCount,
              cloudCount,
              createdCount,
              updatedCount,
              skippedCount: (combinedCandidateIds.length - targetIds.length) + skippedCount,
              parsedCount,
              opportunitiesTouched: opportunitiesUpserted,
              watermark: new Date().toISOString(),
            });
          } catch (bannerErr) {
            console.error("Failed to render sync summary banner:", bannerErr);
          }
        }

        // Atomic progress update + cancellation check in a single database round-trip
        try {
          const updatedState = await prisma.account.update({
            where: { id: accountId },
            data: {
              syncHeartbeatAt: new Date(),
              lastSyncProcessed: processedCount,
              lastSyncPendingProcessed: pendingProcessed,
            },
            select: { isSyncing: true, syncError: true },
          });

          if (!updatedState.isSyncing) {
            if (updatedState.syncError?.includes("Auto-reset")) {
              // Stale heartbeat race from parallel poller — re-claim and continue processing
              await prisma.account.update({
                where: { id: accountId },
                data: { isSyncing: true, syncError: null, syncHeartbeatAt: new Date() },
              });
            } else {
              isCancelled = true;
              break;
            }
          }
        } catch {
          // If update blips, do not crash worker loop
        }
      }
    }

    const workerCount = Math.min(concurrencyLimit, targetIds.length);
    if (workerCount > 0 && !isCancelled) {
      const workers = Array.from({ length: workerCount }, () => worker());
      await Promise.all(workers);
    }

    const stoppedEarly = isCancelled && processedCount < targetIds.length;

    if (stoppedEarly) {
      logStory(
        syncLog,
        "Stopped early — sync was cancelled (isSyncing cleared).",
        { "classified so far": `${processedCount} / ${targetIds.length}` },
        "warn"
      );
      if (!summaryBannerRendered) {
        summaryBannerRendered = true;
        try {
          logSyncSummaryBanner({
            total: processedCount,
            durationMs: Date.now() - runStartedAt.getTime(),
            ollamaCount,
            cloudCount,
            createdCount,
            updatedCount,
            skippedCount: (combinedCandidateIds.length - targetIds.length) + skippedCount,
            parsedCount,
            opportunitiesTouched: opportunitiesUpserted,
            watermark: new Date().toISOString(),
          });
        } catch (bannerErr) {
          console.error("Failed to render sync summary banner:", bannerErr);
        }
      }
      await prisma.account
        .update({
          where: { id: accountId },
          data: {
            syncTotal: null,
            syncKind: null,
            syncPendingTotal: null,
            lastSyncPendingProcessed: null,
          },
        })
        .catch(() => {});

      return {
        processed: processedCount,
        opportunitiesUpserted,
        skipped: combinedCandidateIds.length - targetIds.length,
        historyExpired,
        durationMs: Date.now() - runStartedAt.getTime(),
        ollamaCount,
        cloudCount,
        createdCount,
        updatedCount,
        parsedCount,
      };
    }

    // Batch completed normally: render summary banner if not already emitted by worker
    if (!summaryBannerRendered) {
      summaryBannerRendered = true;
      try {
        logSyncSummaryBanner({
          total: targetIds.length,
          durationMs: Date.now() - runStartedAt.getTime(),
          ollamaCount,
          cloudCount,
          createdCount,
          updatedCount,
          skippedCount: (combinedCandidateIds.length - targetIds.length) + skippedCount,
          parsedCount,
          opportunitiesTouched: opportunitiesUpserted,
          watermark: new Date().toISOString(),
        });
      } catch (bannerErr) {
        console.error("Failed to render sync summary banner:", bannerErr);
      }
    }

    // Purge expired dismissed rows (retention compliance)
    try {
      await purgeExpiredDismissed(accountId);
    } catch {
      // Non-fatal cleanup error
    }

    try {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          lastSyncedAt: runStartedAt,
          isSyncing: false,
          syncError: null,
          syncKind: null,
          lastSyncProcessed: targetIds.length,
          syncTotal: null,
          syncPendingTotal: null,
          lastSyncPendingProcessed: null,
        },
      });
    } catch (updateErr) {
      syncLog.warn(
        { err: updateErr },
        "Failed to stamp lastSyncedAt on account after sync pass"
      );
    }

    if (didUseScrapingAnt) {
      void refreshScrapingAntUsageAfterSync(accountId);
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
      durationMs: Date.now() - batchStartTime,
      ollamaCount,
      cloudCount,
      createdCount,
      updatedCount,
      parsedCount,
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
          syncKind: null,
          syncTotal: null,
          syncPendingTotal: null,
          lastSyncPendingProcessed: null,
        },
      });
    } catch {
      // Non-fatal finalize catch
    }
  }
}
