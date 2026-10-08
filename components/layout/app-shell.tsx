"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  LayoutDashboard,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Logo, NavLogo } from "@/components/brand/logo";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { GlobalSyncTracker } from "@/components/layout/global-sync-tracker";
import { SyncStatusProvider } from "@/components/layout/sync-status-provider";
import { TabRailProvider } from "@/components/ui/segmented-tabs";
import {
  SyncStatusDot,
  SyncTelemetry,
} from "@/components/opportunities/sync-telemetry";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/lib/data";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/subscriptions", label: "Subscriptions", icon: Mail },
  { href: "/jobs", label: "Job Radar", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** Shared height so sidebar brand divider meets the main top-bar bottom edge. */
const SHELL_TOP_BAND_CLASS = "flex h-[4.25rem] shrink-0 items-center";

/**
 * First nav item (Overview) aligns with the Job Radar / Subscriptions toolbar.
 * The tab rail fills the 4.25rem logo band; `mb-3` (12px) sits under it → `pt-3`.
 */
const SHELL_NAV_CLASS = "flex flex-1 flex-col gap-1 px-3 pb-3 pt-3";

type AppShellProps = {
  accounts: AccountSummary[];
  activeAccountId: string | null;
  activeEmail: string | null;
  initialIsSyncing?: boolean;
  initialPendingClassificationCount?: number;
  children: React.ReactNode;
};

export function AppShell({
  accounts,
  activeAccountId,
  activeEmail,
  initialIsSyncing = false,
  initialPendingClassificationCount = 0,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [statusFlyout, setStatusFlyout] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const toggleSidebar = () => setCollapsed((open) => !open);
  /** Desktop sidebar widths: expanded w-60 (240px), collapsed w-[72px]. */
  const sidebarWidthPx = collapsed ? 72 : 240;

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      root.style.setProperty(
        "--app-sidebar-width",
        desktop ? `${sidebarWidthPx}px` : "0px"
      );
      // Mobile bottom nav: icon + label + py-2.5 ≈ 4.5rem; clear fixed overlays.
      root.style.setProperty(
        "--app-mobile-bottom-inset",
        desktop ? "0px" : "4.5rem"
      );
    };
    sync();
    const mq = window.matchMedia("(min-width: 768px)");
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      root.style.removeProperty("--app-sidebar-width");
      root.style.removeProperty("--app-mobile-bottom-inset");
    };
  }, [sidebarWidthPx]);

  return (
    <SyncStatusProvider
      accountId={activeAccountId}
      initialIsSyncing={initialIsSyncing}
      initialPendingClassificationCount={initialPendingClassificationCount}
    >
    <TabRailProvider accountId={activeAccountId}>
    <div className="min-h-screen md:flex">
      <GlobalSyncTracker />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 cursor-pointer flex-col border-r border-white/10 bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-60"
        )}
        onClick={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (
            target.closest(
              "a, button, input, select, textarea, [role='menuitem'], [data-sync-pill]"
            )
          ) {
            return;
          }
          toggleSidebar();
        }}
      >
        <div
          className={cn(
            SHELL_TOP_BAND_CLASS,
            "gap-2 border-b border-white/10 px-4",
            collapsed && "justify-center px-2"
          )}
        >
          <NavLogo collapsed={collapsed} />
        </div>

        <nav className={SHELL_NAV_CLASS}>
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            const showCollapsedStatus = collapsed && item.href === "/jobs";
            const showJobRadarStatus = !collapsed && item.href === "/jobs";
            return (
              <div
                key={item.href}
                className={cn(
                  "flex w-full items-center rounded-md text-sm transition-colors",
                  showCollapsedStatus && "justify-center",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/65 hover:bg-white/5 hover:text-white"
                )}
              >
                <div
                  className={cn(
                    "relative flex items-center",
                    showCollapsedStatus && "mx-auto",
                    !showCollapsedStatus && !showJobRadarStatus && "w-full",
                    showJobRadarStatus && "w-auto shrink-0"
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
                  title={item.label}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2",
                    collapsed && !showCollapsedStatus && "w-full justify-center px-2",
                    showCollapsedStatus && "px-2",
                    !collapsed && !showJobRadarStatus && "w-full",
                    showJobRadarStatus && "w-auto shrink-0 pr-0"
                  )}
                >
                  <span className="relative shrink-0">
                    <Icon className="h-4 w-4" />
                    {showCollapsedStatus ? (
                      <SyncStatusDot
                        connected={Boolean(activeAccountId)}
                        className={statusFlyout ? "opacity-0" : undefined}
                      />
                    ) : null}
                  </span>
                  {!collapsed && (
                    <span className="whitespace-nowrap">
                      {item.label}
                    </span>
                  )}
                </Link>
                {showCollapsedStatus ? (
                  <div
                    className="absolute right-0 top-0 z-[120] h-5 w-5"
                    onPointerEnter={() => setStatusFlyout(true)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {statusFlyout ? (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2">
                        <SyncTelemetry
                          connected={Boolean(activeAccountId)}
                          surface="sidebar"
                          restAsDot
                          forceOpen
                          className="shrink-0"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                </div>
                {showJobRadarStatus ? (
                  <Link
                    href={item.href}
                    tabIndex={-1}
                    aria-hidden
                    className="h-8 min-w-0 flex-1"
                  />
                ) : null}
                {showJobRadarStatus ? (
                  <div
                    className="relative mr-3 size-6 shrink-0"
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
                ) : null}
              </div>
            );
          })}
        </nav>

        <div
          className={cn(
            "space-y-2 border-t border-white/10 p-3",
            collapsed && "flex flex-col items-center px-2"
          )}
        >
          <AccountSwitcher
            accounts={accounts}
            activeAccountId={activeAccountId}
            activeEmail={activeEmail}
            surface="sidebar"
            collapsed={collapsed}
          />
          <div
            className={cn(
              "flex w-full",
              collapsed ? "justify-center" : "justify-end"
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 px-0 text-white/70 hover:bg-white/5 hover:text-white"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        {/* Mobile top bar. Desktop sync status sits beside Job Radar. */}
        <header
          className={cn(
            SHELL_TOP_BAND_CLASS,
            "sticky top-0 z-30 justify-between gap-3 border-b border-border/80 bg-gradient-to-b from-card from-55% via-card/70 to-card/30 px-4 backdrop-blur-md md:hidden"
          )}
        >
          <div className="shrink-0 md:hidden">
            <span className="inline-flex items-center gap-2 text-foreground">
              <Logo variant="icon" size="sm" showWordmark={false} priority />
              <span className="hidden font-semibold tracking-tight sm:inline">
                MailPilot
              </span>
            </span>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <SyncTelemetry
              connected={Boolean(activeAccountId)}
              className="max-w-full"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AccountSwitcher
              accounts={accounts}
              activeAccountId={activeAccountId}
              activeEmail={activeEmail}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-6 md:px-6 md:pb-8 md:pt-[4.25rem]">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        data-mobile-bottom-nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label === "Job Radar" ? "Jobs" : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
    </TabRailProvider>
    </SyncStatusProvider>
  );
}
