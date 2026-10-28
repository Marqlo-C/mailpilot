"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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

/** Sits in normal flow at the top of the command deck. */
export const tabRailRowClassName =
  "mb-4 flex flex-wrap items-center justify-between gap-3";

/**
 * Sticky command deck. On desktop the negative margin cancels main's top
 * padding, then 4px drops the rail just under the sidebar's top.
 */
export const commandDeckClassName =
  "scroll-edge-out sticky flow-root top-[4.25rem] z-30 -mx-4 -mt-4 rounded-b-2xl bg-canvas-fixed px-4 pt-4 md:top-0 md:-mx-6 md:-mt-[9px] md:px-6 md:pt-1";

export function CommandDeckFrame({
  rail,
  toolbar = null,
  children,
}: {
  rail: ReactNode;
  /** Filter toolbar rendered with the rail so it is in the first paint. */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className={commandDeckClassName}>
        <div className="space-y-3">
          {rail}
          {toolbar}
        </div>
      </header>
      <div className="relative z-0">{children}</div>
    </>
  );
}

/** Inactive tab label. Unselected sidebar pages use the same ink. */
export const tabRailInactiveTextClassName = {
  light: "text-foreground/60",
  dark: "text-[#e4f7f3]/60",
} as const;

/** Light rail — near-white plate above the page, white selected chip, same teal edge. */
export const lightRailListClassName =
  "inline-flex h-auto w-auto items-center justify-start gap-2.5 self-start rounded-xl border border-border bg-[hsl(var(--tab-rail-light))] p-1 pr-3 text-foreground/60 shadow-md";

export const lightRailTriggerClassName = cn(
  "group relative inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium shadow-none transition-all data-[state=active]:bg-[hsl(var(--tab-rail-light-highlight))] data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-foreground/[0.06] data-[state=inactive]:hover:text-foreground data-[state=active]:before:pointer-events-none data-[state=active]:before:absolute data-[state=active]:before:-right-2 data-[state=active]:before:bottom-1 data-[state=active]:before:top-1 data-[state=active]:before:w-[3px] data-[state=active]:before:rounded-r-full data-[state=active]:before:bg-[#1ab5af] data-[state=active]:before:shadow-[2px_0_6px_rgba(26,181,175,0.35)] data-[state=active]:before:content-['']",
  tabRailInactiveTextClassName.light
);

/** Solid navy plate shared by the sidebar and the dark tab rail. */
export const darkPlateClassName =
  "border border-white/10 bg-[hsl(var(--sidebar-panel))] shadow-md";

/** Dark rail — same solid plate as the sidebar, with mint labels. */
export const darkRailListClassName = cn(
  "inline-flex h-auto w-auto items-center justify-start gap-2.5 self-start rounded-xl p-1 pr-3 text-[#e4f7f3]",
  darkPlateClassName
);

export const darkRailTriggerClassName = cn(
  "group relative inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium shadow-none transition-all data-[state=active]:bg-[hsl(var(--sidebar-highlight))] data-[state=active]:font-semibold data-[state=active]:text-[#e4f7f3] data-[state=inactive]:hover:bg-white/10 data-[state=inactive]:hover:text-[#e4f7f3] data-[state=active]:before:pointer-events-none data-[state=active]:before:absolute data-[state=active]:before:-right-2 data-[state=active]:before:bottom-1 data-[state=active]:before:top-1 data-[state=active]:before:w-[3px] data-[state=active]:before:rounded-r-full data-[state=active]:before:bg-[#1ab5af] data-[state=active]:before:shadow-[2px_0_6px_rgba(26,181,175,0.35)] data-[state=active]:before:content-['']",
  tabRailInactiveTextClassName.dark
);

const TabRailContext = createContext<{
  variant: TabRailVariant;
  setVariant: (next: TabRailVariant) => void;
  accountId: string | null;
} | null>(null);

const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function TabRailProvider({
  accountId,
  children,
}: {
  accountId: string | null;
  children: ReactNode;
}) {
  const [variant, setVariantState] = useState<TabRailVariant>("light");

  useClientLayoutEffect(() => {
    document.documentElement.removeAttribute("data-mp-tab-rail");
    document.documentElement.removeAttribute("data-mp-rail-action");
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

type TabCountBadgeProps = {
  count: number;
  className?: string;
  /** Optional suffix (e.g. "%" for Fit Score threshold). */
  suffix?: string;
};

/** Compact count chip. Selected and unselected tabs share this color. */
export function TabCountBadge({
  count,
  className,
  suffix,
}: TabCountBadgeProps) {
  return (
    <span className={cn(TAB_COUNT_BADGE_CLASSNAME, className)}>
      {count}
      {suffix}
    </span>
  );
}
