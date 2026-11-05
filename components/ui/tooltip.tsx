"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

/**
 * Singular app tooltip surface — matches the compact OS/native `title`
 * tip that collapsed sidebar icons (e.g. Export Profile) and View Snapshot
 * used before, not the dark sidebar flyout plate.
 */
export const TOOLTIP_CONTENT_CLASSNAME =
  "z-50 w-max max-w-xs overflow-hidden rounded-[4px] bg-[#3c4043] px-2 py-1 text-[11px] font-normal leading-snug text-white shadow-sm animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 origin-[--radix-tooltip-content-transform-origin]";

/** Tight offset like a browser `title` tip. */
export const TOOLTIP_SIDE_OFFSET_DEFAULT = 4;

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(
  (
    { className, sideOffset = TOOLTIP_SIDE_OFFSET_DEFAULT, ...props },
    ref
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(TOOLTIP_CONTENT_CLASSNAME, className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Compact wrapper for a single label tip (e.g. collapsed sidebar icons).
 * Prefer composing Tooltip* directly when content needs custom layout.
 *
 * Do not pass a Radix TabsTrigger (or anything else that owns `data-state`)
 * as the direct child — Tooltip’s open/closed state overwrites it via asChild
 * and breaks active styles (e.g. tab rail teal edge). Wrap that control in a
 * span instead.
 */
export function LabelTooltip({
  label,
  side = "top",
  delayDuration = 400,
  disabled = false,
  contentClassName,
  children,
}: {
  label: React.ReactNode;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"];
  delayDuration?: number;
  disabled?: boolean;
  contentClassName?: string;
  children: React.ReactElement;
}) {
  if (disabled || label == null || label === false || label === "") {
    return children;
  }

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className={contentClassName}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
