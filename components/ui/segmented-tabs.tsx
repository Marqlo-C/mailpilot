import { cn } from "@/lib/utils";

/** Shared segmented tab rail used on Job Radar and Subscriptions. */
export const segmentedTabsListClassName =
  "inline-flex h-auto w-auto items-center justify-start gap-1 self-start rounded-xl border border-border/80 bg-[hsl(var(--tab-rail))] p-1 text-foreground/80 shadow-md";

export const segmentedTabsTriggerClassName =
  "group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-none transition-all data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=inactive]:hover:bg-card/50 data-[state=inactive]:hover:text-foreground";

/** Base pill chrome for tab counts and toolbar number fields. */
export const TAB_COUNT_BADGE_CLASSNAME =
  "rounded-md bg-[hsl(var(--tab-rail-chip))] px-1.5 py-0.5 text-[10px] font-bold leading-none text-foreground/80";

/** Active-tab tint — parent trigger must include `group`. */
export const TAB_COUNT_BADGE_ACTIVE_CLASSNAME =
  "group-data-[state=active]:bg-[#3c837b]/15 group-data-[state=active]:text-[#3c837b]";

type TabCountBadgeProps = {
  count: number;
  className?: string;
  /** Optional suffix (e.g. "%" for Fit Score threshold). */
  suffix?: string;
};

/**
 * Compact count chip that flips to brand tint when its parent tab is active.
 * Parent trigger must include the `group` class (via segmentedTabsTriggerClassName).
 */
export function TabCountBadge({
  count,
  className,
  suffix,
}: TabCountBadgeProps) {
  return (
    <span
      className={cn(
        TAB_COUNT_BADGE_CLASSNAME,
        TAB_COUNT_BADGE_ACTIVE_CLASSNAME,
        className
      )}
    >
      {count}
      {suffix}
    </span>
  );
}
