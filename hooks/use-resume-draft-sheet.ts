"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/resume-draft";
import {
  resumeEffectiveZoom,
  type ResumeDraftZoomChoice,
} from "@/lib/resume-draft/edit-presentation";

export type { ResumeDraftZoomChoice };

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
};

/**
 * Layout measurement, zoom, refine/notes chrome, and draft insights for
 * {@link ResumeDraftSheet}.
 *
 * Edit mode uses a derived zoom floor (max(base, 1)) — stored zoomChoice is
 * never overwritten by enter/exit.
 */
export function useResumeDraftSheet({
  draft,
  includeSummary,
  onRefine,
  lineEditing = false,
  onEditModeChange,
}: UseResumeDraftSheetArgs) {
  const [refineFor, setRefineFor] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [zoomChoice, setZoomChoice] = useState<ResumeDraftZoomChoice>("fit");
  const [fitScale, setFitScale] = useState(0.7);
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  const [notesOpen, setNotesOpen] = useState(false);

  const notesPanelRef = useRef<HTMLDivElement>(null);
  const notesTriggerRef = useRef<HTMLButtonElement>(null);
  const refinePanelRef = useRef<HTMLFormElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, []);

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

  const editMode = Boolean(refineFor) || lineEditing;

  useEffect(() => {
    onEditModeChange?.(editMode);
    return () => onEditModeChange?.(false);
  }, [editMode, onEditModeChange]);

  const zoom = resumeEffectiveZoom(zoomChoice, fitScale, editMode);

  const handleZoomChange = useCallback((next: ResumeDraftZoomChoice) => {
    setZoomChoice(next);
  }, []);

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
    setZoomChoice: handleZoomChange,
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
