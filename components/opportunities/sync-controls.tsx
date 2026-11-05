"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { syncInboxOpportunities } from "@/app/actions/email";
import {
  SYNC_STARTED_EVENT,
  type SyncStartedDetail,
} from "@/components/layout/sync-status-provider";
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
import { cn } from "@/lib/utils";
import { useRailAction, useRailActionToneClass } from "@/components/ui/rail-action";

type SyncControlsProps = {
  accountId: string | null;
  className?: string;
};

const RESCAN_OPTIONS = [
  { days: 1, label: "Today", hint: "Last 24 hours" },
  { days: 5, label: "Past 5 days", hint: "Catch recent misses" },
  { days: 10, label: "Past 10 days", hint: "Broader check" },
  { days: 14, label: "Past 14 days", hint: "Full recent window" },
] as const;

/**
 * Inbox sync control — primary checks new mail; menu rescans recent history.
 */
export function SyncControls({
  accountId,
  className,
}: SyncControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { variant } = useRailAction();
  const toneClass = useRailActionToneClass();
  const disabled = !accountId || pending;

  function runSync(forceRescan: boolean, lookbackDays = 14) {
    if (!accountId) {
      toast.error("Connect a Gmail account first");
      return;
    }

    // Activate bottom indicator immediately (before the server round-trip).
    window.dispatchEvent(
      new CustomEvent<SyncStartedDetail>(SYNC_STARTED_EVENT, {
        detail: { kind: "inbox" },
      })
    );

    startTransition(async () => {
      const result = await syncInboxOpportunities({
        accountId,
        forceRescan,
        lookbackDays,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.data?.message ??
          (forceRescan
            ? lookbackDays === 1
              ? "Checking today’s mail…"
              : `Checking the past ${lookbackDays} days…`
            : "Checking for new mail…")
      );
      router.refresh();
    });
  }

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={cn("rounded-r-none border-r-0 shadow-md", toneClass)}
        data-mp-rail-action=""
        onClick={() => runSync(false)}
      >
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
        {pending ? "Starting…" : "Sync Inbox"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              "rounded-l-none px-2 shadow-md",
              toneClass,
              variant === "dark" && "!border-l-[#e4f7f3]/15"
            )}
            data-mp-rail-action=""
            aria-label="More sync options"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <AppMenuContent
          surface={variant === "dark" ? "dark" : "light"}
          align="end"
          className="w-64"
        >
          <AppMenuItem
            disabled={disabled}
            onSelect={() => runSync(false)}
          >
            Check for new mail
            <span className="ml-auto text-xs text-muted-foreground">
              Default
            </span>
          </AppMenuItem>
          <AppMenuSeparator />
          <AppMenuLabel className="text-xs font-normal text-muted-foreground">
            Re-check recent mail
          </AppMenuLabel>
          {RESCAN_OPTIONS.map((option) => (
            <AppMenuItem
              key={option.days}
              disabled={disabled}
              onSelect={() => runSync(true, option.days)}
            >
              {option.label}
              <span className="ml-auto text-xs text-muted-foreground">
                {option.hint}
              </span>
            </AppMenuItem>
          ))}
        </AppMenuContent>
      </DropdownMenu>
    </div>
  );
}
