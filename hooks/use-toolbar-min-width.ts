"use client";

import { useLayoutEffect, useState } from "react";

function isInFlowToolbarChild(child: Element): child is HTMLElement {
  if (typeof (child as HTMLElement).getBoundingClientRect !== "function") {
    return false;
  }
  // Ace refine / notes / strategy popovers are absolute under the strip —
  // counting them inflated resume minSize and stole width from email.
  const position = getComputedStyle(child).position;
  return position !== "absolute" && position !== "fixed";
}

/**
 * Intrinsic toolbar floor without touching layout.
 * Sums in-flow cluster widths + flex gap + horizontal padding so
 * `ml-auto` / `justify-between` stretch does not inflate the reading.
 * Overlay children (Ace line refine, notes) are ignored.
 */
export function measureToolbarMinWidthPx(root: HTMLElement): number {
  const style = getComputedStyle(root);
  const pad =
    (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const gap = parseFloat(style.columnGap || style.gap) || 0;
  const kids = Array.from(root.children).filter(isInFlowToolbarChild);
  if (kids.length === 0) return Math.ceil(pad);

  let content = 0;
  for (let i = 0; i < kids.length; i += 1) {
    content += kids[i].getBoundingClientRect().width;
    if (i > 0) content += gap;
  }
  return Math.ceil(pad + content);
}

/**
 * Live pixel floor for a draft toolbar.
 * ResizeObserver only — no attribute MutationObserver, no style writes.
 */
export function useToolbarMinWidthPx(
  node: HTMLElement | null,
  enabled: boolean
): number | null {
  const [widthPx, setWidthPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled || !node) {
      setWidthPx(null);
      return;
    }

    let frame = 0;
    let measuring = false;

    const sync = () => {
      if (measuring) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measuring = true;
        try {
          const next = measureToolbarMinWidthPx(node);
          setWidthPx((prev) => (prev === next ? prev : next));
        } finally {
          measuring = false;
        }
      });
    };

    sync();

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(node);
    for (const child of node.children) {
      if (child instanceof HTMLElement) resizeObserver.observe(child);
    }

    // Structure-only — never `attributes` (would re-enter on unrelated chrome).
    const mutationObserver = new MutationObserver(() => {
      for (const child of node.children) {
        if (child instanceof HTMLElement) resizeObserver.observe(child);
      }
      sync();
    });
    mutationObserver.observe(node, { childList: true });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [node, enabled]);

  return widthPx;
}
