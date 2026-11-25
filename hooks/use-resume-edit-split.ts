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
 * User drags during edit update the restore snapshot (and persistence).
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
      // Persist path already ran above; only refresh the in-memory restore target.
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
      // Library clamps email to its pixel/% minSize — resume takes the rest.
      group.setLayout({
        [DRAFT_SPLIT_PANEL_EMAIL]: 0,
        [DRAFT_SPLIT_PANEL_RESUME]: 100,
      });
    } else if (exiting) {
      const restore = savedEmailPctRef.current;
      savedEmailPctRef.current = null;
      if (typeof restore === "number" && Number.isFinite(restore)) {
        group.setLayout({
          [DRAFT_SPLIT_PANEL_EMAIL]: restore,
          [DRAFT_SPLIT_PANEL_RESUME]: 100 - restore,
        });
      }
    }

    wasEditModeRef.current = editMode;
  }, [editMode, enabled, groupRef]);

  return { onLayoutChanged };
}
