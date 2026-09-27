"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getAccountSyncStatus } from "@/app/actions/scan";
import { cn } from "@/lib/utils";

const POLL_MS_ACTIVE = 4000;
const POLL_MS_IDLE = 15000;

type GlobalSyncTrackerProps = {
  accountId: string | null;
  /** SSR seed so the pill can appear before the first poll. */
  initialIsSyncing?: boolean;
};

/**
 * Polls account.isSyncing and shows a non-blocking navbar pill while scans run.
 * When sync finishes, toasts completion and refreshes the current route.
 */
export function GlobalSyncTracker({
  accountId,
  initialIsSyncing = false,
}: GlobalSyncTrackerProps) {
  const router = useRouter();
  const wasSyncingRef = useRef(initialIsSyncing);
  const [isSyncing, setIsSyncing] = useState(initialIsSyncing);

  useEffect(() => {
    wasSyncingRef.current = initialIsSyncing;
    setIsSyncing(initialIsSyncing);
  }, [accountId, initialIsSyncing]);

  useEffect(() => {
    if (!accountId) {
      setIsSyncing(false);
      wasSyncingRef.current = false;
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const result = await getAccountSyncStatus(accountId!);
      if (cancelled) return;

      if (result.ok && result.data) {
        const next = result.data.isSyncing;
        const wasSyncing = wasSyncingRef.current;

        if (wasSyncing && !next) {
          if (result.data.syncError) {
            toast.error(result.data.syncError);
          } else {
            const count = result.data.lastSyncProcessed ?? 0;
            toast.success(
              `Sync complete. ${count} opportunit${count === 1 ? "y" : "ies"} updated.`
            );
          }
          router.refresh();
        }

        wasSyncingRef.current = next;
        setIsSyncing(next);
        timeoutId = setTimeout(poll, next ? POLL_MS_ACTIVE : POLL_MS_IDLE);
      } else {
        timeoutId = setTimeout(poll, POLL_MS_IDLE);
      }
    }

    timeoutId = setTimeout(poll, initialIsSyncing ? 500 : POLL_MS_ACTIVE);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [accountId, initialIsSyncing, router]);

  if (!accountId || !isSyncing) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2",
        "md:left-auto md:right-6 md:translate-x-0"
      )}
    >
      <div className="pointer-events-auto inline-flex max-w-[min(92vw,22rem)] items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-md">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="truncate text-foreground">
          Scanning inbox for new opportunities…
        </span>
      </div>
    </div>
  );
}
