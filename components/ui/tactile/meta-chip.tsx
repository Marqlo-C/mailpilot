"use client";

import type { ReactNode } from "react";

import { LabelTooltip } from "@/components/ui/tooltip";
import { SCORE_PERCENT_CLASSNAME } from "@/components/ui/styles/score-percent";
import { cn } from "@/lib/utils";

/** Shared shell for job meta chips + subscription metric pills. */
export const META_CHIP_SHELL_CLASSNAME =
  "inline-flex h-6 shrink-0 cursor-default items-stretch overflow-hidden rounded-md border border-border/40";

/** Lucide sizes for the icon rail — pass with {@link MetaChipProps.iconSize}. */
export const META_CHIP_ICON_CLASSNAME = {
  sm: "size-3 shrink-0",
  md: "size-3.5 shrink-0",
} as const;

const META_CHIP_ICON_RAIL_CLASSNAME = {
  sm: "flex w-5 shrink-0 items-center justify-center",
  md: "flex w-6 shrink-0 items-center justify-center",
} as const;

/** Outline /40 → pipe /80, same hue token as the shell border. */
const META_CHIP_PIPE_CLASSNAME = {
  default: "text-border/80",
  success:
    "text-emerald-200/80 dark:text-emerald-800/80",
} as const;

const META_CHIP_TONE_SHELL_CLASSNAME = {
  default: "",
  success:
    "border-emerald-200/40 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-400",
} as const;

export type MetaChipIconSize = keyof typeof META_CHIP_ICON_CLASSNAME;
export type MetaChipTone = keyof typeof META_CHIP_PIPE_CLASSNAME;
export type MetaChipDivider = "none" | "pipe" | "rail";

export type MetaChipProps = {
  icon?: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  className?: string;
  /** Fixed width so the same badge type aligns across rows. */
  width?: string;
  /** Ellipsis when the value exceeds the pill width. */
  truncateValue?: boolean;
  title?: ReactNode;
  /** Soften fills when the parent card/row is selected. */
  selected?: boolean;
  /**
   * Icon + rail footprint. `sm` (12px) for dense subscription metrics;
   * `md` (14px) for Job Radar cards.
   */
  iconSize?: MetaChipIconSize;
  /**
   * Shell + pipe hue. `success` uses emerald border/40 → pipe /80
   * (same step-up as default `border` /40 → /80).
   */
  tone?: MetaChipTone;
  /**
   * `pipe` — one gray fill + tiny `|` (job cards / email volume).
   * `rail` — hard `border-r` icon column.
   * `none` — value-only (clutter) or icon without a divider.
   */
  divider?: MetaChipDivider;
};

/**
 * Compact icon+value meta chip used by Job Radar cards and Subscriptions
 * metrics. Prefer this over one-off pill markup so stroke weight and divider
 * behavior stay in lockstep.
 */
export function MetaChip({
  icon,
  value,
  valueClassName,
  className,
  width,
  truncateValue = false,
  title,
  selected = false,
  iconSize = "sm",
  tone = "default",
  divider = "none",
}: MetaChipProps) {
  const pipe = divider === "pipe";
  const rail = divider === "rail";
  const success = tone === "success" && !selected;

  const badge = (
    <div
      className={cn(
        META_CHIP_SHELL_CLASSNAME,
        pipe &&
          !success &&
          (selected
            ? "bg-muted/50 text-muted-foreground"
            : "bg-muted/60 text-muted-foreground"),
        success && META_CHIP_TONE_SHELL_CLASSNAME.success,
        // Fixed `ch` widths must win over flex `min-width: auto` or extra
        // pipe padding makes subscription metrics grow past their column size.
        width ? "min-w-0" : "min-w-[44px]",
        className
      )}
      style={width ? { width, minWidth: width } : undefined}
    >
      {icon ? (
        <div
          className={cn(
            META_CHIP_ICON_RAIL_CLASSNAME[iconSize],
            // Inherit shell ink (emerald on success, muted on default).
            pipe && "text-current opacity-80",
            rail &&
              cn(
                "border-r border-border/40 text-muted-foreground/75",
                selected ? "bg-muted/50" : "bg-muted/40"
              ),
            !pipe && !rail && "text-current opacity-80"
          )}
        >
          {icon}
        </div>
      ) : null}
      <div
        className={cn(
          "relative min-w-0 flex-1",
          // Pipe value region: `|` on the left edge, value truly centered in
          // the remaining box with equal side inset (no dedicated pipe column
          // that stole space only on the left).
          pipe && icon
            ? "grid place-items-center px-1.5"
            : cn(
                "flex items-center px-1",
                rail
                  ? "justify-center"
                  : icon
                    ? "justify-start"
                    : "justify-center"
              ),
          SCORE_PERCENT_CLASSNAME,
          "text-[11px] tracking-normal",
          !pipe && !rail && !valueClassName && "bg-card text-foreground",
          rail && (valueClassName ?? "bg-card text-foreground"),
          valueClassName,
          selected && !pipe && "bg-muted/50 text-muted-foreground"
        )}
      >
        {pipe && icon ? (
          <span
            className={cn(
              "pointer-events-none absolute top-1/2 left-0 z-10 -translate-x-1/2 -translate-y-1/2 text-[10px] font-normal leading-none",
              success
                ? META_CHIP_PIPE_CLASSNAME.success
                : META_CHIP_PIPE_CLASSNAME.default
            )}
            aria-hidden
          >
            |
          </span>
        ) : null}
        <span
          className={cn(
            "max-w-full min-w-0 text-center",
            truncateValue && "truncate",
            pipe && !valueClassName && !success && "text-muted-foreground"
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );

  return (
    <LabelTooltip label={title} side="top" delayDuration={200}>
      {badge}
    </LabelTooltip>
  );
}
