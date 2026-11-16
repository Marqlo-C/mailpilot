import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logShadowEvaluationTelemetry,
  type ShadowEvaluationTelemetryParams,
} from "../shadow-telemetry";

describe("Shadow Evaluation Telemetry Logger", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const baseParams: ShadowEvaluationTelemetryParams = {
    opportunityId: "opp_12345678",
    title: "Senior Systems Engineer",
    company: "Acme Logistics",
    heuristicScore: 72,
    crossoverScore: 84,
    transferableSkillsCount: 3,
    provider: "local_ollama",
    model: "nomic-embed-text",
    latencyMs: 145,
  };

  it("renders compact single-line telemetry in development mode by default", () => {
    process.env.LOG_ASCII_TABLES = "1";
    delete process.env.LOG_SHADOW_CARDS;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logShadowEvaluationTelemetry(baseParams);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const line = consoleSpy.mock.calls[0][0] as string;

    // Verify compact single-line telemetry format
    expect(line).toContain("[Shadow Eval]");
    expect(line).toContain("Acme Logistics");
    expect(line).toContain("Heur: 72% │ Embed: 84% (Δ +12%)");
    expect(line).toContain("3 skills (145ms)");
    expect(line).not.toContain("[local_ollama:nomic-embed-text]");
    expect(line.length).toBeLessThanOrEqual(98);
  });

  it("renders compact single-line silent failure when an error is captured in dev mode", () => {
    process.env.LOG_ASCII_TABLES = "1";
    delete process.env.LOG_SHADOW_CARDS;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logShadowEvaluationTelemetry({
      ...baseParams,
      crossoverScore: 0,
      transferableSkillsCount: 0,
      error: "Ollama server timeout (5500ms limit exceeded)",
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const line = consoleSpy.mock.calls[0][0] as string;

    expect(line).toContain("[Shadow Eval]");
    expect(line).toContain("Acme Logistics");
    expect(line).toContain("FAILED (Ollama server timeout");
    expect(line).toContain("(145ms)");
    expect(line.length).toBeLessThanOrEqual(98);
  });

  it("renders full 100-col ASCII table card when LOG_SHADOW_CARDS=1 is explicitly requested", () => {
    process.env.LOG_ASCII_TABLES = "1";
    process.env.LOG_SHADOW_CARDS = "1";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logShadowEvaluationTelemetry(baseParams);

    expect(consoleSpy).toHaveBeenCalled();
    const calls = consoleSpy.mock.calls.map((c) => c[0] as string);

    // Verify card header with provider and model
    expect(
      calls.some((c) =>
        c.includes("SHADOW EMBEDDED EVALUATION [local_ollama:nomic-embed-text]")
      )
    ).toBe(true);

    // Verify opportunity details
    expect(
      calls.some((c) =>
        c.includes("Opportunity : Acme Logistics — Senior Systems Engineer")
      )
    ).toBe(true);

    // Verify side-by-side score comparison
    expect(
      calls.some((c) =>
        c.includes(
          "Scores      : Heuristic: 72% │ Embedded Crossover: 84% (Δ +12%)"
        )
      )
    ).toBe(true);

    // Verify transferable skills and latency
    expect(
      calls.some((c) =>
        c.includes("Skills      : 3 transferable skills mapped │ Latency: 145ms")
      )
    ).toBe(true);
  });

  it("emits single-line JSON structured log in production mode", () => {
    process.env.LOG_ASCII_TABLES = "0";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logShadowEvaluationTelemetry(baseParams);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(infoSpy.mock.calls[0][0]);
    expect(parsed).toMatchObject({
      scope: "ShadowEmbeddingTelemetry",
      opportunityId: "opp_12345678",
      company: "Acme Logistics",
      title: "Senior Systems Engineer",
      heuristicScore: 72,
      crossoverScore: 84,
      transferableSkillsCount: 3,
      provider: "local_ollama",
      model: "nomic-embed-text",
      latencyMs: 145,
    });
  });
});
