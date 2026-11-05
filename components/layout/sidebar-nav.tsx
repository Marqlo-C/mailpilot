"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cog, MailCheck, Radar, SquareKanban } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { SyncTelemetry } from "@/components/opportunities/sync-telemetry";
import { useSyncStatus } from "@/components/layout/sync-status-provider";
import {
  SIDEBAR_TELEMETRY_OPEN_DELAY_MS,
  useSidebarFlyout,
} from "@/components/layout/sidebar-flyout-provider";
import {
  clearSidebarPageTab,
  rememberSidebarPageTab,
  sidebarTabsForHref,
  type SidebarPageTab,
} from "@/lib/navigation/page-tabs";
import {
  darkPlateClassName,
  TabCountBadge,
  tabRailInactiveTextClassName,
} from "@/components/ui/tactile/segmented-tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import type { SidebarTabCounts } from "@/lib/data";
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

/** Compact gap under the logo divider before Navigation. */
const SHELL_NAV_CLASS =
  "relative z-10 flex shrink-0 flex-col gap-1 px-3 pb-2 pt-1";

/** Same right-edge capsule as the active page mark. */
const NAV_EDGE_MARK_CLASS =
  "pointer-events-none absolute bottom-1.5 top-1.5 w-[3px] rounded-r-full";
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
    return "bg-white/70 shadow-[2px_0_6px_rgba(255,255,255,0.35)]";
  }
  if (syncing) {
    return "bg-sky-300 shadow-[2px_0_6px_rgba(125,211,252,0.35)]";
  }
  if (pendingCount > 0) {
    return "bg-[#c21f10] shadow-[2px_0_6px_rgba(194,31,16,0.35)]";
  }
  return "bg-emerald-300 shadow-[2px_0_6px_rgba(110,231,183,0.35)]";
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

function tabCount(
  counts: SidebarTabCounts,
  href: string,
  value: string
): number | null {
  if (href === "/jobs") {
    if (
      value === "leads" ||
      value === "applied" ||
      value === "action" ||
      value === "history"
    ) {
      return counts.jobs[value];
    }
  }
  if (href === "/subscriptions") {
    if (value === "active" || value === "archive") {
      return counts.subscriptions[value];
    }
  }
  return null;
}

export function SidebarNav({
  collapsed,
  activeAccountId,
  items,
  tabCounts,
  title,
  className,
}: {
  collapsed: boolean;
  activeAccountId: string | null;
  items: readonly SidebarNavItem[];
  tabCounts: SidebarTabCounts;
  title?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { isSyncing, pendingCount } = useSyncStatus();
  const {
    open: flyout,
    isOpen,
    openNow,
    scheduleOpen,
    scheduleClose,
    cancelScheduledOpen,
    closeNow,
  } = useSidebarFlyout();
  const telemetryTimerRef = useRef<number | null>(null);

  function cancelTelemetryOpen() {
    if (telemetryTimerRef.current === null) return;
    window.clearTimeout(telemetryTimerRef.current);
    telemetryTimerRef.current = null;
  }

  function scheduleTelemetryOpen() {
    cancelTelemetryOpen();
    telemetryTimerRef.current = window.setTimeout(() => {
      telemetryTimerRef.current = null;
      openNow({ kind: "telemetry" });
    }, SIDEBAR_TELEMETRY_OPEN_DELAY_MS);
  }

  function resumeTabFlyout(next: EventTarget | null, from: Element) {
    const row = from.closest("[data-sidebar-tab-menu]");
    if (!row || !(next instanceof Node) || !row.contains(next)) return;
    const href = row.getAttribute("data-nav-href");
    if (!href) return;
    scheduleOpen({ kind: "nav", href });
  }

  useEffect(() => {
    return () => cancelTelemetryOpen();
  }, []);

  useEffect(() => {
    if (flyout?.kind !== "nav") return;
    if (isNavActive(pathname, flyout.href)) closeNow();
  }, [pathname, flyout, closeNow]);

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
        const open = showTabs && isOpen({ kind: "nav", href: item.href });
        const railOpen = isOpen({ kind: "telemetry" }) && item.href === "/jobs";
        const showJobRadarStatus = item.href === "/jobs";
        const Icon = item.icon;
        return (
          <div
            key={item.href}
            className="group/nav"
            data-sidebar-tab-menu={showTabs ? "" : undefined}
            data-nav-href={item.href}
            onPointerEnter={() => {
              cancelTelemetryOpen();
              if (!showTabs) {
                cancelScheduledOpen();
                return;
              }
              if (isOpen({ kind: "nav", href: item.href })) {
                cancelScheduledOpen();
                return;
              }
              scheduleOpen({ kind: "nav", href: item.href });
            }}
            onPointerLeave={(event) => {
              const next = event.relatedTarget;
              if (
                next instanceof Node &&
                event.currentTarget.contains(next)
              ) {
                return;
              }
              scheduleClose();
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
                    "bg-[#1ab5af] shadow-[2px_0_6px_rgba(26,181,175,0.35)]"
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
                <LabelTooltip
                  label={collapsed && !showTabs ? item.label : null}
                  side="right"
                >
                  <Link
                    href={item.href}
                    onClick={() => {
                      clearSidebarPageTab();
                      closeNow();
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
                </LabelTooltip>
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
                    if (collapsed && isOpen({ kind: "nav", href: item.href })) {
                      scheduleTelemetryOpen();
                      return;
                    }
                    cancelTelemetryOpen();
                    cancelScheduledOpen();
                    openNow({ kind: "telemetry" });
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
                    scheduleClose();
                    resumeTabFlyout(next, event.currentTarget);
                  }}
                />
              ) : null}
              {open ? (
                <TabFlyout
                  href={item.href}
                  tabs={tabs}
                  tabCounts={tabCounts}
                  collapsed={collapsed}
                  onPick={() => closeNow()}
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
                    scheduleClose();
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

export function SidebarFlyout({
  collapsed,
  children,
  marker,
  onPointerLeave,
  className,
}: {
  collapsed: boolean;
  children: ReactNode;
  marker?: string;
  onPointerLeave?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  className?: string;
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
          darkPlateClassName,
          className
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
  tabCounts,
  collapsed,
  onPick,
}: {
  href: string;
  tabs: readonly SidebarPageTab[];
  tabCounts: SidebarTabCounts;
  collapsed: boolean;
  onPick: () => void;
}) {
  return (
    <SidebarFlyout collapsed={collapsed}>
      {tabs.map((tab) => {
        const count = tabCount(tabCounts, href, tab.value);
        return (
          <Link
            key={tab.value}
            href={href}
            onClick={() => {
              rememberSidebarPageTab(href, tab.value);
              onPick();
            }}
            className="flex h-9 items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium tracking-normal text-[#e4f7f3]/60 transition-colors duration-150 hover:bg-white/10 hover:text-[#e4f7f3]"
          >
            <span>{tab.label}</span>
            {count != null ? <TabCountBadge count={count} /> : null}
          </Link>
        );
      })}
    </SidebarFlyout>
  );
}
