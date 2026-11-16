"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/core/auth";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/gmail/google";
import { scanHistoricalEmails } from "@/lib/gmail/historical-scan";
import { checkRateLimit } from "@/lib/core/ratelimit";
import {
  SCAN_DAY_OPTIONS,
  type ScanDays,
} from "@/lib/gmail/scan-types";
import { scanInputSchema, type ScanInput } from "@/lib/validations/sync.schema";
import {
  accountIdParamSchema,
  actionError,
  actionSuccess,
  type ServerActionResult,
} from "@/lib/validations/action.schema";
import {
  getAccountScanTarget,
  markAccountSyncStarted,
  finalizeAccountSync,
  readAccountSyncStatus,
  type AccountSyncStatusData,
} from "@/lib/services/sync-orchestration.service";

export type ActionResult<T = void> = ServerActionResult<T>;

export type { ScanInput, ServerActionResult };
export type AccountSyncStatus = AccountSyncStatusData;

/**
 * Starts a historical inbox scan in the background and returns immediately.
 * UI stays navigable; GlobalSyncTracker polls isSyncing for progress.
 */
export async function triggerHistoricalScan(
  accountId: string,
  days: number
): Promise<ServerActionResult<{ message: string }>> {
  const session = await auth();
  if (!session) return actionError("Unauthorized");

  const parsed = scanInputSchema.safeParse({ accountId, days });
  if (!parsed.success) {
    return actionError(`Invalid scan input. days must be one of ${SCAN_DAY_OPTIONS.join(", ")}`);
  }

  const account = await getAccountScanTarget(parsed.data.accountId);
  if (!account || !account.isActive) {
    return actionError("Account not found or inactive");
  }

  const rateLimit = await checkRateLimit(`scan:${account.id}`, "strict");
  if (!rateLimit.success) {
    return actionError("Scan rate limit reached. Please wait a few seconds before scanning again.");
  }

  if (account.isSyncing) {
    return actionSuccess({ message: "Sync already running in background" });
  }

  await markAccountSyncStarted(account.id);

  const scanAccountId = account.id;
  const scanDays = parsed.data.days as ScanDays;

  after(async () => {
    let errorMessage: string | null = null;
    let jobsFound = 0;
    try {
      const summary = await scanHistoricalEmails(scanAccountId, scanDays);
      jobsFound = summary.jobsFound;
      revalidatePath("/");
      revalidatePath("/subscriptions");
      revalidatePath("/jobs");
    } catch (error) {
      console.error("Background historical scan failed", error);
      if (
        error instanceof InsufficientScopeError ||
        isInsufficientScopeError(error)
      ) {
        errorMessage = REAUTH_REQUIRED_MESSAGE;
      } else {
        errorMessage =
          error instanceof Error ? error.message : "Historical scan failed";
      }
    } finally {
      try {
        await finalizeAccountSync(scanAccountId, {
          errorMessage,
          jobsFound,
        });
      } catch (finalizeError) {
        console.error(
          "Failed to clear isSyncing after background scan",
          finalizeError
        );
      }
    }
  });

  return actionSuccess({ message: "Sync started in background" });
}

/**
 * Lightweight poll target for GlobalSyncTracker.
 */
export async function getAccountSyncStatus(
  accountId: string
): Promise<ServerActionResult<AccountSyncStatus>> {
  const parsed = accountIdParamSchema.safeParse(accountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "accountId is required");
  }

  const result = await readAccountSyncStatus(parsed.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to read sync status");
}
