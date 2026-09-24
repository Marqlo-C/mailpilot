import { Radio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SyncBadgeProps = {
  connected: boolean;
  watching: boolean;
  compact?: boolean;
};

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
        "inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary",
        compact && "gap-1 px-1.5"
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      {!compact && (
        <>
          <Radio className="h-3.5 w-3.5" />
          <span>{watching ? "Live sync" : "Connected"}</span>
        </>
      )}
    </div>
  );
}
