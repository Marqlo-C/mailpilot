"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal distance (px) from the carousel's left edge to its first pill:
 * 14px arrow icon (`size-3.5`; the arrow button has no other width) + 6px gap (`gap-1.5`).
 * Used to align other content flush with the first pill.
 */
export const SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX = 20;

export interface SlidableBadgeRowProps {
  children: React.ReactNode;
  className?: string;
  railClassName?: string;
  stepPx?: number;
}

/**
 * Slidable Badge Rail (Bounded Carousel)
 *
 * Displays items on a single horizontal line. When they take up enough space to wrap,
 * users can drag/swipe in either direction or click the tiny search-bar-inspired
 * chevron arrows flanking the line to slide items smoothly.
 *
 * Bounded with a distinct beginning and ending:
 * - Left arrow disabled at the beginning (scrollLeft === 0)
 * - Right arrow disabled at the ending (scrollLeft + clientWidth >= scrollWidth)
 * - Dynamic drag-to-scroll with pointer capture and click suppression on drag
 */
export function SlidableBadgeRow({
  children,
  className,
  railClassName,
  stepPx = 180,
}: SlidableBadgeRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize generously so arrows are available immediately while layout resolves
  const childrenCount = React.Children.count(children);
  const [hasOverflow, setHasOverflow] = useState(() => childrenCount > 3);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(() => childrenCount > 3);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{
    startX: number;
    scrollLeft: number;
    hasDragged: boolean;
  } | null>(null);

  const wasDraggedRef = useRef(false);

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    // If element is currently in a collapsed card (clientWidth 0), don't set hasOverflow to false
    if (clientWidth === 0) return;

    const overflow = scrollWidth > clientWidth + 1;
    setHasOverflow(overflow);
    setCanScrollLeft(overflow && scrollLeft > 2);
    setCanScrollRight(overflow && scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateScrollState();

    // Re-check after frames and card animations
    const rafId = requestAnimationFrame(updateScrollState);
    const timer1 = setTimeout(updateScrollState, 50);
    const timer2 = setTimeout(updateScrollState, 200);

    // Watch for size changes
    const resizeObserver = new ResizeObserver(() => {
      updateScrollState();
    });
    resizeObserver.observe(el);

    // Watch for visibility changes (e.g. accordion/card expanded)
    let intersectionObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              updateScrollState();
            }
          }
        },
        { threshold: 0.05 }
      );
      intersectionObserver.observe(el);
    }

    const handleScroll = () => {
      updateScrollState();
    };
    el.addEventListener("scroll", handleScroll, { passive: true });

    const handleWindowResize = () => {
      updateScrollState();
    };
    window.addEventListener("resize", handleWindowResize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [updateScrollState, children]);

  const scrollLeft = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollBy({ left: -stepPx, behavior: "smooth" });
  }, [stepPx]);

  const scrollRight = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollBy({ left: stepPx, behavior: "smooth" });
  }, [stepPx]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    // Only drag if the container is genuinely scrollable
    if (el.scrollWidth <= el.clientWidth + 1) return;

    dragStartRef.current = {
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      hasDragged: false,
    };
    setIsDragging(true);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Safe fallback if pointer capture is unsupported
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !containerRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    if (Math.abs(dx) > 3) {
      dragStartRef.current.hasDragged = true;
    }
    containerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    updateScrollState();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const el = containerRef.current;
    if (el) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
    }
    wasDraggedRef.current = dragStartRef.current.hasDragged;
    dragStartRef.current = null;
    setIsDragging(false);
    updateScrollState();
    setTimeout(() => {
      wasDraggedRef.current = false;
    }, 50);
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (wasDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // Searchbar-inspired ghost button pill scaled down to size-5.5 (22px) to match badge height
  const arrowButtonClassName =
    "inline-flex size-5.5 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/80 text-[hsl(var(--sidebar))] dark:text-foreground/80 shadow-none transition-all hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))] dark:hover:bg-accent dark:hover:text-accent-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div
      data-no-toggle="true"
      onMouseEnter={updateScrollState}
      className={cn(
        "relative flex items-center min-w-0 max-w-full gap-1.5 w-full",
        className
      )}
    >
      <button
        type="button"
        onClick={scrollLeft}
        disabled={!hasOverflow || !canScrollLeft}
        aria-label="Scroll left"
        title={hasOverflow && canScrollLeft ? "Scroll left" : undefined}
        className={arrowButtonClassName}
      >
        <ChevronLeft className="size-3.5 stroke-[2.25]" aria-hidden="true" />
      </button>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          touchAction: "pan-y",
        }}
        className={cn(
          "flex flex-1 items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden min-w-0 py-0.5 select-none",
          isDragging ? "cursor-grabbing" : hasOverflow ? "cursor-grab" : "cursor-default",
          railClassName
        )}
      >
        {children}
      </div>

      <button
        type="button"
        onClick={scrollRight}
        disabled={!hasOverflow || !canScrollRight}
        aria-label="Scroll right"
        title={hasOverflow && canScrollRight ? "Scroll right" : undefined}
        className={arrowButtonClassName}
      >
        <ChevronRight className="size-3.5 stroke-[2.25]" aria-hidden="true" />
      </button>
    </div>
  );
}
