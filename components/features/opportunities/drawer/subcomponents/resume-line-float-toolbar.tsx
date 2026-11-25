"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  WandSparkles,
} from "lucide-react";

import {
  TOOLBAR_TOOL_CLUSTER_BTN_CLASSNAME,
} from "@/components/ui/composites/toolbar-tool-cluster";
import { BRAND_SELECTION_GLOW_CLASSNAME } from "@/components/ui/styles/brand-selection";
import { cn } from "@/lib/utils";

/** Floating cluster height (`h-8` = 32px) — keep in sync with the portal. */
const CHIP_H = 32;
/** Approx cluster width for centering (± | ↑↓ | Refine). */
const CHIP_W = 140;
/** Clear air between chip and line box (no glyph overlap). */
const CHIP_GAP = 6;
const VIEWPORT_PAD = 8;

export type ResumeLineFloatAnchor = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type ResumeLineFloatMeta = {
  label: string;
  included: boolean;
};

/**
 * Bottom edge of the sheet's fixed resume toolbar (+ gap).
 * Float is portaled to `document.body` at a high z-index, so placement — not
 * stacking — must keep it from covering this chrome on scroll.
 */
function resumeSheetToolbarFloor(): number {
  if (typeof document === "undefined") return VIEWPORT_PAD;
  let floor = VIEWPORT_PAD;
  for (const el of document.querySelectorAll("[data-resume-toolbar]")) {
    if (!(el instanceof HTMLElement)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    floor = Math.max(floor, rect.bottom + CHIP_GAP);
  }
  return floor;
}

/**
 * Visible canvas scrollport — body-portaled float must stay inside this clip
 * or it paints over the email pane / dialog chrome when lines scroll away.
 */
function resumeCanvasClipRect(): DOMRect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector("[data-resume-canvas-viewport]");
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

function rectsIntersect(
  a: { top: number; left: number; width: number; height: number },
  b: DOMRect
): boolean {
  return (
    a.top + a.height > b.top &&
    a.top < b.bottom &&
    a.left + a.width > b.left &&
    a.left < b.right
  );
}

/**
 * Center above the first-line box; flip below when there is no room.
 * Hide when the line leaves the canvas pane or sits under the fixed toolbar.
 */
export function placeLineToolbar(
  anchor: ResumeLineFloatAnchor
): { top: number; left: number } | null {
  const windowW =
    typeof window !== "undefined" ? window.innerWidth : anchor.left + CHIP_W;
  const windowH =
    typeof window !== "undefined" ? window.innerHeight : anchor.top + CHIP_H;
  const clip = resumeCanvasClipRect();

  // Line scrolled out of the resume canvas — don't float over sibling panes.
  if (clip && !rectsIntersect(anchor, clip)) return null;

  const minTop = Math.max(
    resumeSheetToolbarFloor(),
    clip ? clip.top + VIEWPORT_PAD : VIEWPORT_PAD
  );
  const maxBottom = clip
    ? clip.bottom - VIEWPORT_PAD
    : windowH - VIEWPORT_PAD;
  const minLeft = clip ? clip.left + VIEWPORT_PAD : VIEWPORT_PAD;
  const maxRight = clip ? clip.right - VIEWPORT_PAD : windowW - VIEWPORT_PAD;

  // Line fully under the fixed chrome / above the clip — hide.
  if (anchor.top + anchor.height <= minTop) return null;
  if (anchor.top >= maxBottom) return null;

  const aboveTop = anchor.top - CHIP_H - CHIP_GAP;
  const belowTop = anchor.top + anchor.height + CHIP_GAP;
  let top =
    aboveTop >= minTop
      ? aboveTop
      : Math.min(belowTop, maxBottom - CHIP_H);
  if (top < minTop) top = minTop;
  if (top + CHIP_H > maxBottom) return null;

  const idealLeft = anchor.left + anchor.width / 2 - CHIP_W / 2;
  const left = Math.min(
    Math.max(minLeft, idealLeft),
    Math.max(minLeft, maxRight - CHIP_W)
  );
  return { top, left };
}

function ToolbarIcon({
  disabled,
  label,
  onClick,
  children,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      // Keep contenteditable focus until click — otherwise blur kills the float.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(TOOLBAR_TOOL_CLUSTER_BTN_CLASSNAME, "cursor-pointer")}
    >
      {children}
    </button>
  );
}

function FloatDivider() {
  return (
    <span
      aria-hidden
      className="mx-0.5 h-3.5 w-px shrink-0 self-center bg-border/70"
    />
  );
}

/**
 * Body-portaled ± / move / Ace chip for the active resume line.
 */
export function ResumeLineFloatToolbar({
  activeId,
  anchor,
  meta,
  disabled,
  refining = false,
  onToggle,
  onMove,
  onRefineOpen,
  onPointerEnter,
  onPointerLeave,
}: {
  activeId: string;
  anchor: ResumeLineFloatAnchor;
  meta: ResumeLineFloatMeta | null;
  disabled?: boolean;
  /** True while Ace line refine is open for `activeId`. */
  refining?: boolean;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefineOpen: (nodeId: string) => void;
  onPointerEnter: () => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  if (typeof document === "undefined") return null;
  const placed = placeLineToolbar(anchor);
  if (!placed) return null;

  const included = meta?.included ?? true;
  const label = meta?.label ?? "line";

  return createPortal(
    <div
      data-resume-line-toolbar=""
      tabIndex={-1}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="pointer-events-auto fixed z-[200] outline-none"
      style={{ top: placed.top, left: placed.left }}
    >
      <div
        role="toolbar"
        aria-label={`${label} actions`}
        className={cn(
          "inline-flex h-8 shrink-0 cursor-default items-center overflow-hidden rounded-lg border border-border bg-[hsl(var(--tab-rail-light))] shadow-sm",
          "animate-in fade-in-0 zoom-in-95 duration-100"
        )}
      >
        <div className="inline-flex h-full items-center gap-1 px-1">
          <ToolbarIcon
            disabled={disabled}
            label={
              included
                ? `Exclude ${label} from export`
                : `Include ${label} in export`
            }
            onClick={() => onToggle(activeId, !included)}
          >
            {included ? (
              <Minus aria-hidden />
            ) : (
              <Plus aria-hidden />
            )}
          </ToolbarIcon>
          <FloatDivider />
          <ToolbarIcon
            disabled={disabled}
            label={`Move ${label} up`}
            onClick={() => onMove(activeId, "up")}
          >
            <ChevronUp aria-hidden />
          </ToolbarIcon>
          <ToolbarIcon
            disabled={disabled}
            label={`Move ${label} down`}
            onClick={() => onMove(activeId, "down")}
          >
            <ChevronDown aria-hidden />
          </ToolbarIcon>
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={refining}
          aria-label={refining ? `Cancel refine ${label}` : `Refine ${label}`}
          title={refining ? `Cancel refine ${label}` : `Refine ${label}`}
          // Keep contenteditable focus until click — otherwise blur kills the float.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onRefineOpen(activeId)}
          className={cn(
            "inline-flex h-full w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-l border-border bg-card text-foreground",
            "transition-all duration-150 ease-apple-snappy motion-safe:active:scale-[0.98]",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-40",
            "[&_svg]:size-3.5",
            refining && cn("bg-accent text-brand hover:bg-accent hover:text-brand", BRAND_SELECTION_GLOW_CLASSNAME)
          )}
        >
          <WandSparkles aria-hidden />
        </button>
      </div>
    </div>,
    document.body
  );
}
