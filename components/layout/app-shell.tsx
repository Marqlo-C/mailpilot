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
import { useState } from "react";

import { Logo, NavLogo } from "@/components/brand/logo";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { SyncBadge } from "@/components/layout/sync-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/lib/data";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/subscriptions", label: "Subscriptions", icon: Mail },
  { href: "/jobs", label: "Job Radar", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

type AppShellProps = {
  accounts: AccountSummary[];
  activeAccountId: string | null;
  activeEmail: string | null;
  hasHistoryId: boolean;
  children: React.ReactNode;
};

export function AppShell({
  accounts,
  activeAccountId,
  activeEmail,
  hasHistoryId,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/10 bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-60"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b border-white/10 px-4 py-5",
            collapsed && "justify-center px-2"
          )}
        >
          <NavLogo collapsed={collapsed} />
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
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
          {!collapsed && (
            <SyncBadge
              connected={Boolean(activeAccountId)}
              watching={hasHistoryId}
            />
          )}
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/80 bg-background/80 px-4 py-3 backdrop-blur-md md:px-6">
          <div className="min-w-0 md:hidden">
            <span className="inline-flex items-center gap-2 text-foreground">
              <span className="lg:hidden">
                <Logo variant="icon" size="sm" showWordmark={false} priority />
              </span>
              <span className="hidden font-semibold tracking-tight sm:inline">
                MailPilot
              </span>
            </span>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {activeEmail ?? "No account connected"}
            </p>
          </div>
          <div className="hidden min-w-0 md:block">
            <p className="text-sm text-muted-foreground">
              {activeEmail
                ? `Working in ${activeEmail}`
                : "Connect a Gmail account to get started"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="md:hidden">
              <SyncBadge
                connected={Boolean(activeAccountId)}
                watching={hasHistoryId}
                compact
              />
            </div>
            <AccountSwitcher
              accounts={accounts}
              activeAccountId={activeAccountId}
              activeEmail={activeEmail}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md md:hidden">
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
  );
}
