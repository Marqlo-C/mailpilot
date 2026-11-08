/**
 * Thin PENDING_AI-only classify path for the "awaiting Ace" chip.
 * Intentionally separate from gatherSyncCandidates / delta / job search so the
 * full Sync Inbox pipeline stays untouched aside from shared processSyncMessage.
 */

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
import { initSyncBatchTelemetry, logStory, syncLog } from "@/lib/logging";
import { resolveIngestionRules } from "@/lib/gmail/sync";
import { parseAccountRules } from "@/lib/validations/rules";
import { isRateLimited, sleep, RATE_LIMIT_BASE_MS } from "./candidates";
import { SYNC_KIND_QUEUED } from "./kinds";
import {
  clampPendingAiDrain,
  DEFAULT_PENDING_AI_DRAIN,
} from "./limits";
import { processSyncMessage } from "./processor";

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

export type PendingAiDrainResult = {
  processed: number;
  opportunitiesUpserted: number;
};

/**
 * Classify up to `pendingAiDrainLimit` oldest PENDING_AI rows.
 * Does not run delta/search and does not advance `lastSyncedAt`.
 */
export async function runPendingAiQueueDrain(
  accountId: string,
  options?: { syncStartedAt?: number }
): Promise<PendingAiDrainResult> {
  const drainStartedAt = options?.syncStartedAt ?? Date.now();
  initSyncBatchTelemetry({ startTime: drainStartedAt });
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

    const accountRules = parseAccountRules(account.settings?.rules);
    const pendingAiDrainLimit = clampPendingAiDrain(
      accountRules.pendingAiDrainLimit ?? DEFAULT_PENDING_AI_DRAIN
    );

    const pendingRows =
      pendingAiDrainLimit > 0
        ? await prisma.emailMessage.findMany({
            where: {
              accountId: account.id,
              emailCategory: "PENDING_AI",
            },
            select: { messageId: true },
            orderBy: { createdAt: "asc" },
            take: pendingAiDrainLimit,
          })
        : [];
    const targetIds = pendingRows.map((row) => row.messageId);

    logStory(syncLog, "Ace queue drain starting", {
      mailbox: account.email,
      "queued to review": targetIds.length,
      "drain cap": pendingAiDrainLimit,
    });

    if (targetIds.length === 0) {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          isSyncing: false,
          syncError: null,
          syncKind: null,
          syncTotal: null,
          lastSyncProcessed: 0,
          syncPendingTotal: null,
          lastSyncPendingProcessed: null,
        },
      });
      return { processed: 0, opportunitiesUpserted: 0 };
    }

    const gmail = await getGmailClientForAccount(account);
    const rules = await resolveIngestionRules(
      accountId,
      account.settings?.rules
    );
    const llmProvider = normalizeProvider(account.settings?.llmProvider);
    const candidateProfile = await loadCandidateProfileSummary(accountId);

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
        "Local Ollama offline — Ace queue will re-park as PENDING_AI.",
        { url: configuredOllamaUrl },
        "warn"
      );
    }

    await prisma.account.update({
      where: { id: accountId },
      data: {
        syncKind: SYNC_KIND_QUEUED,
        syncTotal: targetIds.length,
        lastSyncProcessed: 0,
        syncPendingTotal: targetIds.length,
        lastSyncPendingProcessed: 0,
        syncHeartbeatAt: new Date(),
      },
    });

    let opportunitiesUpserted = 0;

    for (let i = 0; i < targetIds.length; i++) {
      const messageId = targetIds[i];

      const currentState = await prisma.account.findUnique({
        where: { id: accountId },
        select: { isSyncing: true },
      });
      if (!currentState?.isSyncing) {
        logStory(
          syncLog,
          "Ace queue drain cancelled early.",
          { "reviewed so far": `${i} / ${targetIds.length}` },
          "warn"
        );
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
          syncStartedAt: drainStartedAt,
        });
        opportunitiesUpserted += processResult.opportunitiesUpserted;
        ollamaDownForSync = processResult.ollamaDownForSync;
      } catch (error) {
        syncLog.error(
          { err: error, messageId },
          "Ace queue drain failed for message"
        );
        if (isRateLimited(error)) {
          await sleep(RATE_LIMIT_BASE_MS * 2);
        }
      }

      await prisma.account.update({
        where: { id: accountId },
        data: {
          syncHeartbeatAt: new Date(),
          lastSyncProcessed: i + 1,
          lastSyncPendingProcessed: i + 1,
        },
      });

      if (i < targetIds.length - 1) {
        await sleep(350);
      }
    }

    await prisma.account.update({
      where: { id: accountId },
      data: {
        isSyncing: false,
        syncError: null,
        syncKind: null,
        lastSyncProcessed: targetIds.length,
        syncTotal: null,
        syncPendingTotal: null,
        lastSyncPendingProcessed: null,
      },
    });

    logStory(syncLog, "Ace queue drain finished", {
      "messages attempted": targetIds.length,
      "opportunities touched": opportunitiesUpserted,
    });

    return {
      processed: targetIds.length,
      opportunitiesUpserted,
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
      // Non-fatal finalize
    }
  }
}
