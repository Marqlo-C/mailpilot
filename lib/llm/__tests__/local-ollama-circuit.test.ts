import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOllamaCircuitTripped,
  tripOllamaCircuit,
  resetOllamaCircuit,
  probeOllamaTags,
  OllamaUnreachableError,
} from "../local-ollama";
import { classifyJobEmail } from "../classification";
import * as dispatcher from "../dispatcher";

describe("Local Ollama Circuit Breaker & Offline Handling", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetOllamaCircuit();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Circuit Breaker State Management", () => {
    it("reports not tripped initially", () => {
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(false);
    });

    it("trips circuit when tripOllamaCircuit is invoked", () => {
      tripOllamaCircuit("http://localhost:11434", "connection refused");
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);
      // Normalized matching: trailing slash or casing
      expect(isOllamaCircuitTripped("http://localhost:11434/")).toBe(true);
    });

    it("resets circuit when resetOllamaCircuit is invoked", () => {
      tripOllamaCircuit("http://localhost:11434", "connection refused");
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);

      resetOllamaCircuit("http://localhost:11434");
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(false);
    });
  });

  describe("probeOllamaTags Fast-Fail", () => {
    it("immediately throws OllamaUnreachableError without network call when circuit is tripped", async () => {
      tripOllamaCircuit("http://localhost:11434", "offline");

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await expect(probeOllamaTags("http://localhost:11434")).rejects.toThrow(
        OllamaUnreachableError
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("bypasses circuit check when skipCircuitBreaker is true", async () => {
      tripOllamaCircuit("http://localhost:11434", "offline");

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ models: [{ name: "llama3:latest" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );

      const res = await probeOllamaTags("http://localhost:11434", 1000, {
        skipCircuitBreaker: true,
      });
      expect(res.models).toEqual(["llama3:latest"]);
      expect(fetchSpy).toHaveBeenCalled();
      // Successful probe resets the circuit
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(false);
    });
  });

  describe("classifyJobEmail Offline Fallback", () => {
    it("quietly falls back to Grand Heuristic when OllamaUnreachableError is thrown", async () => {
      process.env.DEBUG_VERBOSE = "1";
      vi.spyOn(dispatcher, "callLLMWithFallback").mockRejectedValue(
        new OllamaUnreachableError("http://localhost:11434", "ECONNREFUSED")
      );

      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const result = await classifyJobEmail({
        subject: "Senior Product Designer opening at Linear",
        body: "Linear is looking for a Senior Product Designer to join our team in San Francisco. Salary range $160,000 - $200,000. Apply at https://linear.app/careers/designer",
        fromEmail: "recruiting@linear.app",
        llmProvider: "LOCAL_OLLAMA",
      });

      expect(result).not.toBeNull();
      expect(result?.is_job_related).toBe(true);
      expect(result?.company_name).toBe("Linear");
      expect(result?.classificationMethod).toBe("HEURISTIC");
      expect(result?.sourceTier).toBe("TIER 3 (HEURISTIC)");
      expect(result?.routingLines).toBeDefined();
      expect(result?.routingLines?.[0]).toContain("Tier 1: LOCAL_OLLAMA");
      expect(result?.routingLines?.[2]).toContain("Tier 3: HEURISTIC");

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining("Ollama unreachable at http://localhost:11434")
      );
    });

    it("silences console.debug when DEBUG_VERBOSE is not set", async () => {
      delete process.env.DEBUG_VERBOSE;
      vi.spyOn(dispatcher, "callLLMWithFallback").mockRejectedValue(
        new OllamaUnreachableError("http://localhost:11434", "ECONNREFUSED")
      );

      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const result = await classifyJobEmail({
        subject: "Senior Product Designer opening at Linear",
        body: "Linear is looking for a Senior Product Designer to join our team in San Francisco. Salary range $160,000 - $200,000. Apply at https://linear.app/careers/designer",
        fromEmail: "recruiting@linear.app",
        llmProvider: "LOCAL_OLLAMA",
      });

      expect(result).not.toBeNull();
      expect(result?.classificationMethod).toBe("HEURISTIC");
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it("returns null in AI_ONLY mode when Ollama is unreachable", async () => {
      vi.spyOn(dispatcher, "callLLMWithFallback").mockRejectedValue(
        new OllamaUnreachableError("http://localhost:11434", "ECONNREFUSED")
      );

      const result = await classifyJobEmail({
        subject: "Senior Product Designer opening at Linear",
        body: "Linear is looking for a Senior Product Designer to join our team.",
        fromEmail: "recruiting@linear.app",
        llmProvider: "LOCAL_OLLAMA",
        accountRules: { classificationMode: "AI_ONLY" },
      });

      expect(result).toBeNull();
    });
  });
});
