import { History } from "lucide-react";

import { formatDistanceToNow } from "@/lib/format-distance";
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
  titlePrefix = "Received",
  emptyLabel = "—",
}: {
  date: Date | string | null | undefined;
  className?: string;
  titlePrefix?: string;
  emptyLabel?: string;
}) {
  if (!date) {
    return (
      <span className={cn(RECEIVED_META_CLASSNAME, "shrink-0", className)}>
        <History className={RECEIVED_META_ICON_CLASSNAME} aria-hidden />
        <span>{emptyLabel}</span>
      </span>
    );
  }

  const parsed = date instanceof Date ? date : new Date(date);
  const label = Number.isFinite(parsed.getTime())
    ? formatDistanceToNow(parsed, { addSuffix: true })
    : emptyLabel;

  return (
    <span
      className={cn(RECEIVED_META_CLASSNAME, "shrink-0", className)}
      title={`${titlePrefix}: ${label}`}
    >
      <History className={RECEIVED_META_ICON_CLASSNAME} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
