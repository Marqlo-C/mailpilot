/**
 * TCP-inspired backoff poller for sync-status endpoints.
 * Starts at `initialMs` (default 3s) and grows up to `maxMs` (default 20s).
 */

export type SyncStatusPollResult = "continue" | "stop";

export type SyncStatusBackoffOptions = {
  /** First wait before the first poll (default 3000). */
  initialMs?: number;
  /** Cap on successive waits (default 20000). */
  maxMs?: number;
  /** Multiplier applied after each continue (default 1.4). */
  factor?: number;
  /** Invoked on each tick; return "stop" to end the loop. */
  onTick: () => Promise<SyncStatusPollResult>;
  /** Optional absolute wall-clock limit (default 90s). */
  hardStopMs?: number;
  /** Fired once when elapsed time crosses this threshold (default 30s). */
  onSlow?: () => void;
  slowAfterMs?: number;
  /** Fired once when the wall-clock hard stop is reached. */
  onHardStop?: () => void;
};

/**
 * Starts a cancellable backoff poll loop. Returns a dispose function.
 */
export function startSyncStatusBackoffPoll(
  options: SyncStatusBackoffOptions
): () => void {
  const initialMs = options.initialMs ?? 3000;
  const maxMs = options.maxMs ?? 20_000;
  const factor = options.factor ?? 1.4;
  const hardStopMs = options.hardStopMs ?? 90_000;
  const slowAfterMs = options.slowAfterMs ?? 30_000;

  let cancelled = false;
  let delay = initialMs;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let slowFired = false;
  const startedAt = Date.now();

  const clear = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const schedule = (ms: number) => {
    clear();
    timeoutId = setTimeout(() => {
      void runTick();
    }, ms);
  };

  const runTick = async () => {
    if (cancelled) return;

    const elapsed = Date.now() - startedAt;
    if (!slowFired && elapsed >= slowAfterMs) {
      slowFired = true;
      options.onSlow?.();
    }
    if (elapsed >= hardStopMs) {
      options.onHardStop?.();
      return;
    }

    let result: SyncStatusPollResult = "continue";
    try {
      result = await options.onTick();
    } catch {
      result = "continue";
    }

    if (cancelled || result === "stop") {
      return;
    }

    delay = Math.min(maxMs, Math.round(delay * factor));
    schedule(delay);
  };

  // First poll after initial delay (avoid hammering immediately on mount)
  schedule(initialMs);

  return () => {
    cancelled = true;
    clear();
  };
}
