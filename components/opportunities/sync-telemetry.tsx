"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { BroomSparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { drainPendingAiQueue } from "@/app/actions/email";
import { Logo } from "@/components/brand/logo";
import { FlyoutIconPill } from "@/components/layout/sidebar-flyout-chrome";
import {
  SYNC_STARTED_EVENT,
  useSyncStatus,
  type SyncStartedDetail,
} from "@/components/layout/sync-status-provider";
import { useSidebarFlyout } from "@/components/layout/sidebar-flyout-provider";
import { useFlyoutPresence } from "@/components/ui/composites/bulk-actions-flyout";
import { ConfirmActionDialog } from "@/components/ui/composites/confirm-action-dialog";
import { cn } from "@/lib/utils";

/** Sidebar status copy — white label; state is carried by the colored dot only. */
const STATUS_TEXT_CLASS = "text-[#e4f7f3]";

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
  /** Collapsed-sidebar overlay: nothing until the flyout opens. */
  overlay?: boolean;
  /** Expanded pill inside the sidebar directory window, with no pop animation. */
  panel?: boolean;
  /** Fires while the enter/leave animation is on screen. */
  onPresenceChange?: (mounted: boolean) => void;
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
  forceOpen: requestedOpen = false,
  overlay = false,
  panel = false,
  onPresenceChange,
}: SyncTelemetryProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { closeNow: closeSidebarFlyout } = useSidebarFlyout();
  const {
    accountId,
    isSyncing,
    syncKind,
    pendingCount,
    lastSyncProcessed,
    totalToProcess,
    lastSyncPendingProcessed,
    syncPendingTotal,
    markSyncStarted,
    markSyncFailed,
    forceReset,
    flushPendingClassification,
  } = useSyncStatus();
  const [flushing, startFlush] = useTransition();
  const [confirmFlush, setConfirmFlush] = useState(false);
  const [flushCount, setFlushCount] = useState(0);
  const stopSyncTitle =
    syncKind === "queued" ? "Stop reviewing" : "Stop sorting";

  /** Awaiting chip → Ace queue only (no delta / search). */
  function handleDrainQueued() {
    if (!accountId || isSyncing || pending) return;

    // Dismiss the sidebar awaiting panel before Ace reviewing mounts at the
    // bottom — don't morph this flyout into a duplicate status flash.
    if (panel) closeSidebarFlyout();

    window.dispatchEvent(
      new CustomEvent<SyncStartedDetail>(SYNC_STARTED_EVENT, {
        detail: { kind: "queued" },
      })
    );
    markSyncStarted("queued");

    startTransition(async () => {
      const result = await drainPendingAiQueue({ accountId });

      if (!result.ok) {
        toast.error(result.error);
        markSyncFailed();
        return;
      }

      toast.success(result.data?.message ?? "Ace is reviewing queued emails");
      router.refresh();
    });
  }

  function handleFlushPending() {
    setFlushCount(pendingCount);
    setConfirmFlush(true);
  }

  function confirmFlushPending() {
    startFlush(async () => {
      const cleared = await flushPendingClassification();
      if (cleared) setConfirmFlush(false);
    });
  }

  const onSidebar = surface === "sidebar";
  const dotRest = (restAsDot || panel) && !compact;
  const presence = useFlyoutPresence(
    Boolean(!panel && dotRest && (requestedOpen || confirmFlush))
  );
  // Stay expanded through the leave animation after the pointer has gone.
  const forceOpen = panel || (dotRest && presence.mounted);
  const showTelemetryActions = !compact && !(dotRest && !forceOpen);

  useEffect(() => {
    onPresenceChange?.(presence.mounted);
    return () => onPresenceChange?.(false);
  }, [onPresenceChange, presence.mounted]);

  function motionWrap(child: ReactNode) {
    if (!forceOpen || panel) return child;
    return (
      <div
        className={cn(
          "flex origin-center flex-nowrap items-center gap-2.5",
          presence.phase === "in" && "mp-flyout-pop",
          presence.phase === "out" && "mp-flyout-retract"
        )}
        style={presence.style}
        onAnimationEnd={presence.onAnimationEnd}
      >
        {child}
      </div>
    );
  }

  /** Sidebar during sync: Ace queued slice only (not full inbox total). */
  const aceQueuedProgressLabel = useMemo(() => {
    if (!isSyncing) return null;

    if (syncKind === "queued") {
      const processed = lastSyncPendingProcessed ?? lastSyncProcessed;
      const total = syncPendingTotal ?? totalToProcess;
      if (processed != null && processed > 0) {
        if (total != null && total >= processed) {
          return `${processed} / ${total}`;
        }
        return `${processed}`;
      }
      return null;
    }

    // Full inbox: show Ace ratio only while the pending slice is still running.
    const processed = lastSyncPendingProcessed;
    const total = syncPendingTotal;
    if (
      total != null &&
      total > 0 &&
      processed != null &&
      processed > 0 &&
      processed < total
    ) {
      return `${processed} / ${total}`;
    }
    if (total != null && total > 0 && processed === 0) {
      return null; // "Ace reviewing queued…" until first tick
    }
    return null;
  }, [
    isSyncing,
    syncKind,
    lastSyncPendingProcessed,
    syncPendingTotal,
    lastSyncProcessed,
    totalToProcess,
  ]);

  if (overlay && !panel && !presence.mounted) return null;
  /** Collapsed edge: only the colored dot. Expanded: label beside the dot, no pill chrome. */
  const restDotOnlyClass =
    dotRest && !forceOpen
      ? "size-6 shrink-0 justify-center gap-0 p-0"
      : "";
  const restLabelClass = dotRest
    ? forceOpen
      ? "inline whitespace-nowrap"
      : "hidden whitespace-nowrap"
    : "";
  /** Match Subscriptions / Jobs tab flyout rows (size + weight only). */
  const statusRowClass =
    "inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium tracking-normal";

  const statusLabel = !connected
    ? "Offline"
    : isSyncing
      ? aceQueuedProgressLabel
        ? `Ace reviewing ${aceQueuedProgressLabel}`
        : syncKind === "queued" || (syncPendingTotal && syncPendingTotal > 0)
          ? "Ace reviewing"
          : "Sorting inbox"
      : pendingCount > 0
        ? `${pendingCount} ${pendingCount === 1 ? "email" : "emails"} awaiting Ace`
        : "Inbox up to date";

  const syncingLabel = aceQueuedProgressLabel ? (
    <>
      Ace reviewing{" "}
      <span className="tabular-nums">{aceQueuedProgressLabel}</span>…
    </>
  ) : syncKind === "queued" ||
    (syncPendingTotal != null &&
      syncPendingTotal > 0 &&
      (lastSyncPendingProcessed == null ||
        lastSyncPendingProcessed < syncPendingTotal)) ? (
    <>Ace reviewing…</>
  ) : (
    <>Sorting inbox…</>
  );

  /** Same size-8 circular control as Local Ollama’s check-connection button. */
  const telemetryActions = showTelemetryActions ? (
    <div
      className={cn(
        "mp-flyout-chunk flex shrink-0 items-center justify-center",
        isSyncing ? "size-8" : undefined
      )}
    >
      {isSyncing ? (
        <FlyoutIconPill
          matchPairWidth={false}
          primary={{
            icon: X,
            label: stopSyncTitle,
            onClick: () => {
              // Same as broom: close before state flips so Ace reviewing
              // doesn't morph into "# emails awaiting Ace" in this panel.
              if (panel) closeSidebarFlyout();
              void forceReset();
            },
          }}
        />
      ) : (
        <FlyoutIconPill
          primary={{
            icon: BroomSparkles,
            label: "Start Ace review",
            onClick: handleDrainQueued,
            disabled: pending || isSyncing,
            busy: pending,
          }}
          secondary={{
            icon: Trash2,
            label: "Clear emails awaiting Ace",
            onClick: handleFlushPending,
            disabled: flushing || isSyncing,
          }}
        />
      )}
    </div>
  ) : null;

  if (!connected) {
    return (
      <div
        className={cn(
          "inline-flex select-none items-center gap-2 text-[13px] font-medium tracking-normal",
          STATUS_TEXT_CLASS,
          className
        )}
        title={compact || dotRest ? statusLabel : undefined}
      >
        {motionWrap(
          <div
            className={cn(
              statusRowClass,
              STATUS_TEXT_CLASS,
              restDotOnlyClass,
              forceOpen && "mp-flyout-chunk"
            )}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e4f7f3]/50" />
            {compact ? null : (
              <span className={restLabelClass}>Offline</span>
            )}
          </div>
        )}
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
            "group/syncing",
            showTelemetryActions
              ? "flex h-8 origin-center flex-nowrap items-center gap-1.5"
              : "inline-flex items-center gap-1.5",
            showTelemetryActions &&
              !panel &&
              presence.phase === "in" &&
              "mp-flyout-pop",
            showTelemetryActions &&
              !panel &&
              presence.phase === "out" &&
              "mp-flyout-retract mp-flyout-retract-status",
            onSidebar && !compact && !dotRest && "w-full"
          )}
          style={
            showTelemetryActions && !panel ? presence.style : undefined
          }
          onAnimationEnd={
            showTelemetryActions && !panel
              ? presence.onAnimationEnd
              : undefined
          }
        >
          <div
            className={cn(
              statusRowClass,
              STATUS_TEXT_CLASS,
              "h-8",
              restDotOnlyClass,
              (forceOpen || panel || showTelemetryActions) && "mp-flyout-chunk"
            )}
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
            </span>
            {compact ? null : (
              <span className={restLabelClass}>{syncingLabel}</span>
            )}
          </div>
          {telemetryActions}
        </div>
      ) : pendingCount > 0 ? (
        <div
          className={cn(
            "group/awaiting",
            showTelemetryActions || forceOpen
              ? "flex h-8 origin-center flex-nowrap items-center gap-1.5"
              : "inline-flex items-center gap-1.5",
            forceOpen && !panel && presence.phase === "in" && "mp-flyout-pop",
            forceOpen &&
              !panel &&
              presence.phase === "out" &&
              "mp-flyout-retract mp-flyout-retract-status",
            onSidebar && !compact && !dotRest && "w-full"
          )}
          style={forceOpen && !panel ? presence.style : undefined}
          onAnimationEnd={
            forceOpen && !panel ? presence.onAnimationEnd : undefined
          }
        >
          {showTelemetryActions ? (
            <div
              className={cn(
                statusRowClass,
                STATUS_TEXT_CLASS,
                "h-8",
                restDotOnlyClass,
                (forceOpen || panel) && "mp-flyout-chunk"
              )}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c21f10] opacity-75 dark:bg-[#fb6230]" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#c21f10] dark:bg-[#fb6230]" />
              </span>
              {compact ? null : (
                <span className={restLabelClass}>
                  <span className="tabular-nums">{pendingCount}</span>{" "}
                  {pendingCount === 1 ? "email" : "emails"} awaiting Ace
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDrainQueued}
              disabled={pending}
              aria-label={statusLabel}
              className={cn(
                statusRowClass,
                STATUS_TEXT_CLASS,
                "h-8 bg-transparent p-0 transition-opacity hover:opacity-80 disabled:opacity-60",
                restDotOnlyClass,
                forceOpen && "mp-flyout-chunk"
              )}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c21f10] opacity-75 dark:bg-[#fb6230]" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#c21f10] dark:bg-[#fb6230]" />
              </span>
              {compact ? null : (
                <span className={restLabelClass}>
                  <span className="tabular-nums">{pendingCount}</span>{" "}
                  {pendingCount === 1 ? "email" : "emails"} awaiting Ace
                </span>
              )}
            </button>
          )}
          {telemetryActions}
        </div>
      ) : (
        motionWrap(
          <div
            className={cn(
              statusRowClass,
              STATUS_TEXT_CLASS,
              restDotOnlyClass,
              forceOpen && "mp-flyout-chunk"
            )}
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {compact ? null : (
              <span className={restLabelClass}>Inbox up to date</span>
            )}
          </div>
        )
      )}
      <ConfirmActionDialog
        open={confirmFlush}
        onOpenChange={(open) => {
          if (!open && !flushing) setConfirmFlush(false);
        }}
        title="Clearing emails from queue:"
        primary={`${flushCount} ${flushCount === 1 ? "email" : "emails"}`}
        logo={<Logo variant="icon" size="md" showWordmark={false} />}
        description="We’ll skip Ace review for these emails and let them expire naturally. Don’t worry—any emails tied to your active jobs will stay right where they are."
        emphasis="Are you sure you want to proceed?"
        confirmLabel="Dismiss"
        pending={flushing}
        onConfirm={confirmFlushPending}
      />
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
