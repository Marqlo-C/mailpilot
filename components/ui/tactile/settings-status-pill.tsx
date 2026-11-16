"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ENTRY_CHIP_CLASSNAME } from "@/components/ui/tactile/entry-chip";
import { formatStatusPillTitle } from "@/lib/utils/format";
import {
  type NestedCardLevel,
  useNestedCardLevel,
} from "./nested-card-context";

export const NESTED_PILL_TYPOGRAPHY = {
  1: {
    container: "rounded-full bg-muted/80 text-foreground px-2.5 py-0.5 text-xs gap-1.5",
    dot: "size-2",
  },
  2: {
    container: "rounded-full bg-muted/80 text-foreground px-2.5 py-0.5 text-[11px] gap-1.5",
    dot: "size-1.5",
  },
  3: {
    container: cn(ENTRY_CHIP_CLASSNAME, "gap-1 tracking-tight"),
    dot: "size-1",
  },
  4: {
    container: "rounded-md border border-border/60 text-muted-foreground px-1.5 py-0.5 text-[9.5px] gap-1 tracking-tight",
    dot: "size-1",
  },
} as const;

export function formatTitleCaseNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") {
    return formatStatusPillTitle(node);
  }
  if (Array.isArray(node)) {
    return React.Children.map(node, formatTitleCaseNode);
  }
  if (
    React.isValidElement<{ children?: React.ReactNode }>(node) &&
    node.props &&
    node.props.children !== undefined
  ) {
    return React.cloneElement(
      node,
      undefined,
      formatTitleCaseNode(node.props.children)
    );
  }
  return node;
}

/**
 * Pill-shaped status indicator designed for card header trailing slots.
 * Automatically cascades font size and dot size based on the card's nesting level.
 */
export function SettingsStatusPill({
  level: explicitLevel,
  showDot: explicitShowDot,
  dotClassName,
  count,
  hasItems,
  children,
  className,
}: {
  level?: NestedCardLevel;
  showDot?: boolean;
  dotClassName?: string;
  count?: number;
  hasItems?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const contextLevel = useNestedCardLevel();
  const level = explicitLevel ?? contextLevel ?? 2;
  const config = NESTED_PILL_TYPOGRAPHY[level];
  const showDot = explicitShowDot ?? (level < 3);

  const isPositive =
    hasItems !== undefined ? hasItems : typeof count === "number" ? count > 0 : undefined;

  const resolvedDot =
    dotClassName ??
    (isPositive !== undefined
      ? isPositive
        ? "bg-emerald-500"
        : "bg-muted-foreground/60"
      : "bg-muted-foreground/60");

  const formattedChildren = formatTitleCaseNode(children);

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium shrink-0",
        config.container,
        className
      )}
    >
      {showDot && (
        <span
          className={cn("rounded-full shrink-0", config.dot, resolvedDot)}
          aria-hidden="true"
        />
      )}
      {formattedChildren}
    </span>
  );
}
