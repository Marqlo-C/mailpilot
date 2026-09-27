"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { triggerHistoricalScan } from "@/app/actions/scan";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SCAN_DAY_OPTIONS, type ScanDays } from "@/lib/scan-types";
import { cn } from "@/lib/utils";

type ScanInboxDialogProps = {
  accountId: string | null;
  className?: string;
};

const DAY_LABELS: Record<ScanDays, string> = {
  5: "Last 5 Days",
  10: "Last 10 Days",
  15: "Last 15 Days",
  30: "Last 30 Days",
};

/**
 * Starts an inbox scan in the background and unlocks the UI immediately.
 * Completion feedback comes from GlobalSyncTracker.
 */
export function ScanInboxDialog({ accountId, className }: ScanInboxDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticScanning, setOptimisticScanning] = useOptimistic(false);

  const scanning = pending || optimisticScanning;
  const disabled = !accountId || scanning;

  function runScan(days: ScanDays) {
    if (!accountId) {
      toast.error("Connect a Gmail account first");
      return;
    }

    startTransition(async () => {
      setOptimisticScanning(true);
      const result = await triggerHistoricalScan(accountId, days);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.data?.message ?? "Sync started in background"
      );
      // Re-seed layout so the global sync pill appears without waiting for poll.
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(className)}
        >
          <RefreshCw
            className={cn("h-4 w-4", scanning && "animate-spin")}
          />
          {scanning ? "Starting…" : "Scan Inbox"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Look back window</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SCAN_DAY_OPTIONS.map((days) => (
          <DropdownMenuItem
            key={days}
            disabled={disabled}
            onSelect={() => runScan(days)}
          >
            {DAY_LABELS[days]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
