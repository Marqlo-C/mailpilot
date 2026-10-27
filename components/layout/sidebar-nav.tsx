"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cog, MailCheck, Radar, SquareKanban } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { SyncTelemetry } from "@/components/opportunities/sync-telemetry";
import { useSyncStatus } from "@/components/layout/sync-status-provider";
import {
  clearSidebarPageTab,
  rememberSidebarPageTab,
  sidebarTabsForHref,
  type SidebarPageTab,
} from "@/lib/navigation/page-tabs";
import { darkPlateClassName, tabRailInactiveTextClassName } from "@/components/ui/tactile/segmented-tabs";
import { cn } from "@/lib/utils";

export const SIDEBAR_NAV = [
  { href: "/", label: "Console", icon: SquareKanban },
  { href: "/subscriptions", label: "Subscriptions", icon: MailCheck },
  { href: "/jobs", label: "Job Radar", icon: Radar },
  { href: "/settings", label: "Settings", icon: Cog },
] as const;

type SidebarNavItem = (typeof SIDEBAR_NAV)[number];

export const SIDEBAR_PRIMARY_NAV = SIDEBAR_NAV.filter(
  (item) => item.href !== "/settings"
);

export const SIDEBAR_SETTINGS_NAV = SIDEBAR_NAV.filter(
  (item) => item.href === "/settings"
);

export const SECTION_TITLE_CLASS =
  "select-none pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500";

/** Compact gap under the hairline before Console. */
const SHELL_NAV_CLASS =
  "relative z-10 flex shrink-0 flex-col gap-1 px-3 pb-2 pt-3";

/** Brief pause so a fly-by doesn't open the menu. */
const FLYOUT_OPEN_DELAY_MS = 500;
const FLYOUT_CLOSE_DELAY_MS = 80;
/**
 * Collapsed tab menu's bridge covers the status edge. A short dwell lets a
 * pass-through to the tabs keep going, and a pause on the edge opens status.
 */
const TELEMETRY_OPEN_DELAY_MS = 280;

/** Same right-edge capsule as the active page mark. */
const NAV_EDGE_MARK_CLASS =
  "pointer-events-none absolute bottom-1.5 top-1.5 w-[3px] rounded-l-full";
/** Full-width row: 8px past the row, 4px inside the sidebar edge. */
const NAV_EDGE_MARK_EXPANDED = "-right-2";
/**
 * Collapsed icon sits 14px inside the sidebar edge. Shift the capsule so it
 * lands on that same edge.
 */
const NAV_EDGE_MARK_COLLAPSED = "-right-[10px]";

function telemetryEdgeClass(
  connected: boolean,
  syncing: boolean,
  pendingCount: number
): string {
  if (!connected) {
    return "bg-white/70 shadow-[-2px_0_6px_rgba(255,255,255,0.35)]";
  }
  if (syncing) {
    return "bg-sky-300 shadow-[-2px_0_6px_rgba(125,211,252,0.35)]";
  }
  if (pendingCount > 0) {
    return "bg-[#c21f10] shadow-[-2px_0_6px_rgba(194,31,16,0.35)]";
  }
  return "bg-emerald-300 shadow-[-2px_0_6px_rgba(110,231,183,0.35)]";
}
/** `px-3` on the nav. Expanded rows end this far inside the sidebar edge. */
const NAV_EDGE_PAD_PX = 12;
/** Collapsed `size-9` icon, centered in the `w-[64px]` rail. */
const COLLAPSED_ICON_TO_EDGE_PX = 14;
/** Space between the sidebar edge and the popout. */
const FLYOUT_GAP_PX = 8;

function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SidebarNav({
  collapsed,
  activeAccountId,
  items,
  title,
  className,
}: {
  collapsed: boolean;
  activeAccountId: string | null;
  items: readonly SidebarNavItem[];
  title?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { isSyncing, pendingCount } = useSyncStatus();
  const [openHref, setOpenHref] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const telemetryTimerRef = useRef<number | null>(null);

  function clearTimer(timerRef: MutableRefObject<number | null>) {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function cancelTelemetryOpen() {
    clearTimer(telemetryTimerRef);
  }

  function scheduleTelemetryOpen() {
    clearTimer(telemetryTimerRef);
    telemetryTimerRef.current = window.setTimeout(() => {
      telemetryTimerRef.current = null;
      clearTimer(openTimerRef);
      clearTimer(closeTimerRef);
      setOpenHref(null);
      setRailOpen(true);
    }, TELEMETRY_OPEN_DELAY_MS);
  }

  function scheduleFlyoutOpen(href: string) {
    cancelTelemetryOpen();
    clearTimer(closeTimerRef);
    clearTimer(openTimerRef);
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setOpenHref(href);
    }, FLYOUT_OPEN_DELAY_MS);
  }

  function scheduleFlyoutClose() {
    cancelTelemetryOpen();
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpenHref(null);
    }, FLYOUT_CLOSE_DELAY_MS);
  }

  function resumeTabFlyout(next: EventTarget | null, from: Element) {
    const row = from.closest("[data-sidebar-tab-menu]");
    if (!row || !(next instanceof Node) || !row.contains(next)) return;
    const href = row.getAttribute("data-nav-href");
    if (!href) return;
    scheduleFlyoutOpen(href);
  }

  useEffect(() => {
    const openTimer = openTimerRef;
    const closeTimer = closeTimerRef;
    const telemetryTimer = telemetryTimerRef;
    return () => {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      if (telemetryTimer.current !== null) {
        window.clearTimeout(telemetryTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!openHref) return;
    if (isNavActive(pathname, openHref)) setOpenHref(null);
  }, [pathname, openHref]);

  useEffect(() => {
    if (!openHref) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-sidebar-tab-menu]")) return;
      setOpenHref(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenHref(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openHref]);

  return (
    <nav
      className={cn(SHELL_NAV_CLASS, className)}
      onClick={(event) => event.stopPropagation()}
    >
      {title && !collapsed ? (
        <span className={SECTION_TITLE_CLASS}>{title}</span>
      ) : null}
      {items.map((item) => {
        const active = isNavActive(pathname, item.href);
        const tabs = sidebarTabsForHref(item.href);
        const showTabs = !active && tabs.length > 0;
        const open = showTabs && openHref === item.href;
        const showJobRadarStatus = item.href === "/jobs";
        const Icon = item.icon;
        return (
          <div
            key={item.href}
            className="group/nav"
            data-sidebar-tab-menu={showTabs ? "" : undefined}
            data-nav-href={item.href}
            onPointerEnter={() => {
              clearTimer(closeTimerRef);
              if (!showTabs) {
                clearTimer(openTimerRef);
                return;
              }
              if (openHref === item.href) {
                clearTimer(openTimerRef);
                return;
              }
              scheduleFlyoutOpen(item.href);
            }}
            onPointerLeave={(event) => {
              const next = event.relatedTarget;
              if (
                next instanceof Node &&
                event.currentTarget.contains(next)
              ) {
                return;
              }
              scheduleFlyoutClose();
            }}
          >
            <div
              className={cn(
                "relative flex rounded-xl transition-colors duration-150",
                collapsed
                  ? "mx-auto size-9 shrink-0 items-center justify-center"
                  : "h-9 w-full items-center",
                active
                  ? "bg-[hsl(var(--sidebar-highlight))] text-[#e4f7f3] hover:bg-[hsl(var(--sidebar-highlight))]"
                  : "hover:bg-white/10",
                open && "bg-white/10"
              )}
            >
              {active && !collapsed && item.href !== "/jobs" ? (
                <span
                  className={cn(
                    NAV_EDGE_MARK_CLASS,
                    NAV_EDGE_MARK_EXPANDED,
                    "bg-[#1ab5af] shadow-[-2px_0_6px_rgba(26,181,175,0.35)]"
                  )}
                  aria-hidden="true"
                />
              ) : null}
              {showJobRadarStatus ? (
                <span
                  className={cn(
                    NAV_EDGE_MARK_CLASS,
                    collapsed
                      ? NAV_EDGE_MARK_COLLAPSED
                      : NAV_EDGE_MARK_EXPANDED,
                    telemetryEdgeClass(
                      Boolean(activeAccountId),
                      isSyncing,
                      pendingCount
                    )
                  )}
                  aria-hidden="true"
                />
              ) : null}
              <div
                className={cn(
                  "flex items-center",
                  collapsed
                    ? "absolute inset-0 justify-center"
                    : "absolute inset-0"
                )}
              >
                <Link
                  href={item.href}
                  title={collapsed && !showTabs ? item.label : undefined}
                  onClick={() => {
                    clearSidebarPageTab();
                    setOpenHref(null);
                  }}
                  className={cn(
                    "flex items-center gap-3",
                    collapsed && "size-full justify-center",
                    !collapsed && "h-full w-full px-3"
                  )}
                >
                  <span className="relative grid size-4 shrink-0 place-items-center">
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active
                          ? "text-[#1ab5af]"
                          : open
                            ? "text-[#e4f7f3]"
                            : "text-[#e4f7f3]/60 group-hover/nav:text-[#e4f7f3]"
                      )}
                    />
                  </span>
                  {!collapsed && (
                    <span
                      className={cn(
                        "whitespace-nowrap text-[13px] font-medium tracking-normal",
                        active
                          ? "font-semibold text-[#e4f7f3]"
                          : cn(
                              tabRailInactiveTextClassName.dark,
                              "group-hover/nav:text-[#e4f7f3]"
                            )
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              </div>
              {showJobRadarStatus ? (
                <div
                  data-telemetry-edge=""
                  className={cn(
                    "absolute inset-y-0",
                    collapsed
                      ? "-right-[14px] z-[140] w-3"
                      : "-right-2 z-10 w-8"
                  )}
                  onPointerEnter={() => {
                    if (collapsed && openHref === item.href) {
                      scheduleTelemetryOpen();
                      return;
                    }
                    cancelTelemetryOpen();
                    clearTimer(openTimerRef);
                    setOpenHref(null);
                    setRailOpen(true);
                  }}
                  onPointerLeave={(event) => {
                    cancelTelemetryOpen();
                    const next = event.relatedTarget;
                    if (
                      next instanceof Node &&
                      event.currentTarget.contains(next)
                    ) {
                      return;
                    }
                    if (
                      next instanceof Element &&
                      next.closest("[data-sidebar-flyout='telemetry']")
                    ) {
                      return;
                    }
                    setRailOpen(false);
                    resumeTabFlyout(next, event.currentTarget);
                  }}
                />
              ) : null}
              {open ? (
                <TabFlyout
                  href={item.href}
                  tabs={tabs}
                  collapsed={collapsed}
                  onPick={() => setOpenHref(null)}
                />
              ) : null}
              {showJobRadarStatus && railOpen ? (
                <SidebarFlyout
                  collapsed={collapsed}
                  marker="telemetry"
                  onPointerLeave={(event) => {
                    const next = event.relatedTarget;
                    if (
                      next instanceof Element &&
                      next.closest("[data-telemetry-edge]")
                    ) {
                      return;
                    }
                    setRailOpen(false);
                    resumeTabFlyout(next, event.currentTarget);
                  }}
                >
                  <SyncTelemetry
                    connected={Boolean(activeAccountId)}
                    surface="sidebar"
                    panel
                    className="shrink-0"
                  />
                </SidebarFlyout>
              ) : null}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFlyout({
  collapsed,
  children,
  marker,
  onPointerLeave,
}: {
  collapsed: boolean;
  children: ReactNode;
  marker?: string;
  onPointerLeave?: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const edge =
    (collapsed ? COLLAPSED_ICON_TO_EDGE_PX : NAV_EDGE_PAD_PX) + FLYOUT_GAP_PX;

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 12;
    let next = 0;
    if (rect.bottom > window.innerHeight - margin) {
      next -= rect.bottom - (window.innerHeight - margin);
    }
    if (rect.top + next < margin) {
      next += margin - (rect.top + next);
    }
    if (next !== 0) setShift(next);
  }, [children]);

  return (
    <div
      ref={rootRef}
      data-sidebar-flyout={marker}
      className="absolute z-[130]"
      style={{
        left: `calc(100% + ${edge}px)`,
        top: "50%",
        transform: `translateY(calc(-50% + ${shift}px))`,
      }}
      onPointerLeave={onPointerLeave}
    >
      <div className="absolute inset-y-0 right-full" style={{ width: edge }} />
      <div
        className={cn(
          "flex w-max flex-col gap-1 rounded-2xl p-1.5",
          darkPlateClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

function TabFlyout({
  href,
  tabs,
  collapsed,
  onPick,
}: {
  href: string;
  tabs: readonly SidebarPageTab[];
  collapsed: boolean;
  onPick: () => void;
}) {
  return (
    <SidebarFlyout collapsed={collapsed}>
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={href}
          onClick={() => {
            rememberSidebarPageTab(href, tab.value);
            onPick();
          }}
          className="flex h-9 items-center whitespace-nowrap rounded-xl px-3 text-[13px] font-medium tracking-normal text-[#e4f7f3]/60 transition-colors duration-150 hover:bg-white/10 hover:text-[#e4f7f3]"
        >
          {tab.label}
        </Link>
      ))}
    </SidebarFlyout>
  );
}
