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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
};

export function AccountSwitcher({
  accounts,
  activeAccountId,
  activeEmail,
  surface = "header",
  collapsed = false,
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

  const renderAccountMenu = (side: "right" | "top") => (
    <DropdownMenuContent side={side} align="end" className="mb-1 w-72">
            <DropdownMenuLabel>Connected accounts</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accounts.length === 0 ? (
              <DropdownMenuItem disabled>No accounts yet</DropdownMenuItem>
            ) : (
              accounts.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  onSelect={() => {
                    startTransition(async () => {
                      await setActiveAccount(account.id);
                      router.refresh();
                    });
                  }}
                  className="justify-between gap-2"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Avatar className="h-4 w-4 shrink-0 border border-border/60">
                      {account.picture ? (
                        <AvatarImage
                          src={account.picture}
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <AvatarFallback className="bg-transparent text-muted-foreground">
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
                      "h-4 w-4 shrink-0",
                      account.id === activeAccountId ? "opacity-100" : "opacity-0"
                    )}
                  />
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                window.location.href = "/api/auth/google?intent=link";
              }}
            >
              <Plus className="h-4 w-4" />
              Link Gmail account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Account Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => {
                startTransition(async () => {
                  await logoutSession();
                });
              }}
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (surface === "sidebar") {
    const cogButton = (
      <button
        type="button"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
        title="Account options"
        aria-label="Account options"
        disabled={pending}
      >
        <UserRoundCog className="size-4" />
      </button>
    );

    if (collapsed) {
      return (
        <div className="flex w-full flex-col items-center gap-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{cogButton}</DropdownMenuTrigger>
            {renderAccountMenu("right")}
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="overflow-hidden rounded-[22%] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                aria-label="User profile"
                title={accountEmail || displayName}
                disabled={pending}
              >
                <span className="block transition-opacity hover:opacity-85">
                  {avatar}
                </span>
              </button>
            </DropdownMenuTrigger>
            {renderAccountMenu("right")}
          </DropdownMenu>
        </div>
      );
    }

    return (
      <div className="flex w-full items-center justify-between gap-2.5 p-1.5">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{cogButton}</DropdownMenuTrigger>
          {renderAccountMenu("top")}
        </DropdownMenu>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        className="w-72"
      >
        <DropdownMenuLabel>Connected accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.length === 0 ? (
          <DropdownMenuItem disabled>No accounts yet</DropdownMenuItem>
        ) : (
          accounts.map((account) => (
            <DropdownMenuItem
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
                  account.id === activeAccountId ? "opacity-100" : "opacity-0"
                )}
              />
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            window.location.href = "/api/auth/google?intent=link";
          }}
        >
          <Plus className="h-4 w-4" />
          Link Gmail account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => {
            startTransition(async () => {
              await logoutSession();
            });
          }}
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
