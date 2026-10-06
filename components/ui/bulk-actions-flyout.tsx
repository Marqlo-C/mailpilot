"use client";

import type { ReactNode } from "react";

import { TabCountBadge } from "@/components/ui/segmented-tabs";
import { APP_CONTENT_CENTER_X_CLASS } from "@/lib/app-content-center";
import { cn } from "@/lib/utils";

/** Default (non-destructive) action chip — matches unselected tab ink. */
export const BULK_ACTION_BTN_CLASSNAME =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

/** Alias — Snapshot / Delete Snapshots share the same neutral chip. */
export const BULK_ACTION_PLAIN_BTN_CLASSNAME = BULK_ACTION_BTN_CLASSNAME;

/** Destructive action chip — Job Radar bulk actions. */
export const BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50";

/** Count pill tint matching destructive flyout text. */
export const BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME =
  "bg-destructive/15 text-destructive group-data-[state=active]:bg-destructive/15 group-data-[state=active]:text-destructive";

/** Count pill for flyout action labels — same chrome as tab counts. */
export function BulkActionCount({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return <TabCountBadge count={count} className={className} />;
}

type BulkActionsFlyoutProps = {
  selectedCount: number;
  onCancel: () => void;
  children: ReactNode;
  className?: string;
  /** Accessible region label. */
  label?: string;
};

/**
 * Fixed bottom selection flyout (Job Radar / Subscriptions).
 * Host supplies action buttons as children; shell owns count + Cancel.
 * Counts use the shared tab pill chrome by default.
 */
export function BulkActionsFlyout({
  selectedCount,
  onCancel,
  children,
  className,
  label = "Bulk actions toolbar",
}: BulkActionsFlyoutProps) {
  if (selectedCount <= 0) return null;

  return (
    <aside
      role="region"
      aria-label={label}
      data-bulk-actions
      className={cn(
        APP_CONTENT_CENTER_X_CLASS,
        "fixed z-40 flex w-max max-w-[min(96vw,calc(100vw-var(--app-sidebar-width,0px)-1.5rem))] -translate-x-1/2 flex-nowrap items-center gap-2 overflow-x-auto rounded-2xl border border-border/80 bg-gradient-to-b from-card/75 from-35% via-card/45 to-card/20 px-4 py-2.5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3",
        className
      )}
      style={{
        bottom: "calc(1.5rem + var(--app-mobile-bottom-inset, 0px))",
      }}
    >
      <span className="mr-1 shrink-0 whitespace-nowrap border-r border-border pr-3 text-xs font-semibold text-muted-foreground">
        {selectedCount} Selected
      </span>

      {children}

      <button
        type="button"
        onClick={onCancel}
        className="ml-1 shrink-0 whitespace-nowrap text-xs text-muted-foreground underline hover:text-foreground"
      >
        Cancel
      </button>
    </aside>
  );
}
