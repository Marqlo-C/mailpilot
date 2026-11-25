"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { LabelTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Same plate language as compact {@link SegmentedControl} / light tab rail —
 * inset chips, not full-bleed icon buttons.
 */
export const TOOLBAR_TOOL_CLUSTER_CLASSNAME = cn(
  "inline-flex h-8 shrink-0 items-center gap-1 self-center overflow-visible",
  "rounded-lg border border-border bg-[hsl(var(--tab-rail-light))] p-0.5 shadow-sm"
);

/** Compact tab-rail chip shapes (hover/active fill only — no teal edge). */
export const TOOLBAR_TOOL_CLUSTER_BTN_CLASSNAME = cn(
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
  "text-xs font-medium text-foreground/60 shadow-none",
  "transition-all duration-150 ease-apple-snappy motion-safe:active:scale-[0.98]",
  "hover:bg-foreground/[0.06] hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-40",
  "[&_svg]:size-3.5"
);

export const TOOLBAR_TOOL_CLUSTER_BTN_ACTIVE_CLASSNAME = cn(
  "bg-[hsl(var(--tab-rail-light-highlight))] font-semibold text-foreground shadow-sm",
  "hover:bg-[hsl(var(--tab-rail-light-highlight))] hover:text-foreground"
);

export function ToolbarToolCluster({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(TOOLBAR_TOOL_CLUSTER_CLASSNAME, className)}
    >
      {children}
    </div>
  );
}

type ToolbarClusterIconButtonProps = {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onMouseDown?: ButtonHTMLAttributes<HTMLButtonElement>["onMouseDown"];
  children: ReactNode;
  className?: string;
};

export function ToolbarClusterIconButton({
  label,
  pressed,
  disabled,
  onClick,
  onMouseDown,
  children,
  className,
}: ToolbarClusterIconButtonProps) {
  return (
    <LabelTooltip label={label} side="bottom">
      {/*
        Span wrapper: TooltipTrigger asChild must not own the button — it
        overwrites data-state / can fight pressed styles (same as tab rail).
      */}
      <span className="inline-flex">
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed === true}
          className={cn(
            TOOLBAR_TOOL_CLUSTER_BTN_CLASSNAME,
            pressed === true && TOOLBAR_TOOL_CLUSTER_BTN_ACTIVE_CLASSNAME,
            className
          )}
          // Keep the editor selection/focus so mark isActive() stays correct.
          onMouseDown={(event) => {
            event.preventDefault();
            onMouseDown?.(event);
          }}
          onClick={onClick}
        >
          {children}
        </button>
      </span>
    </LabelTooltip>
  );
}
