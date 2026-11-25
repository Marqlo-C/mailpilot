"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type {
  GroupImperativeHandle,
  Layout,
  LayoutChangedMeta,
} from "react-resizable-panels";

import {
  DRAFT_SPLIT_PANEL_EMAIL,
  DRAFT_SPLIT_PANEL_RESUME,
} from "@/hooks/use-draft-split-pane";

type GroupRef = RefObject<GroupImperativeHandle | null>;

/**
 * While resume edit mode is active, expand resume until email hits its legal
 * floor (panel minSize), then restore the prior split on exit.
 *
 * Edge-triggered: duplicate enter/exit is ignored. First expand waits until
 * after pointerup (or a short fallback) so the caret lands on a still page.
 */
export function useResumeEditSplit({
  groupRef,
  enabled,
  editMode,
  onUserLayoutChanged,
}: {
  groupRef: GroupRef;
  /** Desktop split + resume attached. */
  enabled: boolean;
  editMode: boolean;
  /** Existing persist handler for normal user drags. */
  onUserLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void;
}) {
  const savedEmailPctRef = useRef<number | null>(null);
  const wasEditModeRef = useRef(false);

  const onLayoutChanged = useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      onUserLayoutChanged(layout, meta);
      if (!meta.isUserInteraction) return;
      if (!editMode || savedEmailPctRef.current === null) return;
      const next = layout[DRAFT_SPLIT_PANEL_EMAIL];
      if (typeof next !== "number" || !Number.isFinite(next)) return;
      savedEmailPctRef.current = next;
    },
    [editMode, onUserLayoutChanged]
  );

  useLayoutEffect(() => {
    if (!enabled) {
      savedEmailPctRef.current = null;
      wasEditModeRef.current = false;
      return;
    }

    const group = groupRef.current;
    if (!group) return;

    const entering = editMode && !wasEditModeRef.current;
    const exiting = !editMode && wasEditModeRef.current;

    if (entering) {
      const current = group.getLayout()[DRAFT_SPLIT_PANEL_EMAIL];
      if (typeof current === "number" && Number.isFinite(current)) {
        savedEmailPctRef.current = current;
      }

      let cancelled = false;
      let expanded = false;
      const expand = () => {
        if (cancelled || expanded) return;
        expanded = true;
        // Library clamps email to its pixel/% minSize — resume takes the rest.
        group.setLayout({
          [DRAFT_SPLIT_PANEL_EMAIL]: 0,
          [DRAFT_SPLIT_PANEL_RESUME]: 100,
        });
      };

      const onPointerUp = () => {
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("mouseup", onPointerUp, true);
        // Double rAF: browser finishes caret placement, then we widen the pane.
        requestAnimationFrame(() => {
          requestAnimationFrame(expand);
        });
      };
      window.addEventListener("pointerup", onPointerUp, true);
      window.addEventListener("mouseup", onPointerUp, true);
      // Ace / keyboard path: no pointerup coming.
      const fallback = window.setTimeout(() => {
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("mouseup", onPointerUp, true);
        expand();
      }, 280);

      wasEditModeRef.current = true;
      return () => {
        cancelled = true;
        window.clearTimeout(fallback);
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("mouseup", onPointerUp, true);
      };
    }

    if (exiting) {
      const restore = savedEmailPctRef.current;
      savedEmailPctRef.current = null;
      if (typeof restore === "number" && Number.isFinite(restore)) {
        group.setLayout({
          [DRAFT_SPLIT_PANEL_EMAIL]: restore,
          [DRAFT_SPLIT_PANEL_RESUME]: 100 - restore,
        });
      }
      wasEditModeRef.current = false;
    }
  }, [editMode, enabled, groupRef]);

  return { onLayoutChanged };
}
