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

/**
 * First edit-entry camera target (125%). Applied as `"custom"` via
 * `applyManualZoom` so Fit/100/125 chips stay honest.
 */
export const RESUME_EDIT_ENTRY_ZOOM = 1.25;

/** rAF entry lerp duration (ms) — scale + scroll together. */
export const RESUME_EDIT_ENTRY_LERP_MS = 220;

export type ResumeEditScreenPoint = { x: number; y: number };

/** Unscaled page-space point under `transform-origin: 0 0`. */
export type ResumeEditPageLocal = { x: number; y: number };

export type ResumeEditScroll = { scrollLeft: number; scrollTop: number };

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

/**
 * Extra px around glyph client-rects for edit hit-testing (hover / click).
 * Matches the float highlight geometry with a little aim forgiveness.
 */
export const RESUME_EDIT_TEXT_HIT_PAD_PX = 6;

/** DOM-free probe for {@link classifyResumeEditProbe} hermetic tests. */
export type ResumeEditTargetProbe = {
  isResumeLocal: boolean;
  /** Target sits inside a `[data-resume-line]` that belongs to the resume root. */
  inResumeLine: boolean;
  /** Target itself is / is nested under contenteditable. */
  isContentEditablePath: boolean;
  /** The line host contains a contenteditable (e.g. skills label + text). */
  lineHasContentEditable: boolean;
  /**
   * Pointer is within padded editable glyph rects.
   * `null` when no pointer (focus path) — do not infer from the line box alone.
   */
  nearEditableText: boolean | null;
  /** Target is inside the resume draft root (canvas whitespace, padding, …). */
  insideResumeRoot: boolean;
};

/**
 * True when `point` lies inside any rect expanded by `padPx`.
 */
export function pointHitsPaddedRects(
  point: ResumeEditScreenPoint,
  rects: readonly ResumeEditRect[],
  padPx: number
): boolean {
  for (const rect of rects) {
    if (rect.width <= 0 && rect.height <= 0) continue;
    if (
      point.x >= rect.x - padPx &&
      point.x <= rect.x + rect.width + padPx &&
      point.y >= rect.y - padPx &&
      point.y <= rect.y + rect.height + padPx
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Pure classifier — no DOM. Used by {@link classifyResumeEditTarget} and tests.
 *
 * Edit hits must be on/near glyph boxes (or a focused contenteditable path
 * without a pointer). Same-row whitespace on a full-width line host is
 * `resume-other`, not `editable`.
 */
export function classifyResumeEditProbe(
  probe: ResumeEditTargetProbe | null,
  hasResumeRoot: boolean
): ResumeEditTargetClass {
  if (!hasResumeRoot) return "detached";
  if (!probe) return "external";
  if (probe.isResumeLocal) return "resume-local";
  if (probe.inResumeLine) {
    if (probe.nearEditableText === true) return "editable";
    if (probe.nearEditableText === false) return "resume-other";
    // Focus / keyboard: only the contenteditable path counts — not the row box.
    if (probe.isContentEditablePath) return "editable";
    return "resume-other";
  }
  if (probe.insideResumeRoot) return "resume-other";
  return "external";
}

/**
 * Classify a DOM target for edit-mode enter/stay/exit.
 * `resumeRoot` is `[data-resume-draft-root]`; null ⇒ detached context.
 * Pass `point` on pointer events so same-row whitespace is not treated as text.
 */
export function classifyResumeEditTarget(
  target: EventTarget | null,
  resumeRoot: Element | null,
  point?: ResumeEditScreenPoint | null
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

  let nearEditableText: boolean | null = null;
  if (point && inResumeLine && line instanceof HTMLElement) {
    nearEditableText = pointNearEditableLineText(
      line,
      point,
      RESUME_EDIT_TEXT_HIT_PAD_PX
    );
  }

  return classifyResumeEditProbe(
    {
      isResumeLocal,
      inResumeLine,
      isContentEditablePath,
      lineHasContentEditable,
      nearEditableText,
      insideResumeRoot: resumeRoot.contains(target),
    },
    true
  );
}

/**
 * Hit-test against the same glyph client-rects the float highlight uses.
 * `line` is a `[data-resume-line]` host (or the contenteditable itself).
 */
export function pointNearEditableLineText(
  line: HTMLElement,
  point: ResumeEditScreenPoint,
  padPx: number = RESUME_EDIT_TEXT_HIT_PAD_PX
): boolean {
  const editable = resolveLineEditableElement(line);
  if (!editable) return false;
  const rects = Array.from(editable.getClientRects()).map((r) => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
  }));
  if (rects.length === 0) {
    const b = editable.getBoundingClientRect();
    rects.push({ x: b.x, y: b.y, width: b.width, height: b.height });
  }
  return pointHitsPaddedRects(point, rects, padPx);
}

function resolveLineEditableElement(line: HTMLElement): HTMLElement | null {
  if (
    line.isContentEditable ||
    line.getAttribute("contenteditable") === "true"
  ) {
    return line;
  }
  const inner = line.querySelector("[contenteditable='true']");
  return inner instanceof HTMLElement ? inner : null;
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

/**
 * Linear interpolate scalar `a → b` by `t` in `[0, 1]` (clamped).
 */
export function lerp(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return a + (b - a) * u;
}

/**
 * Apple-snappy ease (`cubic-bezier(0.25, 1, 0.5, 1)`) sampled for rAF lerps.
 * Approximate closed form — not a full Bezier solver.
 */
export function easeAppleSnappy(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  // 1 - (1-t)^3 closely matches the snappy ease for UI camera moves.
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

/**
 * Screen → page-local under `transform-origin: 0 0`.
 * `pagesOrigin` is the live `[data-resume-pages]` getBoundingClientRect origin.
 */
export function screenToPageLocal(
  screen: ResumeEditScreenPoint,
  pagesOrigin: ResumeEditScreenPoint,
  scale: number
): ResumeEditPageLocal {
  const s = scale === 0 || !Number.isFinite(scale) ? 1 : scale;
  return {
    x: (screen.x - pagesOrigin.x) / s,
    y: (screen.y - pagesOrigin.y) / s,
  };
}

/**
 * Page-local → screen under `transform-origin: 0 0` at the live pages origin.
 */
export function pageLocalToScreen(
  local: ResumeEditPageLocal,
  pagesOrigin: ResumeEditScreenPoint,
  scale: number
): ResumeEditScreenPoint {
  return {
    x: pagesOrigin.x + local.x * scale,
    y: pagesOrigin.y + local.y * scale,
  };
}

/**
 * Project a content-local point to screen given viewport geometry + scroll.
 *
 * Model (origin `0 0`):
 * `screen = viewportOrigin + pagesContentOrigin - scroll + contentLocal * scale`
 */
export function projectContentPointToScreen(args: {
  contentLocal: ResumeEditPageLocal;
  viewportOrigin: ResumeEditScreenPoint;
  /**
   * Pages origin inside the scrollable content at this scale
   * (`pagesRect - viewportRect + scroll`).
   */
  pagesContentOrigin: ResumeEditScreenPoint;
  scrollLeft: number;
  scrollTop: number;
  scale: number;
}): ResumeEditScreenPoint {
  const {
    contentLocal,
    viewportOrigin,
    pagesContentOrigin,
    scrollLeft,
    scrollTop,
    scale,
  } = args;
  return {
    x:
      viewportOrigin.x +
      pagesContentOrigin.x -
      scrollLeft +
      contentLocal.x * scale,
    y:
      viewportOrigin.y +
      pagesContentOrigin.y -
      scrollTop +
      contentLocal.y * scale,
  };
}

/**
 * Solve scroll so `contentLocal` lands under `mouseScreen` at `scale`.
 * Clamped to `[0, maxScroll*]`. Scroll only — no sheet margin residual.
 */
export function scrollForContentPointAtScreen(args: {
  contentLocal: ResumeEditPageLocal;
  mouseScreen: ResumeEditScreenPoint;
  viewportOrigin: ResumeEditScreenPoint;
  pagesContentOrigin: ResumeEditScreenPoint;
  scale: number;
  maxScrollLeft: number;
  maxScrollTop: number;
}): ResumeEditScroll {
  const {
    contentLocal,
    mouseScreen,
    viewportOrigin,
    pagesContentOrigin,
    scale,
    maxScrollLeft,
    maxScrollTop,
  } = args;

  const rawLeft =
    viewportOrigin.x +
    pagesContentOrigin.x +
    contentLocal.x * scale -
    mouseScreen.x;
  const rawTop =
    viewportOrigin.y +
    pagesContentOrigin.y +
    contentLocal.y * scale -
    mouseScreen.y;

  const maxL = Math.max(0, maxScrollLeft);
  const maxT = Math.max(0, maxScrollTop);

  return {
    scrollLeft: Math.min(maxL, Math.max(0, rawLeft)),
    scrollTop: Math.min(maxT, Math.max(0, rawTop)),
  };
}