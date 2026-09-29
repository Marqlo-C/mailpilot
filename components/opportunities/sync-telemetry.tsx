"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { syncInboxOpportunities } from "@/app/actions/email";
import { SYNC_STARTED_EVENT } from "@/components/layout/global-sync-tracker";
import { cn } from "@/lib/utils";

type SyncTelemetryProps = {
  accountId?: string | null;
  initialIsSyncing?: boolean;
  initialPendingClassificationCount?: number;
  connected?: boolean;
  className?: string;
};

/**
 * Header status indicator: Syncing / awaiting classification / Live.
 */
export function SyncTelemetry({
  accountId = null,
  initialIsSyncing = false,
  initialPendingClassificationCount = 0,
  connected = true,
  className,
}: SyncTelemetryProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(initialIsSyncing);
  const [pendingCount, setPendingCount] = useState(
    initialPendingClassificationCount
  );

  useEffect(() => {
    setIsSyncing(initialIsSyncing);
    setPendingCount(initialPendingClassificationCount);
  }, [initialIsSyncing, initialPendingClassificationCount]);

  useEffect(() => {
    function handleSyncStart() {
      setIsSyncing(true);
    }
    window.addEventListener(SYNC_STARTED_EVENT, handleSyncStart);
    return () => window.removeEventListener(SYNC_STARTED_EVENT, handleSyncStart);
  }, []);

  useEffect(() => {
    if (!isSyncing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/account/sync-status", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          isSyncing?: boolean;
          pendingClassificationCount?: number;
        };
        if (typeof data.pendingClassificationCount === "number") {
          setPendingCount(data.pendingClassificationCount);
        }
        if (!data.isSyncing) {
          setIsSyncing(false);
          router.refresh();
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isSyncing, router]);

  // Light poll while awaiting classification so the badge clears when AI recovers
  useEffect(() => {
    if (isSyncing || pendingCount <= 0) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/account/sync-status", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          isSyncing?: boolean;
          pendingClassificationCount?: number;
        };
        if (data.isSyncing) {
          setIsSyncing(true);
        }
        if (typeof data.pendingClassificationCount === "number") {
          setPendingCount(data.pendingClassificationCount);
        }
      } catch {
        // ignore
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [isSyncing, pendingCount]);

  function handleTriggerSync() {
    if (!accountId || isSyncing || pending) return;

    window.dispatchEvent(new Event(SYNC_STARTED_EVENT));
    setIsSyncing(true);

    startTransition(async () => {
      const result = await syncInboxOpportunities({
        accountId,
        forceRescan: false,
      });

      if (!result.ok) {
        toast.error(result.error);
        setIsSyncing(false);
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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          <span>Syncing inbox...</span>
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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Synced. Inbox updated</span>
        </div>
      )}
    </div>
  );
}
