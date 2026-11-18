"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useEffect } from "react";

import { NavLogo } from "@/components/brand/logo";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import {
  SidebarNav,
  SIDEBAR_PRIMARY_NAV,
  SIDEBAR_SETTINGS_NAV,
} from "@/components/layout/sidebar-nav";
import { SidebarQuickActions } from "@/components/layout/sidebar-quick-actions";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse-provider";
import { CurvedCardDivider } from "@/components/ui/tactile/nested-settings-card";
import { darkPlateClassName } from "@/components/ui/tactile/segmented-tabs";
import { cn } from "@/lib/utils";
import type { AccountSummary, SidebarTabCounts } from "@/lib/data";

const SHELL_HAIRLINE_CLASS = "mx-3 border-b border-white/[0.06]";

export type TabletNavDrawerProps = {
  accounts: AccountSummary[];
  activeAccountId: string | null;
  activeEmail: string | null;
  tabCounts: SidebarTabCounts;
  isDev?: boolean;
};

/**
 * Universal off-canvas overlay drawer for mobile (<744px) and portrait tablet (744px to 1023px) screens.
 * Dismisses cleanly on tap-backdrop, Escape key, or route navigation.
 */
export function TabletNavDrawer({
  accounts,
  activeAccountId,
  activeEmail,
  tabCounts,
  isDev,
}: TabletNavDrawerProps) {
  const pathname = usePathname();
  const { tabletDrawerOpen, setTabletDrawerOpen } = useSidebarCollapse();

  // Dismiss drawer automatically upon navigating to a new route
  useEffect(() => {
    setTabletDrawerOpen(false);
  }, [pathname, setTabletDrawerOpen]);

  // Dismiss on Escape key press
  useEffect(() => {
    if (!tabletDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTabletDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabletDrawerOpen, setTabletDrawerOpen]);

  // Prevent background body scroll while drawer is open
  useEffect(() => {
    if (!tabletDrawerOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [tabletDrawerOpen]);

  if (!tabletDrawerOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation drawer"
      className="fixed inset-0 z-50 flex lg:hidden"
    >
      {/* Backdrop scrim */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in cursor-pointer select-none"
        onClick={() => setTabletDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className={cn(
          "relative z-10 flex h-full w-[280px] max-w-[85vw] flex-col rounded-r-2xl text-[hsl(var(--sidebar-foreground))] shadow-2xl animate-in slide-in-from-left duration-300 ease-out",
          darkPlateClassName
        )}
      >
        <div className="relative z-10 shrink-0">
          <div className="flex w-full items-center justify-between px-3 py-2">
            <Link
              href="/jobs"
              onClick={() => setTabletDrawerOpen(false)}
              className="inline-flex min-w-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <NavLogo collapsed={false} />
            </Link>
            <button
              type="button"
              onClick={() => setTabletDrawerOpen(false)}
              className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white shadow-xs transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-95 before:absolute before:-inset-2 before:content-['']"
              title="Close navigation"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
          </div>
          <CurvedCardDivider radius={16} className="mb-0 text-white/10" />
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain scroll-smooth [-webkit-overflow-scrolling:touch]">
          <SidebarNav
            collapsed={false}
            activeAccountId={activeAccountId}
            items={SIDEBAR_PRIMARY_NAV}
            title="Navigation"
            tabCounts={tabCounts}
            isDev={isDev}
          />
          <div className={SHELL_HAIRLINE_CLASS} aria-hidden="true" />
          <SidebarQuickActions
            collapsed={false}
            accountId={activeAccountId}
          />
          <div className={SHELL_HAIRLINE_CLASS} aria-hidden="true" />
          <SidebarNav
            collapsed={false}
            activeAccountId={activeAccountId}
            items={SIDEBAR_SETTINGS_NAV}
            tabCounts={tabCounts}
            className="pb-2 pt-2"
            isDev={isDev}
          />
          <div className="min-h-2 flex-1" />
        </div>

        <div className="relative z-10 border-t border-white/[0.06] px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] pt-2">
          <AccountSwitcher
            accounts={accounts}
            activeAccountId={activeAccountId}
            activeEmail={activeEmail}
            surface="sidebar"
            collapsed={false}
          />
        </div>
      </aside>
    </div>
  );
}
