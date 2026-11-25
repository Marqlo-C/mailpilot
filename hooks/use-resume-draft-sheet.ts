"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import {
  computeResumeDraftInsights,
  type ResumeDraftInsights,
} from "@/components/features/opportunities/drawer/subcomponents/resume-draft-insights";
import {
  buildBlocks,
  getBlockId,
  PAGE_GAP,
  PAGE_HEIGHT,
  partitionBlocksIntoPages,
  SHEET_WIDTH,
  type DraftBlock,
} from "@/components/features/opportunities/drawer/subcomponents/resume-draft-layout";
import {
  useResumeEditEntryCamera,
  type ResumeEditEntryCameraApi,
} from "@/hooks/use-resume-edit-entry-camera";
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/resume-draft";
import {
  clampResumeZoom,
  resumeEffectiveZoom,
  resumeZoomPercent,
  type ResumeDraftZoomChoice,
  type ResumeDraftZoomPreset,
} from "@/lib/resume-draft/edit-presentation";

export type { ResumeDraftZoomChoice, ResumeDraftZoomPreset };
export type { ResumeEditEntryCameraApi };

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type UseResumeDraftSheetArgs = {
  draft: TailoredResumeDraft;
  includeSummary?: boolean;
  onRefine: (nodeId: string, instruction: string) => void;
  /** True while a resume contenteditable line holds focus. */
  lineEditing?: boolean;
  /** Fires when Ace-on-line or inline edit starts/stops. */
  onEditModeChange?: (active: boolean) => void;
  /**
   * False while the busy skeleton replaces the canvas so Fit re-binds when
   * the viewport mounts again.
   */
  viewportActive?: boolean;
  /** Split expand → entry camera handoff (desktop draft dialog). */
  editEntryCameraApiRef?: MutableRefObject<ResumeEditEntryCameraApi | null>;
};

/**
 * Layout measurement, zoom, refine/notes chrome, and draft insights for
 * {@link ResumeDraftSheet}. Zoom chips are always honest (no edit floor).
 */
export function useResumeDraftSheet({
  draft,
  includeSummary,
  onRefine,
  lineEditing = false,
  onEditModeChange,
  viewportActive = true,
  editEntryCameraApiRef,
}: UseResumeDraftSheetArgs) {
  const [refineFor, setRefineFor] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [zoomChoice, setZoomChoice] = useState<ResumeDraftZoomChoice>("fit");
  const [manualScale, setManualScale] = useState(1);
  const [fitScale, setFitScale] = useState(0.7);
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  const [notesOpen, setNotesOpen] = useState(false);

  const notesPanelRef = useRef<HTMLDivElement>(null);
  const notesTriggerRef = useRef<HTMLButtonElement>(null);
  const refinePanelRef = useRef<HTMLFormElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const zoomChoiceRef = useRef(zoomChoice);
  const manualScaleRef = useRef(manualScale);
  const fitScaleRef = useRef(fitScale);

  useEffect(() => {
    zoomChoiceRef.current = zoomChoice;
    manualScaleRef.current = manualScale;
    fitScaleRef.current = fitScale;
  }, [fitScale, manualScale, zoomChoice]);

  const getLiveZoom = useCallback(
    () =>
      resumeEffectiveZoom(
        zoomChoiceRef.current,
        fitScaleRef.current,
        false,
        manualScaleRef.current
      ),
    []
  );

  const applyManualZoom = useCallback((nextScale: number) => {
    const clamped = clampResumeZoom(nextScale);
    setManualScale(clamped);
    setZoomChoice("custom");
  }, []);

  const getZoomSnapshot = useCallback(
    () => ({
      choice: zoomChoiceRef.current,
      manualScale: manualScaleRef.current,
    }),
    []
  );

  const restoreZoom = useCallback(
    (snapshot: { choice: ResumeDraftZoomChoice; manualScale: number }) => {
      setZoomChoice(snapshot.choice);
      setManualScale(snapshot.manualScale);
    },
    []
  );

  // Re-bind after busy skeleton → canvas mount (viewportRef was null before).
  useEffect(() => {
    if (!viewportActive) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const available = viewport.clientWidth - 24;
      if (available <= 0) return;
      setFitScale(available / SHEET_WIDTH);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewportActive]);

  const editMode = Boolean(refineFor) || lineEditing;

  useResumeEditEntryCamera({
    viewportRef,
    pagesContainerRef,
    getLiveZoom,
    applyManualZoom,
    getZoomSnapshot,
    restoreZoom,
    editMode,
    viewportActive,
    animate: true,
    apiRef: editEntryCameraApiRef,
  });

  /**
   * Trackpad pinch (ctrl+wheel) + touch pinch on the canvas viewport.
   * Scale only — entry camera ignores an in-progress pinch.
   */
  useEffect(() => {
    if (!viewportActive) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      // macOS trackpad pinch is dispatched as ctrl+wheel.
      if (!event.ctrlKey) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.01);
      applyManualZoom(getLiveZoom() * factor);
    };

    let pinchStartDist = 0;
    let pinchStartZoom = 1;

    const touchDistance = (touches: TouchList) => {
      const a = touches.item(0);
      const b = touches.item(1);
      if (!a || !b) return 0;
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinchStartDist = touchDistance(event.touches);
      pinchStartZoom = getLiveZoom();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || pinchStartDist <= 0) return;
      event.preventDefault();
      const dist = touchDistance(event.touches);
      if (dist <= 0) return;
      applyManualZoom(pinchStartZoom * (dist / pinchStartDist));
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchStartDist = 0;
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd);
    viewport.addEventListener("touchcancel", onTouchEnd);
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyManualZoom, getLiveZoom, viewportActive]);

  useEffect(() => {
    if (!notesOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (notesPanelRef.current?.contains(target)) return;
      if (notesTriggerRef.current?.contains(target)) return;
      setNotesOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotesOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [notesOpen]);

  useEffect(() => {
    if (!refineFor) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (refinePanelRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-resume-line-toolbar]")
      ) {
        return;
      }
      setInstruction("");
      setRefineFor(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [refineFor]);

  // Emit current value only — never pulse `false` on cleanup (that slammed the split).
  useEffect(() => {
    onEditModeChange?.(editMode);
  }, [editMode, onEditModeChange]);

  const zoom = resumeEffectiveZoom(
    zoomChoice,
    fitScale,
    editMode,
    manualScale
  );
  const zoomPercent = resumeZoomPercent(zoom);

  const handleZoomPresetChange = useCallback((next: ResumeDraftZoomPreset) => {
    setZoomChoice(next);
  }, []);

  const handleZoomPercentChange = useCallback(
    (percent: number) => {
      applyManualZoom(percent / 100);
    },
    [applyManualZoom]
  );

  const blocks = useMemo(() => {
    const all = buildBlocks(draft);
    if (includeSummary === false) {
      return all.filter(
        (block) =>
          !(block.kind === "node" && block.node.section === "summary")
      );
    }
    return all;
  }, [draft, includeSummary]);

  const selectedIds = useMemo(
    () =>
      new Set(draft.nodes.filter((node) => node.selected).map((node) => node.id)),
    [draft.nodes]
  );

  /** Matches export: excluded if self or parent is unchecked. */
  const isIncluded = useCallback(
    (node: ResumeDraftNode): boolean => {
      if (!node.selected) return false;
      if (node.parentId && !selectedIds.has(node.parentId)) return false;
      return true;
    },
    [selectedIds]
  );

  const firstHeadingBlock = blocks.find(
    (b) => b.kind === "skills" || (b.kind === "node" && Boolean(b.heading))
  );
  const firstHeadingBlockId = firstHeadingBlock
    ? getBlockId(firstHeadingBlock)
    : null;

  const remeasure = useCallback(() => {
    const container = pagesContainerRef.current;
    if (!container) return;

    const elements = container.querySelectorAll<HTMLElement>(
      "[data-draft-block-id]"
    );
    let hasChanged = false;
    const nextHeights: Record<string, number> = {};

    elements.forEach((el) => {
      const id = el.getAttribute("data-draft-block-id");
      if (!id) return;
      const comp = window.getComputedStyle(el);
      const marginTop = parseFloat(comp.marginTop) || 0;
      const marginBottom = parseFloat(comp.marginBottom) || 0;
      const measured = Math.ceil(el.offsetHeight + marginTop + marginBottom);
      nextHeights[id] = measured;
      const previous = blockHeights[id];
      if (previous === undefined || Math.abs(previous - measured) > 1) {
        hasChanged = true;
      }
    });

    if (
      hasChanged ||
      Object.keys(blockHeights).length !== Object.keys(nextHeights).length
    ) {
      setBlockHeights(nextHeights);
    }
  }, [blockHeights]);

  useIsomorphicLayoutEffect(() => {
    remeasure();
  }, [blocks, remeasure]);

  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        remeasure();
      });
    }
  }, [remeasure]);

  const pages = useMemo(
    () => partitionBlocksIntoPages(blocks, blockHeights, null),
    [blocks, blockHeights]
  );

  const displayPages: DraftBlock[][] = pages.length > 0 ? pages : [[]];
  const totalPages = displayPages.length;
  const totalCanvasHeight =
    totalPages * PAGE_HEIGHT + Math.max(0, totalPages - 1) * PAGE_GAP;

  const draftInsights: ResumeDraftInsights = useMemo(
    () =>
      computeResumeDraftInsights({
        draft,
        displayPages,
        blockHeights,
        totalPages,
        includeSummary,
      }),
    [blockHeights, displayPages, draft, includeSummary, totalPages]
  );

  const dismissRefine = useCallback(() => {
    setInstruction("");
    setRefineFor(null);
  }, []);

  const closeNotes = useCallback(() => {
    setNotesOpen(false);
  }, []);

  function submitRefine() {
    if (!refineFor) return;
    const next = instruction.trim();
    if (!next) return;
    onRefine(refineFor, next);
    dismissRefine();
  }

  function openRefine(nodeId: string) {
    setNotesOpen(false);
    setRefineFor(nodeId);
    setInstruction("");
  }

  function toggleNotes() {
    dismissRefine();
    setNotesOpen((open) => !open);
  }

  return {
    refineFor,
    instruction,
    setInstruction,
    zoomChoice,
    setZoomChoice: handleZoomPresetChange,
    zoomPercent,
    setZoomPercent: handleZoomPercentChange,
    zoom,
    editMode,
    notesOpen,
    notesPanelRef,
    notesTriggerRef,
    refinePanelRef,
    viewportRef,
    pagesContainerRef,
    displayPages,
    totalCanvasHeight,
    firstHeadingBlockId,
    isIncluded,
    draftInsights,
    dismissRefine,
    submitRefine,
    openRefine,
    toggleNotes,
    closeNotes,
  };
}
