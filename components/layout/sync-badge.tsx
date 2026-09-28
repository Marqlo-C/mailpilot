import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SyncBadgeProps = {
  connected: boolean;
  watching: boolean;
  compact?: boolean;
};

/** High-contrast Connected / Offline status badge for sidebar + mobile. */
export function SyncBadge({ connected, watching, compact }: SyncBadgeProps) {
  if (!connected) {
    return (
      <Badge variant="secondary" className={cn(compact && "px-1.5")}>
        Offline
      </Badge>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400",
        compact && "px-2"
      )}
      title={watching ? "Push watch active" : "Connected"}
    >
      <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-emerald-500" />
      {!compact && <span>Connected</span>}
    </div>
  );
}
