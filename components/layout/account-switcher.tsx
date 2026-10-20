"use client";

import { useTransition } from "react";
import { Check, ChevronsUpDown, LogOut, Plus, UserCog } from "lucide-react";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "max-w-[260px] justify-between gap-2",
            surface === "sidebar" &&
              !collapsed &&
              "w-full max-w-none border-white/15 bg-white/10 text-[hsl(var(--sidebar-foreground))] hover:bg-white/15 hover:text-white",
            collapsed &&
              "h-auto w-full max-w-none justify-center border-0 bg-transparent px-2 py-2 text-white/65 shadow-none hover:bg-white/5 hover:text-white"
          )}
          disabled={pending}
          aria-label={collapsed ? label : undefined}
          title={collapsed ? label : undefined}
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
            {collapsed ? null : <span className="truncate">{label}</span>}
          </span>
          {collapsed ? null : (
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={surface === "sidebar" ? "right" : "bottom"}
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
