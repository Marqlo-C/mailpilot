import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type SkeletonProps = {
  /** Override the sweep gradient (e.g. sidebar `via-white/25`). */
  shimmerClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Shared placeholder bar with a single-page shimmer sweep.
 * Prefer this over ad-hoc `animate-pulse` muted blocks.
 */
export function Skeleton({
  className,
  shimmerClassName,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/10 to-transparent motion-safe:animate-skeleton-shimmer",
          shimmerClassName
        )}
      />
    </div>
  );
}
