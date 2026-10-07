"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { CompanyLogo } from "@/components/ui/company-logo";
import {
  DND_GHOST_POINTER_GRACE_PX,
  DND_LERP_ALPHA,
} from "@/lib/dnd/constants";
import { type DragGrabGeometry } from "@/lib/dnd/drag-smooth";
import { clutterScoreTier } from "@/lib/subscriptions/filters";
import { cn } from "@/lib/utils";

export type DragGhostStackItem = {
  name: string;
  logoSrc: string | null;
  subtitle?: string | null;
  /** Origin clutter (subscriptions) or match score (jobs), 0–100. */
  score?: number | null;
  scoreKind?: "clutter" | "match";
  /** When set, show a gray metric dot (email volume stand-in). */
  emailCount?: number | null;
  /** When set, show a gray metric dot (last-received stand-in). */
  lastReceivedLabel?: string | null;
  /** Inert empty button shapes mirroring secondary / primary CTAs. */
  actions?: readonly ("snapshot" | "unsubscribe")[];
};

/** Fallback / max estimate until the front face is measured (content-hug). */
const STACK_CARD_W_FALLBACK = 360;
/** Match measured in-list chip height (logo sm + py-2 + optional count line). */
const STACK_CARD_H = 52;
/** Vertical peek per depth — smaller = tighter stack / less vertical spread. */
const STACK_PEEK_Y = 6;
const STACK_DEPTH_SCALE = 0.06;
const STACK_MAX_LAYERS = 3;
/** Extra dim per depth so backs read as shadowed under the front card. */
const STACK_DEPTH_DIM = 0.12;
/** Cool blue-slate shade for depth (not warm/neutral black). */
const STACK_DEPTH_SHADE = "hsl(215 42% 16%)";
const STACK_COOL_SHADOW =
  "0 4px 16px -3px hsl(210 55% 22% / 0.4), 0 2px 6px -2px hsl(205 60% 32% / 0.3)";
const STACK_COOL_SHADOW_FRONT =
  "0 8px 24px -4px hsl(210 58% 18% / 0.45), 0 3px 10px -3px hsl(205 62% 30% / 0.34)";

const TRIAGE_CARD_SURFACE =
  "rounded-xl border border-border/80 bg-card";

/** Solid clutter dots — same tier roles as subscription triage pills. */
const CLUTTER_DOT_CLASSES = {
  high: "bg-[#c21f10]",
  mid: "bg-[hsl(28_70%_48%)]",
  low: "bg-[#1ab5af]",
} as const;

const MATCH_DOT_CLASSES = {
  high: "bg-emerald-500",
  mid: "bg-amber-500",
  low: "bg-muted-foreground/50",
} as const;

function scoreDotClass(score: number, kind: "clutter" | "match"): string {
  const tier = clutterScoreTier(score);
  return kind === "clutter"
    ? CLUTTER_DOT_CLASSES[tier]
    : MATCH_DOT_CLASSES[tier];
}

/**
 * Horizontal triage-row face: identity | metric dots | CTA shapes.
 * Front height matches the in-list chip (sm logo / text-xs), not the full triage row.
 */
function StackPreviewFace({
  item,
  count,
  compact,
}: {
  item: DragGhostStackItem;
  count?: number;
  compact?: boolean;
}) {
  const score =
    typeof item.score === "number" && Number.isFinite(item.score)
      ? Math.round(item.score)
      : null;
  const scoreKind = item.scoreKind ?? "clutter";
  const showReceivedDot = Boolean(item.lastReceivedLabel);
  const showEmailDot = item.emailCount != null;
  const actions = item.actions ?? [];

  const showMetrics = showReceivedDot || showEmailDot || score != null;

  return (
    <div
      className={cn(
        "flex h-full min-w-0 items-center",
        compact ? "gap-2 px-2" : "gap-1.5 px-2.5"
      )}
    >
      {/* Zone 1 — identity; capped so metrics/CTAs sit slightly left of the far edge */}
      <div
        className={cn(
          "flex min-w-0 items-center gap-2",
          compact ? "flex-1" : "min-w-0 max-w-[10.5rem] shrink"
        )}
      >
        <CompanyLogo src={item.logoSrc} name={item.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            {item.name}
          </p>
          {!compact && count != null && count > 1 ? (
            <p className="text-[10px] font-semibold leading-none text-muted-foreground">
              {count} selected
            </p>
          ) : null}
        </div>
      </div>

      {/* Trailing cluster — separator + dots + CTAs (kept together, closer to identity) */}
      {!compact ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {showMetrics ? (
            <span
              className="h-5 w-px shrink-0 self-center bg-border/40"
              aria-hidden
            />
          ) : null}

          {showMetrics ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {showReceivedDot ? (
                <span
                  className="size-2 shrink-0 rounded-full bg-muted-foreground/35"
                  aria-hidden
                />
              ) : null}
              {showEmailDot ? (
                <span
                  className="size-2 shrink-0 rounded-full bg-muted-foreground/35"
                  aria-hidden
                />
              ) : null}
              {score != null ? (
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    scoreDotClass(score, scoreKind)
                  )}
                  aria-hidden
                />
              ) : null}
            </div>
          ) : null}

          {actions.length > 0 ? (
            <span
              className="h-5 w-px shrink-0 self-center bg-border/40"
              aria-hidden
            />
          ) : null}

          {actions.length > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {actions.includes("snapshot") ? (
                <span
                  className="h-5 w-14 shrink-0 rounded-md border border-border/70 bg-transparent"
                  aria-hidden
                />
              ) : null}
              {actions.includes("unsubscribe") ? (
                <span
                  className="h-5 w-14 shrink-0 rounded-md border border-[#181e26] bg-[#181e26]/85"
                  aria-hidden
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : showMetrics ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {showReceivedDot ? (
            <span
              className="size-2 shrink-0 rounded-full bg-muted-foreground/35"
              aria-hidden
            />
          ) : null}
          {showEmailDot ? (
            <span
              className="size-2 shrink-0 rounded-full bg-muted-foreground/35"
              aria-hidden
            />
          ) : null}
          {score != null ? (
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                scoreDotClass(score, scoreKind)
              )}
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Lightweight floating preview that follows the pointer during a card drag. */
export function DragGhost({
  active,
  pointerX,
  pointerY,
  grab,
  count,
  label,
  dropZone = null,
  pageFlipDir = null,
  outsideList = false,
  stackItems = [],
  className,
}: {
  active: boolean;
  pointerX: number;
  pointerY: number;
  grab: DragGrabGeometry | null;
  count: number;
  label?: ReactNode;
  dropZone?: string | null;
  pageFlipDir?: -1 | 1 | null;
  outsideList?: boolean;
  stackItems?: DragGhostStackItem[];
  className?: string;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const stackAnchorRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: pointerX, y: pointerY });
  const grabRef = useRef<DragGrabGeometry | null>(grab);
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const [stackWidth, setStackWidth] = useState(STACK_CARD_W_FALLBACK);

  pointerRef.current = { x: pointerX, y: pointerY };
  grabRef.current = grab;

  const stacking = active && (outsideList || Boolean(dropZone));

  // Hug front content width so the right edge meets the CTA stubs (name is capped).
  useLayoutEffect(() => {
    if (!active || !stacking) {
      setStackWidth(STACK_CARD_W_FALLBACK);
      return;
    }
    const el = stackAnchorRef.current;
    if (!el) return;
    const sync = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setStackWidth((prev) => (prev === w ? prev : w));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, stacking, count, stackItems, label]);

  useEffect(() => {
    if (!active) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const initial = grab ?? grabRef.current;
    grabRef.current = initial;
    currentRef.current = initial
      ? {
          x: initial.startLeft + initial.grabX,
          y: initial.startTop + initial.grabY,
        }
      : { x: pointerRef.current.x, y: pointerRef.current.y };

    const applyTransform = (x: number, y: number) => {
      const el = nodeRef.current;
      if (!el) return;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    applyTransform(currentRef.current.x, currentRef.current.y);

    const tick = () => {
      const el = nodeRef.current;
      if (!el) {
        rafRef.current = null;
        return;
      }

      const grace = DND_GHOST_POINTER_GRACE_PX;
      const targetX = pointerRef.current.x + grace;
      const targetY = pointerRef.current.y + grace;
      const cur = currentRef.current;
      cur.x += (targetX - cur.x) * DND_LERP_ALPHA;
      cur.y += (targetY - cur.y) * DND_LERP_ALPHA;

      if (Math.abs(targetX - cur.x) < 0.15) cur.x = targetX;
      if (Math.abs(targetY - cur.y) < 0.15) cur.y = targetY;

      applyTransform(cur.x, cur.y);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, grab]);

  if (!active) return null;

  const layerCount = Math.min(STACK_MAX_LAYERS, Math.max(1, count));
  const maxDepth = Math.max(0, layerCount - 1);
  const fallbackName = typeof label === "string" ? label : "Item";
  const items: DragGhostStackItem[] =
    stackItems.length > 0
      ? stackItems.slice(0, layerCount)
      : Array.from({ length: layerCount }, (_, i) => ({
          name: i === 0 ? fallbackName : `Item ${i + 1}`,
          logoSrc: null,
        }));
  const front = items[0] ?? {
    name: fallbackName,
    logoSrc: null,
  };
  const cardW = stacking ? stackWidth : STACK_CARD_W_FALLBACK;

  return (
    <div
      ref={nodeRef}
      className={cn(
        "pointer-events-none fixed left-0 top-0 z-[80] will-change-transform",
        className
      )}
      style={{
        transform: "translate3d(-9999px, -9999px, 0)",
      }}
      aria-hidden
    >
      {stacking ? (
        <div
          className="relative isolate w-max"
          style={{ height: STACK_CARD_H }}
        >
          {Array.from({ length: maxDepth }, (_, i) => {
            const depth = maxDepth - i;
            const item = items[Math.min(depth, items.length - 1)]!;
            const widthScale = Math.max(0.7, 1 - depth * STACK_DEPTH_SCALE);
            const width = Math.round(cardW * widthScale);
            const left = Math.round((cardW - width) / 2);
            const dim = Math.min(0.45, depth * STACK_DEPTH_DIM);
            return (
              <div
                key={`stack-back-${depth}`}
                className={cn("absolute overflow-hidden", TRIAGE_CARD_SURFACE)}
                style={{
                  zIndex: layerCount - depth,
                  top: -depth * STACK_PEEK_Y,
                  left,
                  width,
                  height: STACK_CARD_H,
                  boxShadow: STACK_COOL_SHADOW,
                }}
              >
                <StackPreviewFace item={item} compact />
                {/* Cool depth shade — farther cards sit in the front card’s shadow */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-[inherit]"
                  style={{ backgroundColor: STACK_DEPTH_SHADE, opacity: dim }}
                  aria-hidden
                />
              </div>
            );
          })}

          <div
            ref={stackAnchorRef}
            className={cn(
              "relative overflow-hidden",
              TRIAGE_CARD_SURFACE
            )}
            style={{
              zIndex: layerCount,
              height: STACK_CARD_H,
              boxShadow: STACK_COOL_SHADOW_FRONT,
            }}
          >
            <StackPreviewFace item={front} count={count} />
          </div>
        </div>
      ) : (
        // In-list chip — original compact look (not the simplified stack face).
        <div
          ref={stackAnchorRef}
          className="max-w-[min(18rem,70vw)] rounded-lg border border-border/60 bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg"
        >
          <div className="flex items-center gap-2">
            {front.logoSrc != null || front.name ? (
              <CompanyLogo
                src={front.logoSrc}
                name={front.name}
                size="sm"
              />
            ) : null}
            <div className="min-w-0">
              <div className="truncate">{label}</div>
              {count > 1 ? (
                <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                  {count} selected
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
