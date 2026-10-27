"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Logo, NavLogo } from "@/components/brand/logo";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { GlobalSyncTracker } from "@/components/layout/global-sync-tracker";
import { SidebarNav, SIDEBAR_NAV, SIDEBAR_PRIMARY_NAV, SIDEBAR_SETTINGS_NAV } from "@/components/layout/sidebar-nav";
import { SidebarQuickActions } from "@/components/layout/sidebar-quick-actions";
import { SyncStatusProvider } from "@/components/layout/sync-status-provider";
import { TabRailProvider, darkPlateClassName } from "@/components/ui/tactile/segmented-tabs";
import { RailActionProvider } from "@/components/ui/rail-action";
import { SyncTelemetry } from "@/components/opportunities/sync-telemetry";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/lib/data";

/** Mobile top bar. Desktop pages no longer share this band. */
const SHELL_TOP_BAND_CLASS = "flex h-[4.25rem] shrink-0 items-center";

/**
 * `py-3` matches the collapsed horizontal inset. The h-8 mark then sits
 * with its center 28px from the top of the sidebar.
 */
const SHELL_BRAND_ROW_CLASS = "flex items-center px-3 py-3";

const SHELL_HAIRLINE_CLASS = "mx-3 border-b border-white/[0.06]";

/**
 * Desktop top padding is canceled by the command deck. The deck then
 * drops the tab rail 4px under the sidebar's top.
 */
const SHELL_MAIN_CLASS =
  "mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-6 md:px-6 md:pb-8 md:pt-[9px]";

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
  const toggleSidebar = () => setCollapsed((open) => !open);
  /** Desktop sidebar widths: expanded w-60 (240px), collapsed w-[64px]. */
  const sidebarWidthPx = collapsed ? 64 : 240;
  /** Left float inset (ml equivalent). Content centering starts after this gap. */
  const sidebarOffsetPx = sidebarWidthPx + 6;

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      root.style.setProperty(
        "--app-sidebar-width",
        desktop ? `${sidebarOffsetPx}px` : "0px"
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
  }, [sidebarOffsetPx]);

  return (
    <SyncStatusProvider
      accountId={activeAccountId}
      initialIsSyncing={initialIsSyncing}
      initialPendingClassificationCount={initialPendingClassificationCount}
    >
    <TabRailProvider accountId={activeAccountId}>
    <RailActionProvider accountId={activeAccountId}>
    <div className="min-h-screen md:flex md:h-dvh md:min-h-0 md:overflow-hidden md:py-1.5 md:pl-1.5">
      <GlobalSyncTracker />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-1.5 z-40 hidden h-[calc(100dvh-0.75rem)] shrink-0 cursor-pointer flex-col rounded-2xl text-[hsl(var(--sidebar-foreground))] transition-[width] duration-200 md:flex",
          darkPlateClassName,
          collapsed ? "w-[64px]" : "w-60"
        )}
        onClick={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (
            target.closest(
              "a, button, input, select, textarea, [role='menuitem'], [data-sync-pill], nav"
            )
          ) {
            return;
          }
          toggleSidebar();
        }}
      >
        <div className="relative z-10 shrink-0">
          {collapsed ? (
            <div className={cn(SHELL_BRAND_ROW_CLASS, "w-full justify-center")}>
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="group relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[22%] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logos/colored-logo-only.png"
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full scale-125 object-contain transition-opacity duration-150 group-hover:opacity-0"
                />
                <span className="absolute inset-0 flex items-center justify-center rounded-[22%] bg-white/[0.10] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <PanelLeftOpen className="size-4 text-white" />
                </span>
              </button>
            </div>
          ) : (
            <div className={cn(SHELL_BRAND_ROW_CLASS, "w-full justify-between")}>
              <Link
                href="/jobs"
                className="inline-flex min-w-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <NavLogo collapsed={false} />
              </Link>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="group relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="size-4 transition-opacity group-hover:opacity-0" />
                <PanelLeftClose className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </div>
          )}
          <div className={SHELL_HAIRLINE_CLASS} aria-hidden="true" />
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <SidebarNav
            collapsed={collapsed}
            activeAccountId={activeAccountId}
            items={SIDEBAR_PRIMARY_NAV}
            title="Navigation"
          />
          <div className={SHELL_HAIRLINE_CLASS} aria-hidden="true" />
          <SidebarQuickActions
            collapsed={collapsed}
            accountId={activeAccountId}
          />
          <div className={SHELL_HAIRLINE_CLASS} aria-hidden="true" />
          <SidebarNav
            collapsed={collapsed}
            activeAccountId={activeAccountId}
            items={SIDEBAR_SETTINGS_NAV}
            className="pb-2 pt-2"
          />
          <div className="min-h-2 flex-1" />
        </div>

        <div className="relative z-10 border-t border-white/[0.06] px-2 pb-2.5 pt-2">
          <AccountSwitcher
            accounts={accounts}
            activeAccountId={activeAccountId}
            activeEmail={activeEmail}
            surface="sidebar"
            collapsed={collapsed}
          />
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col md:min-h-0">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-20 md:overflow-y-auto md:overscroll-y-contain md:pb-0 md:scroll-smooth">
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

          <main className={SHELL_MAIN_CLASS}>
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav
        data-mobile-bottom-nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      >
        <ul className="grid grid-cols-4">
          {SIDEBAR_NAV.map((item) => {
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
    </RailActionProvider>
    </TabRailProvider>
    </SyncStatusProvider>
  );
}
