"use client";

import type {
  ElementType,
  HTMLAttributes,
  ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export type TextShimmerProps = {
  as?: ElementType;
  /** Loop duration in seconds. */
  duration?: number;
  /** Gradient band width (clamped 5–45). */
  spread?: number;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

/**
 * prompt-kit text shimmer — gradient band sweeps loading / AI wait labels.
 *
 * MailPilot theme tokens are HSL channels (`--foreground: 210 24% 12%`), so
 * gradients must use `hsl(var(--token))` — bare `var(--token)` makes
 * `text-transparent` + `bg-clip-text` render invisible.
 */
export function TextShimmer({
  as: Component = "span",
  className,
  duration = 3,
  spread = 20,
  children,
  ...props
}: TextShimmerProps) {
  const dynamicSpread = Math.min(Math.max(spread, 5), 45);

  return (
    <Component
      className={cn(
        "inline-block bg-[length:200%_auto] bg-clip-text font-medium text-transparent animate-shimmer",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(to right, hsl(var(--muted-foreground)) ${50 - dynamicSpread}%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground)) ${50 + dynamicSpread}%)`,
        animationDuration: `${duration}s`,
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
