"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface OutboundStatusPillProps {
  isRecommended: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Neutral, flat status pill for Outbound tailoring cards.
 *
 * Light and unobtrusive: flat light background with no 3D effects,
 * colored based on whether the active option is the recommended setting
 * (teal derivative) or an alternative/experimental setting (pink derivative).
 */
export function OutboundStatusPill({
  isRecommended,
  children,
  className,
}: OutboundStatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-0.5 text-[11px] font-medium shrink-0",
        isRecommended
          ? "text-[#0f766e] dark:text-[#2dd4bf]"
          : "text-[#78486c] dark:text-[#e49ecb]",
        className
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-current shrink-0"
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
