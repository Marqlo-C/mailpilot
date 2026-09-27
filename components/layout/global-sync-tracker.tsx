"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { forceResetSyncStatus } from "@/app/actions/email";
import { cn } from "@/lib/utils";

export const SYNC_STARTED_EVENT = "mailpilot:sync-started";

type GlobalSyncTrackerProps = {
  accountId: string | null;
  initialIsSyncing?: boolean;
};

/**
 * Bottom-right floating sync capsule with stale-lock polling, client safety
 * timeout, and a one-click force reset.
 */
export function GlobalSyncTracker({
  accountId,
  initialIsSyncing = false,
}: GlobalSyncTrackerProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(initialIsSyncing);
  const [justFinished, setJustFinished] = useState(false);
  const [showForceReset, setShowForceReset] = useState(false);
  const pollCount = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      pollCount.current = 0;
      setShowForceReset(false);
      setJustFinished(false);
      setIsSyncing(true);
    }

    window.addEventListener(SYNC_STARTED_EVENT, handleSyncStart);
    return () => window.removeEventListener(SYNC_STARTED_EVENT, handleSyncStart);
  }, []);

  // Polling loop: runs ONLY while isSyncing is true
  useEffect(() => {
    if (!accountId || !isSyncing) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    pollCount.current = 0;
    setShowForceReset(false);

    intervalRef.current = setInterval(() => {
      void (async () => {
        pollCount.current += 1;

        // Show manual reset option after ~30s of polling
        if (pollCount.current >= 12) {
          setShowForceReset(true);
        }

        // Hard stop client spinner after ~60s
        if (pollCount.current >= 24) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsSyncing(false);
          setShowForceReset(false);
          return;
        }

        try {
          const res = await fetch("/api/account/sync-status", {
            cache: "no-store",
          });
          if (!res.ok) {
            if (pollCount.current >= 4) {
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              setIsSyncing(false);
            }
            return;
          }

          const data = (await res.json()) as {
            isSyncing?: boolean;
          };

          if (data.isSyncing) return;

          // 1. Immediately kill the polling loop
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          // 2. Transition state
          setIsSyncing(false);
          setShowForceReset(false);
          setJustFinished(true);

          // 3. Refresh server data
          router.refresh();
        } catch (err) {
          console.error("Sync poll error:", err);
          if (pollCount.current >= 4) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            setIsSyncing(false);
          }
        }
      })();
    }, 2500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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
