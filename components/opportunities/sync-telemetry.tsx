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
  /** Dark sidebar uses lighter pill text. `compact` is the collapsed icon. */
  surface?: "header" | "sidebar";
  compact?: boolean;
  /** Rest as a circle around the status dot; label shows on hover. */
  restAsDot?: boolean;
  /** Show the expanded pill immediately (collapsed-sidebar dot hover). */
  forceOpen?: boolean;
};

/**
 * Header status indicator. Reads shared sync status (no own poller).
 */
export function SyncTelemetry({
  connected = true,
  className,
  surface = "header",
  compact = false,
  restAsDot = false,
  forceOpen = false,
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

  const onSidebar = surface === "sidebar";
  const dotRest = restAsDot && !compact;
  const restCircleClass = !dotRest
    ? ""
    : forceOpen
      ? "h-auto w-max shrink-0 justify-start gap-1.5 whitespace-nowrap px-2.5 py-1 transition-[padding,gap,background-color,background-image,color,border-color]"
      : "size-6 shrink-0 justify-center gap-0 whitespace-nowrap p-0 transition-[padding,gap,background-color,background-image,color,border-color] hover:!h-auto hover:!w-max hover:!justify-start hover:!gap-1.5 hover:!px-2.5 hover:!py-1";
  /** Opaque sidebar plate plus the status tint, so the flyout is not see-through. */
  const restPlateMuted = !dotRest
    ? ""
    : forceOpen
      ? "!bg-[hsl(var(--sidebar))] !bg-[linear-gradient(rgb(255_255_255/0.1),rgb(255_255_255/0.1))]"
      : "hover:!bg-[hsl(var(--sidebar))] hover:!bg-[linear-gradient(rgb(255_255_255/0.1),rgb(255_255_255/0.1))]";
  const restPlateSky = !dotRest
    ? ""
    : forceOpen
      ? "!bg-[hsl(var(--sidebar))] !bg-[linear-gradient(rgb(56_189_248/0.15),rgb(56_189_248/0.15))]"
      : "hover:!bg-[hsl(var(--sidebar))] hover:!bg-[linear-gradient(rgb(56_189_248/0.15),rgb(56_189_248/0.15))]";
  const restPlateReady = !dotRest
    ? ""
    : forceOpen
      ? "!bg-[hsl(var(--sidebar))] !bg-[linear-gradient(rgb(52_211_153/0.15),rgb(52_211_153/0.15))]"
      : "hover:!bg-[hsl(var(--sidebar))] hover:!bg-[linear-gradient(rgb(52_211_153/0.15),rgb(52_211_153/0.15))]";
  /** Awaiting-classification flyout matches the high-clutter score chip. */
  const restAwaitingClass = !dotRest
    ? ""
    : forceOpen
      ? "!border-[#c21f10] !bg-[hsl(var(--sidebar))] !bg-[linear-gradient(rgb(194_31_16/0.1),rgb(194_31_16/0.1))] !text-[#c21f10] dark:!border-[#fb6230] dark:!bg-[hsl(var(--sidebar))] dark:!bg-[linear-gradient(rgb(251_98_48/0.18),rgb(251_98_48/0.18))] dark:!text-[#fb6230]"
      : "hover:!border-[#c21f10] hover:!bg-[hsl(var(--sidebar))] hover:!bg-[linear-gradient(rgb(194_31_16/0.1),rgb(194_31_16/0.1))] hover:!text-[#c21f10] dark:hover:!border-[#fb6230] dark:hover:!bg-[hsl(var(--sidebar))] dark:hover:!bg-[linear-gradient(rgb(251_98_48/0.18),rgb(251_98_48/0.18))] dark:hover:!text-[#fb6230]";
  const restLabelClass = dotRest
    ? forceOpen
      ? "inline whitespace-nowrap"
      : "hidden whitespace-nowrap group-hover:inline"
    : "";
  const statusLabel = !connected
    ? "Offline"
    : isSyncing
      ? pendingCount > 0
        ? `Classifying ${pendingCount} ${pendingCount === 1 ? "email" : "emails"}`
        : "Syncing inbox"
      : pendingCount > 0
        ? `${pendingCount} ${pendingCount === 1 ? "email" : "emails"} awaiting classification`
        : "Inbox up to date";

  if (!connected) {
    return (
      <div
        className={cn(
          "inline-flex select-none items-center gap-2 text-xs text-muted-foreground",
          onSidebar && "text-white/55",
          className
        )}
        title={compact || dotRest ? statusLabel : undefined}
      >
        <div
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
            onSidebar &&
              "border-white/15 bg-white/10 text-white/70",
            compact && "px-2 py-2",
            restCircleClass,
            restPlateMuted
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
          {compact ? null : (
            <span className={restLabelClass}>Offline</span>
          )}
        </div>
        {compact || onSidebar ? null : (
          <>
            <span className="text-border">•</span>
            <span>Connect a Gmail account to get started</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex select-none items-center",
        onSidebar && !compact && !dotRest && "w-full",
        className
      )}
      data-sync-pill={dotRest ? "1" : undefined}
      role="status"
      aria-live="polite"
      title={compact || dotRest ? statusLabel : undefined}
    >
      {isSyncing ? (
        <div
          className={cn(
            "group flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-700/80 dark:border-sky-400/40 dark:bg-sky-400/15 dark:text-sky-300/85",
            onSidebar &&
              "border-sky-300/35 bg-sky-400/15 text-sky-100",
            compact && "px-2 py-2",
            onSidebar && !compact && !dotRest && "w-full whitespace-normal text-left",
            restCircleClass,
            restPlateSky
          )}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
          </span>
          {compact ? null : pendingCount > 0 ? (
            <span className={restLabelClass}>
              Classifying{" "}
              <span className="font-bold tabular-nums">{pendingCount}</span>{" "}
              {pendingCount === 1 ? "email" : "emails"}…
            </span>
          ) : (
            <span className={restLabelClass}>Syncing inbox…</span>
          )}
        </div>
      ) : pendingCount > 0 ? (
        <button
          type="button"
          onClick={handleTriggerSync}
          disabled={pending}
          aria-label={statusLabel}
          className={cn(
            "group flex items-center gap-1.5 rounded-full border border-[#c21f10]/35 bg-[#c21f10]/10 px-2.5 py-1 text-xs font-medium text-[#c21f10] transition-colors hover:bg-[#c21f10]/18 disabled:opacity-60 dark:border-[#fb6230]/40 dark:bg-[#fb6230]/18 dark:text-[#fb6230] dark:hover:bg-[#fb6230]/28",
            onSidebar &&
              "border-[#fb6230]/40 bg-[#fb6230]/18 text-[#fb6230] hover:bg-[#fb6230]/28",
            compact && "px-2 py-2",
            onSidebar && !compact && !dotRest && "w-full whitespace-normal text-left",
            restCircleClass,
            restAwaitingClass
          )}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c21f10] opacity-75 dark:bg-[#fb6230]" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#c21f10] dark:bg-[#fb6230]" />
          </span>
          {compact ? null : (
            <span className={restLabelClass}>
              <span className="font-bold tabular-nums">{pendingCount}</span>{" "}
              {pendingCount === 1 ? "email" : "emails"} awaiting classification
            </span>
          )}
        </button>
      ) : (
        <div
          className={cn(
            "group flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700/80 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300/85",
            onSidebar &&
              "border-emerald-300/35 bg-emerald-400/15 text-emerald-100",
            compact && "px-2 py-2",
            onSidebar && !compact && !dotRest && "w-full",
            restCircleClass,
            restPlateReady
          )}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {compact ? null : (
            <span className={restLabelClass}>Inbox up to date</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Same 6px status dot the expanded sidebar pill uses, for the collapsed suitcase. */
export function SyncStatusDot({
  connected = true,
  className,
}: {
  connected?: boolean;
  className?: string;
}) {
  const { isSyncing, pendingCount } = useSyncStatus();
  const blinking = connected && (isSyncing || pendingCount > 0);
  const tone = !connected
    ? "bg-white/70 opacity-60"
    : isSyncing
      ? "bg-sky-500"
      : pendingCount > 0
        ? "bg-[#c21f10] dark:bg-[#fb6230]"
        : "bg-emerald-500";

  return (
    <span
      className={cn(
        "pointer-events-none absolute -right-1.5 -top-1.5 flex h-1.5 w-1.5",
        className
      )}
      aria-hidden
    >
      {blinking ? (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            tone
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", tone)} />
    </span>
  );
}
