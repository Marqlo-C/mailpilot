"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { syncInboxOpportunities } from "@/app/actions/email";
import {
  SYNC_STARTED_EVENT,
  useSyncStatus,
} from "@/components/layout/sync-status-provider";
import { cn } from "@/lib/utils";

type SyncTelemetryProps = {
  connected?: boolean;
  className?: string;
};

/**
 * Header status indicator. Reads shared sync status (no own poller).
 */
export function SyncTelemetry({
  connected = true,
  className,
}: SyncTelemetryProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    accountId,
    isSyncing,
    pendingCount,
    markSyncStarted,
    markSyncFailed,
  } = useSyncStatus();

  function handleTriggerSync() {
    if (!accountId || isSyncing || pending) return;

    window.dispatchEvent(new Event(SYNC_STARTED_EVENT));
    markSyncStarted();

    startTransition(async () => {
      const result = await syncInboxOpportunities({
        accountId,
        forceRescan: false,
      });

      if (!result.ok) {
        toast.error(result.error);
        markSyncFailed();
        return;
      }

      toast.success(result.data?.message ?? "Sync started in background");
      router.refresh();
    });
  }

  if (!connected) {
    return (
      <div
        className={cn(
          "inline-flex select-none items-center gap-2 text-xs text-muted-foreground",
          className
        )}
      >
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          Offline
        </div>
        <span className="text-border">•</span>
        <span>Connect a Gmail account to get started</span>
      </div>
    );
  }

  const syncingLabel =
    pendingCount > 0
      ? `Syncing... (${pendingCount} left)`
      : "Syncing...";

  return (
    <div
      className={cn("inline-flex select-none items-center", className)}
      role="status"
      aria-live="polite"
    >
      {isSyncing ? (
        <div className="flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
          </span>
          <span>{syncingLabel}</span>
        </div>
      ) : pendingCount > 0 ? (
        <button
          type="button"
          onClick={handleTriggerSync}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-400"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          </span>
          <span>
            {pendingCount}{" "}
            {pendingCount === 1 ? "email" : "emails"} awaiting classification
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span>Synced. Inbox updated</span>
        </div>
      )}
    </div>
  );
}
