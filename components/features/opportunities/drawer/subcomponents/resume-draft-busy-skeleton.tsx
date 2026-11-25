import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  PAGE_HEIGHT,
  PAGE_PADDING_BOTTOM,
  PAGE_PADDING_TOP,
  PAGE_PADDING_X,
  SHEET_WIDTH,
} from "./resume-draft-layout";

/** Letter padding as % of width so the busy page scales with the pane. */
const PAGE_PAD_X_PCT = `${(PAGE_PADDING_X / SHEET_WIDTH) * 100}%`;
const PAGE_PAD_TOP_PCT = `${(PAGE_PADDING_TOP / SHEET_WIDTH) * 100}%`;
const PAGE_PAD_BOTTOM_PCT = `${(PAGE_PADDING_BOTTOM / SHEET_WIDTH) * 100}%`;

function ResumePageLines() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="mx-auto h-5 w-2/5 rounded-sm bg-muted/80" />
      <Skeleton className="mx-auto h-2.5 w-3/5 rounded-sm bg-muted/70" />
      <div className="mt-2 space-y-2 border-t border-[#D1D5DB] pt-3">
        <Skeleton className="h-3 w-1/4 rounded-sm bg-muted/80" />
        <Skeleton className="h-2.5 w-full rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[94%] rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[88%] rounded-sm bg-muted/70" />
      </div>
      <div className="mt-1 space-y-2 border-t border-[#D1D5DB] pt-3">
        <Skeleton className="h-3 w-1/3 rounded-sm bg-muted/80" />
        <Skeleton className="h-2.5 w-[96%] rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[90%] rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[72%] rounded-sm bg-muted/70" />
        <Skeleton className="mt-2 h-2.5 w-[94%] rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[86%] rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[68%] rounded-sm bg-muted/70" />
      </div>
      <div className="mt-1 space-y-2 border-t border-[#D1D5DB] pt-3">
        <Skeleton className="h-3 w-[28%] rounded-sm bg-muted/80" />
        <Skeleton className="h-2.5 w-full rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[92%] rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[80%] rounded-sm bg-muted/70" />
        <Skeleton className="mt-2 h-2.5 w-[96%] rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[88%] rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[70%] rounded-sm bg-muted/70" />
      </div>
      <div className="mt-1 space-y-2 border-t border-[#D1D5DB] pt-3">
        <Skeleton className="h-3 w-1/4 rounded-sm bg-muted/80" />
        <Skeleton className="h-2.5 w-full rounded-sm bg-muted/70" />
        <Skeleton className="h-2.5 w-[84%] rounded-sm bg-muted/70" />
      </div>
    </div>
  );
}

/**
 * Letter page only — real ResumeDraftToolbar stays visible like email To/Subject.
 * Fills the pane width (Fit-style); letter aspect only — no SHEET_WIDTH cap.
 */
export function ResumeDraftBusySkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-auto bg-background/75 p-3",
        className
      )}
      aria-hidden
    >
      <div
        className="mx-auto h-auto w-full max-w-full overflow-hidden rounded-sm bg-white shadow-lg ring-1 ring-black/5"
        style={{
          aspectRatio: `${SHEET_WIDTH} / ${PAGE_HEIGHT}`,
          paddingTop: PAGE_PAD_TOP_PCT,
          paddingBottom: PAGE_PAD_BOTTOM_PCT,
          paddingLeft: PAGE_PAD_X_PCT,
          paddingRight: PAGE_PAD_X_PCT,
        }}
      >
        <ResumePageLines />
      </div>
    </div>
  );
}
