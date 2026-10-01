"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

/**
 * Race a promise against an AbortSignal so cancellation unblocks immediately
 * even when the underlying work (e.g. a Server Action) cannot be torn down.
 */
export function abortablePromise<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export type TaskAbortManager = {
  startTask: (taskId: string) => AbortSignal;
  /** Mark a task finished without aborting (success or handled failure). */
  finishTask: (taskId: string, signal?: AbortSignal) => void;
  cancelTask: (taskId: string) => void;
  cancelAll: () => void;
  isTaskActive: (taskId: string) => boolean;
  activeTaskIds: ReadonlySet<string>;
};

/**
 * Central AbortController registry for in-flight async AI work in a modal.
 * Aborts replace any prior controller for the same taskId.
 */
export function useTaskAbortManager(): TaskAbortManager {
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const [activeTaskIds, setActiveTaskIds] = useState<Set<string>>(
    () => new Set()
  );

  const syncActive = useCallback(() => {
    setActiveTaskIds(new Set(controllersRef.current.keys()));
  }, []);

  const startTask = useCallback(
    (taskId: string): AbortSignal => {
      const existing = controllersRef.current.get(taskId);
      if (existing) {
        existing.abort();
        controllersRef.current.delete(taskId);
      }
      const controller = new AbortController();
      controllersRef.current.set(taskId, controller);
      syncActive();
      return controller.signal;
    },
    [syncActive]
  );

  const finishTask = useCallback(
    (taskId: string, signal?: AbortSignal) => {
      const current = controllersRef.current.get(taskId);
      if (!current) return;
      if (signal && current.signal !== signal) return;
      controllersRef.current.delete(taskId);
      syncActive();
    },
    [syncActive]
  );

  const cancelTask = useCallback(
    (taskId: string) => {
      const controller = controllersRef.current.get(taskId);
      if (!controller) return;
      controller.abort();
      controllersRef.current.delete(taskId);
      syncActive();
    },
    [syncActive]
  );

  const cancelAll = useCallback(() => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
    syncActive();
  }, [syncActive]);

  const isTaskActive = useCallback(
    (taskId: string) => activeTaskIds.has(taskId),
    [activeTaskIds]
  );

  useEffect(() => {
    return () => {
      for (const controller of controllersRef.current.values()) {
        controller.abort();
      }
      controllersRef.current.clear();
    };
  }, []);

  return {
    startTask,
    finishTask,
    cancelTask,
    cancelAll,
    isTaskActive,
    activeTaskIds,
  };
}
