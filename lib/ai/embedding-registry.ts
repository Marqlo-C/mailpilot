/**
 * ============================================================================
 * UNIFIED EMBEDDING REGISTRY & MULTI-PROVIDER DRIVER
 *
 * Implements lightweight vector embedding drivers for Ollama, OpenAI,
 * Google Gemini, and Jina AI with strict timeouts (< 6s), circuit breaking,
 * and graceful fallback.
 * ============================================================================
 */

import type { AccountRules } from "@/lib/validations/rules.schema";
import type {
  EmbeddingDriverConfig,
  EmbeddingProviderType,
  EmbeddingTaskType,
} from "./embedding-types";
import {
  CIRCUIT_BREAKER_TTL_MS,
  DEV_CIRCUIT_BREAKER_TTL_MS,
  getCircuitBreakerTtlMs,
  isOllamaCircuitTripped,
  resetOllamaCircuit,
  resolveOllamaBaseUrl,
  tripOllamaCircuit,
} from "./local-ollama";

export {
  CIRCUIT_BREAKER_TTL_MS,
  DEV_CIRCUIT_BREAKER_TTL_MS,
  getCircuitBreakerTtlMs,
  isOllamaCircuitTripped,
  resetOllamaCircuit,
  tripOllamaCircuit,
};
import {
  resolveDecryptedAccountKey,
  resolveDecryptedJinaKey,
} from "./vault";

/** Default timeout for all embedding network calls (must remain < 6 seconds for serverless safety) */
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 5000;

interface OpenAiEmbeddingItem {
  index: number;
  embedding: number[];
}

interface OpenAiEmbeddingResponse {
  data?: OpenAiEmbeddingItem[];
}

interface GeminiSingleEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

interface GeminiBatchEmbeddingResponse {
  embeddings?: Array<{
    values?: number[];
  }>;
}

interface JinaEmbeddingItem {
  index: number;
  embedding: number[];
}

interface JinaEmbeddingResponse {
  data?: JinaEmbeddingItem[];
}

interface OllamaEmbeddingResponse {
  embedding?: number[];
}

/**
 * Creates an AbortSignal with a timeout clamped to safe serverless ceilings (< 6s).
 */
function createSafeTimeoutSignal(timeoutMs?: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const effectiveTimeout = Math.min(
    timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS,
    5500
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

/**
 * Maps abstract taskType to Google Gemini's API taskType format.
 */
function mapGeminiTaskType(taskType?: EmbeddingTaskType): string {
  switch (taskType) {
    case "query":
      return "RETRIEVAL_QUERY";
    case "document":
      return "RETRIEVAL_DOCUMENT";
    case "similarity":
    default:
      return "SEMANTIC_SIMILARITY";
  }
}

/**
 * Maps abstract taskType to Jina AI's adapter task format.
 */
function mapJinaTaskType(taskType?: EmbeddingTaskType): string {
  switch (taskType) {
    case "query":
      return "retrieval.query";
    case "document":
      return "retrieval.passage";
    case "similarity":
    default:
      return "text-matching";
  }
}

/**
 * Generates embeddings via Local Ollama /api/embeddings endpoint.
 */
export async function callOllamaEmbedding(
  texts: string[],
  config: EmbeddingDriverConfig
): Promise<number[][] | null> {
  const baseUrl = resolveOllamaBaseUrl(config.baseUrl);

  if (isOllamaCircuitTripped(baseUrl)) {
    return null;
  }

  const model = config.model || "nomic-embed-text";
  const results: number[][] = [];

  for (const text of texts) {
    const { signal, clear } = createSafeTimeoutSignal(config.timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text }),
        signal,
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(
            `[Ollama Embeddings] Model '${model}' not found on ${baseUrl}. Run 'ollama pull ${model}' on the host machine.`
          );
        }
        tripOllamaCircuit(baseUrl, `HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;
      if (!data.embedding || !Array.isArray(data.embedding)) {
        tripOllamaCircuit(baseUrl, "Malformed Ollama embedding response");
        return null;
      }

      results.push(data.embedding);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      tripOllamaCircuit(baseUrl, detail);
      return null;
    } finally {
      clear();
    }
  }

  return results;
}

/**
 * Generates embeddings via OpenAI /v1/embeddings endpoint with dimension support.
 */
export async function callOpenAiEmbedding(
  texts: string[],
  config: EmbeddingDriverConfig
): Promise<number[][] | null> {
  const apiKey = config.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[embedding-registry] No OpenAI API key configured. Skipping.");
    return null;
  }

  const rawBase = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const endpoint = rawBase.endsWith("/embeddings") ? rawBase : `${rawBase}/embeddings`;

  const payload: Record<string, unknown> = {
    model: config.model || "text-embedding-3-small",
    input: texts,
  };

  if (typeof config.dimensions === "number" && config.dimensions > 0) {
    payload.dimensions = config.dimensions;
  }

  const { signal, clear } = createSafeTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`[embedding-registry] OpenAI request failed: HTTP ${response.status}`);
      return null;
    }

    const json = (await response.json()) as OpenAiEmbeddingResponse;
    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
      return null;
    }

    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[embedding-registry] OpenAI embedding call error: ${detail}`);
    return null;
  } finally {
    clear();
  }
}

/**
 * Generates embeddings via Google Gemini REST API (embedContent or batchEmbedContents).
 */
export async function callGeminiEmbedding(
  texts: string[],
  config: EmbeddingDriverConfig
): Promise<number[][] | null> {
  const apiKey =
    config.apiKey?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    console.warn("[embedding-registry] No Google Gemini API key configured. Skipping.");
    return null;
  }

  const rawModel = config.model || "text-embedding-004";
  const cleanModel = rawModel.replace(/^models\//, "");
  const baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com").replace(
    /\/+$/,
    ""
  );

  const taskType = mapGeminiTaskType(config.taskType);
  const { signal, clear } = createSafeTimeoutSignal(config.timeoutMs);

  try {
    if (texts.length === 1) {
      const endpoint = `${baseUrl}/v1beta/models/${cleanModel}:embedContent`;
      const body: Record<string, unknown> = {
        content: { parts: [{ text: texts[0] }] },
        taskType,
      };
      if (typeof config.dimensions === "number" && config.dimensions > 0) {
        body.outputDimensionality = config.dimensions;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      });

      if (!response.ok) {
        console.warn(`[embedding-registry] Gemini request failed: HTTP ${response.status}`);
        return null;
      }

      const json = (await response.json()) as GeminiSingleEmbeddingResponse;
      if (!json.embedding?.values || !Array.isArray(json.embedding.values)) {
        return null;
      }

      return [json.embedding.values];
    }

    const endpoint = `${baseUrl}/v1beta/models/${cleanModel}:batchEmbedContents`;
    const requests = texts.map((text) => {
      const req: Record<string, unknown> = {
        model: `models/${cleanModel}`,
        content: { parts: [{ text }] },
        taskType,
      };
      if (typeof config.dimensions === "number" && config.dimensions > 0) {
        req.outputDimensionality = config.dimensions;
      }
      return req;
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ requests }),
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`[embedding-registry] Gemini batch request failed: HTTP ${response.status}`);
      return null;
    }

    const json = (await response.json()) as GeminiBatchEmbeddingResponse;
    if (!json.embeddings || !Array.isArray(json.embeddings)) {
      return null;
    }

    return json.embeddings.map((item) => item.values ?? []);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[embedding-registry] Gemini embedding call error: ${detail}`);
    return null;
  } finally {
    clear();
  }
}

/**
 * Generates embeddings via Jina AI /v1/embeddings endpoint with task-specific adapters.
 */
export async function callJinaEmbedding(
  texts: string[],
  config: EmbeddingDriverConfig
): Promise<number[][] | null> {
  const apiKey = config.apiKey?.trim() || process.env.JINA_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[embedding-registry] No Jina AI API key configured. Skipping.");
    return null;
  }

  const rawBase = (config.baseUrl || "https://api.jina.ai/v1").replace(/\/+$/, "");
  const endpoint = rawBase.endsWith("/embeddings") ? rawBase : `${rawBase}/embeddings`;

  const payload: Record<string, unknown> = {
    model: config.model || "jina-embeddings-v3",
    task: mapJinaTaskType(config.taskType),
    input: texts,
  };

  if (typeof config.dimensions === "number" && config.dimensions > 0) {
    payload.dimensions = config.dimensions;
  }

  const { signal, clear } = createSafeTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`[embedding-registry] Jina request failed: HTTP ${response.status}`);
      return null;
    }

    const json = (await response.json()) as JinaEmbeddingResponse;
    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
      return null;
    }

    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[embedding-registry] Jina embedding call error: ${detail}`);
    return null;
  } finally {
    clear();
  }
}

/**
 * High-level driver router that dispatches embedding batch generation to the configured provider.
 */
export async function getBatchEmbeddings(
  texts: string[],
  config: EmbeddingDriverConfig
): Promise<number[][] | null> {
  if (config.provider === "disabled") {
    return null;
  }

  if (texts.length === 0) {
    return [];
  }

  switch (config.provider) {
    case "local_ollama":
      return callOllamaEmbedding(texts, config);
    case "openai":
      return callOpenAiEmbedding(texts, config);
    case "gemini":
      return callGeminiEmbedding(texts, config);
    case "jina":
      return callJinaEmbedding(texts, config);
    default:
      return null;
  }
}

/**
 * High-level driver router that dispatches a single string embedding request.
 */
export async function getEmbedding(
  text: string,
  config: EmbeddingDriverConfig
): Promise<number[] | null> {
  if (config.provider === "disabled" || !text || !text.trim()) {
    return null;
  }

  const batchResult = await getBatchEmbeddings([text], config);
  if (!batchResult || batchResult.length === 0) {
    return null;
  }

  return batchResult[0];
}

/**
 * Resolves the active embedding driver configuration from account rules and vault BYOK credentials.
 */
export function resolveEmbeddingConfig(
  rules: Partial<AccountRules> | null | undefined
): EmbeddingDriverConfig | null {
  let provider = rules?.embeddingProvider ?? "disabled";
  // Auto-infer local Ollama when bridge is connected, or in development mode, and provider was left at default
  if (
    provider === "disabled" &&
    (rules?.bridgeConnected || process.env.NODE_ENV === "development")
  ) {
    provider = "local_ollama";
  }
  if (provider === "disabled") {
    return null;
  }

  const model = rules?.embeddingModel?.trim() || getDefaultModelForProvider(provider);

  switch (provider) {
    case "local_ollama":
      return {
        provider: "local_ollama",
        model,
        baseUrl: resolveOllamaBaseUrl(rules?.localOllamaUrl),
      };

    case "openai": {
      const decryptedKey = resolveDecryptedAccountKey(rules);
      const apiKey = decryptedKey?.apiKey || process.env.OPENAI_API_KEY;
      return {
        provider: "openai",
        model,
        apiKey,
      };
    }

    case "gemini": {
      const decryptedKey = resolveDecryptedAccountKey(rules);
      const apiKey =
        decryptedKey?.apiKey ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY;
      return {
        provider: "gemini",
        model,
        apiKey,
      };
    }

    case "jina": {
      const jinaKey = resolveDecryptedJinaKey(rules);
      const generalKey = resolveDecryptedAccountKey(rules)?.apiKey;
      const apiKey = jinaKey || generalKey || process.env.JINA_API_KEY;
      return {
        provider: "jina",
        model,
        apiKey,
      };
    }

    default:
      return null;
  }
}

/**
 * Returns canonical default model for a given embedding provider.
 */
export function getDefaultModelForProvider(provider: EmbeddingProviderType): string {
  switch (provider) {
    case "local_ollama":
      return "nomic-embed-text";
    case "openai":
      return "text-embedding-3-small";
    case "gemini":
      return "text-embedding-004";
    case "jina":
      return "jina-embeddings-v3";
    case "disabled":
    default:
      return "";
  }
}
