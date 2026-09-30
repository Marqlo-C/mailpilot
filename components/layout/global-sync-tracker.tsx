"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import {
  SYNC_STARTED_EVENT,
  useSyncStatus,
} from "@/components/layout/sync-status-provider";
import { cn } from "@/lib/utils";

export { SYNC_STARTED_EVENT };

/**
 * Bottom-right floating sync capsule. Reads shared sync status (no own poller).
 */
export function GlobalSyncTracker() {
  const { accountId, isSyncing, justFinished, forceReset } = useSyncStatus();

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
          <button
            type="button"
            onClick={() => void forceReset()}
            className="ml-1 inline-flex shrink-0 text-rose-500 transition-colors hover:text-rose-600"
            title="Cancel sync — remaining emails stay in the queue"
            aria-label="Cancel sync"
          >
            <XCircle className="h-5 w-5" />
          </button>
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
