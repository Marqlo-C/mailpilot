import pino, { type Logger } from "pino";
import pretty from "pino-pretty";

/**
 * Central MailPilot logger (Pino).
 *
 * Levels by environment (override with LOG_LEVEL):
 * - production  → warn  (errors/warnings only; no Sync/Dedupe chatter)
 * - preview     → debug (Vercel preview — full sync/dedupe stories)
 * - development → debug (local `next dev` — pretty-printed)
 * - test        → silent
 *
 * Dev pretty uses an in-process stream (not `pino.transport` workers). Next.js
 * HMR / `after()` kills those workers and surfaces "the worker has exited".
 */

export type LogEnv = "production" | "preview" | "development" | "test";

export function resolveLogEnv(): LogEnv {
  const vercel = process.env.VERCEL_ENV;
  if (
    vercel === "production" ||
    vercel === "preview" ||
    vercel === "development"
  ) {
    return vercel;
  }
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

function resolveLevel(env: LogEnv): pino.LevelWithSilent {
  const override = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (
    override === "fatal" ||
    override === "error" ||
    override === "warn" ||
    override === "info" ||
    override === "debug" ||
    override === "trace" ||
    override === "silent"
  ) {
    return override;
  }

  switch (env) {
    case "production":
      return "warn";
    case "preview":
    case "development":
      return "debug";
    case "test":
      return "silent";
    default:
      return "info";
  }
}

const logEnv = resolveLogEnv();
const level = resolveLevel(logEnv);

/** Pretty stream only for local dev (never on Vercel). */
const usePretty =
  logEnv === "development" &&
  process.env.LOG_PRETTY !== "0" &&
  process.env.VERCEL !== "1";

export const logger: Logger = usePretty
  ? pino(
      {
        level,
        base: { env: logEnv },
      },
      pretty({
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "HH:MM:ss",
        sync: true,
      })
    )
  : pino({
      level,
      base: { env: logEnv },
    });

/** Inbox sync pipeline (delta → job query → classify → watermark). */
export const syncLog = logger.child({ scope: "Sync" });

/** Opportunity 3-tier dedupe decisions. */
export const dedupeLog = logger.child({ scope: "Dedupe" });

/** Stale sync-lock auto-reset (kept at warn so production still surfaces it). */
export const syncLockLog = logger.child({ scope: "SyncLock" });

/**
 * Plain-English multi-line story. Defaults to `debug` so production stays quiet
 * while preview/dev keep the full narrative.
 */
export function logStory(
  log: Logger,
  title: string,
  details?: Record<string, string | number | boolean | null | undefined>,
  lvl: "debug" | "info" | "warn" = "debug"
): void {
  if (!log.isLevelEnabled(lvl)) return;
  const lines = details
    ? Object.entries(details)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n")
    : "";
  log[lvl](lines ? `${title}\n${lines}` : title);
}
