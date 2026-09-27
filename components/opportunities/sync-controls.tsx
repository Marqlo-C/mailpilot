"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { syncInboxOpportunities } from "@/app/actions/email";
import { SYNC_STARTED_EVENT } from "@/components/layout/global-sync-tracker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type SyncControlsProps = {
  accountId: string | null;
  className?: string;
};

/**
 * Dual-mode inbox sync with granular force-rescan lookbacks (5 / 10 / 14 days).
 */
export function SyncControls({ accountId, className }: SyncControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const disabled = !accountId || pending;

  function runSync(forceRescan: boolean, lookbackDays = 14) {
    if (!accountId) {
      toast.error("Connect a Gmail account first");
      return;
    }

    // Activate bottom indicator immediately (before the server round-trip).
    window.dispatchEvent(new Event(SYNC_STARTED_EVENT));

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
            ? `Force rescan (${lookbackDays}d) started`
            : "Sync started in background")
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
        className="rounded-r-none border-r-0"
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
            className="rounded-l-none px-2"
            aria-label="More sync options"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Inbox sync</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => runSync(false)}
          >
            Sync Inbox
            <span className="ml-auto text-xs text-muted-foreground">
              new mail only
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Force rescan &amp; backfill
          </DropdownMenuLabel>
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => runSync(true, 5)}
          >
            Quick Rescan (Last 5 Days)
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => runSync(true, 10)}
          >
            Standard Rescan (Last 10 Days)
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => runSync(true, 14)}
          >
            Deep Backfill (Last 14 Days)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
