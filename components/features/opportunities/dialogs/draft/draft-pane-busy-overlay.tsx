import type { ReactNode } from "react";

import { Loader } from "@/components/ui/loader";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { CancelTaskButton } from "@/components/ui/composites/cancel-task-button";

/** Shared veil for email + resume pane waits — same tint/blur on both sides. */
export const DRAFT_PANE_BUSY_OVERLAY_CLASSNAME =
  "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/75 backdrop-blur-[2px]";

export function DraftPaneBusyOverlay({
  label,
  cancelTitle,
  onCancel,
}: {
  label: string;
  cancelTitle: string;
  onCancel: () => void;
}): ReactNode {
  return (
    <div className={DRAFT_PANE_BUSY_OVERLAY_CLASSNAME}>
      <div className="flex items-center gap-2 text-sm">
        <Loader size="md" />
        <TextShimmer>{label}</TextShimmer>
      </div>
      <CancelTaskButton tone="light" title={cancelTitle} onCancel={onCancel} />
    </div>
  );
}
