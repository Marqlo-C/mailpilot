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

  if (phase === "START" && !globalForTelemetry.__mailpilot_active_batch_tracker) {
    initSyncBatchTelemetry({ startTime: Date.now() });
  }

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
  const header = `┌─ ${title} [${truncate(model, 40)}] `.padEnd(99, "─") + "┐";
  const durSec = (durationMs / 1000).toFixed(1);
  const chunkRate =
    durationMs > 0 && chunks > 0 ? (chunks / (durationMs / 1000)).toFixed(1) : "0.0";
  const idleSec = Math.round(idleTimeoutMs / 1000);
  const hardSec = Math.round(hardCapMs / 1000);

  if (phase === "START" && engineType === "LOCAL_OLLAMA") {
    console.log(`\n${header}`);
    const line = `Payload : ${promptChars.toLocaleString()} chars (idle ${idleSec}s / cap ${hardSec}s)`.padEnd(96);
    console.log(`│ ${line} │`);
    console.log(`└${"─".repeat(98)}┘`);
  } else if (phase === "COMPLETE") {
    console.log(`\n${header}`);
    if (chunks > 0) {
      const line = `Stream  : ${chunks} chunks │ ${outputChars.toLocaleString()} chars │ ${durSec}s (${chunkRate} chunks/s)`.padEnd(96);
      console.log(`│ ${line} │`);
    } else {
      const line = `Result  : 200 OK │ Latency: ${durSec}s │ Output: ${outputChars.toLocaleString()} chars`.padEnd(96);
      console.log(`│ ${line} │`);
    }
    console.log(`└${"─".repeat(98)}┘`);
  } else if (phase === "RATE_LIMIT") {
    console.log(`\n${header}`);
    const line1 = "Warning : HTTP 429 Rate Limit".padEnd(96);
    const line2 = `Action  : ${truncate(rotationNote || "Rotating model", 86)}`.padEnd(96);
    console.log(`│ ${line1} │`);
    console.log(`│ ${line2} │`);
    console.log(`└${"─".repeat(98)}┘`);
  } else if (phase === "ERROR") {
    console.log(`\n${header}`);
    const cleanError = (errorDetail || "Unknown error")
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const line = `Error   : ${truncate(cleanError, 86)}`.padEnd(96);
    console.log(`│ ${line} │`);
    console.log(`└${"─".repeat(98)}┘`);
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
  syncStartedAt?: number;
};

type ActiveBatchTracker = {
  startTime: number;
  ollamaCount: number;
  cloudCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  touchedCount: number;
};

const globalForTelemetry = globalThis as unknown as {
  __mailpilot_active_batch_tracker?: ActiveBatchTracker | null;
  __mailpilot_last_banner_time?: number;
  __mailpilot_last_banner_total?: number;
};

export function initSyncBatchTelemetry(options?: {
  startTime?: number;
}): void {
  globalForTelemetry.__mailpilot_active_batch_tracker = {
    startTime: options?.startTime ?? Date.now(),
    ollamaCount: 0,
    cloudCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    touchedCount: 0,
  };
}

export function logCompactSyncCard(entry: CompactSyncLogEntry): void {
  const padIdx = String(entry.index).padStart(2, "0");
  const padTot = String(entry.total).padStart(2, "0");
  const shortSub = truncate(entry.subject, 70);
  const shortId = entry.messageId.slice(0, 8);

  let tracker = globalForTelemetry.__mailpilot_active_batch_tracker;
  const effectiveStartTime =
    entry.syncStartedAt ?? tracker?.startTime ?? Date.now();

  if (!tracker) {
    tracker = {
      startTime: effectiveStartTime,
      ollamaCount: 0,
      cloudCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      touchedCount: 0,
    };
    globalForTelemetry.__mailpilot_active_batch_tracker = tracker;
  } else if (entry.index === 1) {
    const earliestStart = Math.min(effectiveStartTime, tracker.startTime);
    tracker.startTime = earliestStart;
    tracker.ollamaCount = 0;
    tracker.cloudCount = 0;
    tracker.createdCount = 0;
    tracker.updatedCount = 0;
    tracker.skippedCount = 0;
    tracker.touchedCount = 0;
  } else if (entry.syncStartedAt && entry.syncStartedAt < tracker.startTime) {
    tracker.startTime = entry.syncStartedAt;
  }

  if (entry.routing.some((r) => r.includes("Tier 2: CLOUD"))) {
    tracker.cloudCount += 1;
  } else if (entry.routing.some((r) => r.includes("Tier 1: LOCAL_OLLAMA"))) {
    tracker.ollamaCount += 1;
  }

  if (!entry.isJob) {
    tracker.skippedCount += 1;
  } else {
    const action = (entry.databaseAction || "").trim();
    const digestMatch = action.match(
      /(\d+)\s+opportunities processed\s*\((?:(\d+)\s+Added)?(?:.*?(\d+)\s+Deduped)?\)/i
    );
    if (digestMatch) {
      const totalDigest = parseInt(digestMatch[1] || "1", 10);
      const addedDigest = parseInt(digestMatch[2] || "0", 10);
      const dedupedDigest = parseInt(digestMatch[3] || "0", 10);
      tracker.touchedCount += totalDigest;
      tracker.createdCount += addedDigest;
      tracker.updatedCount += dedupedDigest;
    } else if (/created|inserted/i.test(action)) {
      tracker.touchedCount += 1;
      tracker.createdCount += 1;
    } else if (/updated|deduped/i.test(action)) {
      tracker.touchedCount += 1;
      tracker.updatedCount += 1;
    } else {
      tracker.touchedCount += 1;
    }
  }

  const maybeEmitAutoSummary = () => {
    if (entry.index === entry.total && !process.env.VITEST && tracker) {
      const start = Math.min(
        entry.syncStartedAt ?? tracker.startTime,
        tracker.startTime
      );
      const durationMs = Math.max(100, Date.now() - start);
      logSyncSummaryBanner({
        total: entry.total,
        durationMs,
        ollamaCount: tracker.ollamaCount,
        cloudCount: tracker.cloudCount,
        createdCount: tracker.createdCount,
        updatedCount: tracker.updatedCount,
        skippedCount: tracker.skippedCount,
        opportunitiesTouched: tracker.touchedCount,
        watermark: new Date().toISOString(),
      });
      globalForTelemetry.__mailpilot_active_batch_tracker = null;
    }
  };

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
      maybeEmitAutoSummary();
      return;
    }
    console.log(`\n[SYNC ${padIdx}/${padTot}] "${shortSub}" (${shortId}...)`);
    if (entry.skipReason && entry.skipReason.includes("PENDING_AI")) {
      console.log(
        "  └─ PARKED: PENDING_AI (Model Unavailable - Will retry next sync)"
      );
    } else {
      console.log(
        `  └─ SKIPPED: ${entry.skipReason || "Non-Job / Marketing or Newsletter"}`
      );
    }
    maybeEmitAutoSummary();
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
    maybeEmitAutoSummary();
    return;
  }

  // Development: 100-column compact card
  console.log(`\n[SYNC ${padIdx}/${padTot}] "${shortSub}" (${shortId}...)`);
  console.log(`┌${"─".repeat(98)}┐`);

  // Format routing cleanly for pure 2-tier pipeline
  const formattedRouting: string[] = [];
  if (entry.routing.some((r) => r.includes("Tier 2: CLOUD"))) {
    formattedRouting.push("Tier 2: CLOUD_BYOK (Ollama failover)");
  } else if (entry.routing.some((r) => r.includes("Tier 1: LOCAL_OLLAMA"))) {
    formattedRouting.push("Tier 1: LOCAL_OLLAMA");
  } else {
    formattedRouting.push(...entry.routing);
  }

  for (const route of formattedRouting) {
    const line = `Triage: ${truncate(route, 88)}`.padEnd(96);
    console.log(`│ ${line} │`);
  }

  console.log(`├${"─".repeat(48)}┬${"─".repeat(49)}┤`);

  const leftCol1 = truncate(`Company : ${entry.company || "Unknown"}`, 46).padEnd(46);
  const rightCol1 = truncate(`Location : ${entry.location || "Remote"}`, 47).padEnd(47);
  console.log(`│ ${leftCol1} │ ${rightCol1} │`);

  const leftCol2 = truncate(`Role    : ${entry.role || "Role"}`, 46).padEnd(46);
  const rightCol2 = truncate(`Salary   : ${entry.salary || "$TBD"}`, 47).padEnd(47);
  console.log(`│ ${leftCol2} │ ${rightCol2} │`);

  const fitStr =
    entry.matchScore !== undefined
      ? `${entry.matchScore}% (${entry.matchTier || "MID"}) [${entry.matchSource || "AI"}]`
      : "N/A";
  const leftCol3 = truncate(`Status  : ${entry.status || "LEAD"}`, 46).padEnd(46);
  const rightCol3 = truncate(`Match Fit: ${fitStr}`, 47).padEnd(47);
  console.log(`│ ${leftCol3} │ ${rightCol3} │`);

  console.log(`├${"─".repeat(48)}┴${"─".repeat(49)}┤`);

  // Multi-line word-wrapped "Saved :" with second line indented past "Saved   : "
  const fullAction = (entry.databaseAction || "Processed").trim();
  const maxLine1Chars = 86; // 96 total inner width - 10 chars label
  const maxLine2Chars = 86;

  if (fullAction.length <= maxLine1Chars) {
    const line = `Saved   : ${fullAction}`.padEnd(96);
    console.log(`│ ${line} │`);
  } else {
    let splitIdx = fullAction.lastIndexOf(" ", maxLine1Chars);
    if (splitIdx === -1 || splitIdx < 45) {
      splitIdx = maxLine1Chars;
    }
    const line1Text = fullAction.slice(0, splitIdx).trim();
    const remaining = fullAction.slice(splitIdx).trim();
    const line2Text = truncate(remaining, maxLine2Chars);

    const line1 = `Saved   : ${line1Text}`.padEnd(96);
    const line2 = `          ${line2Text}`.padEnd(96);
    console.log(`│ ${line1} │`);
    console.log(`│ ${line2} │`);
  }

  console.log(`└${"─".repeat(98)}┘`);
  maybeEmitAutoSummary();
}

// ---------------------------------------------------------------------------
// 3. BATCH SUMMARY BANNER
// ---------------------------------------------------------------------------
export type SyncSummaryStats = {
  total: number;
  durationMs: number;
  ollamaCount: number;
  cloudCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  watermark: string;
  opportunitiesTouched?: number;
  parsedCount?: number;
};

export function logSyncSummaryBanner(stats: SyncSummaryStats): void {
  const now = Date.now();
  const lastTime = globalForTelemetry.__mailpilot_last_banner_time ?? 0;
  const lastTotal = globalForTelemetry.__mailpilot_last_banner_total ?? 0;
  if (now - lastTime < 1000 && stats.total === lastTotal && !process.env.VITEST) {
    return;
  }
  globalForTelemetry.__mailpilot_last_banner_time = now;
  globalForTelemetry.__mailpilot_last_banner_total = stats.total;

  const durationSec = (stats.durationMs / 1000).toFixed(1);
  const touchedCount =
    stats.opportunitiesTouched ?? stats.createdCount + stats.updatedCount;
  const avgPerOppSec =
    touchedCount > 0
      ? (stats.durationMs / 1000 / touchedCount).toFixed(1)
      : "0.0";
  const avgPerMsgSec =
    stats.total > 0
      ? (stats.durationMs / 1000 / stats.total).toFixed(1)
      : "0.0";

  const parsedSuffix =
    typeof stats.parsedCount === "number" && stats.parsedCount > 0
      ? `, ${stats.parsedCount} Parsed`
      : "";

  if (!isAsciiTableLoggingEnabled()) {
    console.info(
      JSON.stringify({
        scope: "Sync",
        event: "sync_summary",
        ...stats,
        opportunitiesTouched: touchedCount,
        avgPacePerOpportunitySec: Number(avgPerOppSec),
        avgPacePerMessageSec: Number(avgPerMsgSec),
      })
    );
    return;
  }

  console.log(`\n┌${"─".repeat(98)}┐`);
  console.log(
    `│ ${`[SYNC COMPLETE] ${stats.total} Messages Processed in ${durationSec}s`.padEnd(96)} │`
  );
  console.log(
    `│ ${`Opportunities: ${touchedCount} Touched (${stats.createdCount} Added, ${stats.updatedCount} Deduped${parsedSuffix})`.padEnd(96)} │`
  );
  console.log(
    `│ ${`Avg Pace : ${avgPerOppSec}s / opportunity (${avgPerMsgSec}s / message)`.padEnd(96)} │`
  );
  console.log(
    `│ ${`Providers: ${stats.ollamaCount} Ollama │ ${stats.cloudCount} Cloud BYOK`.padEnd(96)} │`
  );
  console.log(
    `│ ${`Database : ${stats.createdCount} Created │ ${stats.updatedCount} Updated │ ${stats.skippedCount} Skipped`.padEnd(96)} │`
  );
  console.log(`│ ${`Watermark: ${stats.watermark}`.padEnd(96)} │`);
  console.log(`└${"─".repeat(98)}┘\n`);
}
