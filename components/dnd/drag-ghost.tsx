"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { DND_LERP_ALPHA } from "@/lib/dnd/constants";
import {
  computeDeadzoneTarget,
  type DragGrabGeometry,
} from "@/lib/dnd/drag-smooth";
import { cn } from "@/lib/utils";

/** Lightweight floating preview that follows the pointer during a card drag. */
export function DragGhost({
  active,
  pointerX,
  pointerY,
  grab,
  count,
  label,
  className,
}: {
  active: boolean;
  pointerX: number;
  pointerY: number;
  /** Grab bbox + offsets from drag start; enables deadzone + lerp follow. */
  grab: DragGrabGeometry | null;
  count: number;
  label?: ReactNode;
  className?: string;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: pointerX, y: pointerY });
  const grabRef = useRef<DragGrabGeometry | null>(grab);
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  pointerRef.current = { x: pointerX, y: pointerY };
  grabRef.current = grab;

  useEffect(() => {
    if (!active) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Prefer prop grab for this activation (ref can briefly be stale on mount).
    const initial = grab ?? grabRef.current;
    grabRef.current = initial;
    // Seed at the grab bbox (or pointer if geometry missing).
    currentRef.current = initial
      ? { x: initial.startLeft, y: initial.startTop }
      : { x: pointerRef.current.x, y: pointerRef.current.y };

    const applyTransform = (boxX: number, boxY: number, g: DragGrabGeometry | null) => {
      const el = nodeRef.current;
      if (!el) return;
      if (g) {
        // Pill sits at the grab point inside the logical bbox.
        el.style.transform = `translate3d(${boxX + g.grabX}px, ${boxY + g.grabY}px, 0)`;
      } else {
        el.style.transform = `translate3d(${boxX}px, ${boxY}px, 0)`;
      }
    };

    applyTransform(currentRef.current.x, currentRef.current.y, initial);

    const tick = () => {
      const el = nodeRef.current;
      if (!el) {
        rafRef.current = null;
        return;
      }

      const g = grabRef.current;
      const { x: clientX, y: clientY } = pointerRef.current;
      let targetX: number;
      let targetY: number;
      if (g) {
        ({ targetX, targetY } = computeDeadzoneTarget(
          clientX,
          clientY,
          currentRef.current.y,
          g
        ));
      } else {
        targetX = clientX;
        targetY = clientY;
      }

      const cur = currentRef.current;
      cur.x += (targetX - cur.x) * DND_LERP_ALPHA;
      cur.y += (targetY - cur.y) * DND_LERP_ALPHA;

      // Snap when close enough to avoid endless sub-pixel RAF.
      if (Math.abs(targetX - cur.x) < 0.15) cur.x = targetX;
      if (Math.abs(targetY - cur.y) < 0.15) cur.y = targetY;

      applyTransform(cur.x, cur.y, g);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // Re-seed when grab geometry arrives with the drag (not only active flip).
  }, [active, grab]);

  if (!active) return null;

  return (
    <div
      ref={nodeRef}
      className={cn(
        "pointer-events-none fixed left-0 top-0 z-[80] max-w-[min(18rem,70vw)] rounded-lg border border-border/60 bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg will-change-transform",
        className
      )}
      style={{
        transform: "translate3d(-9999px, -9999px, 0)",
      }}
      aria-hidden
    >
      <div className="truncate">{label}</div>
      {count > 1 ? (
        <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
          {count} selected
        </div>
      ) : null}
    </div>
  );
}
