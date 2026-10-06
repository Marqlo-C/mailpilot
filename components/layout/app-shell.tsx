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
import { SyncTelemetry } from "@/components/opportunities/sync-telemetry";
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
 * First nav item (Overview) aligns with Job Radar / Subscriptions tab rails:
 * main `md:pt-6` (24px) + tab row `pt-2` (8px) = 32px → `pt-8`.
 */
const SHELL_NAV_CLASS = "flex flex-1 flex-col gap-1 px-3 pb-3 pt-8";

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
    <div className="min-h-screen md:flex">
      <GlobalSyncTracker />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/10 bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-60"
        )}
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
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  collapsed && "justify-center px-2",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/65 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-white/70 hover:bg-white/5 hover:text-white"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        {/* Top bar — account dropdown always available */}
        <header
          className={cn(
            SHELL_TOP_BAND_CLASS,
            "sticky top-0 z-30 justify-between gap-3 border-b border-border/80 bg-gradient-to-b from-card from-55% via-card/70 to-card/30 px-4 backdrop-blur-md md:px-6"
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

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-6 md:px-6 md:pt-6 md:pb-8">
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
    </SyncStatusProvider>
  );
}
