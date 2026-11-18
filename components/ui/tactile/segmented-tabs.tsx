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
} from "@/lib/utils/ui/tab-rail-preference";
import { cn } from "@/lib/utils";

/** Shared segmented tab rail used on Job Radar and Subscriptions. */

/** Full shell column — matches filter toolbar; listing/meta stay on `max-w-6xl`. */
export const tabRailRowClassName =
  "mb-4 flex w-full flex-wrap items-center justify-between gap-3";

/**
 * Sticky command deck. On tablet portrait (and mobile) it sticks under the
 * h-14 (3.5rem) top bar at `top-14`. On desktop (`lg:`) the top bar is hidden
 * and the command deck sticks at `top-0`.
 */
export const commandDeckClassName =
  "scroll-edge-out sticky flow-root top-14 z-30 -mx-4 -mt-4 rounded-b-2xl bg-canvas-fixed px-4 pt-4 min-[744px]:-mx-6 min-[744px]:px-6 lg:top-0 lg:-mt-[9px] lg:pt-1";

/** Rail, Sync, toolbar, and full-deck bodies share this outer column. */
export const commandDeckColumnClassName =
  "mx-auto w-[calc(100%-16px)] sm:w-[calc(100%-24px)] md:w-[calc(100%-32px)]";

/**
 * Listing under the sticky deck. Stays below `.scroll-edge-out`’s fade
 * padding so cards aren’t masked at rest. Strictly inset vs the wider rail/toolbar column across all viewports.
 */
export const commandDeckBodyClassName =
  "relative z-0 mx-auto w-[calc(100%-36px)] sm:w-[calc(100%-48px)] md:w-[calc(100%-56px)] max-w-6xl";

/** Body aligned to the rail + action / toolbar column (Settings). */
export const commandDeckWideBodyClassName = cn(
  "relative z-0",
  commandDeckColumnClassName
);

/** Rail → toolbar gap when the rail row uses `mb-0` (matches `.scroll-edge-out` fade). */
const COMMAND_DECK_STACK_GAP = "space-y-2.5";

export function CommandDeckFrame({
  rail,
  toolbar = null,
  bodyWidth = "listing",
  children,
}: {
  rail: ReactNode;
  /** Filter toolbar rendered with the rail so it is in the first paint. */
  toolbar?: ReactNode;
  /**
   * `listing` — max-w-6xl (Job Radar / Subscriptions cards).
   * `deck` — same width as the tab rail + top actions column (Settings).
   */
  bodyWidth?: "listing" | "deck";
  children: ReactNode;
}) {
  return (
    <>
      <header className={commandDeckClassName}>
        <div
          className={cn(commandDeckColumnClassName, COMMAND_DECK_STACK_GAP)}
        >
          {rail}
          {toolbar}
        </div>
      </header>
      <div
        className={
          bodyWidth === "deck"
            ? commandDeckWideBodyClassName
            : commandDeckBodyClassName
        }
      >
        {children}
      </div>
      <CommandDeckBottomCutoff bodyWidth={bodyWidth} />
    </>
  );
}

/**
 * Bottom scroll cutoff that lifts the card stream entry threshold off the
 * bottom of the screen and curves upward at the edges mirroring the
 * rounded-2xl (16px) corners of the cards, without drawing a hard visible
 * container or solid box around the area.
 */
export function CommandDeckBottomCutoff({
  bodyWidth = "listing",
}: {
  bodyWidth?: "listing" | "deck";
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none sticky bottom-0 z-20 -mx-4 -mb-6 flex flex-col select-none min-[744px]:-mx-6 min-[744px]:-mb-8"
    >
      {/* 16px corner row: curves up at the outer edges of the card column */}
      <div className="flex w-full items-end h-4">
        {/* Left canvas wing outside card column */}
        <div className="flex-1 h-full bg-canvas-fixed" />

        {/* Center column aligned exactly to the cards */}
        <div
          className={cn(
            "relative flex items-end h-full shrink-0",
            bodyWidth === "deck"
              ? "w-[calc(100%-16px)] sm:w-[calc(100%-24px)] md:w-[calc(100%-32px)]"
              : "w-[calc(100%-36px)] sm:w-[calc(100%-48px)] md:w-[calc(100%-56px)] max-w-6xl"
          )}
        >
          {/* Bottom-left curve: curves UP into the card column mirroring card corner */}
          <div
            className="size-4 shrink-0 bg-canvas-fixed"
            style={{
              maskImage:
                "radial-gradient(circle 16px at 16px 0, transparent 0, transparent 15.5px, black 16.5px)",
              WebkitMaskImage:
                "radial-gradient(circle 16px at 16px 0, transparent 0, transparent 15.5px, black 16.5px)",
            }}
          />

          {/* Open center where cards show through */}
          <div className="flex-1 h-full" />

          {/* Bottom-right curve: curves UP into the card column mirroring card corner */}
          <div
            className="size-4 shrink-0 bg-canvas-fixed"
            style={{
              maskImage:
                "radial-gradient(circle 16px at 0 0, transparent 0, transparent 15.5px, black 16.5px)",
              WebkitMaskImage:
                "radial-gradient(circle 16px at 0 0, transparent 0, transparent 15.5px, black 16.5px)",
            }}
          />
        </div>

        {/* Right canvas wing outside card column */}
        <div className="flex-1 h-full bg-canvas-fixed" />
      </div>

      {/* Base cutoff band lifting the scroll area 8px off the bottom of the viewport */}
      <div className="h-2 w-full bg-canvas-fixed" />
    </div>
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

function applyTabRailDataset(variant: TabRailVariant) {
  if (typeof document === "undefined") return;
  if (variant === "dark") {
    document.documentElement.dataset.mpTabRail = "dark";
  } else {
    document.documentElement.removeAttribute("data-mp-tab-rail");
  }
}

export function TabRailProvider({
  accountId,
  initialVariant,
  children,
}: {
  accountId: string | null;
  initialVariant?: TabRailVariant;
  children: ReactNode;
}) {
  const [variant, setVariantState] = useState<TabRailVariant>(
    () => initialVariant ?? (accountId ? readTabRail(accountId) : "light")
  );

  useClientLayoutEffect(() => {
    if (!accountId) {
      setVariantState("light");
      applyTabRailDataset("light");
      return;
    }
    const current = readTabRail(accountId);
    setVariantState((prev) => (prev === current ? prev : current));
    applyTabRailDataset(current);
  }, [accountId]);

  const setVariant = useCallback(
    (next: TabRailVariant) => {
      setVariantState(next);
      applyTabRailDataset(next);
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
  "font-brand rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none bg-[hsl(var(--tab-rail-chip))] text-foreground/80";

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
