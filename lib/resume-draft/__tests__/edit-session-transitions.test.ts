import { describe, expect, it } from "vitest";

import {
  INITIAL_RESUME_EDIT_SESSION_STATE,
  isResumeEditMode,
  reduceResumeEditSession,
} from "@/hooks/use-resume-edit-session";

describe("reduceResumeEditSession", () => {
  it("keeps Preview inactive when focusing resume-local toolbar controls cold", () => {
    const step = reduceResumeEditSession(
      INITIAL_RESUME_EDIT_SESSION_STATE,
      null,
      { type: "focusin", targetClass: "resume-local" }
    );

    expect(step.state).toEqual({ lineEditing: false, toolbarFocusHold: false });
    expect(step.editMode).toBe(false);
    expect(step.blurActiveElement).toBe(false);
  });

  it("enters EditingText on editable focus and preserves session across Hop A -> B", () => {
    const enter = reduceResumeEditSession(
      INITIAL_RESUME_EDIT_SESSION_STATE,
      null,
      { type: "focusin", targetClass: "editable" }
    );
    expect(enter.state).toEqual({ lineEditing: true, toolbarFocusHold: false });
    expect(enter.editMode).toBe(true);

    const hopClick = reduceResumeEditSession(enter.state, null, {
      type: "pointerdown",
      targetClass: "editable",
      refineFor: null,
    });
    expect(hopClick.editMode).toBe(true);
    expect(hopClick.blurActiveElement).toBe(false);

    const hopSettle = reduceResumeEditSession(hopClick.state, null, {
      type: "focusout-settled",
      activeClass: "editable",
    });
    expect(hopSettle.state).toEqual({
      lineEditing: true,
      toolbarFocusHold: false,
    });
    expect(hopSettle.editMode).toBe(true);
  });

  it("transitions EditingText -> ToolbarHold on toolbar focus and exits cleanly without getting stuck", () => {
    const editing = reduceResumeEditSession(
      INITIAL_RESUME_EDIT_SESSION_STATE,
      null,
      { type: "focusin", targetClass: "editable" }
    );

    const hold = reduceResumeEditSession(editing.state, null, {
      type: "focusin",
      targetClass: "resume-local",
      inAceRefine: false,
    });
    expect(hold.state).toEqual({ lineEditing: false, toolbarFocusHold: true });
    expect(hold.editMode).toBe(true);

    const exitOnMargin = reduceResumeEditSession(hold.state, null, {
      type: "pointerdown",
      targetClass: "resume-other",
      refineFor: null,
    });
    expect(exitOnMargin.state).toEqual(INITIAL_RESUME_EDIT_SESSION_STATE);
    expect(exitOnMargin.editMode).toBe(false);
    expect(exitOnMargin.blurActiveElement).toBe(true);
  });

  it("exits synchronously on resume-other and external pointerdowns and allows immediate re-entry (F3b regression)", () => {
    const editing = reduceResumeEditSession(
      INITIAL_RESUME_EDIT_SESSION_STATE,
      null,
      { type: "focusin", targetClass: "editable" }
    );

    for (const exitTarget of ["resume-other", "external", "detached"] as const) {
      const exited = reduceResumeEditSession(editing.state, null, {
        type: "pointerdown",
        targetClass: exitTarget,
        refineFor: null,
      });
      expect(exited.state).toEqual(INITIAL_RESUME_EDIT_SESSION_STATE);
      expect(exited.editMode).toBe(false);
      expect(exited.blurActiveElement).toBe(true);

      // Immediate re-entry on next editable click/Tab must never be swallowed.
      const reentered = reduceResumeEditSession(exited.state, null, {
        type: "focusin",
        targetClass: "editable",
      });
      expect(reentered.state).toEqual({
        lineEditing: true,
        toolbarFocusHold: false,
      });
      expect(reentered.editMode).toBe(true);
    }
  });

  it("keeps RefiningLine open when clicking toolbar zoom presets (F6 regression)", () => {
    const refineNodeId = "node-bullet-1";
    expect(
      isResumeEditMode(INITIAL_RESUME_EDIT_SESSION_STATE, refineNodeId)
    ).toBe(true);

    const focusRefineInput = reduceResumeEditSession(
      INITIAL_RESUME_EDIT_SESSION_STATE,
      refineNodeId,
      {
        type: "focusin",
        targetClass: "resume-local",
        inAceRefine: true,
      }
    );
    expect(focusRefineInput.state).toEqual({
      lineEditing: false,
      toolbarFocusHold: false,
    });
    expect(focusRefineInput.editMode).toBe(true);

    const clickZoomPreset = reduceResumeEditSession(
      focusRefineInput.state,
      refineNodeId,
      {
        type: "pointerdown",
        targetClass: "resume-local",
        refineFor: refineNodeId,
      }
    );
    expect(clickZoomPreset.dismissRefine).toBe(false);
    expect(clickZoomPreset.editMode).toBe(true);
    expect(clickZoomPreset.blurActiveElement).toBe(false);
  });

  it("handles Escape cleanly across RefiningLine, EditingText, and Preview", () => {
    const refineNodeId = "node-1";

    // Opened refine from Preview -> 1st Escape dismisses refine and returns to Preview.
    const refineInputState = reduceResumeEditSession(
      INITIAL_RESUME_EDIT_SESSION_STATE,
      refineNodeId,
      { type: "focusin", targetClass: "resume-local", inAceRefine: true }
    ).state;

    const firstEscapeFromPreviewRefine = reduceResumeEditSession(
      refineInputState,
      refineNodeId,
      { type: "escape", refineFor: refineNodeId }
    );
    expect(firstEscapeFromPreviewRefine.dismissRefine).toBe(true);
    expect(firstEscapeFromPreviewRefine.editMode).toBe(false);
    expect(firstEscapeFromPreviewRefine.consumeEscape).toBe(true);

    // If a line still holds focus while refine is open: 1st Escape closes refine, 2nd exits line edit.
    const lineAndRefine = { lineEditing: true, toolbarFocusHold: false };
    const firstEscape = reduceResumeEditSession(lineAndRefine, refineNodeId, {
      type: "escape",
      refineFor: refineNodeId,
    });
    expect(firstEscape.dismissRefine).toBe(true);
    expect(firstEscape.editMode).toBe(true);
    expect(firstEscape.consumeEscape).toBe(true);

    const secondEscape = reduceResumeEditSession(firstEscape.state, null, {
      type: "escape",
      refineFor: null,
    });
    expect(secondEscape.editMode).toBe(false);
    expect(secondEscape.blurActiveElement).toBe(true);
    expect(secondEscape.consumeEscape).toBe(true);

    // Cold Preview does not consume Escape so parent dialog can close.
    const previewEscape = reduceResumeEditSession(
      secondEscape.state,
      null,
      { type: "escape", refineFor: null }
    );
    expect(previewEscape.consumeEscape).toBe(false);
  });

  it("bridges RefiningLine -> EditingText without pulsing editMode false when clicking editable text", () => {
    const refineNodeId = "node-1";
    const step = reduceResumeEditSession(
      INITIAL_RESUME_EDIT_SESSION_STATE,
      refineNodeId,
      {
        type: "pointerdown",
        targetClass: "editable",
        refineFor: refineNodeId,
      }
    );
    expect(step.dismissRefine).toBe(true);
    expect(step.editMode).toBe(true);
    expect(step.state.lineEditing).toBe(true);
  });
});
