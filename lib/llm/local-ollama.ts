/**
 * ============================================================================
 * LOCAL OLLAMA DOMAIN MODULE
 *
 * Encapsulates the 2-second health check pings, adaptive inference timeouts,
 * stream recovery, and JSON parsing for local Ollama instances.
 * ============================================================================
 */

export const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";

/**
 * Thrown when LOCAL_OLLAMA is selected but the instance cannot be reached
 * or fails health checks.
 */
export class OllamaUnreachableError extends Error {
  readonly url: string;

  constructor(url: string, detail?: string) {
    const suffix = detail?.trim() ? `: ${detail.trim()}` : "";
    super(`Local Ollama instance unreachable at ${url}${suffix}`);
    this.name = "OllamaUnreachableError";
    this.url = url;
  }
}

/**
 * Resolves the Ollama model for inference.
 * Dev runtime override takes precedence, then DB-configured model, then default.
 */
export function resolveOllamaModel(
  configured?: string | null,
  devOverride?: string | null
): string {
  const isDev = process.env.NODE_ENV === "development";
  const devTrimmed = devOverride?.trim();
  if (isDev && devTrimmed) {
    return devTrimmed;
  }

  const configuredTrimmed = configured?.trim();
  if (configuredTrimmed) {
    return configuredTrimmed;
  }

  return DEFAULT_OLLAMA_MODEL;
}

/**
 * Normalizes an Ollama URL so calls to /api/tags or /api/generate always
 * resolve against the Ollama root (not an OpenAI-compat base path).
 */
export function normalizeOllamaBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "http://localhost:11434";
  }

  // Strip trailing slashes and common OpenAI path suffixes
  const stripped = trimmed
    .replace(/\/+$/, "")
    .replace(/\/v1(?:\/chat(?:\/completions)?)?$/, "");

  return stripped || "http://localhost:11434";
}

export function ollamaBaseUrlFromEnv(): string {
  return normalizeOllamaBaseUrl(
    process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
  );
}

export function resolveOllamaBaseUrl(configured?: string | null): string {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) return ollamaBaseUrlFromEnv();
  return normalizeOllamaBaseUrl(configured?.trim() || ollamaBaseUrlFromEnv());
}

/**
 * Pings /api/tags with a timeout and validates that the response
 * contains a valid Ollama models array.
 */
export async function probeOllamaTags(
  baseUrl: string,
  timeoutMs: number = 5000
): Promise<{ models: string[] }> {
  const base = normalizeOllamaBaseUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${base}/api/tags`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "MailPilot-OllamaProbe/1.0",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new OllamaUnreachableError(base, detail);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new OllamaUnreachableError(base, `health check HTTP ${res.status}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new OllamaUnreachableError(
      base,
      "health check returned non-JSON (not a valid Ollama /api/tags response)"
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("models" in data) ||
    !Array.isArray((data as { models: unknown }).models)
  ) {
    throw new OllamaUnreachableError(
      base,
      "health check JSON missing models[] (not a valid Ollama daemon)"
    );
  }

  const models = (data as { models: Array<{ name?: string }> }).models;
  const list = models
    .map((m) => (typeof m.name === "string" ? m.name : ""))
    .filter(Boolean);
  return { models: list };
}

/**
 * Probes /api/tags with retries for transient connection startup delays.
 */
export async function probeOllamaTagsWithRetry(
  baseUrl: string,
  opts?: { timeoutMs?: number; attempts?: number; gapMs?: number }
): Promise<{ models: string[] }> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const attempts = opts?.attempts ?? 3;
  const gapMs = opts?.gapMs ?? 750;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await probeOllamaTags(baseUrl, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, gapMs * attempt));
      }
    }
  }

  throw lastError instanceof OllamaUnreachableError
    ? lastError
    : new OllamaUnreachableError(baseUrl, String(lastError));
}

/** Adaptive idle / hard-cap timeouts from prompt payload size. */
export function computeOllamaTimeouts(payloadChars: number): {
  idleTimeoutMs: number;
  hardCapMs: number;
} {
  const idleTimeoutMs = Math.min(
    180_000,
    Math.max(45_000, 30_000 + Math.ceil(payloadChars / 40) * 800)
  );
  const hardCapMs = Math.min(
    600_000,
    Math.max(120_000, idleTimeoutMs * 2 + Math.ceil(payloadChars / 25) * 1000)
  );
  return { idleTimeoutMs, hardCapMs };
}

/**
 * Normalize local Ollama failures into a descriptive Error suitable to throw
 * or pass into the failover path.
 */
export function toLocalOllamaError(baseUrl: string, error: unknown): Error {
  if (error instanceof OllamaUnreachableError) return error;
  if (error instanceof Error) {
    const msg = error.message;
    if (
      /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|timeout|AbortError|aborted|hard.?cap|idle/i.test(
        msg
      ) ||
      error.name === "AbortError" ||
      error.name === "TimeoutError"
    ) {
      return new OllamaUnreachableError(baseUrl, msg);
    }
    return error;
  }
  return new Error(String(error));
}

/**
 * Generates structured JSON from local Ollama with a strict initial health check probe
 * and single retry on transient failures.
 */
export async function callOllamaJson(
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string,
  model?: string | null,
  options?: {
    num_ctx: number;
    num_predict: number;
    temperature: number;
  },
  devModelOverride?: string | null
): Promise<Record<string, unknown> | null> {
  const resolvedModel = resolveOllamaModel(model, devModelOverride);
  const payloadChars = systemPrompt.length + userPrompt.length;
  const timeouts = computeOllamaTimeouts(payloadChars);

  // Strict probe: HTTP 200 alone is not enough — must look like Ollama /api/tags.
  const probe = await probeOllamaTags(baseUrl, 5000);
  console.info("[Ollama:Active]", {
    url: baseUrl,
    resolvedModel,
    discoveredModelsCount: probe.models.length,
    timeouts,
  });

  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.info("[Ollama:Active]", {
          url: baseUrl,
          resolvedModel,
          attempt,
          retrying: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      const result = await callOllamaGenerateOnce(
        baseUrl,
        resolvedModel,
        systemPrompt,
        userPrompt,
        timeouts,
        options
      );

      if (result) {
        console.info("[Ollama:Done]", {
          url: baseUrl,
          model: resolvedModel,
          attempt,
          status: "success",
        });
        return result;
      }
    } catch (error) {
      lastError = error;
      console.error("[Ollama:Error]", {
        url: baseUrl,
        model: resolvedModel,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof OllamaUnreachableError) throw error;
    }
  }

  console.error("[Ollama:Error]", {
    url: baseUrl,
    model: resolvedModel,
    exhausted: true,
  });

  if (lastError instanceof Error) {
    throw lastError;
  }
  return null;
}

async function callOllamaGenerateOnce(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeouts: { idleTimeoutMs: number; hardCapMs: number },
  options?: {
    num_ctx: number;
    num_predict: number;
    temperature: number;
  }
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  let hardCapTimer: NodeJS.Timeout | undefined;
  let idleTimer: NodeJS.Timeout | undefined;
  let abortedReason: "hard_cap" | "idle_timeout" | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      abortedReason = "idle_timeout";
      controller.abort();
    }, timeouts.idleTimeoutMs);
  };

  hardCapTimer = setTimeout(() => {
    abortedReason = "hard_cap";
    controller.abort();
  }, timeouts.hardCapMs);

  resetIdleTimer();

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: userPrompt,
        system: systemPrompt,
        format: "json",
        stream: true,
        options: {
          temperature: options?.temperature ?? 0,
          num_ctx: options?.num_ctx ?? 8192,
          num_predict: options?.num_predict ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Ollama HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }

    if (!response.body) {
      throw new Error("Ollama response missing body stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunkCount++;
      resetIdleTimer();

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter((l) => l.trim().length > 0);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as { response?: string; done?: boolean };
          if (parsed.response) {
            accumulated += parsed.response;
          }
        } catch {
          // Skip invalid stream chunks
        }
      }
    }

    return parseJsonObject(accumulated);
  } catch (error) {
    if (abortedReason === "hard_cap") {
      throw new Error(
        `Ollama generate aborted: hard cap timeout exceeded (${timeouts.hardCapMs}ms)`
      );
    }
    if (abortedReason === "idle_timeout") {
      throw new Error(
        `Ollama generate aborted: stream idle timeout exceeded (${timeouts.idleTimeoutMs}ms)`
      );
    }
    throw error;
  } finally {
    clearTimeout(hardCapTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    const parsed: unknown = JSON.parse(unfenced);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Attempt best-effort brace extraction if output is surrounded by extra text
    const firstBrace = unfenced.indexOf("{");
    const lastBrace = unfenced.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const sliced = unfenced.slice(firstBrace, lastBrace + 1);
        const parsedSliced: unknown = JSON.parse(sliced);
        if (
          parsedSliced &&
          typeof parsedSliced === "object" &&
          !Array.isArray(parsedSliced)
        ) {
          return parsedSliced as Record<string, unknown>;
        }
      } catch {
        // Fall through
      }
    }
  }

  return null;
}
