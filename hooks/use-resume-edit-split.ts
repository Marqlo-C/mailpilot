"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type {
  GroupImperativeHandle,
  Layout,
  LayoutChangedMeta,
} from "react-resizable-panels";

import {
  DRAFT_SPLIT_PANEL_EMAIL,
  DRAFT_SPLIT_PANEL_RESUME,
} from "@/hooks/use-draft-split-pane";
import { classifyResumeEditTarget } from "@/lib/resume-draft/edit-presentation";

type GroupRef = RefObject<GroupImperativeHandle | null>;

/** Treat email pct above this as "not expanded" (library minSize still applies). */
const EXPANDED_EMAIL_PCT_CEILING = 8;
/** First expand waits for caret; window focus/visibility heals after that. */
const EXPAND_FALLBACK_MS = 280;
/** Single-frame safety guard before restoring the pre-edit split. */
const EXIT_RESTORE_MS = 32;

function resumeEditableStillFocused(): boolean {
  const root = document.querySelector("[data-resume-draft-root]");
  return classifyResumeEditTarget(document.activeElement, root) === "editable";
}

/**
 * While resume edit mode is active, expand resume until email hits its legal
 * floor (panel minSize), then restore the prior split on exit.
 *
 * Expand is sticky while editing: a watchdog re-applies it if a blur flicker
 * restored the split or a cancelled enter left us shrunk (alt-tab used to be
 * the only thing that healed that stuck state).
 */
export function useResumeEditSplit({
  groupRef,
  enabled,
  editMode,
  onUserLayoutChanged,
  onExpanded,
}: {
  groupRef: GroupRef;
  /** Desktop split + resume attached. */
  enabled: boolean;
  editMode: boolean;
  /** Existing persist handler for normal user drags. */
  onUserLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void;
  /**
   * Fires once after the first expand layout of an edit session.
   * Used to start the edit-entry camera lerp.
   */
  onExpanded?: () => void;
}) {
  const savedEmailPctRef = useRef<number | null>(null);
  const wasEditModeRef = useRef(false);
  const editModeRef = useRef(editMode);
  const onExpandedRef = useRef(onExpanded);
  const announcedExpandRef = useRef(false);
  const userDraggingRef = useRef(false);

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  useEffect(() => {
    onExpandedRef.current = onExpanded;
  }, [onExpanded]);

  const applyExpandedLayout = useCallback((group: GroupImperativeHandle) => {
    group.setLayout({
      [DRAFT_SPLIT_PANEL_EMAIL]: 0,
      [DRAFT_SPLIT_PANEL_RESUME]: 100,
    });
  }, []);

  const ensureExpanded = useCallback(
    (group: GroupImperativeHandle, announce: boolean) => {
      if (!editModeRef.current) return;
      if (userDraggingRef.current) return;

      const emailPct = group.getLayout()[DRAFT_SPLIT_PANEL_EMAIL];
      const needsExpand =
        typeof emailPct !== "number" ||
        !Number.isFinite(emailPct) ||
        emailPct > EXPANDED_EMAIL_PCT_CEILING;

      if (needsExpand) {
        if (
          savedEmailPctRef.current === null &&
          typeof emailPct === "number" &&
          Number.isFinite(emailPct)
        ) {
          savedEmailPctRef.current = emailPct;
        }
        applyExpandedLayout(group);
      }

      wasEditModeRef.current = true;

      if (announce && !announcedExpandRef.current) {
        announcedExpandRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!editModeRef.current) return;
            onExpandedRef.current?.();
          });
        });
      }
    },
    [applyExpandedLayout]
  );

  const onLayoutChanged = useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      onUserLayoutChanged(layout, meta);

      if (meta.isUserInteraction) {
        userDraggingRef.current = true;
        window.setTimeout(() => {
          userDraggingRef.current = false;
        }, 120);
        if (editModeRef.current && savedEmailPctRef.current !== null) {
          const next = layout[DRAFT_SPLIT_PANEL_EMAIL];
          if (typeof next === "number" && Number.isFinite(next)) {
            savedEmailPctRef.current = next;
          }
        }
        return;
      }

      // Programmatic shrink while still editing (restore race) — snap back.
      if (!editModeRef.current || !enabled) return;
      const group = groupRef.current;
      if (!group) return;
      const emailPct = layout[DRAFT_SPLIT_PANEL_EMAIL];
      if (
        typeof emailPct === "number" &&
        Number.isFinite(emailPct) &&
        emailPct > EXPANDED_EMAIL_PCT_CEILING
      ) {
        applyExpandedLayout(group);
        wasEditModeRef.current = true;
      }
    },
    [applyExpandedLayout, enabled, groupRef, onUserLayoutChanged]
  );

  useLayoutEffect(() => {
    if (!enabled) {
      savedEmailPctRef.current = null;
      wasEditModeRef.current = false;
      announcedExpandRef.current = false;
      return;
    }

    const group = groupRef.current;
    if (!group) return;

    if (editMode) {
      const current = group.getLayout()[DRAFT_SPLIT_PANEL_EMAIL];
      if (
        savedEmailPctRef.current === null &&
        typeof current === "number" &&
        Number.isFinite(current) &&
        current > EXPANDED_EMAIL_PCT_CEILING
      ) {
        savedEmailPctRef.current = current;
      }

      let cancelled = false;
      let expandedOnce = false;

      const expand = (announce: boolean) => {
        if (cancelled) return;
        expandedOnce = true;
        ensureExpanded(group, announce);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("mouseup", onPointerUp, true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => expand(true));
        });
      };
      window.addEventListener("pointerup", onPointerUp, true);
      window.addEventListener("mouseup", onPointerUp, true);

      const fallback = window.setTimeout(() => {
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("mouseup", onPointerUp, true);
        expand(true);
      }, EXPAND_FALLBACK_MS);

      const healFromWindow = () => {
        if (!editModeRef.current) return;
        ensureExpanded(group, false);
      };
      window.addEventListener("focus", healFromWindow);
      document.addEventListener("visibilitychange", healFromWindow);

      return () => {
        cancelled = true;
        window.clearTimeout(fallback);
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("mouseup", onPointerUp, true);
        window.removeEventListener("focus", healFromWindow);
        document.removeEventListener("visibilitychange", healFromWindow);
        // If expand never applied, leave wasEditMode false so a remount retries.
        if (!expandedOnce && !wasEditModeRef.current) {
          announcedExpandRef.current = false;
        }
      };
    }

    // Exiting — debounce; abort if focus returned to a resume editable.
    if (!editMode && wasEditModeRef.current) {
      let cancelled = false;
      const restoreTimer = window.setTimeout(() => {
        if (cancelled || editModeRef.current) return;
        if (resumeEditableStillFocused()) {
          // React state lagged behind focus — stay expanded.
          wasEditModeRef.current = true;
          const g = groupRef.current;
          if (g) ensureExpanded(g, false);
          return;
        }
        const restore = savedEmailPctRef.current;
        savedEmailPctRef.current = null;
        announcedExpandRef.current = false;
        if (typeof restore === "number" && Number.isFinite(restore)) {
          group.setLayout({
            [DRAFT_SPLIT_PANEL_EMAIL]: restore,
            [DRAFT_SPLIT_PANEL_RESUME]: 100 - restore,
          });
        }
        wasEditModeRef.current = false;
      }, EXIT_RESTORE_MS);
      return () => {
        cancelled = true;
        window.clearTimeout(restoreTimer);
      };
    }
  }, [editMode, enabled, ensureExpanded, groupRef]);

  return { onLayoutChanged };
}
