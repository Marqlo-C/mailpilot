"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Lightweight floating preview that follows the pointer during a card drag. */
export function DragGhost({
  active,
  x,
  y,
  count,
  label,
  className,
}: {
  active: boolean;
  x: number;
  y: number;
  count: number;
  label?: ReactNode;
  className?: string;
}) {
  if (!active) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[80] max-w-[min(18rem,70vw)] rounded-lg border border-border/60 bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg",
        className
      )}
      style={{
        left: x + 12,
        top: y + 12,
      }}
      aria-hidden
    >
      <div className="truncate">{label}</div>
      {count > 1 ? (
        <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
          {count} selected
        </div>
      ) : null}
    </div>
  );
}
