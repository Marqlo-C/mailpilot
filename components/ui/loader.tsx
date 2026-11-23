"use client";

import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type LoaderSize = "sm" | "md" | "lg";

export type LoaderProps = {
  /** Visual style. MailPilot standardizes on prompt-kit `wave`. */
  variant?: "wave";
  /**
   * Placement SSOT: `sm` on commit buttons / inline rows; `md` on panel or
   * window body content waits; `lg` reserved. Never show button + panel wave
   * for the same operation.
   */
  size?: LoaderSize;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

const BAR_WIDTHS: Record<LoaderSize, string> = {
  sm: "w-0.5",
  md: "w-0.5",
  lg: "w-1",
};

const CONTAINER_SIZES: Record<LoaderSize, string> = {
  sm: "h-4",
  md: "h-5",
  lg: "h-6",
};

const BAR_HEIGHTS: Record<LoaderSize, string[]> = {
  sm: ["6px", "9px", "12px", "9px", "6px"],
  md: ["8px", "12px", "16px", "12px", "8px"],
  lg: ["10px", "15px", "20px", "15px", "10px"],
};

/**
 * prompt-kit wave loader — five bars with staggered scaleY animation.
 * Uses `bg-current` so Tailwind `text-*` classes on `className` tint the bars.
 */
export function WaveLoader({
  className,
  size = "md",
  ...props
}: {
  className?: string;
  size?: LoaderSize;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-0.5 text-primary",
        CONTAINER_SIZES[size],
        className
      )}
      {...props}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "animate-[wave_1s_ease-in-out_infinite] rounded-full bg-current",
            BAR_WIDTHS[size]
          )}
          style={{
            animationDelay: `${i * 100}ms`,
            height: BAR_HEIGHTS[size][i],
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * Shared loading indicator. Defaults to the prompt-kit wave variant.
 *
 * Use `md` when the surface content is empty/wrong until the job finishes
 * (dialog/flyout body). Use `sm` on the control that committed an action
 * while the form stays visible. Do not mount both for one operation.
 */
export function Loader({
  variant = "wave",
  size = "md",
  className,
  ...props
}: LoaderProps) {
  void variant;
  return <WaveLoader size={size} className={className} {...props} />;
}
