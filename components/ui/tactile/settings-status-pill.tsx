"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ENTRY_CHIP_CLASSNAME } from "@/components/ui/tactile/entry-chip";
import { formatStatusPillTitle } from "@/lib/utils/format";
import {
  type NestedCardLevel,
  useNestedCardLevel,
} from "./nested-card-context";

export type SettingsStatusPillVariant = "default" | "recommended" | "alternative";

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
    container:
      "font-wordmark rounded-md border border-border/60 text-muted-foreground px-1.5 py-0.5 text-[9.5px] gap-1 tracking-tight",
    dot: "size-1",
  },
} as const;

export const VARIANT_CONTAINER_CLASSES: Record<SettingsStatusPillVariant, string | undefined> = {
  default: undefined,
  recommended: "text-[#0f766e] dark:text-[#2dd4bf]",
  alternative: "text-[#78486c] dark:text-[#e49ecb]",
};

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

export interface SettingsStatusPillProps {
  /** Optional nesting level override; cascades from card context if omitted. */
  level?: NestedCardLevel;
  /**
   * Semantic tint variant:
   * - default: standard text-foreground with emerald or muted dot.
   * - recommended: teal (#0f766e / #2dd4bf) with bullet dot for recommended settings.
   * - alternative: pink/plum (#78486c / #e49ecb) with bullet dot for alternative settings.
   */
  variant?: SettingsStatusPillVariant;
  /** Explicit control over bullet dot visibility. Defaults to true for variants and levels < 3. */
  showDot?: boolean;
  /** Custom classes for the bullet dot indicator. */
  dotClassName?: string;
  /** Number of items to evaluate status (positive if > 0). */
  count?: number;
  /** Explicit boolean flag indicating whether the entity has active items. */
  hasItems?: boolean;
  /** Label content displayed within the pill. */
  children: React.ReactNode;
  /** Optional container class overrides. */
  className?: string;
}

/**
 * Pill-shaped status indicator designed for card header trailing slots.
 * Automatically cascades font size and dot size based on the card's nesting level,
 * with first-class support for recommended (teal) and alternative (pink) option states.
 */
export function SettingsStatusPill({
  level: explicitLevel,
  variant = "default",
  showDot: explicitShowDot,
  dotClassName,
  count,
  hasItems,
  children,
  className,
}: SettingsStatusPillProps) {
  const contextLevel = useNestedCardLevel();
  const level = explicitLevel ?? contextLevel ?? 2;
  const config = NESTED_PILL_TYPOGRAPHY[level];
  const showDot =
    explicitShowDot ??
    (variant === "recommended" || variant === "alternative" ? true : level < 3);

  const isPositive =
    hasItems !== undefined ? hasItems : typeof count === "number" ? count > 0 : undefined;

  const resolvedDot =
    dotClassName ??
    (variant === "recommended" || variant === "alternative"
      ? "bg-current"
      : isPositive !== undefined
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
        VARIANT_CONTAINER_CLASSES[variant],
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
