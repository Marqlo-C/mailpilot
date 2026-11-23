"use client";

import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

/**
 * shadcn-style aliases over react-resizable-panels v4 (`Group` / `Panel` / `Separator`).
 *
 * Default handle: narrow seam + short centered capsule indicator (iPad-style),
 * with a wider invisible hit/steer area. Optional `withHandle` adds the stock grip.
 */
function ResizablePanelGroup({
  className,
  ...props
}: GroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  );
}

function ResizablePanel({ className, ...props }: PanelProps) {
  return (
    <Panel
      data-slot="resizable-panel"
      className={className}
      {...props}
    />
  );
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        // Modest gutter between plates; short capsule sits in the middle.
        "group relative flex w-2.5 shrink-0 items-center justify-center bg-transparent",
        "before:absolute before:-inset-x-1 before:inset-y-0 before:content-['']",
        // Short centered capsule — not full-height.
        "after:absolute after:top-1/2 after:left-1/2 after:h-8 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2",
        "after:rounded-full after:bg-border/80 after:transition-[background-color,height,width]",
        "data-[separator=hover]:after:h-9 data-[separator=hover]:after:bg-brand/55",
        "data-[separator=focus]:after:h-9 data-[separator=focus]:after:bg-brand/55",
        "data-[separator=active]:after:h-9 data-[separator=active]:after:w-1.5 data-[separator=active]:after:bg-brand/70",
        "focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-brand/40 focus-visible:ring-offset-1",
        // Vertical group: rotate the short bar into a horizontal capsule.
        "aria-[orientation=horizontal]:h-2.5 aria-[orientation=horizontal]:w-full",
        "aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-8",
        "aria-[orientation=horizontal]:data-[separator=hover]:after:w-9",
        "aria-[orientation=horizontal]:data-[separator=focus]:after:w-9",
        "aria-[orientation=horizontal]:data-[separator=active]:after:h-1.5 aria-[orientation=horizontal]:data-[separator=active]:after:w-9",
        "[&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle ? (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border">
          <GripVertical className="size-2.5" />
        </div>
      ) : null}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
