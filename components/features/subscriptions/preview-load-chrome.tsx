"use client";

import type { ReactNode } from "react";

import { Loader } from "@/components/ui/loader";
import { Skeleton } from "@/components/ui/skeleton";
import { TextShimmer } from "@/components/ui/text-shimmer";

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
  /** Spinner label under the skeleton bars. */
  loadingMessage?: string;
  /** Preview surface (typically an iframe); kept mounted so onLoad can fire. */
  children: ReactNode;
  className?: string;
};

/**
 * Shared subject / date meta + shimmer skeleton for Gmail message preview
 * (Latest Message / original email) and View Snap.
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
        {loading ? (
          <>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </>
        ) : (
          <>
            <p className="break-words text-sm font-medium text-foreground">
              {subject}
            </p>
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
          </>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-[66%]" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-[50vh] rounded-md border border-border/50" />
          <div className="flex items-center gap-2 text-xs">
            <Loader size="sm" />
            <TextShimmer>{loadingMessage}</TextShimmer>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          loading && "hidden",
          !loading && "animate-in fade-in-0 duration-300"
        )}
      >
        {children}
      </div>
    </div>
  );
}
