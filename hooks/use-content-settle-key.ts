"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Increments when `busy` transitions true → false so content can remount
 * with a soft enter animation after regenerate / refine completes.
 */
export function useContentSettleKey(busy: boolean): number {
  const [key, setKey] = useState(0);
  const wasBusyRef = useRef(busy);

  useEffect(() => {
    if (wasBusyRef.current && !busy) {
      setKey((current) => current + 1);
    }
    wasBusyRef.current = busy;
  }, [busy]);

  return key;
}
