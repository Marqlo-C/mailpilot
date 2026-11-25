"use client";

import { useCallback, useRef, useState } from "react";

import type { TailoredResumeDraft } from "@/lib/validations/resume-draft.schema";

const HISTORY_LIMIT = 40;

function cloneDraft(draft: TailoredResumeDraft): TailoredResumeDraft {
  return structuredClone(draft);
}

/**
 * Snapshot stack for resume draft undo/redo (committed edits).
 * In-progress contenteditable strokes still use the browser undo stack.
 */
export function useResumeDraftHistory() {
  const pastRef = useRef<TailoredResumeDraft[]>([]);
  const futureRef = useRef<TailoredResumeDraft[]>([]);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const recordBefore = useCallback((draft: TailoredResumeDraft | null | undefined) => {
    if (!draft) return;
    pastRef.current = [
      ...pastRef.current.slice(-(HISTORY_LIMIT - 1)),
      cloneDraft(draft),
    ];
    futureRef.current = [];
    bump();
  }, []);

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, []);

  const takeUndo = useCallback(
    (current: TailoredResumeDraft | null | undefined): TailoredResumeDraft | null => {
      if (!current || pastRef.current.length === 0) return null;
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [
        cloneDraft(current),
        ...futureRef.current,
      ].slice(0, HISTORY_LIMIT);
      bump();
      return prev;
    },
    []
  );

  const takeRedo = useCallback(
    (current: TailoredResumeDraft | null | undefined): TailoredResumeDraft | null => {
      if (!current || futureRef.current.length === 0) return null;
      const next = futureRef.current[0];
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [
        ...pastRef.current.slice(-(HISTORY_LIMIT - 1)),
        cloneDraft(current),
      ];
      bump();
      return next;
    },
    []
  );

  return {
    version,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    recordBefore,
    takeUndo,
    takeRedo,
    clear,
  };
}

/** Prefer native contenteditable undo when a resume line still has focus. */
export function tryResumeDomHistory(command: "undo" | "redo"): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.isContentEditable) {
    return false;
  }
  if (!active.closest("[data-resume-draft-root]")) return false;
  try {
    return document.execCommand(command);
  } catch {
    return false;
  }
}
