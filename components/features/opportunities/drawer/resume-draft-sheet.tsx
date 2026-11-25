"use client";

import { useEffect, type Ref } from "react";

import { ResumeDraftBusySkeleton } from "@/components/features/opportunities/drawer/subcomponents/resume-draft-busy-skeleton";
import { BusyStatusChip } from "@/components/ui/composites/busy-status-chip";
import { ResumeDraftCanvas } from "@/components/features/opportunities/drawer/subcomponents/resume-draft-canvas";
import { ResumeDraftToolbar } from "@/components/features/opportunities/drawer/subcomponents/resume-draft-toolbar";
import { ResumeLineChromeProvider } from "@/components/features/opportunities/drawer/subcomponents/resume-line-chrome";
import { useResumeDraftSheet } from "@/hooks/use-resume-draft-sheet";
import type { TailoredResumeDraft } from "@/lib/resume-draft";
import type { StrategyRationale } from "@/lib/validations/resume-draft.schema";

export {
  SHEET_WIDTH,
  PAGE_HEIGHT,
  PAGE_PADDING_TOP,
  PAGE_PADDING_BOTTOM,
  PAGE_PADDING_X,
  PRINTABLE_HEIGHT,
  PAGE_GAP,
  type DraftBlock,
  getBlockId,
  estimateBlockHeight,
  buildBlocks,
  getEntityTotalHeight,
  partitionBlocksIntoPages,
} from "./subcomponents/resume-draft-layout";

export function ResumeDraftSheet({
  draft,
  disabled,
  busyLabel = null,
  onCommit,
  onToggle,
  onMove,
  onRefine,
  onExport,
  exporting,
  strategyRationale,
  includeSummary,
  onIncludeSummaryChange,
  toolbarRef,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  lineEditing = false,
  onEditModeChange,
}: {
  draft: TailoredResumeDraft;
  disabled?: boolean;
  /** Skeleton the page only; real toolbar stays (like email To/Subject). */
  busyLabel?: string | null;
  exporting?: boolean;
  onCommit: (nodeId: string, content: string) => void;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefine: (nodeId: string, instruction: string) => void;
  onExport: (format: "pdf" | "docx") => void;
  strategyRationale?: StrategyRationale | null;
  includeSummary?: boolean;
  onIncludeSummaryChange?: (include: boolean) => void;
  toolbarRef?: Ref<HTMLDivElement>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Contenteditable line currently focused (from plate focus tracking). */
  lineEditing?: boolean;
  onEditModeChange?: (active: boolean) => void;
}) {
  const sheet = useResumeDraftSheet({
    draft,
    includeSummary,
    onRefine,
    lineEditing,
    onEditModeChange,
  });

  useEffect(() => {
    if (!disabled && !busyLabel) return;
    sheet.closeNotes();
    sheet.dismissRefine();
  }, [busyLabel, disabled, sheet.closeNotes, sheet.dismissRefine]);

  return (
    <ResumeLineChromeProvider
      disabled={disabled}
      pinnedId={sheet.refineFor}
      onToggle={onToggle}
      onMove={onMove}
      onRefineOpen={sheet.openRefine}
    >
      <div
        data-resume-draft-root
        className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-lg"
      >
        {/* py-3 matches email pane field inset so To and this rail share one horizon. */}
        <ResumeDraftToolbar
          toolbarRef={toolbarRef}
          disabled={disabled}
          exporting={exporting}
          zoomChoice={sheet.zoomChoice}
          onZoomChange={sheet.setZoomChoice}
          includeSummary={includeSummary}
          onIncludeSummaryChange={onIncludeSummaryChange}
          draftInsights={sheet.draftInsights}
          strategyRationale={strategyRationale}
          notesOpen={sheet.notesOpen}
          onToggleNotes={sheet.toggleNotes}
          notesTriggerRef={sheet.notesTriggerRef}
          notesPanelRef={sheet.notesPanelRef}
          onExport={onExport}
          refineFor={sheet.refineFor}
          instruction={sheet.instruction}
          onInstructionChange={sheet.setInstruction}
          refinePanelRef={sheet.refinePanelRef}
          onSubmitRefine={sheet.submitRefine}
          onDismissRefine={sheet.dismissRefine}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
        {busyLabel ? (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <ResumeDraftBusySkeleton className="h-full" />
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
              <BusyStatusChip label={busyLabel} />
            </div>
          </div>
        ) : (
          <ResumeDraftCanvas
            viewportRef={sheet.viewportRef}
            pagesContainerRef={sheet.pagesContainerRef}
            zoom={sheet.zoom}
            totalCanvasHeight={sheet.totalCanvasHeight}
            displayPages={sheet.displayPages}
            firstHeadingBlockId={sheet.firstHeadingBlockId}
            disabled={disabled}
            isIncluded={sheet.isIncluded}
            onCommit={onCommit}
          />
        )}
      </div>
    </ResumeLineChromeProvider>
  );
}
