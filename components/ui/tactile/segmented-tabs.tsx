"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  persistTabRail,
  readTabRail,
  type TabRailVariant,
} from "@/lib/ui/tab-rail-preference";
import { cn } from "@/lib/utils";

/** Shared segmented tab rail used on Job Radar and Subscriptions. */

/** Desktop: rail sits in the logo band so its bottom meets the sidebar separator. */
export const tabRailRowClassName =
  "mb-3 flex flex-col justify-between gap-3 pt-2 sm:flex-row sm:items-center md:-mt-[4.25rem] md:h-[4.25rem] md:items-end md:pt-0";

/** Light rail — upstream gray track, white active tab. */
export const lightRailListClassName =
  "inline-flex h-auto w-auto items-center justify-start gap-1 self-start rounded-xl border border-border/80 bg-[hsl(var(--tab-rail-light))] p-1 text-foreground/80 shadow-md";

export const lightRailTriggerClassName =
  "group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-none transition-all data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=inactive]:hover:bg-card/50 data-[state=inactive]:hover:text-foreground";

/** Dark rail — primary-button shell (#181e26 at 85%) with mint labels. */
export const darkRailListClassName =
  "inline-flex h-auto w-auto items-center justify-start gap-1 self-start rounded-xl border border-[hsl(var(--tab-rail-dark))] bg-[hsl(var(--tab-rail-dark)/0.85)] p-1 text-[#e4f7f3] shadow-md";

export const darkRailTriggerClassName =
  "group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-[#e4f7f3]/90 shadow-none transition-all data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-white/10 data-[state=inactive]:hover:text-[#e4f7f3]";

const TabRailContext = createContext<{
  variant: TabRailVariant;
  setVariant: (next: TabRailVariant) => void;
  accountId: string | null;
} | null>(null);

export function TabRailProvider({
  accountId,
  children,
}: {
  accountId: string | null;
  children: ReactNode;
}) {
  const [variant, setVariantState] = useState<TabRailVariant>("light");

  useEffect(() => {
    if (!accountId) {
      setVariantState("light");
      return;
    }
    setVariantState(readTabRail(accountId));
  }, [accountId]);

  const setVariant = useCallback(
    (next: TabRailVariant) => {
      setVariantState(next);
      if (accountId) persistTabRail(accountId, next);
    },
    [accountId]
  );

  const value = useMemo(
    () => ({ variant, setVariant, accountId }),
    [variant, setVariant, accountId]
  );

  return (
    <TabRailContext.Provider value={value}>{children}</TabRailContext.Provider>
  );
}

export function useTabRail() {
  const context = useContext(TabRailContext);
  if (!context) {
    throw new Error("useTabRail must be used within TabRailProvider");
  }
  return context;
}

export function useTabRailClasses() {
  const { variant } = useTabRail();
  return variant === "dark"
    ? {
        listClassName: darkRailListClassName,
        triggerClassName: darkRailTriggerClassName,
      }
    : {
        listClassName: lightRailListClassName,
        triggerClassName: lightRailTriggerClassName,
      };
}

/** Base pill chrome for tab counts and toolbar number fields. */
export const TAB_COUNT_BADGE_CLASSNAME =
  "rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none bg-[hsl(var(--tab-rail-chip))] text-foreground/80";

/**
 * Active-tab tint — #498E86 number on a soft teal pill of the same family.
 * Parent trigger must include `group`.
 */
export const TAB_COUNT_BADGE_ACTIVE_CLASSNAME =
  "group-data-[state=active]:!bg-[#498E86]/15 group-data-[state=active]:!text-[#498E86]";

type TabCountBadgeProps = {
  count: number;
  className?: string;
  /** Optional suffix (e.g. "%" for Fit Score threshold). */
  suffix?: string;
};

/**
 * Compact count chip that flips to brand tint when its parent tab is active.
 * Parent trigger must include the `group` class (via the tab-rail trigger classes).
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
