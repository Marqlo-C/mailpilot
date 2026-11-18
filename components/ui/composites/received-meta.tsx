"use client";

import { History } from "lucide-react";

import { LabelTooltip } from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/lib/utils/format-distance";
import { cn } from "@/lib/utils";

/**
 * Shared “received” telemetry (icon + type) for job cards and subscription rows.
 * Keep this as the single source of truth for that treatment.
 */
export const RECEIVED_META_CLASSNAME =
  "inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground";

export const RECEIVED_META_ICON_CLASSNAME =
  "h-3.5 w-3.5 shrink-0 text-muted-foreground/70";

export function ReceivedMeta({
  date,
  className,
  iconClassName,
  titlePrefix = "Received",
  emptyLabel = "—",
}: {
  date: Date | string | null | undefined;
  className?: string;
  iconClassName?: string;
  titlePrefix?: string;
  emptyLabel?: string;
}) {
  if (!date) {
    return (
      <span className={cn(RECEIVED_META_CLASSNAME, "shrink-0", className)}>
        <History className={cn(RECEIVED_META_ICON_CLASSNAME, iconClassName)} aria-hidden />
        <span>{emptyLabel}</span>
      </span>
    );
  }

  const label = formatRelativeTime(date, { addSuffix: false }) ?? emptyLabel;

  return (
    <LabelTooltip label={`${titlePrefix}: ${label}`} side="top">
      <span className={cn(RECEIVED_META_CLASSNAME, "shrink-0", className)}>
        <History className={cn(RECEIVED_META_ICON_CLASSNAME, iconClassName)} aria-hidden />
        <span>{label}</span>
      </span>
    </LabelTooltip>
  );
}
