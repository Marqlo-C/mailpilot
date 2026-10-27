"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cog, MailCheck, Radar, SquareKanban } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";

import {
  SyncStatusDot,
  SyncTelemetry,
} from "@/components/opportunities/sync-telemetry";
import {
  clearSidebarPageTab,
  rememberSidebarPageTab,
  sidebarTabsForHref,
  type SidebarPageTab,
} from "@/lib/navigation/page-tabs";
import { cn } from "@/lib/utils";

export const SIDEBAR_NAV = [
  { href: "/", label: "Console", icon: SquareKanban },
  { href: "/subscriptions", label: "Subscriptions", icon: MailCheck },
  { href: "/jobs", label: "Job Radar", icon: Radar },
  { href: "/settings", label: "Settings", icon: Cog },
] as const;

/** Compact gap under the hairline before Console. */
const SHELL_NAV_CLASS =
  "relative z-10 flex flex-1 flex-col gap-1 px-3 pb-3 pt-3";

/** Brief pause so a fly-by doesn't open the menu. */
const FLYOUT_OPEN_DELAY_MS = 150;
const FLYOUT_CLOSE_DELAY_MS = 80;

/** `px-3` on the nav. Expanded rows end this far inside the sidebar edge. */
const NAV_EDGE_PAD_PX = 12;
/** Collapsed `size-9` icon, centered in the `w-[72px]` rail. */
const COLLAPSED_ICON_TO_EDGE_PX = 18;
/** Space between the sidebar edge and the popout. */
const FLYOUT_GAP_PX = 8;

function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SidebarNav({
  collapsed,
  activeAccountId,
}: {
  collapsed: boolean;
  activeAccountId: string | null;
}) {
  const pathname = usePathname();
  const [openHref, setOpenHref] = useState<string | null>(null);
  const [statusFlyout, setStatusFlyout] = useState(false);
  const [statusFlyoutHeld, setStatusFlyoutHeld] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  function clearTimer(timerRef: MutableRefObject<number | null>) {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function scheduleFlyoutOpen(href: string) {
    clearTimer(closeTimerRef);
    clearTimer(openTimerRef);
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setOpenHref(href);
    }, FLYOUT_OPEN_DELAY_MS);
  }

  function scheduleFlyoutClose() {
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpenHref(null);
    }, FLYOUT_CLOSE_DELAY_MS);
  }

  useEffect(() => {
    const openTimer = openTimerRef;
    const closeTimer = closeTimerRef;
    return () => {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
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
      className={SHELL_NAV_CLASS}
      onClick={(event) => event.stopPropagation()}
    >
      {SIDEBAR_NAV.map((item) => {
        const active = isNavActive(pathname, item.href);
        const tabs = sidebarTabsForHref(item.href);
        const showTabs = !active && tabs.length > 0;
        const open = showTabs && openHref === item.href;
        const showCollapsedStatus = collapsed && item.href === "/jobs";
        const showJobRadarStatus = !collapsed && item.href === "/jobs";
        const Icon = item.icon;
        return (
          <div
            key={item.href}
            className="group/nav"
            data-sidebar-tab-menu={showTabs ? "" : undefined}
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
                  ? "bg-white/[0.05] text-white hover:bg-white/[0.07]"
                  : "text-stone-400 hover:bg-white/[0.035] hover:text-stone-200",
                open && "bg-white/[0.08] text-white"
              )}
            >
              <div
                className={cn(
                  "flex items-center",
                  collapsed
                    ? "absolute inset-0 justify-center"
                    : "absolute inset-0"
                )}
                onPointerLeave={
                  showCollapsedStatus
                    ? (event) => {
                        const next = event.relatedTarget;
                        if (
                          next instanceof Node &&
                          event.currentTarget.contains(next)
                        ) {
                          return;
                        }
                        setStatusFlyout(false);
                      }
                    : undefined
                }
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
                    !collapsed && "h-full w-full px-3",
                    !collapsed && showJobRadarStatus && "pr-11"
                  )}
                >
                  <span className="relative grid size-4 shrink-0 place-items-center">
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active
                          ? "text-teal-400"
                          : open
                            ? "text-white"
                            : "text-stone-400/80 group-hover/nav:text-stone-200"
                      )}
                    />
                    {showCollapsedStatus ? (
                      <SyncStatusDot
                        connected={Boolean(activeAccountId)}
                        className={statusFlyoutHeld ? "opacity-0" : undefined}
                      />
                    ) : null}
                    {showCollapsedStatus ? (
                      <div
                        className="absolute left-full top-0 z-[120] h-1.5 w-1.5"
                        onPointerEnter={() => setStatusFlyout(true)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="absolute -inset-2" />
                        <div className="absolute left-1/2 top-1/2 -translate-x-[calc(1px+0.625rem+0.1875rem)] -translate-y-1/2">
                          <SyncTelemetry
                            connected={Boolean(activeAccountId)}
                            surface="sidebar"
                            restAsDot
                            overlay
                            forceOpen={statusFlyout}
                            onPresenceChange={setStatusFlyoutHeld}
                            className="shrink-0"
                          />
                        </div>
                      </div>
                    ) : null}
                  </span>
                  {!collapsed && (
                    <span
                      className={cn(
                        "whitespace-nowrap text-[13px] font-medium tracking-normal",
                        active
                          ? "text-white"
                          : "text-stone-400/80 group-hover/nav:text-stone-200"
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              </div>
              {!collapsed && showJobRadarStatus ? (
                <div className="pointer-events-none absolute inset-y-0 right-2 z-10 flex items-center">
                  <div
                    className="pointer-events-auto relative flex size-6 shrink-0 items-center justify-center"
                    onPointerEnter={() => setRailOpen(true)}
                    onPointerLeave={(event) => {
                      const next = event.relatedTarget;
                      if (
                        next instanceof Node &&
                        event.currentTarget.contains(next)
                      ) {
                        return;
                      }
                      setRailOpen(false);
                    }}
                  >
                    <div className="absolute left-0 top-1/2 z-[100] -translate-y-1/2">
                      <SyncTelemetry
                        connected={Boolean(activeAccountId)}
                        surface="sidebar"
                        restAsDot
                        forceOpen={railOpen}
                        className="shrink-0"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              {open ? (
                <TabFlyout
                  href={item.href}
                  tabs={tabs}
                  collapsed={collapsed}
                  onPick={() => setOpenHref(null)}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </nav>
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
  }, [tabs.length]);

  return (
    <div
      ref={rootRef}
      className="absolute z-[130]"
      style={{
        left: `calc(100% + ${edge}px)`,
        top: "50%",
        transform: `translateY(calc(-50% + ${shift}px))`,
      }}
    >
      <div className="absolute inset-y-0 right-full" style={{ width: edge }} />
      <div className="flex min-w-[9.5rem] flex-col gap-1 rounded-2xl border border-white/10 bg-[hsl(var(--sidebar))] p-1.5 shadow-2xl shadow-black/50">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={href}
            onClick={() => {
              rememberSidebarPageTab(href, tab.value);
              onPick();
            }}
            className="flex h-9 items-center whitespace-nowrap rounded-xl px-3 text-[13px] font-medium tracking-normal text-stone-400/80 transition-colors duration-150 hover:bg-white/[0.035] hover:text-stone-200"
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
