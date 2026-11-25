/**
 * Pure helpers for resume edit-mode zoom floor, target classification, and
 * screen-anchor resolution. Hermetic — zoom/classifier/anchor math need no live DOM.
 */

export type ResumeDraftZoomChoice = "fit" | "0.85" | "1" | "1.25";

/** Edit-mode scale floor (100%). */
export const RESUME_EDIT_ZOOM_FLOOR = 1;

/** Pin settle budget while zoom/split + CSS scale transition settle (ms). */
export const RESUME_EDIT_PIN_SETTLE_MS = 320;

/** Stable-frame epsilon (CSS px) before declaring the pin settled. */
export const RESUME_EDIT_PIN_STABLE_PX = 1;

export type ResumeEditScreenPoint = { x: number; y: number };

export type ResumeEditRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Base scale from the user's stored choice (Fit uses live fitScale).
 */
export function resumeBaseZoom(
  zoomChoice: ResumeDraftZoomChoice,
  fitScale: number
): number {
  return zoomChoice === "fit" ? fitScale : Number(zoomChoice);
}

/**
 * While editing, floor at 100% so we zoom past a small Fit into the click.
 * Stored choice / toolbar chip are never mutated — presentation only.
 */
export function resumeEffectiveZoom(
  zoomChoice: ResumeDraftZoomChoice,
  fitScale: number,
  editActive: boolean
): number {
  const base = resumeBaseZoom(zoomChoice, fitScale);
  return editActive ? Math.max(base, RESUME_EDIT_ZOOM_FLOOR) : base;
}

/**
 * PDF.js-style scroll delta so the screen point under the cursor stays put
 * when scale changes about `origin-top-left`.
 */
export function scrollDeltaForZoomAroundPoint(args: {
  oldZoom: number;
  newZoom: number;
  /** Click X relative to the scroller's client left. */
  anchorXInScroller: number;
  /** Click Y relative to the scroller's client top. */
  anchorYInScroller: number;
}): { dx: number; dy: number } {
  const { oldZoom, newZoom, anchorXInScroller, anchorYInScroller } = args;
  if (oldZoom <= 0 || Math.abs(newZoom - oldZoom) < 1e-9) {
    return { dx: 0, dy: 0 };
  }
  const factor = newZoom / oldZoom - 1;
  return {
    dx: anchorXInScroller * factor,
    dy: anchorYInScroller * factor,
  };
}

/**
 * Segmented control always mirrors the user's stored choice.
 * Edit-mode floor is presentation-only — never hops the chip to 100%.
 */
export function resumeDisplayZoomChoice(
  zoomChoice: ResumeDraftZoomChoice,
  _fitScale: number,
  _editActive: boolean
): ResumeDraftZoomChoice {
  return zoomChoice;
}

export type ResumeEditTargetClass =
  | "editable"
  | "resume-local"
  | "resume-other"
  | "external"
  | "detached";

/** DOM-free probe for {@link classifyResumeEditProbe} hermetic tests. */
export type ResumeEditTargetProbe = {
  isResumeLocal: boolean;
  /** Target sits inside a `[data-resume-line]` that belongs to the resume root. */
  inResumeLine: boolean;
  /** Target itself is / is nested under contenteditable. */
  isContentEditablePath: boolean;
  /** The line host contains a contenteditable (e.g. skills label + text). */
  lineHasContentEditable: boolean;
  /** Target is inside the resume draft root (canvas whitespace, padding, …). */
  insideResumeRoot: boolean;
};

/**
 * Pure classifier — no DOM. Used by {@link classifyResumeEditTarget} and tests.
 */
export function classifyResumeEditProbe(
  probe: ResumeEditTargetProbe | null,
  hasResumeRoot: boolean
): ResumeEditTargetClass {
  if (!hasResumeRoot) return "detached";
  if (!probe) return "external";
  if (probe.isResumeLocal) return "resume-local";
  if (probe.inResumeLine) {
    if (probe.isContentEditablePath || probe.lineHasContentEditable) {
      return "editable";
    }
    return "resume-other";
  }
  if (probe.insideResumeRoot) return "resume-other";
  return "external";
}

/**
 * Classify a DOM target for edit-mode enter/stay/exit.
 * `resumeRoot` is `[data-resume-draft-root]`; null ⇒ detached context.
 */
export function classifyResumeEditTarget(
  target: EventTarget | null,
  resumeRoot: Element | null
): ResumeEditTargetClass {
  if (!resumeRoot) return "detached";
  if (!(target instanceof Element)) {
    return classifyResumeEditProbe(null, true);
  }

  const isResumeLocal = Boolean(
    target.closest("[data-resume-line-toolbar]") ||
      target.closest("[data-resume-ace-refine]") ||
      target.closest("[data-resume-toolbar]")
  );
  const line = target.closest("[data-resume-line]");
  const inResumeLine = Boolean(line && resumeRoot.contains(line));
  const isContentEditablePath = Boolean(
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.getAttribute("contenteditable") === "true")) ||
      target.closest("[contenteditable='true']")
  );
  const lineHasContentEditable = Boolean(
    line?.querySelector("[contenteditable='true']")
  );

  return classifyResumeEditProbe(
    {
      isResumeLocal,
      inResumeLine,
      isContentEditablePath,
      lineHasContentEditable,
      insideResumeRoot: resumeRoot.contains(target),
    },
    true
  );
}

/**
 * Skills wrap a bold label + contenteditable in one hover target — chrome and
 * pin must measure the editable text, not the label.
 */
export function resolveEditableMeasureTarget(args: {
  hostIsContentEditable: boolean;
  hasInnerContentEditable: boolean;
}): "host" | "inner" {
  if (args.hostIsContentEditable) return "host";
  if (args.hasInnerContentEditable) return "inner";
  return "host";
}

/**
 * Screen point to keep stable across Fit zoom + pane grow.
 * Prefer caret when present and non-empty; else first-line center.
 */
export function resolveEditScreenAnchor(args: {
  caret: ResumeEditRect | null;
  firstLine: ResumeEditRect;
}): ResumeEditScreenPoint {
  const { caret, firstLine } = args;
  if (caret && (caret.height > 0 || caret.width > 0)) {
    return {
      x: caret.x + caret.width / 2,
      y: caret.y + caret.height / 2,
    };
  }
  return {
    x: firstLine.x + firstLine.width / 2,
    y: firstLine.y + firstLine.height / 2,
  };
}

/**
 * First client rect when the editable wraps; otherwise the full box.
 * Pure — callers pass already-measured rects.
 */
export function resolveEditableAnchorRect(args: {
  clientRects: readonly ResumeEditRect[];
  boundingRect: ResumeEditRect;
}): ResumeEditRect {
  if (args.clientRects.length === 0) return args.boundingRect;
  return args.clientRects[0];
}