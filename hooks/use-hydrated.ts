import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns `false` during SSR/hydration and `true` once hydrated on the client.
 * Avoids synchronous `setState` inside `useEffect` for mount-only UI branches.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
