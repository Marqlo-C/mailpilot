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
  if (lvl === "debug" && !process.env.DEBUG_VERBOSE) return;
  if (!log.isLevelEnabled(lvl)) return;
  const lines = details
    ? Object.entries(details)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n")
    : "";
  log[lvl](lines ? `${title}\n${lines}` : title);
}

/* -------------------------------------------------------------------------- */
/*             COMPACT 66-COL ASCII TERMINAL TELEMETRY (DEV / PROD)           */
/* -------------------------------------------------------------------------- */

export function isAsciiTableLoggingEnabled(): boolean {
  if (process.env.LOG_ASCII_TABLES === "1") return true;
  if (process.env.LOG_ASCII_TABLES === "0") return false;
  return process.env.NODE_ENV === "development";
}

export function truncate(str: string, maxLen: number): string {
  const clean = str.replace(/[\u200B-\u200F\uFEFF]/g, "").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 3)}...` : clean;
}

// ---------------------------------------------------------------------------
// 1. ENGINE INSPECTION CARD (OLLAMA & CLOUD)
// ---------------------------------------------------------------------------
export type EngineExecutionLogParams = {
  engineType: "LOCAL_OLLAMA" | "CLOUD_BYOK";
  provider: string;
  model: string;
  endpoint?: string;
  phase: "START" | "COMPLETE" | "RATE_LIMIT" | "ERROR";
  promptChars: number;
  outputChars?: number;
  durationMs?: number;
  chunks?: number;
  attempt?: number;
  maxAttempts?: number;
  rotationNote?: string;
  errorDetail?: string;
  idleTimeoutMs?: number;
  hardCapMs?: number;
};

export function logEngineExecutionTable(params: EngineExecutionLogParams): void {
  const {
    engineType,
    provider,
    model,
    phase,
    promptChars,
    outputChars = 0,
    durationMs = 0,
    chunks = 0,
    rotationNote,
    errorDetail,
    idleTimeoutMs = 0,
    hardCapMs = 0,
  } = params;

  if (!isAsciiTableLoggingEnabled()) {
    console.info(
      JSON.stringify({
        scope: "EngineTelemetry",
        engine: engineType,
        provider,
        model,
        phase,
        durationMs,
        promptChars,
        outputChars,
        chunks,
      })
    );
    return;
  }

  const title = engineType === "LOCAL_OLLAMA" ? "OLLAMA ENGINE" : "CLOUD ENGINE";
  const header = `┌─ ${title} [${truncate(model, 34)}] `.padEnd(65, "─") + "┐";
  const durSec = (durationMs / 1000).toFixed(1);
  const chunkRate =
    durationMs > 0 && chunks > 0 ? (chunks / (durationMs / 1000)).toFixed(1) : "0.0";
  const idleSec = Math.round(idleTimeoutMs / 1000);
  const hardSec = Math.round(hardCapMs / 1000);

  if (phase === "START" && engineType === "LOCAL_OLLAMA") {
    console.log(`\n${header}`);
    console.log(
      `│ Payload : ${promptChars.toLocaleString()} chars (idle ${idleSec}s / cap ${hardSec}s)`.padEnd(
        65
      ) + "│"
    );
    console.log(`└`.padEnd(65, "─") + "┘");
  } else if (phase === "COMPLETE") {
    console.log(`\n${header}`);
    if (chunks > 0) {
      console.log(
        `│ Stream  : ${chunks} chunks │ ${outputChars.toLocaleString()} chars │ ${durSec}s (${chunkRate} chunks/s)`.padEnd(
          65
        ) + "│"
      );
    } else {
      console.log(
        `│ Result  : 200 OK │ Latency: ${durSec}s │ Output: ${outputChars.toLocaleString()} chars`.padEnd(
          65
        ) + "│"
      );
    }
    console.log(`└`.padEnd(65, "─") + "┘");
  } else if (phase === "RATE_LIMIT") {
    console.log(`\n${header}`);
    console.log(`│ Warning : HTTP 429 Rate Limit`.padEnd(65) + "│");
    console.log(
      `│ Action  : ${truncate(rotationNote || "Rotating model", 52)}`.padEnd(
        65
      ) + "│"
    );
    console.log(`└`.padEnd(65, "─") + "┘");
  } else if (phase === "ERROR") {
    console.log(`\n${header}`);
    console.log(
      `│ Error   : ${truncate(errorDetail || "Unknown error", 53)}`.padEnd(
        65
      ) + "│"
    );
    console.log(`└`.padEnd(65, "─") + "┘");
  }
}

// ---------------------------------------------------------------------------
// 2. COMPACT MESSAGE EVALUATION CARD (NO RATIONALE)
// ---------------------------------------------------------------------------
export type CompactSyncLogEntry = {
  index: number;
  total: number;
  subject: string;
  messageId: string;
  isJob: boolean;
  routing: string[];
  company?: string;
  role?: string;
  location?: string | null;
  salary?: string | null;
  status?: string;
  matchScore?: number;
  matchTier?: string;
  matchSource?: string;
  databaseAction?: string;
  skipReason?: string;
};

export function logCompactSyncCard(entry: CompactSyncLogEntry): void {
  const padIdx = String(entry.index).padStart(2, "0");
  const padTot = String(entry.total).padStart(2, "0");
  const shortSub = truncate(entry.subject, 50);
  const shortId = entry.messageId.slice(0, 8);

  // Non-job email: print clean single-line skip notice
  if (!entry.isJob) {
    if (!isAsciiTableLoggingEnabled()) {
      console.info(
        JSON.stringify({
          scope: "Sync",
          messageId: shortId,
          event: "email_skipped",
          reason: entry.skipReason || "IRRELEVANT",
        })
      );
      return;
    }
    console.log(`\n[SYNC ${padIdx}/${padTot}] "${shortSub}" (${shortId}...)`);
    console.log(`  └─ SKIPPED: ${entry.skipReason || "Non-Job / Marketing or Newsletter"}`);
    return;
  }

  // Production: emit single-line JSON log
  if (!isAsciiTableLoggingEnabled()) {
    console.info(
      JSON.stringify({
        scope: "Sync",
        messageId: shortId,
        company: entry.company,
        role: entry.role,
        status: entry.status,
        score: entry.matchScore,
        tier: entry.matchTier,
        action: entry.databaseAction,
      })
    );
    return;
  }

  // Development: 66-column compact card
  console.log(`\n[SYNC ${padIdx}/${padTot}] "${shortSub}" (${shortId}...)`);
  console.log(`┌${"─".repeat(64)}┐`);

  // Dynamically format fallback triage reason
  const formattedRouting: string[] = [];
  if (entry.routing.some((r) => r.includes("Tier 3: HEURISTIC"))) {
    const isCloudRateLimited = entry.routing.some(
      (r) => r.includes("429") || /rate\s*limit/i.test(r)
    );
    const isCloudSkipped = entry.routing.some(
      (r) => r.includes("SKIPPED") || /no api key/i.test(r)
    );
    const isCloudFailed = entry.routing.some(
      (r) =>
        r.includes("Tier 2: CLOUD_BYOK -> FAILED") ||
        /Tier 2:\s*CLOUD_BYOK\s*->\s*FAILED/i.test(r)
    );

    if (isCloudRateLimited) {
      formattedRouting.push("Tier 3: HEURISTIC (Ollama offline, Cloud rate-limited)");
    } else if (isCloudSkipped) {
      formattedRouting.push("Tier 3: HEURISTIC (Ollama offline, No cloud key)");
    } else if (isCloudFailed) {
      formattedRouting.push("Tier 3: HEURISTIC (Ollama offline, Cloud failed)");
    } else {
      formattedRouting.push("Tier 3: HEURISTIC (Ollama offline, Cloud disabled)");
    }
  } else if (entry.routing.some((r) => r.includes("Tier 2: CLOUD"))) {
    formattedRouting.push("Tier 2: CLOUD_BYOK (Ollama failover)");
  } else if (entry.routing.some((r) => r.includes("Tier 1: LOCAL_OLLAMA"))) {
    formattedRouting.push("Tier 1: LOCAL_OLLAMA (200 OK)");
  } else {
    formattedRouting.push(...entry.routing);
  }

  for (const route of formattedRouting) {
    console.log(`│ Triage: ${truncate(route, 54)}`.padEnd(65) + "│");
  }

  console.log(`├${"─".repeat(31)}┬${"─".repeat(32)}┤`);

  const leftCol1 = truncate(`Company : ${entry.company || "Unknown"}`, 29).padEnd(29);
  const rightCol1 = truncate(`Location : ${entry.location || "Remote"}`, 30).padEnd(30);
  console.log(`│ ${leftCol1} │ ${rightCol1} │`);

  const leftCol2 = truncate(`Role    : ${entry.role || "Role"}`, 29).padEnd(29);
  const rightCol2 = truncate(`Salary   : ${entry.salary || "$TBD"}`, 30).padEnd(30);
  console.log(`│ ${leftCol2} │ ${rightCol2} │`);

  const fitStr =
    entry.matchScore !== undefined
      ? `${entry.matchScore}% (${entry.matchTier || "MID"}) [${entry.matchSource || "AI"}]`
      : "N/A";
  const leftCol3 = truncate(`Status  : ${entry.status || "LEAD"}`, 29).padEnd(29);
  const rightCol3 = truncate(`Match Fit: ${fitStr}`, 30).padEnd(30);
  console.log(`│ ${leftCol3} │ ${rightCol3} │`);

  console.log(`├${"─".repeat(31)}┴${"─".repeat(32)}┤`);
  console.log(`│ Saved   : ${truncate(entry.databaseAction || "Processed", 52)}`.padEnd(65) + "│");
  console.log(`└${"─".repeat(64)}┘`);
}

// ---------------------------------------------------------------------------
// 3. BATCH SUMMARY BANNER
// ---------------------------------------------------------------------------
export function logSyncSummaryBanner(stats: {
  total: number;
  durationMs: number;
  ollamaCount: number;
  cloudCount: number;
  heuristicCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  watermark: string;
}): void {
  const durationSec = (stats.durationMs / 1000).toFixed(1);

  if (!isAsciiTableLoggingEnabled()) {
    console.info(
      JSON.stringify({
        scope: "Sync",
        event: "sync_summary",
        ...stats,
      })
    );
    return;
  }

  console.log(`\n┌${"─".repeat(64)}┐`);
  console.log(
    `│ [SYNC COMPLETE] ${stats.total} Messages Processed in ${durationSec}s`.padEnd(65) + "│"
  );
  console.log(
    `│ Providers: ${stats.ollamaCount} Ollama │ ${stats.cloudCount} Cloud │ ${stats.heuristicCount} Heuristic`.padEnd(
      65
    ) + "│"
  );
  console.log(
    `│ Database : ${stats.createdCount} Created │ ${stats.updatedCount} Updated │ ${stats.skippedCount} Skipped`.padEnd(
      65
    ) + "│"
  );
  console.log(`│ Watermark: ${stats.watermark}`.padEnd(65) + "│");
  console.log(`└${"─".repeat(64)}┘\n`);
}
