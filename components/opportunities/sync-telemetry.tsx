"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";

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
 * Header telemetry pill: live sync pulse, relative last-scan time, and
 * background auto-sync engine status. Optimistic via SYNC_STARTED_EVENT;
 * clears via /api/account/sync-status polling + server prop refresh.
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

  // Poll while syncing so the pill clears without waiting on a full navigation.
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
          "inline-flex select-none items-center gap-2 rounded-full border border-border/80 bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground",
          className
        )}
      >
        <span className="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/50" />
        <span className="font-medium text-foreground">Offline</span>
        <span className="text-border">•</span>
        <span>Connect a Gmail account to get started</span>
      </div>
    );
  }

  const relativeTime = lastSyncedAt
    ? `Scanned ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}`
    : "Not scanned yet";

  return (
    <div
      className={cn(
        "inline-flex select-none items-center gap-2 rounded-full border border-border/80 bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {isSyncing ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        ) : (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-20" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            isSyncing ? "animate-pulse bg-primary" : "bg-emerald-500"
          )}
        />
      </span>

      <span className="font-medium text-foreground">
        {isSyncing ? "Sync in progress" : "Connected"}
      </span>

      <span className="text-border">•</span>

      <span>{isSyncing ? "Scanning inbox…" : relativeTime}</span>

      <span className="hidden text-border sm:inline">•</span>

      <span className="hidden items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 sm:inline-flex">
        <Radio className="h-2.5 w-2.5 text-emerald-500" />
        Auto-sync
      </span>
    </div>
  );
}
