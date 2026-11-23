"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "./use-hydrated";

export const DRAFT_SPLIT_STORAGE_KEY = "mp-draft-email-resume-split";
export const DRAFT_SPLIT_DEFAULT = 48;
export const DRAFT_SPLIT_MIN = 28;
export const DRAFT_SPLIT_MAX = 72;

export function readDraftSplitPct(): number {
  if (typeof window === "undefined") return DRAFT_SPLIT_DEFAULT;
  try {
    const raw = localStorage.getItem(DRAFT_SPLIT_STORAGE_KEY);
    if (!raw) return DRAFT_SPLIT_DEFAULT;
    const next = Number(raw);
    if (
      !Number.isFinite(next) ||
      next < DRAFT_SPLIT_MIN ||
      next > DRAFT_SPLIT_MAX
    ) {
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

export function useDraftSplitPane() {
  const hydrated = useHydrated();
  const [customSplitPct, setCustomSplitPct] = useState<number | null>(null);
  const emailSplitPct =
    customSplitPct ?? (hydrated ? readDraftSplitPct() : DRAFT_SPLIT_DEFAULT);
  const [splitDragging, setSplitDragging] = useState(false);
  const splitRowRef = useRef<HTMLDivElement>(null);
  const emailSplitPctRef = useRef(emailSplitPct);

  useEffect(() => {
    emailSplitPctRef.current = emailSplitPct;
  }, [emailSplitPct]);

  useEffect(() => {
    if (!splitDragging) return;

    function onPointerMove(event: PointerEvent) {
      const row = splitRowRef.current;
      if (!row) return;
      const rect = row.getBoundingClientRect();
      if (rect.width <= 0) return;
      const next = Math.min(
        DRAFT_SPLIT_MAX,
        Math.max(
          DRAFT_SPLIT_MIN,
          ((event.clientX - rect.left) / rect.width) * 100
        )
      );
      emailSplitPctRef.current = next;
      setCustomSplitPct(next);
    }

    function onPointerUp() {
      setSplitDragging(false);
      writeDraftSplitPct(emailSplitPctRef.current);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [splitDragging]);

  const adjustSplitBy = (delta: number) => {
    setCustomSplitPct((prev) => {
      const base = prev ?? emailSplitPctRef.current;
      const next = Math.min(
        DRAFT_SPLIT_MAX,
        Math.max(DRAFT_SPLIT_MIN, base + delta)
      );
      emailSplitPctRef.current = next;
      writeDraftSplitPct(next);
      return next;
    });
  };

  const onSplitKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -2 : 2;
    adjustSplitBy(delta);
  };

  return {
    emailSplitPct,
    setEmailSplitPct: setCustomSplitPct,
    splitDragging,
    setSplitDragging,
    splitRowRef,
    onSplitKeyDown,
    adjustSplitBy,
    minSplit: DRAFT_SPLIT_MIN,
    maxSplit: DRAFT_SPLIT_MAX,
  };
}
