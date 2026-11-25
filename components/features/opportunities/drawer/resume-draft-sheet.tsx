"use client";

import { useCallback, useEffect, useRef, type Ref } from "react";

import { ResumeDraftBusySkeleton } from "@/components/features/opportunities/drawer/subcomponents/resume-draft-busy-skeleton";
import { BusyStatusChip } from "@/components/ui/composites/busy-status-chip";
import { ResumeDraftCanvas } from "@/components/features/opportunities/drawer/subcomponents/resume-draft-canvas";
import { ResumeDraftToolbar } from "@/components/features/opportunities/drawer/subcomponents/resume-draft-toolbar";
import { ResumeLineChromeProvider } from "@/components/features/opportunities/drawer/subcomponents/resume-line-chrome";
import { useResumeDraftSheet } from "@/hooks/use-resume-draft-sheet";
import type { TailoredResumeDraft } from "@/lib/resume-draft";
import { classifyResumeEditTarget } from "@/lib/resume-draft/edit-presentation";
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
  onForceExitEdit,
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
  /** Escape exit — clears edit presentation even if focus moves to zoom. */
  onForceExitEdit?: () => void;
  onEditModeChange?: (active: boolean) => void;
}) {
  const sheet = useResumeDraftSheet({
    draft,
    includeSummary,
    onRefine,
    lineEditing,
    onEditModeChange,
    viewportActive: !busyLabel,
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const escapeSuppressedIdRef = useRef<string | null>(null);

  const blurActiveEditable = useCallback(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      rootRef.current?.contains(active) &&
      (active.isContentEditable ||
        active.getAttribute("contenteditable") === "true")
    ) {
      const lineId =
        active.closest("[data-resume-line]")?.getAttribute("data-resume-line") ??
        null;
      escapeSuppressedIdRef.current = lineId;
      active.blur();
    }
  }, []);

  useEffect(() => {
    if (!disabled && !busyLabel) return;
    sheet.closeNotes();
    sheet.dismissRefine();
  }, [busyLabel, disabled, sheet.closeNotes, sheet.dismissRefine]);

  // Escape: dismiss refine → else blur editable once; do not hand focus to zoom.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (sheet.refineFor) {
        event.preventDefault();
        event.stopPropagation();
        sheet.dismissRefine();
        return;
      }
      if (!lineEditing && !sheet.editMode) return;
      event.preventDefault();
      event.stopPropagation();
      onForceExitEdit?.();
      blurActiveEditable();
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [
    blurActiveEditable,
    lineEditing,
    onForceExitEdit,
    sheet.editMode,
    sheet.refineFor,
    sheet.dismissRefine,
  ]);

  // Whitespace / resume-other pointer exit (blur commits; don't preventDefault).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element) {
        const lineId =
          target
            .closest("[data-resume-line]")
            ?.getAttribute("data-resume-line") ?? null;
        // Intentional re-enter after Escape suppression.
        if (
          lineId &&
          escapeSuppressedIdRef.current &&
          lineId === escapeSuppressedIdRef.current
        ) {
          escapeSuppressedIdRef.current = null;
        }
      }
      if (!sheet.editMode) return;
      const kind = classifyResumeEditTarget(event.target, root);
      // Zoom / toolbar = resume-local — change zoom, do not exit.
      if (kind !== "resume-other") return;
      onForceExitEdit?.();
      blurActiveEditable();
      if (sheet.refineFor) sheet.dismissRefine();
    };
    root.addEventListener("pointerdown", onPointerDown);
    return () => root.removeEventListener("pointerdown", onPointerDown);
  }, [
    blurActiveEditable,
    onForceExitEdit,
    sheet.dismissRefine,
    sheet.editMode,
    sheet.refineFor,
  ]);

  // Suppress Escape re-enter until blur+refocus (next intentional pointer).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onFocusIn = (event: FocusEvent) => {
      const suppressed = escapeSuppressedIdRef.current;
      if (!suppressed) return;
      const t = event.target;
      if (!(t instanceof HTMLElement)) return;
      const lineId =
        t.closest("[data-resume-line]")?.getAttribute("data-resume-line") ??
        null;
      if (lineId !== suppressed) {
        if (lineId) escapeSuppressedIdRef.current = null;
        return;
      }
      requestAnimationFrame(() => {
        if (
          escapeSuppressedIdRef.current === suppressed &&
          document.activeElement === t
        ) {
          t.blur();
        }
      });
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, []);

  return (
    <ResumeLineChromeProvider
      disabled={disabled}
      pinnedId={sheet.refineFor}
      onToggle={onToggle}
      onMove={onMove}
      onRefineOpen={sheet.openRefine}
    >
      <div
        ref={rootRef}
        data-resume-draft-root
        className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-lg"
      >
        <ResumeDraftToolbar
          toolbarRef={toolbarRef}
          disabled={disabled}
          exporting={exporting}
          zoomChoice={sheet.zoomChoice}
          onZoomChange={sheet.setZoomChoice}
          zoomPercent={sheet.zoomPercent}
          onZoomPercentChange={sheet.setZoomPercent}
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
