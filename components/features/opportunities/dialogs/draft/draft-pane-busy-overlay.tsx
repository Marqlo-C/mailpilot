import type { ReactNode } from "react";

import { ResumeDraftBusySkeleton } from "@/components/features/opportunities/drawer/subcomponents/resume-draft-busy-skeleton";
import { BusyStatusChip } from "@/components/ui/composites/busy-status-chip";

/** @deprecated Prefer {@link BusyStatusChip}. */
export { BusyStatusChip as DraftBusyStatusChip } from "@/components/ui/composites/busy-status-chip";

/**
 * Full-pane resume wait when no sheet chrome exists yet (first create).
 * With a draft, {@link ResumeDraftSheet} keeps the real toolbar and skeletons
 * the page only.
 */
export function DraftPaneBusyOverlay({
  label,
}: {
  label: string;
}): ReactNode {
  return (
    <div className="absolute inset-0 z-10">
      <div className="absolute inset-0 overflow-hidden">
        <ResumeDraftBusySkeleton className="h-full" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
        <BusyStatusChip label={label} />
      </div>
    </div>
  );
}
