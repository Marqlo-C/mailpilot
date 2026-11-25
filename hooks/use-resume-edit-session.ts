"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  classifyResumeEditTarget,
  type ResumeEditTargetClass,
} from "@/lib/resume-draft/edit-presentation";

export type ResumeEditSessionState = {
  /** True while a `[contenteditable='true']` line inside the resume root holds focus. */
  lineEditing: boolean;
  /**
   * True when focus moved from an active line-editing session into non-refine
   * `"resume-local"` chrome (e.g. Zoom `%` NumericField or portaled menu).
   * Never activates from cold preview (`editMode === false`).
   */
  toolbarFocusHold: boolean;
};

export const INITIAL_RESUME_EDIT_SESSION_STATE: ResumeEditSessionState = {
  lineEditing: false,
  toolbarFocusHold: false,
};

export type ResumeEditSessionEvent =
  | {
      type: "focusin";
      targetClass: ResumeEditTargetClass;
      inAceRefine?: boolean;
    }
  | {
      type: "focusout-settled";
      activeClass: ResumeEditTargetClass;
      inAceRefine?: boolean;
    }
  | {
      type: "pointerdown";
      targetClass: ResumeEditTargetClass;
      refineFor: string | null;
    }
  | {
      type: "escape";
      refineFor: string | null;
    }
  | {
      type: "force-exit";
    };

export type ResumeEditSessionTransition = {
  state: ResumeEditSessionState;
  editMode: boolean;
  dismissRefine: boolean;
  blurActiveElement: boolean;
  consumeEscape: boolean;
};

/**
 * Derive overall `editMode` from inline focus, toolbar focus hold, and Ace line refine.
 */
export function isResumeEditMode(
  state: ResumeEditSessionState,
  refineFor: string | null
): boolean {
  return Boolean(refineFor) || state.lineEditing || state.toolbarFocusHold;
}

/**
 * Pure, DOM-free state machine for resume draft edit-mode enter, stay, and exit.
 *
 * Enforces the product invariants:
 * - `"resume-local"` never enters `editMode` from cold preview (`Preview`),
 *   but preserves an already-active session (`ToolbarHold` / `RefiningLine`).
 * - `"resume-other"`, `"external"`, and `"detached"` pointerdowns exit
 *   synchronously (`0ms` lag) with zero `escapeExitRef` re-entry suppression.
 */
export function reduceResumeEditSession(
  state: ResumeEditSessionState,
  refineFor: string | null,
  event: ResumeEditSessionEvent
): ResumeEditSessionTransition {
  switch (event.type) {
    case "focusin": {
      if (event.targetClass === "editable") {
        const next: ResumeEditSessionState = {
          lineEditing: true,
          toolbarFocusHold: false,
        };
        return {
          state: next,
          editMode: true,
          dismissRefine: Boolean(refineFor),
          blurActiveElement: false,
          consumeEscape: false,
        };
      }
      if (event.targetClass === "resume-local") {
        if (event.inAceRefine) {
          const next: ResumeEditSessionState = {
            lineEditing: false,
            toolbarFocusHold: false,
          };
          return {
            state: next,
            editMode: isResumeEditMode(next, refineFor),
            dismissRefine: false,
            blurActiveElement: false,
            consumeEscape: false,
          };
        }
        if (state.lineEditing || state.toolbarFocusHold) {
          const next: ResumeEditSessionState = {
            lineEditing: false,
            toolbarFocusHold: true,
          };
          return {
            state: next,
            editMode: true,
            dismissRefine: false,
            blurActiveElement: false,
            consumeEscape: false,
          };
        }
        return {
          state: INITIAL_RESUME_EDIT_SESSION_STATE,
          editMode: isResumeEditMode(INITIAL_RESUME_EDIT_SESSION_STATE, refineFor),
          dismissRefine: false,
          blurActiveElement: false,
          consumeEscape: false,
        };
      }
      const next = INITIAL_RESUME_EDIT_SESSION_STATE;
      return {
        state: next,
        editMode: isResumeEditMode(next, refineFor),
        dismissRefine: false,
        blurActiveElement: false,
        consumeEscape: false,
      };
    }

    case "focusout-settled": {
      if (event.activeClass === "editable") {
        const next: ResumeEditSessionState = {
          lineEditing: true,
          toolbarFocusHold: false,
        };
        return {
          state: next,
          editMode: true,
          dismissRefine: false,
          blurActiveElement: false,
          consumeEscape: false,
        };
      }
      if (
        event.activeClass === "resume-local" &&
        !event.inAceRefine &&
        (state.lineEditing || state.toolbarFocusHold)
      ) {
        const next: ResumeEditSessionState = {
          lineEditing: false,
          toolbarFocusHold: true,
        };
        return {
          state: next,
          editMode: true,
          dismissRefine: false,
          blurActiveElement: false,
          consumeEscape: false,
        };
      }
      const next = INITIAL_RESUME_EDIT_SESSION_STATE;
      return {
        state: next,
        editMode: isResumeEditMode(next, refineFor),
        dismissRefine: false,
        blurActiveElement: false,
        consumeEscape: false,
      };
    }

    case "pointerdown": {
      const currentActive = isResumeEditMode(state, event.refineFor);
      if (!currentActive) {
        return {
          state,
          editMode: false,
          dismissRefine: false,
          blurActiveElement: false,
          consumeEscape: false,
        };
      }
      if (event.targetClass === "editable") {
        // Bridge `RefiningLine -> EditingText` across pointerdown -> mousedown
        // without pulsing `editMode` false on the frame refineFor clears.
        const next: ResumeEditSessionState = event.refineFor
          ? { lineEditing: true, toolbarFocusHold: false }
          : state;
        return {
          state: next,
          editMode: isResumeEditMode(next, null),
          dismissRefine: Boolean(event.refineFor),
          blurActiveElement: false,
          consumeEscape: false,
        };
      }
      if (event.targetClass === "resume-local") {
        return {
          state,
          editMode: currentActive,
          dismissRefine: false,
          blurActiveElement: false,
          consumeEscape: false,
        };
      }
      return {
        state: INITIAL_RESUME_EDIT_SESSION_STATE,
        editMode: false,
        dismissRefine: Boolean(event.refineFor),
        blurActiveElement: true,
        consumeEscape: false,
      };
    }

    case "escape": {
      if (event.refineFor) {
        return {
          state,
          editMode: isResumeEditMode(state, null),
          dismissRefine: true,
          blurActiveElement: false,
          consumeEscape: true,
        };
      }
      if (isResumeEditMode(state, null)) {
        return {
          state: INITIAL_RESUME_EDIT_SESSION_STATE,
          editMode: false,
          dismissRefine: false,
          blurActiveElement: true,
          consumeEscape: true,
        };
      }
      return {
        state,
        editMode: false,
        dismissRefine: false,
        blurActiveElement: false,
        consumeEscape: false,
      };
    }

    case "force-exit": {
      return {
        state: INITIAL_RESUME_EDIT_SESSION_STATE,
        editMode: false,
        dismissRefine: Boolean(refineFor),
        blurActiveElement: true,
        consumeEscape: false,
      };
    }
  }
}

export type UseResumeEditSessionArgs = {
  rootRef: RefObject<HTMLElement | null>;
  refineFor: string | null;
  dismissRefine: () => void;
  onEditModeChange?: (active: boolean) => void;
};

/**
 * Single focus, pointer, and Escape exit authority for {@link ResumeDraftSheet}.
 * Owns `lineEditing`, `toolbarFocusHold`, and `editMode` for both the desktop
 * draft dialog and Chrome extension sidepanel.
 */
export function useResumeEditSession({
  rootRef,
  refineFor,
  dismissRefine,
  onEditModeChange,
}: UseResumeEditSessionArgs) {
  const [state, setState] = useState<ResumeEditSessionState>(
    INITIAL_RESUME_EDIT_SESSION_STATE
  );
  const stateRef = useRef<ResumeEditSessionState>(
    INITIAL_RESUME_EDIT_SESSION_STATE
  );
  const refineForRef = useRef<string | null>(refineFor);
  const dismissRefineRef = useRef(dismissRefine);
  const hopRafRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    refineForRef.current = refineFor;
    dismissRefineRef.current = dismissRefine;
  }, [dismissRefine, refineFor]);

  const cancelHopRaf = useCallback(() => {
    if (hopRafRef.current !== null) {
      window.cancelAnimationFrame(hopRafRef.current);
      hopRafRef.current = null;
    }
  }, []);

  const blurActiveInSession = useCallback(() => {
    const root = rootRef.current;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return;
    if (
      root?.contains(active) ||
      Boolean(active.closest("[data-resume-toolbar-portal]")) ||
      Boolean(active.closest("[data-resume-line-toolbar]"))
    ) {
      active.blur();
    }
  }, [rootRef]);

  const commitState = useCallback((next: ResumeEditSessionState) => {
    const prev = stateRef.current;
    if (
      prev.lineEditing === next.lineEditing &&
      prev.toolbarFocusHold === next.toolbarFocusHold
    ) {
      return;
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const applyTransition = useCallback(
    (event: ResumeEditSessionEvent): ResumeEditSessionTransition => {
      const transition = reduceResumeEditSession(
        stateRef.current,
        refineForRef.current,
        event
      );
      commitState(transition.state);
      if (transition.dismissRefine) {
        refineForRef.current = null;
        dismissRefineRef.current();
      }
      if (transition.blurActiveElement) {
        blurActiveInSession();
      }
      return transition;
    },
    [blurActiveInSession, commitState]
  );

  const scheduleFocusVerifyRaf = useCallback(() => {
    cancelHopRaf();
    hopRafRef.current = window.requestAnimationFrame(() => {
      hopRafRef.current = null;
      const root = rootRef.current;
      const active = document.activeElement;
      const activeClass = classifyResumeEditTarget(active, root);
      const inAceRefine =
        active instanceof Element &&
        Boolean(active.closest("[data-resume-ace-refine]"));
      applyTransition({
        type: "focusout-settled",
        activeClass,
        inAceRefine,
      });
    });
  }, [applyTransition, cancelHopRaf, rootRef]);

  const exitEditSession = useCallback(() => {
    cancelHopRaf();
    applyTransition({ type: "force-exit" });
  }, [applyTransition, cancelHopRaf]);

  const editMode = isResumeEditMode(state, refineFor);

  useEffect(() => {
    onEditModeChange?.(editMode);
  }, [editMode, onEditModeChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onFocusIn = (event: FocusEvent) => {
      cancelHopRaf();
      const targetClass = classifyResumeEditTarget(event.target, root);
      const inAceRefine =
        event.target instanceof Element &&
        Boolean(event.target.closest("[data-resume-ace-refine]"));
      applyTransition({
        type: "focusin",
        targetClass,
        inAceRefine,
      });
    };

    const onFocusOut = () => {
      if (!isResumeEditMode(stateRef.current, refineForRef.current)) return;
      scheduleFocusVerifyRaf();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancelHopRaf();
      const transition = applyTransition({
        type: "escape",
        refineFor: refineForRef.current,
      });
      if (transition.consumeEscape) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("keydown", onKeyDown, true);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("keydown", onKeyDown, true);
    };
  }, [applyTransition, cancelHopRaf, rootRef, scheduleFocusVerifyRaf]);

  // Reconcile focusout from body-portaled toolbar menus back to Preview if left without a click.
  useEffect(() => {
    if (!state.toolbarFocusHold) return;
    const onDocumentFocusOut = (event: FocusEvent) => {
      const root = rootRef.current;
      if (event.target instanceof Node && root?.contains(event.target)) return;
      scheduleFocusVerifyRaf();
    };
    document.addEventListener("focusout", onDocumentFocusOut);
    return () => document.removeEventListener("focusout", onDocumentFocusOut);
  }, [rootRef, scheduleFocusVerifyRaf, state.toolbarFocusHold]);

  // Single document capture pointerdown authority across resume canvas, portals, and outer chrome.
  useEffect(() => {
    if (!editMode) return;
    const onPointerDownCapture = (event: PointerEvent) => {
      const root = rootRef.current;
      const targetClass = classifyResumeEditTarget(event.target, root, {
        x: event.clientX,
        y: event.clientY,
      });
      if (
        targetClass === "resume-other" ||
        targetClass === "external" ||
        targetClass === "detached"
      ) {
        cancelHopRaf();
      }
      const transition = applyTransition({
        type: "pointerdown",
        targetClass,
        refineFor: refineForRef.current,
      });
      if (targetClass === "editable" && transition.dismissRefine) {
        scheduleFocusVerifyRaf();
      }
    };
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
  }, [applyTransition, cancelHopRaf, editMode, rootRef, scheduleFocusVerifyRaf]);

  useEffect(() => () => cancelHopRaf(), [cancelHopRaf]);

  return {
    lineEditing: state.lineEditing,
    toolbarFocusHold: state.toolbarFocusHold,
    editMode,
    exitEditSession,
  };
}
