import { cn } from "@/lib/utils";

/** Shared segmented tab rail used on Job Radar and Subscriptions. */
export const segmentedTabsListClassName =
  "inline-flex h-auto w-auto items-center justify-start gap-1 self-start rounded-xl border border-border/70 bg-secondary/50 p-1 text-muted-foreground";

export const segmentedTabsTriggerClassName =
  "group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium shadow-none transition-all data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-card/40 data-[state=inactive]:hover:text-foreground";

type TabCountBadgeProps = {
  count: number;
  className?: string;
};

/**
 * Compact count chip that flips to brand tint when its parent tab is active.
 * Parent trigger must include the `group` class (via segmentedTabsTriggerClassName).
 */
export function TabCountBadge({ count, className }: TabCountBadgeProps) {
  return (
    <span
      className={cn(
        "rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted-foreground group-data-[state=active]:bg-[#3c837b]/15 group-data-[state=active]:text-[#3c837b]",
        className
      )}
    >
      {count}
    </span>
  );
}
