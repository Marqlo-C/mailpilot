"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";

import {
  STAMP_BADGE_TOOTH_PX,
  STAMP_FACE_INSET_X_PX,
  STAMP_FACE_INSET_Y_PX,
  buildStampPath,
} from "@/lib/constants/stamp-geometry";
import { cn } from "@/lib/utils";

type StampFrameProps = HTMLAttributes<HTMLDivElement> & {
  /** Target perforation radius in CSS px. */
  toothPx?: number;
  /** Tailwind fill class for the perforated paper shell (keep opaque). */
  paperClassName?: string;
  /** Tailwind stroke class for the perforated silhouette edge. */
  paperStrokeClassName?: string;
};

const PAPER_SHADOW: CSSProperties = {
  filter:
    "drop-shadow(0 1px 2px rgba(0,0,0,0.12)) drop-shadow(0 2px 5px rgba(0,0,0,0.08))",
};

type ContentSize = { w: number; h: number };

/**
 * Postage-stamp frame: opaque perforated paper + inset content.
 *
 * Measures in useLayoutEffect (before paint) with no seeded width, so refresh
 * doesn't flash a too-wide silhouette then snap.
 */
export function StampFrame({
  className,
  children,
  toothPx = STAMP_BADGE_TOOTH_PX,
  paperClassName = "fill-zinc-50 dark:fill-zinc-700",
  paperStrokeClassName = "stroke-[#030534]/50 dark:stroke-[#030534]/50",
  style,
  ...rest
}: StampFrameProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState<ContentSize | null>(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.ceil(el.getBoundingClientRect().width);
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (w <= 0 || h <= 0) return;
      setContentSize((prev) =>
        prev && prev.w === w && prev.h === h ? prev : { w, h }
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!contentSize) return null;
    const boxW = contentSize.w + STAMP_FACE_INSET_X_PX * 2;
    const boxH = contentSize.h + STAMP_FACE_INSET_Y_PX * 2;
    return {
      boxW,
      boxH,
      path: buildStampPath(boxW, boxH, toothPx),
      padX: STAMP_FACE_INSET_X_PX,
      padY: STAMP_FACE_INSET_Y_PX,
    };
  }, [contentSize, toothPx]);

  return (
    <div
      className={cn(
        "relative inline-flex",
        // Hold off visible paint until measured — avoids wide→correct snap.
        !layout && "opacity-0",
        className
      )}
      style={{
        ...style,
        ...(layout
          ? { width: layout.boxW, height: layout.boxH }
          : {
              // Pre-measure box roughly matches final padding so layout is stable.
              paddingTop: STAMP_FACE_INSET_Y_PX,
              paddingBottom: STAMP_FACE_INSET_Y_PX,
              paddingLeft: STAMP_FACE_INSET_X_PX,
              paddingRight: STAMP_FACE_INSET_X_PX,
            }),
      }}
      {...rest}
    >
      {layout ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox={`-1.5 -1.5 ${layout.path.width + 3} ${layout.path.height + 3}`}
          preserveAspectRatio="none"
          aria-hidden
          style={PAPER_SHADOW}
        >
          <path
            d={layout.path.d}
            className={cn(paperClassName, paperStrokeClassName)}
            strokeWidth={1.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            paintOrder="stroke fill"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      <div
        className="relative z-[1] box-border flex h-full w-full items-center justify-center"
        style={
          layout
            ? {
                paddingTop: layout.padY,
                paddingBottom: layout.padY,
                paddingLeft: layout.padX,
                paddingRight: layout.padX,
              }
            : undefined
        }
      >
        <div ref={contentRef} className="inline-flex items-stretch">
          {children}
        </div>
      </div>
    </div>
  );
}
