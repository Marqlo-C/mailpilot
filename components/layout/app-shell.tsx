"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cog,
  MailCheck,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  SquareKanban,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Logo, NavLogo } from "@/components/brand/logo";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { GlobalSyncTracker } from "@/components/layout/global-sync-tracker";
import { SyncStatusProvider } from "@/components/layout/sync-status-provider";
import { TabRailProvider } from "@/components/ui/tactile/segmented-tabs";
import {
  SyncStatusDot,
  SyncTelemetry,
} from "@/components/opportunities/sync-telemetry";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/lib/data";

const NAV = [
  { href: "/", label: "Console", icon: SquareKanban },
  { href: "/subscriptions", label: "Subscriptions", icon: MailCheck },
  { href: "/jobs", label: "Job Radar", icon: Radar },
  { href: "/settings", label: "Settings", icon: Cog },
] as const;

/** Mobile top bar. Desktop pages no longer share this band. */
const SHELL_TOP_BAND_CLASS = "flex h-[4.25rem] shrink-0 items-center";

/**
 * `py-3` matches the collapsed horizontal inset. The h-8 mark then sits
 * with its center 28px from the top of the sidebar.
 */
const SHELL_BRAND_ROW_CLASS = "flex items-center px-3 py-3";

/**
 * Desktop main inset that centers the 38px tab rail on that same line.
 * 28px − 19px = 9px.
 */
const SHELL_MAIN_CLASS =
  "mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-6 md:px-6 md:pb-8 md:pt-[9px]";

/** Compact gap under the hairline before Console. */
const SHELL_NAV_CLASS = "relative z-10 flex flex-1 flex-col gap-1 px-3 pb-3 pt-3";

/**
 * Directional micro-emboss. Diffuse light on fractal noise keeps the black
 * base and only lifts the stipple. Stays under brand, nav, and account controls.
 */
const SIDEBAR_NOISE_BACKGROUND = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='stipple' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' result='noise'/%3E%3CfeDiffuseLighting in='noise' lighting-color='%23ffffff' surfaceScale='1.2' result='light'%3E%3CfeDistantLight azimuth='65' elevation='55'/%3E%3C/feDiffuseLighting%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.7' intercept='-0.1'/%3E%3CfeFuncG type='linear' slope='0.7' intercept='-0.1'/%3E%3CfeFuncB type='linear' slope='0.7' intercept='-0.1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23stipple)'/%3E%3C/svg%3E")`;

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
  const [statusFlyoutHeld, setStatusFlyoutHeld] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const toggleSidebar = () => setCollapsed((open) => !open);
  /** Desktop sidebar widths: expanded w-60 (240px), collapsed w-[72px]. */
  const sidebarWidthPx = collapsed ? 72 : 240;
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
    <div className="min-h-screen md:flex md:h-dvh md:min-h-0 md:overflow-hidden md:py-1.5 md:pl-1.5">
      <GlobalSyncTracker />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-1.5 z-40 hidden h-[calc(100dvh-0.75rem)] shrink-0 cursor-pointer flex-col rounded-2xl border border-white/10 bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] shadow-2xl shadow-black/50 transition-[width] duration-200 md:flex",
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
        {/* Physical tactile matte micro-stippling */}
        <div
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl opacity-40 mix-blend-overlay"
          style={{
            backgroundImage: SIDEBAR_NOISE_BACKGROUND,
            backgroundRepeat: "repeat",
          }}
          aria-hidden="true"
        />
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
          <div
            className="mx-3 border-b border-white/[0.06]"
            aria-hidden="true"
          />
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
                  "group relative flex items-center rounded-xl transition-colors duration-150",
                  collapsed ? "mx-auto size-9 justify-center" : "h-9 w-full",
                  !collapsed && (showJobRadarStatus ? "pl-3 pr-0" : "px-3"),
                  active
                    ? "bg-white/[0.05] text-white hover:bg-white/[0.07]"
                    : "text-stone-400 hover:bg-white/[0.035] hover:text-stone-200"
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
                    "flex items-center gap-3",
                    collapsed && "justify-center",
                    showCollapsedStatus && "px-2",
                    !collapsed && !showJobRadarStatus && "h-full w-full",
                    showJobRadarStatus && "h-full w-auto shrink-0"
                  )}
                >
                  <span className="relative shrink-0">
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active
                          ? "text-teal-400"
                          : "text-stone-400/80 group-hover:text-stone-200"
                      )}
                    />
                    {showCollapsedStatus ? (
                      <SyncStatusDot
                        connected={Boolean(activeAccountId)}
                        className={statusFlyoutHeld ? "opacity-0" : undefined}
                      />
                    ) : null}
                  </span>
                  {!collapsed && (
                    <span
                      className={cn(
                        "whitespace-nowrap text-[13px] font-medium tracking-normal",
                        active
                          ? "text-white"
                          : "text-stone-300 group-hover:text-stone-100"
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
                {showCollapsedStatus ? (
                  <div
                    className="absolute left-[calc(0.5rem+1rem)] top-0 z-[120] h-1.5 w-1.5"
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
                </div>
                {showJobRadarStatus ? (
                  <Link
                    href={item.href}
                    tabIndex={-1}
                    aria-hidden
                    className="h-full min-w-0 flex-1"
                  />
                ) : null}
                {showJobRadarStatus ? (
                  <div
                    className="relative mr-2 size-6 shrink-0"
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
        <div
          aria-hidden
          className="scroll-edge-in bg-canvas-fixed fixed inset-x-0 bottom-[var(--app-mobile-bottom-inset,0px)] md:absolute md:inset-x-0 md:bottom-0"
        />
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
