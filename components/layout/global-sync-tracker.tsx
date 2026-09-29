"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { forceResetSyncStatus } from "@/app/actions/email";
import { SYNC_LOCK_STALE_MS } from "@/lib/constants";
import { startSyncStatusBackoffPoll } from "@/lib/sync-status-poll";
import { cn } from "@/lib/utils";

export const SYNC_STARTED_EVENT = "mailpilot:sync-started";

type GlobalSyncTrackerProps = {
  accountId: string | null;
  initialIsSyncing?: boolean;
};

/**
 * Bottom-right floating sync capsule with TCP-inspired backoff polling,
 * client safety timeout, and a one-click force reset.
 */
export function GlobalSyncTracker({
  accountId,
  initialIsSyncing = false,
}: GlobalSyncTrackerProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(initialIsSyncing);
  const [justFinished, setJustFinished] = useState(false);
  const [showForceReset, setShowForceReset] = useState(false);
  const disposePollRef = useRef<(() => void) | null>(null);

  // Sync prop changes from server
  useEffect(() => {
    setIsSyncing(initialIsSyncing);
    if (!initialIsSyncing) {
      setShowForceReset(false);
    }
  }, [accountId, initialIsSyncing]);

  // Optimistic activation when SyncControls fires
  useEffect(() => {
    function handleSyncStart() {
      setShowForceReset(false);
      setJustFinished(false);
      setIsSyncing(true);
    }

    window.addEventListener(SYNC_STARTED_EVENT, handleSyncStart);
    return () => window.removeEventListener(SYNC_STARTED_EVENT, handleSyncStart);
  }, []);

  // Backoff poll: 3s → 10s while waiting for server acknowledgment
  useEffect(() => {
    if (!accountId || !isSyncing) {
      disposePollRef.current?.();
      disposePollRef.current = null;
      return;
    }

    setShowForceReset(false);
    let consecutiveErrors = 0;

    disposePollRef.current = startSyncStatusBackoffPoll({
      initialMs: 3000,
      maxMs: 10_000,
      hardStopMs: SYNC_LOCK_STALE_MS,
      slowAfterMs: 120_000,
      onSlow: () => setShowForceReset(true),
      onHardStop: () => {
        setIsSyncing(false);
        setShowForceReset(false);
      },
      onTick: async () => {
        try {
          const res = await fetch("/api/account/sync-status", {
            cache: "no-store",
          });
          if (!res.ok) {
            consecutiveErrors += 1;
            if (consecutiveErrors >= 4) {
              setIsSyncing(false);
              return "stop";
            }
            return "continue";
          }

          consecutiveErrors = 0;
          const data = (await res.json()) as { isSyncing?: boolean };

          if (data.isSyncing) return "continue";

          setIsSyncing(false);
          setShowForceReset(false);
          setJustFinished(true);
          router.refresh();
          return "stop";
        } catch (err) {
          console.error("Sync poll error:", err);
          consecutiveErrors += 1;
          if (consecutiveErrors >= 4) {
            setIsSyncing(false);
            return "stop";
          }
          return "continue";
        }
      },
    });

    return () => {
      disposePollRef.current?.();
      disposePollRef.current = null;
    };
  }, [accountId, isSyncing, router]);

  // Dedicated dismissal timer: badge disappears after 3.5s
  useEffect(() => {
    if (!justFinished) return;

    const timer = setTimeout(() => {
      setJustFinished(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, [justFinished]);

  async function handleForceReset() {
    disposePollRef.current?.();
    disposePollRef.current = null;
    setIsSyncing(false);
    setShowForceReset(false);
    setJustFinished(false);
    try {
      await forceResetSyncStatus();
    } catch (error) {
      console.error("forceResetSyncStatus failed", error);
    }
    router.refresh();
  }

  if (!accountId || (!isSyncing && !justFinished)) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-5 right-5 z-50 flex max-w-[min(92vw,24rem)] items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2.5 text-sm shadow-xl backdrop-blur",
        "mb-16 md:mb-0",
        "animate-in fade-in slide-in-from-bottom-2"
      )}
    >
      {isSyncing ? (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <span className="font-medium text-foreground">
            Scanning inbox for opportunities…
          </span>
          {showForceReset ? (
            <button
              type="button"
              onClick={() => void handleForceReset()}
              className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          ) : null}
        </>
      ) : (
        <>
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="font-medium text-foreground">
            Scan complete — opportunities updated
          </span>
        </>
      )}
    </aside>
  );
}
