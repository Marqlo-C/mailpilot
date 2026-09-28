"use client";

import { useEffect, useState } from "react";

import { SYNC_STARTED_EVENT } from "@/components/layout/global-sync-tracker";
import { formatDistanceToNow } from "@/lib/format-distance";
import { cn } from "@/lib/utils";

type SyncTelemetryProps = {
  initialLastSyncedAt?: Date | string | null;
  initialIsSyncing?: boolean;
  connected?: boolean;
  className?: string;
};

/**
 * Header telemetry pill: high-contrast Connected badge + Last synced.
 */
export function SyncTelemetry({
  initialLastSyncedAt = null,
  initialIsSyncing = false,
  connected = true,
  className,
}: SyncTelemetryProps) {
  const [isSyncing, setIsSyncing] = useState(initialIsSyncing);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    initialLastSyncedAt ? new Date(initialLastSyncedAt) : null
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    setIsSyncing(initialIsSyncing);
    if (initialLastSyncedAt) {
      setLastSyncedAt(new Date(initialLastSyncedAt));
    }
  }, [initialIsSyncing, initialLastSyncedAt]);

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
          lastSyncedAt?: string | null;
        };
        if (data.lastSyncedAt) {
          setLastSyncedAt(new Date(data.lastSyncedAt));
        }
        if (!data.isSyncing) {
          setIsSyncing(false);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isSyncing]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

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

  const relativeTime = lastSyncedAt
    ? `Last synced ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}`
    : "Not synced yet";

  return (
    <div
      className={cn(
        "inline-flex select-none items-center gap-2 text-xs text-muted-foreground",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
          isSyncing
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isSyncing
              ? "animate-pulse bg-primary"
              : "animate-pulse bg-emerald-500"
          )}
        />
        {isSyncing ? "Sync in progress" : "Connected"}
      </div>

      <span className="text-border">•</span>

      <span className="text-foreground/80">
        {isSyncing ? "Syncing inbox…" : relativeTime}
      </span>
    </div>
  );
}
