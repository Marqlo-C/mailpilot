"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function formatPreviewDisplayDate(raw: string): string {
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return raw;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type PreviewLoadChromeProps = {
  loading: boolean;
  subject: string;
  dateLabel: string;
  /** Spinner label under the pulse bars. */
  loadingMessage?: string;
  /** Preview surface (typically an iframe); kept mounted so onLoad can fire. */
  children: ReactNode;
  className?: string;
};

/**
 * Shared subject / date meta + pulse skeleton used by View Last Email
 * and View Snap preview.
 */
export function PreviewLoadChrome({
  loading,
  subject,
  dateLabel,
  loadingMessage = "Loading…",
  children,
  className,
}: PreviewLoadChromeProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="min-w-0 max-w-full space-y-1">
        <p className="break-words text-sm font-medium text-foreground">
          {loading ? "Loading subject…" : subject}
        </p>
        <p className="text-xs text-muted-foreground">
          {loading ? "Loading date…" : dateLabel}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-4 w-[66%] animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-[50vh] animate-pulse rounded-md border border-border/50 bg-muted/40" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {loadingMessage}
          </div>
        </div>
      ) : null}

      <div className={cn(loading && "hidden")}>{children}</div>
    </div>
  );
}
