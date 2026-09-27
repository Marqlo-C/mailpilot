"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { syncInboxOpportunities } from "@/app/actions/email";
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
 * Dual-mode inbox sync:
 * - Primary: fast incremental sync (new mail since lastSyncedAt)
 * - Menu: Force Rescan & Backfill (14d) to re-extract wages/scores/links/logos
 */
export function SyncControls({ accountId, className }: SyncControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticScanning, setOptimisticScanning] = useOptimistic(false);

  const scanning = pending || optimisticScanning;
  const disabled = !accountId || scanning;

  function runSync(forceRescan: boolean) {
    if (!accountId) {
      toast.error("Connect a Gmail account first");
      return;
    }

    startTransition(async () => {
      setOptimisticScanning(true);
      const result = await syncInboxOpportunities({
        accountId,
        forceRescan,
        lookbackDays: 14,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.data?.message ??
          (forceRescan
            ? "Force rescan started in background"
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
        <RefreshCw className={cn("h-4 w-4", scanning && "animate-spin")} />
        {scanning ? "Starting…" : "Sync Inbox"}
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
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Inbox sync</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => runSync(false)}
          >
            Sync Inbox
            <span className="ml-auto text-xs text-muted-foreground">
              new mail
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => runSync(true)}
          >
            Force Rescan & Backfill (14d)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
