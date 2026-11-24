"use client";

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
  onCommit,
  onToggle,
  onMove,
  onRefine,
  onExport,
  exporting,
  strategyRationale,
  includeSummary,
  onIncludeSummaryChange,
}: {
  draft: TailoredResumeDraft;
  disabled?: boolean;
  exporting?: boolean;
  onCommit: (nodeId: string, content: string) => void;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefine: (nodeId: string, instruction: string) => void;
  onExport: (format: "pdf" | "docx") => void;
  strategyRationale?: StrategyRationale | null;
  includeSummary?: boolean;
  onIncludeSummaryChange?: (include: boolean) => void;
}) {
  const sheet = useResumeDraftSheet({
    draft,
    includeSummary,
    onRefine,
  });

  return (
    <ResumeLineChromeProvider
      disabled={disabled}
      pinnedId={sheet.refineFor}
      onToggle={onToggle}
      onMove={onMove}
      onRefineOpen={sheet.openRefine}
    >
      <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-lg">
        {/* py-3 matches email pane field inset so To and this rail share one horizon. */}
        <ResumeDraftToolbar
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
        />
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
      </div>
    </ResumeLineChromeProvider>
  );
}
