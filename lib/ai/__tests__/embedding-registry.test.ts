import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callGeminiEmbedding,
  callJinaEmbedding,
  callOllamaEmbedding,
  callOpenAiEmbedding,
  getDefaultModelForProvider,
  getBatchEmbeddings,
  getEmbedding,
  isOllamaCircuitTripped,
  resetOllamaCircuit,
  resolveEmbeddingConfig,
  tripOllamaCircuit,
} from "../embedding-registry";
import type { AccountRules } from "@/lib/validations/rules.schema";

describe("Embedding Registry & Multi-Provider Drivers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetOllamaCircuit();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.env = originalEnv;
  });

  describe("Ollama Driver", () => {
    it("calls /api/embeddings for a single string", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await callOllamaEmbedding(["test prompt"], {
        provider: "local_ollama",
        model: "nomic-embed-text",
        baseUrl: "http://localhost:11434",
      });

      expect(result).toEqual([[0.1, 0.2, 0.3]]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://localhost:11434/api/embeddings");
      expect(JSON.parse(options?.body as string)).toEqual({
        model: "nomic-embed-text",
        prompt: "test prompt",
      });
    });

    it("handles batch arrays by calling /api/embeddings for each item", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ embedding: [0.1, 0.2] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ embedding: [0.3, 0.4] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );

      const result = await callOllamaEmbedding(["first", "second"], {
        provider: "local_ollama",
        model: "nomic-embed-text",
        baseUrl: "http://localhost:11434",
      });

      expect(result).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("trips circuit breaker and returns null on network failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Connection refused")
      );

      const result = await callOllamaEmbedding(["prompt"], {
        provider: "local_ollama",
        model: "nomic-embed-text",
        baseUrl: "http://localhost:11434",
      });

      expect(result).toBeNull();
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);
    });

    it("fast-fails immediately when circuit breaker is already open", async () => {
      tripOllamaCircuit("http://localhost:11434", "recently offline");

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const result = await callOllamaEmbedding(["prompt"], {
        provider: "local_ollama",
        model: "nomic-embed-text",
        baseUrl: "http://localhost:11434",
      });

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("logs actionable warning on HTTP 404 missing model response", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("model 'nomic-embed-text' not found", { status: 404 })
      );

      const result = await callOllamaEmbedding(["sample text"], {
        provider: "local_ollama",
        model: "nomic-embed-text",
        baseUrl: "http://localhost:11434",
      });

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        "[Ollama Embeddings] Model 'nomic-embed-text' not found on http://localhost:11434. Run 'ollama pull nomic-embed-text' on the host machine."
      );
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);
    });

    it("expires circuit breaker backoff after 5 seconds in development mode", async () => {
      vi.useFakeTimers();
      vi.stubEnv("NODE_ENV", "development");

      tripOllamaCircuit("http://localhost:11434", "dev test failure");
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);

      // Advance by 4.9 seconds - should still be tripped
      vi.advanceTimersByTime(4900);
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);

      // Advance past 5 seconds - should now be reset
      vi.advanceTimersByTime(200);
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(false);

      vi.useRealTimers();
    });

    it("retains circuit breaker backoff for 60 seconds in production mode", async () => {
      vi.useFakeTimers();
      vi.stubEnv("NODE_ENV", "production");

      tripOllamaCircuit("http://localhost:11434", "prod test failure");
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);

      // Advance by 10 seconds - should still be tripped in production
      vi.advanceTimersByTime(10000);
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);

      // Advance past 60 seconds total (50.1s more) - should now be reset
      vi.advanceTimersByTime(50100);
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(false);

      vi.useRealTimers();
    });

    it("resets circuit breaker via exported resetOllamaCircuit", () => {
      tripOllamaCircuit("http://localhost:11434", "test");
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(true);

      resetOllamaCircuit("http://localhost:11434");
      expect(isOllamaCircuitTripped("http://localhost:11434")).toBe(false);
    });
  });

  describe("OpenAI Driver", () => {
    it("calls /v1/embeddings with authorization header and dimension support", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { index: 1, embedding: [0.3, 0.4] },
              { index: 0, embedding: [0.1, 0.2] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await callOpenAiEmbedding(["item1", "item2"], {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "sk-test-openai-key",
        dimensions: 256,
      });

      expect(result).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/embeddings");
      const headers = options?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-test-openai-key");
      expect(JSON.parse(options?.body as string)).toEqual({
        model: "text-embedding-3-small",
        input: ["item1", "item2"],
        dimensions: 256,
      });
    });

    it("returns null when no API key is provided", async () => {
      delete process.env.OPENAI_API_KEY;

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const result = await callOpenAiEmbedding(["text"], {
        provider: "openai",
        model: "text-embedding-3-small",
      });

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns null gracefully on non-200 HTTP response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      );

      const result = await callOpenAiEmbedding(["text"], {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "sk-invalid",
      });

      expect(result).toBeNull();
    });
  });

  describe("Google Gemini Driver", () => {
    it("calls embedContent for a single text with taskType mapping", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            embedding: { values: [0.15, 0.25, 0.35] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await callGeminiEmbedding(["sample job text"], {
        provider: "gemini",
        model: "text-embedding-004",
        apiKey: "gemini-api-key-test",
        taskType: "query",
        dimensions: 128,
      });

      expect(result).toEqual([[0.15, 0.25, 0.35]]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent"
      );
      const headers = options?.headers as Record<string, string>;
      expect(headers["x-goog-api-key"]).toBe("gemini-api-key-test");
      expect(JSON.parse(options?.body as string)).toEqual({
        content: { parts: [{ text: "sample job text" }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: 128,
      });
    });

    it("calls batchEmbedContents for multiple texts", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            embeddings: [
              { values: [0.1, 0.2] },
              { values: [0.3, 0.4] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await callGeminiEmbedding(["req1", "req2"], {
        provider: "gemini",
        model: "text-embedding-004",
        apiKey: "gemini-api-key-test",
        taskType: "document",
      });

      expect(result).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents"
      );
      const parsedBody = JSON.parse(options?.body as string);
      expect(parsedBody.requests).toHaveLength(2);
      expect(parsedBody.requests[0].taskType).toBe("RETRIEVAL_DOCUMENT");
      expect(parsedBody.requests[1].taskType).toBe("RETRIEVAL_DOCUMENT");
    });

    it("returns null when no Gemini API key is configured", async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const result = await callGeminiEmbedding(["text"], {
        provider: "gemini",
        model: "text-embedding-004",
      });

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("Jina AI Driver", () => {
    it("calls /v1/embeddings with adapter task parameter and dimensions", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ index: 0, embedding: [0.5, 0.6] }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await callJinaEmbedding(["candidate bullet"], {
        provider: "jina",
        model: "jina-embeddings-v3",
        apiKey: "jina_test_key",
        taskType: "similarity",
        dimensions: 512,
      });

      expect(result).toEqual([[0.5, 0.6]]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.jina.ai/v1/embeddings");
      const headers = options?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer jina_test_key");
      expect(JSON.parse(options?.body as string)).toEqual({
        model: "jina-embeddings-v3",
        task: "text-matching",
        input: ["candidate bullet"],
        dimensions: 512,
      });
    });

    it("returns null when no Jina key is present", async () => {
      delete process.env.JINA_API_KEY;

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const result = await callJinaEmbedding(["text"], {
        provider: "jina",
        model: "jina-embeddings-v3",
      });

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("Unified getEmbedding & getBatchEmbeddings", () => {
    it("returns null immediately when provider is 'disabled'", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const single = await getEmbedding("test", {
        provider: "disabled",
        model: "none",
      });
      const batch = await getBatchEmbeddings(["test"], {
        provider: "disabled",
        model: "none",
      });

      expect(single).toBeNull();
      expect(batch).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns empty array for empty batch without network calls", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const result = await getBatchEmbeddings([], {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "test",
      });

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns null for empty or whitespace single string", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const result = await getEmbedding("   ", {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "test",
      });

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fails fast returning null when fetch throws or times out", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("The operation was aborted")
      );

      const result = await getEmbedding("sample", {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "test",
      });

      expect(result).toBeNull();
    });
  });

  describe("resolveEmbeddingConfig", () => {
    it("returns null when embeddingProvider is 'disabled'", () => {
      const rules = { embeddingProvider: "disabled" } as Partial<AccountRules>;
      expect(resolveEmbeddingConfig(rules)).toBeNull();
    });

    it("auto-infers local_ollama when bridgeConnected is true even if embeddingProvider is disabled", () => {
      const rules = {
        embeddingProvider: "disabled",
        bridgeConnected: true,
      } as Partial<AccountRules>;
      const config = resolveEmbeddingConfig(rules);
      expect(config?.provider).toBe("local_ollama");
      expect(config?.model).toBe("nomic-embed-text");
    });

    it("auto-infers local_ollama in development mode when embeddingProvider is disabled", () => {
      vi.stubEnv("NODE_ENV", "development");
      const rules = { embeddingProvider: "disabled" } as Partial<AccountRules>;
      const config = resolveEmbeddingConfig(rules);
      expect(config?.provider).toBe("local_ollama");
      expect(config?.model).toBe("nomic-embed-text");
    });

    it("resolves local_ollama with default model", () => {
      const rules = {
        embeddingProvider: "local_ollama",
        embeddingModel: "nomic-embed-text",
      } as Partial<AccountRules>;

      const config = resolveEmbeddingConfig(rules);
      expect(config?.provider).toBe("local_ollama");
      expect(config?.model).toBe("nomic-embed-text");
      expect(config?.baseUrl).toBeDefined();
    });

    it("respects custom configured localOllamaUrl when resolving local_ollama", () => {
      const rules = {
        embeddingProvider: "local_ollama",
        localOllamaUrl: "http://192.168.1.76:11434",
      } as Partial<AccountRules>;

      const config = resolveEmbeddingConfig(rules);
      expect(config?.provider).toBe("local_ollama");
      expect(config?.baseUrl).toBe("http://192.168.1.76:11434");
    });

    it("resolves openai using fallback env when no BYOK key configured", () => {
      process.env.OPENAI_API_KEY = "sk-env-test";
      const rules = {
        embeddingProvider: "openai",
        embeddingModel: "text-embedding-3-small",
      } as Partial<AccountRules>;

      const config = resolveEmbeddingConfig(rules);
      expect(config?.provider).toBe("openai");
      expect(config?.apiKey).toBe("sk-env-test");
    });

    it("resolves jina with fallback env", () => {
      process.env.JINA_API_KEY = "jina_env_key";
      const rules = {
        embeddingProvider: "jina",
      } as Partial<AccountRules>;

      const config = resolveEmbeddingConfig(rules);
      expect(config?.provider).toBe("jina");
      expect(config?.model).toBe("jina-embeddings-v3");
      expect(config?.apiKey).toBe("jina_env_key");
    });

    it("resolves gemini with fallback env", () => {
      process.env.GEMINI_API_KEY = "gemini_env_key";
      const rules = {
        embeddingProvider: "gemini",
      } as Partial<AccountRules>;

      const config = resolveEmbeddingConfig(rules);
      expect(config?.provider).toBe("gemini");
      expect(config?.model).toBe("text-embedding-004");
      expect(config?.apiKey).toBe("gemini_env_key");
    });
  });

  describe("getDefaultModelForProvider", () => {
    it("returns canonical default models", () => {
      expect(getDefaultModelForProvider("local_ollama")).toBe("nomic-embed-text");
      expect(getDefaultModelForProvider("openai")).toBe("text-embedding-3-small");
      expect(getDefaultModelForProvider("gemini")).toBe("text-embedding-004");
      expect(getDefaultModelForProvider("jina")).toBe("jina-embeddings-v3");
      expect(getDefaultModelForProvider("disabled")).toBe("");
    });
  });
});
