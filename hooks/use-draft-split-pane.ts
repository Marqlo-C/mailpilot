"use client";

import { useEffect, useMemo, useState } from "react";
import type { Layout, LayoutChangedMeta } from "react-resizable-panels";
import { useHydrated } from "./use-hydrated";

export const DRAFT_SPLIT_STORAGE_KEY = "mp-draft-email-resume-split";
export const DRAFT_SPLIT_DEFAULT = 48;
/**
 * Soft %-fallback only until each toolbar's intrinsic pixel min is measured.
 * Live floors come from `useToolbarMinWidthPx` (max-content width).
 */
export const DRAFT_SPLIT_MIN = 20;
/**
 * Soft email drag ceiling (%). Toolbar pixel mins still bind both panes.
 */
export const DRAFT_SPLIT_MAX = 80;

export const DRAFT_SPLIT_PANEL_EMAIL = "draft-email";
export const DRAFT_SPLIT_PANEL_RESUME = "draft-resume";

/** Tailwind `lg` — draft dual-pane resize only applies at this breakpoint. */
const DRAFT_SPLIT_MQ = "(min-width: 1024px)";

export function readDraftSplitPct(): number {
  if (typeof window === "undefined") return DRAFT_SPLIT_DEFAULT;
  try {
    const raw = localStorage.getItem(DRAFT_SPLIT_STORAGE_KEY);
    if (!raw) return DRAFT_SPLIT_DEFAULT;
    const next = Number(raw);
    // Soft clamp only — pixel toolbar floors enforce the real drag stop.
    if (!Number.isFinite(next) || next < 10 || next > DRAFT_SPLIT_MAX) {
      return DRAFT_SPLIT_DEFAULT;
    }
    return next;
  } catch {
    return DRAFT_SPLIT_DEFAULT;
  }
}

export function writeDraftSplitPct(pct: number) {
  try {
    localStorage.setItem(DRAFT_SPLIT_STORAGE_KEY, String(pct));
  } catch {
    // ignore quota / private mode
  }
}

function clampEmailPct(pct: number): number {
  return Math.min(DRAFT_SPLIT_MAX, Math.max(10, pct));
}

/**
 * Desktop dual-pane layout for the opportunity draft dialog.
 * Persists email panel %; double-click reset is built into shadcn `ResizableHandle`.
 * Pane floors should prefer measured toolbar pixel widths from the dialog.
 */
export function useDraftSplitPane() {
  const hydrated = useHydrated();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DRAFT_SPLIT_MQ);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const emailSplitPct = hydrated ? readDraftSplitPct() : DRAFT_SPLIT_DEFAULT;

  const defaultLayout = useMemo<Layout>(
    () => ({
      [DRAFT_SPLIT_PANEL_EMAIL]: emailSplitPct,
      [DRAFT_SPLIT_PANEL_RESUME]: 100 - emailSplitPct,
    }),
    [emailSplitPct]
  );

  const onLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return;
    const next = layout[DRAFT_SPLIT_PANEL_EMAIL];
    if (typeof next !== "number" || !Number.isFinite(next)) return;
    writeDraftSplitPct(clampEmailPct(next));
  };

  return {
    /** True only after hydrate when viewport ≥ lg. */
    isDesktopSplit: hydrated && isDesktop,
    defaultLayout,
    onLayoutChanged,
    /** Percentage fallback until toolbar measurement lands. */
    minSplit: DRAFT_SPLIT_MIN,
    maxSplit: DRAFT_SPLIT_MAX,
  };
}
