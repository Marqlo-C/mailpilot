import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  truncate,
  isAsciiTableLoggingEnabled,
  logEngineExecutionTable,
  logCompactSyncCard,
  logSyncSummaryBanner,
  logStory,
} from "../index";

describe("Compact 66-Col ASCII Terminal Telemetry", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("truncate utility", () => {
    it("shortens strings exceeding length with ellipsis and removes zero-width characters", () => {
      expect(truncate("Short string", 20)).toBe("Short string");
      expect(truncate("Very long string that needs truncation", 15)).toBe("Very long st...");
      expect(truncate("clean\u200B string", 20)).toBe("clean string");
    });
  });

  describe("isAsciiTableLoggingEnabled", () => {
    it("respects LOG_ASCII_TABLES override", () => {
      process.env.LOG_ASCII_TABLES = "1";
      expect(isAsciiTableLoggingEnabled()).toBe(true);

      process.env.LOG_ASCII_TABLES = "0";
      expect(isAsciiTableLoggingEnabled()).toBe(false);
    });

    it("defaults to true in development and false in production", () => {
      delete process.env.LOG_ASCII_TABLES;

      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      expect(isAsciiTableLoggingEnabled()).toBe(true);

      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      expect(isAsciiTableLoggingEnabled()).toBe(false);
    });
  });

  describe("logEngineExecutionTable", () => {
    it("renders OLLAMA ENGINE start and complete cards in dev mode", () => {
      process.env.LOG_ASCII_TABLES = "1";
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logEngineExecutionTable({
        engineType: "LOCAL_OLLAMA",
        provider: "LOCAL_OLLAMA",
        model: "llama3.1:8b",
        phase: "START",
        promptChars: 3200,
        idleTimeoutMs: 45000,
        hardCapMs: 120000,
      });

      expect(consoleSpy).toHaveBeenCalled();
      const startCalls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(startCalls.some((c) => typeof c === "string" && c.includes("OLLAMA ENGINE [llama3.1:8b]"))).toBe(true);
      expect(startCalls.some((c) => typeof c === "string" && c.includes("Payload : 3,200 chars"))).toBe(true);

      consoleSpy.mockClear();

      logEngineExecutionTable({
        engineType: "LOCAL_OLLAMA",
        provider: "LOCAL_OLLAMA",
        model: "llama3.1:8b",
        phase: "COMPLETE",
        promptChars: 3200,
        outputChars: 450,
        durationMs: 1850,
        chunks: 24,
      });

      const completeCalls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(completeCalls.some((c) => typeof c === "string" && c.includes("24 chunks"))).toBe(true);
    });

    it("renders CLOUD ENGINE cards for rate limits and errors", () => {
      process.env.LOG_ASCII_TABLES = "1";
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logEngineExecutionTable({
        engineType: "CLOUD_BYOK",
        provider: "OPENROUTER",
        model: "meta-llama/llama-3.3-70b-instruct",
        phase: "RATE_LIMIT",
        promptChars: 2500,
        rotationNote: "HTTP 429 Rate Limit - Rotating to candidate model",
      });

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => typeof c === "string" && c.includes("CLOUD ENGINE"))).toBe(true);
      expect(calls.some((c) => typeof c === "string" && c.includes("HTTP 429 Rate Limit"))).toBe(true);
    });

    it("emits single-line JSON in production mode", () => {
      process.env.LOG_ASCII_TABLES = "0";
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      logEngineExecutionTable({
        engineType: "CLOUD_BYOK",
        provider: "OPENAI",
        model: "gpt-4o-mini",
        phase: "COMPLETE",
        promptChars: 1500,
        outputChars: 300,
        durationMs: 820,
      });

      expect(infoSpy).toHaveBeenCalled();
      const logged = JSON.parse(infoSpy.mock.calls[0][0]);
      expect(logged.scope).toBe("EngineTelemetry");
      expect(logged.engine).toBe("CLOUD_BYOK");
      expect(logged.provider).toBe("OPENAI");
      expect(logged.durationMs).toBe(820);
    });
  });

  describe("logCompactSyncCard", () => {
    it("renders clean single-line SKIPPED for non-job emails in dev mode", () => {
      process.env.LOG_ASCII_TABLES = "1";
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logCompactSyncCard({
        index: 2,
        total: 10,
        subject: "50% off pizza this Friday!",
        messageId: "msg-pizza123",
        isJob: false,
        routing: [],
        skipReason: "Non-Job / Marketing or Newsletter",
      });

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => typeof c === "string" && c.includes("[SYNC 02/10] \"50% off pizza this Friday!\""))).toBe(true);
      expect(calls.some((c) => typeof c === "string" && c.includes("SKIPPED: Non-Job / Marketing or Newsletter"))).toBe(true);
    });

    it("renders compact 66-col card for job emails without rationale bloat", () => {
      process.env.LOG_ASCII_TABLES = "1";
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logCompactSyncCard({
        index: 1,
        total: 10,
        subject: "Founding Engineer at Warp",
        messageId: "msg-warp12345",
        isJob: true,
        routing: [
          "Tier 1: LOCAL_OLLAMA -> SUCCESS [1.2s]",
        ],
        company: "Warp",
        role: "Founding Engineer",
        location: "San Francisco, CA",
        salary: "$180K - $220K",
        status: "LEAD",
        matchScore: 88,
        matchTier: "HIGH",
        matchSource: "AI",
        databaseAction: "Created new opportunity record",
      });

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => typeof c === "string" && c.includes("[SYNC 01/10]"))).toBe(true);
      expect(calls.some((c) => typeof c === "string" && c.includes("Company : Warp"))).toBe(true);
      expect(calls.some((c) => typeof c === "string" && c.includes("Match Fit: 88% (HIGH) [AI]"))).toBe(true);
      // Verify strict 66-column boundaries for all box lines
      const boxLines = calls
        .map((c) => (typeof c === "string" ? c.trim() : ""))
        .filter(
          (c) =>
            c.startsWith("┌") ||
            c.startsWith("│") ||
            c.startsWith("├") ||
            c.startsWith("└")
        );
      expect(boxLines.length).toBe(9);
      for (const line of boxLines) {
        expect(line.length).toBe(66);
      }

      // Verify no paragraph text or rationale narrative was printed
      for (const call of calls) {
        if (typeof call === "string") {
          expect(call).not.toContain("Reason  :");
          expect(call).not.toContain("Candidate fit evaluated");
        }
      }
    });

    it("condenses Tier 2 cloud failover into a single clean line", () => {
      process.env.LOG_ASCII_TABLES = "1";
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logCompactSyncCard({
        index: 2,
        total: 10,
        subject: "Staff Engineer at Stripe",
        messageId: "msg-stripe12345",
        isJob: true,
        routing: [
          "Tier 1: LOCAL_OLLAMA -> FAILED (ECONNREFUSED)",
          "Tier 2: CLOUD_BYOK   -> SUCCESS [1.1s]",
        ],
        company: "Stripe",
        role: "Staff Engineer",
        status: "LEAD",
        matchScore: 75,
      });

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(
        calls.some(
          (c) =>
            typeof c === "string" &&
            c.includes("Tier 2: CLOUD_BYOK (Ollama failover)")
        )
      ).toBe(true);

      const boxLines = calls
        .map((c) => (typeof c === "string" ? c.trim() : ""))
        .filter(
          (c) =>
            c.startsWith("┌") ||
            c.startsWith("│") ||
            c.startsWith("├") ||
            c.startsWith("└")
        );
      expect(boxLines.length).toBe(9);
      for (const line of boxLines) {
        expect(line.length).toBe(66);
      }
    });

    it("renders clean Tier 1 LOCAL_OLLAMA routing line", () => {
      process.env.LOG_ASCII_TABLES = "1";
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logCompactSyncCard({
        index: 3,
        total: 10,
        subject: "Senior Frontend Engineer at Vercel",
        messageId: "msg-vercel12345",
        isJob: true,
        routing: ["Tier 1: LOCAL_OLLAMA -> SUCCESS [0.8s]"],
        company: "Vercel",
        role: "Senior Frontend Engineer",
        status: "LEAD",
        matchScore: 82,
      });

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(
        calls.some(
          (c) =>
            typeof c === "string" &&
            c.includes("Tier 1: LOCAL_OLLAMA")
        )
      ).toBe(true);
    });

    it("renders PARKED notice when email is parked as PENDING_AI", () => {
      process.env.LOG_ASCII_TABLES = "1";
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logCompactSyncCard({
        index: 4,
        total: 10,
        subject: "Staff DevOps Engineer at Linear",
        messageId: "msg-linear12345",
        isJob: false,
        routing: [],
        skipReason: "PENDING_AI (Ollama offline, Cloud disabled)",
      });

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(
        calls.some(
          (c) =>
            typeof c === "string" &&
            c.includes("└─ PARKED: PENDING_AI (Model Unavailable - Will retry next sync)")
        )
      ).toBe(true);
    });

    it("silences logStory debug logs unless DEBUG_VERBOSE is set", () => {
      delete process.env.DEBUG_VERBOSE;
      const debugFn = vi.fn();
      const mockLog = {
        isLevelEnabled: vi.fn().mockReturnValue(true),
        debug: debugFn,
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as any;

      logStory(mockLog, "Step 2/4 — Job search", { key: "val" }, "debug");
      expect(debugFn).not.toHaveBeenCalled();

      process.env.DEBUG_VERBOSE = "1";
      logStory(mockLog, "Step 2/4 — Job search", { key: "val" }, "debug");
      expect(debugFn).toHaveBeenCalledWith(expect.stringContaining("Step 2/4"));
    });

    it("emits single-line JSON in production mode", () => {
      process.env.LOG_ASCII_TABLES = "0";
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      logCompactSyncCard({
        index: 1,
        total: 10,
        subject: "Founding Engineer at Warp",
        messageId: "msg-warp12345",
        isJob: true,
        routing: [],
        company: "Warp",
        role: "Founding Engineer",
        status: "LEAD",
        matchScore: 88,
        matchTier: "HIGH",
        databaseAction: "Created new opportunity record",
      });

      expect(infoSpy).toHaveBeenCalled();
      const logged = JSON.parse(infoSpy.mock.calls[0][0]);
      expect(logged.scope).toBe("Sync");
      expect(logged.company).toBe("Warp");
      expect(logged.score).toBe(88);
    });
  });

  describe("logSyncSummaryBanner", () => {
    it("renders formatted summary banner in dev mode with skippedCount", () => {
      process.env.LOG_ASCII_TABLES = "1";
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logSyncSummaryBanner({
        total: 15,
        durationMs: 3500,
        ollamaCount: 5,
        cloudCount: 5,
        createdCount: 4,
        updatedCount: 3,
        skippedCount: 8,
        watermark: "2026-10-12T09:00:00.000Z",
      });

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => typeof c === "string" && c.includes("[SYNC COMPLETE] 15 Messages Processed in 3.5s"))).toBe(true);
      expect(calls.some((c) => typeof c === "string" && c.includes("Providers: 5 Ollama │ 5 Cloud BYOK"))).toBe(true);
      expect(calls.some((c) => typeof c === "string" && c.includes("4 Created │ 3 Updated │ 8 Skipped"))).toBe(true);
      const bannerLines = calls
        .map((c) => (typeof c === "string" ? c.trim() : ""))
        .filter(
          (c) =>
            c.startsWith("┌") || c.startsWith("│") || c.startsWith("└")
        );
      expect(bannerLines.length).toBe(6);
      for (const line of bannerLines) {
        expect(line.length).toBe(66);
      }
    });

    it("emits single-line JSON in production mode", () => {
      process.env.LOG_ASCII_TABLES = "0";
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      logSyncSummaryBanner({
        total: 15,
        durationMs: 3500,
        ollamaCount: 5,
        cloudCount: 5,
        createdCount: 4,
        updatedCount: 3,
        skippedCount: 8,
        watermark: "2026-10-12T09:00:00.000Z",
      });

      expect(infoSpy).toHaveBeenCalled();
      const logged = JSON.parse(infoSpy.mock.calls[0][0]);
      expect(logged.event).toBe("sync_summary");
      expect(logged.skippedCount).toBe(8);
    });
  });
});
