import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOllamaCircuitTripped,
  tripOllamaCircuit,
  resetOllamaCircuit,
  probeOllamaTags,
  OllamaUnreachableError,
  OllamaInvalidJsonError,
  parseJsonObject,
  resolveOllamaModel,
  DEFAULT_OLLAMA_MODEL,
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
    it("returns null and logs debug when OllamaUnreachableError is thrown with DEBUG_VERBOSE", async () => {
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

      expect(result).toBeNull();
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

      expect(result).toBeNull();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it("returns null when Ollama is unreachable", async () => {
      vi.spyOn(dispatcher, "callLLMWithFallback").mockRejectedValue(
        new OllamaUnreachableError("http://localhost:11434", "ECONNREFUSED")
      );

      const result = await classifyJobEmail({
        subject: "Senior Product Designer opening at Linear",
        body: "Linear is looking for a Senior Product Designer to join our team.",
        fromEmail: "recruiting@linear.app",
        llmProvider: "LOCAL_OLLAMA",
      });

      expect(result).toBeNull();
    });

    it("returns null on OllamaInvalidJsonError WITHOUT tripping circuit breaker", async () => {
      vi.spyOn(dispatcher, "callLLMWithFallback").mockRejectedValue(
        new OllamaInvalidJsonError("empty or invalid JSON after local retries")
      );

      const result = await classifyJobEmail({
        subject: "Senior Product Designer opening at Linear",
        body: "Linear is looking for a Senior Product Designer to join our team in San Francisco. Salary range $160,000 - $200,000. Apply at https://linear.app/careers/designer",
        fromEmail: "recruiting@linear.app",
        llmProvider: "LOCAL_OLLAMA",
      });

      expect(result).toBeNull();
      // Circuit must remain CLOSED so subsequent messages can run Ollama!
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(false);
    });
  });

  describe("parseJsonObject Stream Truncation Repair", () => {
    it("successfully parses valid clean JSON", () => {
      const parsed = parseJsonObject('{"is_job_related": true, "company_name": "Stripe"}');
      expect(parsed).toEqual({ is_job_related: true, company_name: "Stripe" });
    });

    it("repairs and parses JSON missing outer closing brace", () => {
      const parsed = parseJsonObject('{"is_job_related": true, "company_name": "Stripe"');
      expect(parsed).toEqual({ is_job_related: true, company_name: "Stripe" });
    });

    it("repairs and parses JSON missing array and object closing brackets", () => {
      const parsed = parseJsonObject('{"is_job_related": true, "jobs": [{"title": "Software Engineer"}');
      expect(parsed).toEqual({
        is_job_related: true,
        jobs: [{ title: "Software Engineer" }],
      });
    });

    it("repairs and parses JSON with trailing comma before cut-off", () => {
      const parsed = parseJsonObject('{"is_job_related": true, "company": "Vercel",');
      expect(parsed).toEqual({ is_job_related: true, company: "Vercel" });
    });

    it("repairs and parses JSON cut-off inside a string in an array", () => {
      const parsed = parseJsonObject('{"is_job_related": true, "jobs": [{"title": "Principal Architect');
      expect(parsed).toEqual({
        is_job_related: true,
        jobs: [{ title: "Principal Architect" }],
      });
    });
  });

  describe("resolveOllamaModel Dynamic Configuration", () => {
    it("respects devOverride in development mode", () => {
      vi.stubEnv("NODE_ENV", "development");
      const model = resolveOllamaModel("db-model:latest", "dev-override:latest");
      expect(model).toBe("dev-override:latest");
    });

    it("prioritizes configured model over env and default", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("OLLAMA_MODEL", "env-model:latest");
      const model = resolveOllamaModel("db-model:latest", null);
      expect(model).toBe("db-model:latest");
    });

    it("falls back to process.env.OLLAMA_MODEL if no configured model is supplied", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("OLLAMA_MODEL", "env-model:latest");
      const model = resolveOllamaModel(null, null);
      expect(model).toBe("env-model:latest");
    });

    it("falls back to DEFAULT_OLLAMA_MODEL when nothing is configured", () => {
      delete process.env.OLLAMA_MODEL;
      const model = resolveOllamaModel(null, null);
      expect(model).toBe(DEFAULT_OLLAMA_MODEL);
    });
  });
});
