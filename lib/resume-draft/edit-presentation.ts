/**
 * Pure helpers for resume zoom choice, target classification, and
 * screen-anchor resolution. Hermetic — no live DOM.
 */

/** Preset chips + freeform (pinch / percent field). */
export type ResumeDraftZoomChoice = "fit" | "1" | "1.25" | "custom";

/** Preset rail options only — `"custom"` means no chip selected. */
export const RESUME_ZOOM_PRESET_CHOICES = ["fit", "1", "1.25"] as const;

export type ResumeDraftZoomPreset = (typeof RESUME_ZOOM_PRESET_CHOICES)[number];

export const RESUME_ZOOM_MIN = 0.25;
export const RESUME_ZOOM_MAX = 3;
/** Percent steppers / typed field step (1%). */
export const RESUME_ZOOM_PERCENT_STEP = 1;

export type ResumeEditScreenPoint = { x: number; y: number };

export type ResumeEditRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Clamp presentation scale into the supported zoom range.
 */
export function clampResumeZoom(scale: number): number {
  if (!Number.isFinite(scale)) return RESUME_ZOOM_MIN;
  return Math.min(RESUME_ZOOM_MAX, Math.max(RESUME_ZOOM_MIN, scale));
}

/**
 * Scale from choice. Fit → live fitScale; custom → manualScale; else chip ratio.
 */
export function resumeBaseZoom(
  zoomChoice: ResumeDraftZoomChoice,
  fitScale: number,
  manualScale = 1
): number {
  if (zoomChoice === "fit") return fitScale;
  if (zoomChoice === "custom") return clampResumeZoom(manualScale);
  return Number(zoomChoice);
}

/**
 * Presentation zoom — mirrors {@link resumeBaseZoom}.
 * `editActive` is retained for call-site compatibility and ignored.
 */
export function resumeEffectiveZoom(
  zoomChoice: ResumeDraftZoomChoice,
  fitScale: number,
  _editActive: boolean,
  manualScale = 1
): number {
  return resumeBaseZoom(zoomChoice, fitScale, manualScale);
}

/** Whole-percent display for the zoom field (tracks live scale). */
export function resumeZoomPercent(scale: number): number {
  return Math.round(clampResumeZoom(scale) * 100);
}

/**
 * Segmented control: presets highlight themselves; custom leaves none active.
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