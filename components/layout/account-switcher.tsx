"use client";

import { useTransition } from "react";
import { Check, ChevronsUpDown, LogOut, Plus, UserCog, UserRoundCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { setActiveAccount } from "@/app/actions/accounts";
import { logoutSession } from "@/app/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
} from "@/components/ui/app-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFlyout } from "@/components/layout/sidebar-nav";
import { useSidebarFlyout } from "@/components/layout/sidebar-flyout-provider";
import type { AccountSummary } from "@/lib/data";
import { cn } from "@/lib/utils";

type AccountSwitcherProps = {
  accounts: AccountSummary[];
  activeAccountId: string | null;
  activeEmail?: string | null;
  /** Sidebar placement opens the menu into the content column. */
  surface?: "header" | "sidebar";
  /** Collapsed sidebar: icon trigger only. */
  collapsed?: boolean;
  /** Compact header mode: avatar trigger only with connected accounts indicator. */
  compact?: boolean;
};

export function AccountSwitcher({
  accounts,
  activeAccountId,
  activeEmail,
  surface = "header",
  collapsed = false,
  compact = false,
}: AccountSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = accounts.find((a) => a.id === activeAccountId);
  const label = active?.email ?? activeEmail ?? "Select account";
  const displayName = active?.name?.trim() || "Account";
  const accountEmail = active?.email ?? activeEmail ?? "";
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const markLetters =
    nameParts.length >= 2
      ? `${nameParts[0]?.[0] ?? ""}${nameParts[1]?.[0] ?? ""}`.toUpperCase()
      : (nameParts[0] ?? "?").slice(0, 2).toUpperCase();

  const avatar = (
    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[22%]">
      {active?.picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={active.picture}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center bg-white/10 text-xs font-medium text-white">
          {markLetters}
        </span>
      )}
    </span>
  );

  const { isOpen, togglePinned, closeNow } = useSidebarFlyout();
  const accountFlyoutOpen = surface === "sidebar" && isOpen({ kind: "account" });

  if (surface === "sidebar") {
    const cogButton = (
      <button
        type="button"
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white",
          accountFlyoutOpen && "bg-white/10 text-[#e4f7f3]"
        )}
        title="Account options"
        aria-label="Account options"
        aria-expanded={accountFlyoutOpen}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          togglePinned({ kind: "account" });
        }}
      >
        <UserRoundCog className="size-4" />
      </button>
    );

    const flyoutContent = (
      <SidebarFlyout
        collapsed={collapsed}
        marker="account"
        className="w-72"
      >
        <div className="px-2.5 py-1.5 text-xs font-semibold text-[#e4f7f3]">
          Connected accounts
        </div>
        <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
        {accounts.length === 0 ? (
          <div className="px-2.5 py-1.5 text-xs text-[#e4f7f3]/50">
            No accounts yet
          </div>
        ) : (
          accounts.map((account) => {
            const isSelected = account.id === activeAccountId;
            return (
              <button
                key={account.id}
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await setActiveAccount(account.id);
                    router.refresh();
                    closeNow();
                  });
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[#e4f7f3]/80 transition-colors hover:bg-white/10 hover:text-[#e4f7f3] focus-visible:bg-white/10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                  isSelected && "bg-white/[0.08] text-[#e4f7f3]"
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar className="h-4 w-4 shrink-0 border border-white/20">
                    {account.picture ? (
                      <AvatarImage
                        src={account.picture}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <AvatarFallback className="bg-transparent text-white/50">
                      <UserCog className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">
                    {account.name
                      ? `${account.name} (${account.email})`
                      : account.email}
                  </span>
                </div>
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0 text-teal-400",
                    isSelected ? "opacity-100" : "opacity-0"
                  )}
                />
              </button>
            );
          })
        )}
        <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            closeNow();
            window.location.href = "/api/auth/google?intent=link";
          }}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[#e4f7f3]/80 transition-colors hover:bg-white/10 hover:text-[#e4f7f3] focus-visible:bg-white/10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>Link Gmail account</span>
        </button>
        <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
        <Link
          href="/settings"
          onClick={() => closeNow()}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[#e4f7f3]/80 transition-colors hover:bg-white/10 hover:text-[#e4f7f3] focus-visible:bg-white/10 focus-visible:outline-none"
        >
          <UserRoundCog className="h-3.5 w-3.5 shrink-0" />
          <span>Account Settings</span>
        </Link>
        <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            closeNow();
            startTransition(async () => {
              await logoutSession();
            });
          }}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus-visible:bg-rose-500/10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          <span>Log Out</span>
        </button>
      </SidebarFlyout>
    );

    if (collapsed) {
      return (
        <div
          className="relative flex w-full flex-col items-center gap-2.5"
          data-sidebar-quick-flyout=""
        >
          {cogButton}
          <button
            type="button"
            className="overflow-hidden rounded-[22%] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            aria-label="User profile"
            title={accountEmail || displayName}
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              togglePinned({ kind: "account" });
            }}
          >
            <span className="block transition-opacity hover:opacity-85">
              {avatar}
            </span>
          </button>
          {accountFlyoutOpen ? flyoutContent : null}
        </div>
      );
    }

    return (
      <div
        className="relative flex w-full items-center justify-between gap-2.5 py-1.5"
        data-sidebar-quick-flyout=""
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {avatar}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium text-white">
              {displayName}
            </p>
            <p className="truncate text-[11px] text-white/55">
              {accountEmail || "No account connected"}
            </p>
          </div>
        </div>
        {cogButton}
        {accountFlyoutOpen ? flyoutContent : null}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="group relative flex size-8 shrink-0 items-center justify-center rounded-[22%] border border-white/10 bg-white/10 p-0 text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={`Account menu for ${label}`}
            title={label}
            disabled={pending}
          >
            {avatar}
            {accounts.length > 1 && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full bg-teal-400 ring-2 ring-[#181e26]"
                title={`${accounts.length} connected accounts`}
              />
            )}
          </button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="max-w-[260px] justify-between gap-2"
            disabled={pending}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Avatar className="h-4 w-4 shrink-0">
                {active?.picture ? (
                  <AvatarImage src={active.picture} alt="" referrerPolicy="no-referrer" />
                ) : null}
                <AvatarFallback className="bg-transparent">
                  <UserCog className="h-3.5 w-3.5" />
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{label}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <AppMenuContent surface={compact ? "dark" : "light"} side="bottom" align="end" className="w-72">
        <AppMenuLabel>Connected accounts</AppMenuLabel>
        <AppMenuSeparator />
        {accounts.length === 0 ? (
          <AppMenuItem disabled>No accounts yet</AppMenuItem>
        ) : (
          accounts.map((account) => (
            <AppMenuItem
              key={account.id}
              onSelect={() => {
                startTransition(async () => {
                  await setActiveAccount(account.id);
                  router.refresh();
                });
              }}
              className="justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Avatar className="h-4 w-4 shrink-0 border border-border/60">
                  {account.picture ? (
                    <AvatarImage src={account.picture} alt="" referrerPolicy="no-referrer" />
                  ) : null}
                  <AvatarFallback className="bg-transparent text-muted-foreground">
                    <UserCog className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {account.name ? `${account.name} (${account.email})` : account.email}
                </span>
              </div>
              <Check
                className={cn(
                  "h-4 w-4 shrink-0",
                  compact ? "text-teal-400" : "text-primary",
                  account.id === activeAccountId ? "opacity-100" : "opacity-0"
                )}
              />
            </AppMenuItem>
          ))
        )}
        <AppMenuSeparator />
        <AppMenuItem
          onSelect={() => {
            window.location.href = "/api/auth/google?intent=link";
          }}
        >
          <Plus className="h-4 w-4" />
          Link Gmail account
        </AppMenuItem>
        <AppMenuSeparator />
        <AppMenuItem
          className={cn(compact ? "text-rose-400 focus:text-rose-300" : "text-destructive focus:text-destructive")}
          onSelect={() => {
            startTransition(async () => {
              await logoutSession();
            });
          }}
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </AppMenuItem>
      </AppMenuContent>
    </DropdownMenu>
  );
}
