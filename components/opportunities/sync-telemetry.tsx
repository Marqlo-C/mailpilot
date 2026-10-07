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

  return (
    <div
      className={cn("inline-flex select-none items-center", className)}
      role="status"
      aria-live="polite"
    >
      {isSyncing ? (
        <div className="flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-700/80 dark:border-sky-400/40 dark:bg-sky-400/15 dark:text-sky-300/85">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
          </span>
          {pendingCount > 0 ? (
            <span>
              Classifying{" "}
              <span className="font-bold tabular-nums">{pendingCount}</span>{" "}
              {pendingCount === 1 ? "email" : "emails"}…
            </span>
          ) : (
            <span>Syncing inbox…</span>
          )}
        </div>
      ) : pendingCount > 0 ? (
        <button
          type="button"
          onClick={handleTriggerSync}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-full border border-[hsl(28_62%_40%/0.35)] bg-[hsl(28_70%_48%/0.14)] px-2.5 py-1 text-xs font-medium text-[hsl(28_62%_36%)] transition-colors hover:bg-[hsl(28_70%_48%/0.25)] disabled:opacity-60 dark:border-[hsl(28_75%_60%/0.4)] dark:bg-[hsl(28_70%_48%/0.2)] dark:text-[hsl(28_75%_68%)] dark:hover:bg-[hsl(28_70%_48%/0.3)]"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(28_70%_48%)] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(28_70%_48%)]" />
          </span>
          <span>
            <span className="font-bold tabular-nums">{pendingCount}</span>{" "}
            {pendingCount === 1 ? "email" : "emails"} awaiting classification
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700/80 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300/85">
          <span className="relative flex h-1.5 w-1.5">
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span>Inbox up to date</span>
        </div>
      )}
    </div>
  );
}
