import { prisma } from "@/lib/prisma";
import { parseAccountRules, type AccountRules } from "@/lib/validations/rules";
import {
  type CloudLlmProvider,
  type LlmProvider,
} from "./provider.ssot";
import {
  type DecryptedAccountCredentials,
  resolveDecryptedAccountKey,
} from "./vault";
import {
  callOllamaJson,
  isOllamaCircuitTripped,
  tripOllamaCircuit,
  resolveOllamaModel,
  OllamaUnreachableError,
  OllamaInvalidJsonError,
  resolveOllamaBaseUrl,
  toLocalOllamaError,
} from "./local-ollama";
import { callCloudLlmJson } from "./client";

/**
 * ============================================================================
 * LLM DISPATCHER & MULTI-PROVIDER ROUTER
 *
 * Implements account-scoped BYOK resolution, local Ollama execution with
 * strict health pings, adaptive timeout handling, and resilient fallback.
 * ============================================================================
 */

export class MissingLlmKeyError extends Error {
  readonly provider: CloudLlmProvider;

  constructor(provider: CloudLlmProvider = "OPENROUTER") {
    super(
      `No API key configured for ${provider}. Please configure your API key in Settings → AI & Models.`
    );
    this.name = "MissingLlmKeyError";
    this.provider = provider;
  }
}

export type DispatchExecutionResult = {
  result: Record<string, unknown> | null;
  routingLines: string[];
  sourceTier: "TIER 1 (OLLAMA)" | "TIER 2 (CLOUD)" | "TIER 3 (HEURISTIC)";
};

export type CallLLMOptions = {
  systemPrompt: string;
  userPrompt: string;
  llmProvider?: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  /** Dev-only client/runtime override; takes precedence over DB model in development */
  devModelOverride?: string | null;
  /**
   * When true (or env OLLAMA_ALLOW_OPENROUTER_FALLBACK=true), LOCAL_OLLAMA may
   * fall back to cloud after local failure. Default: no silent fallback.
   * Prefer account rule `allowCloudFallback`.
   */
  allowCloudFallback?: boolean;
  /** @deprecated Use allowCloudFallback */
  allowOpenRouterFallback?: boolean;
  /** When set, tries only these models, in order (OpenRouter-compatible). */
  openRouterModels?: string[];
  /** Local generation limits. Omitted calls keep Ollama defaults. */
  ollamaOptions?: {
    num_ctx?: number;
    num_predict?: number;
    temperature?: number;
  };

  /** Account identifier for BYOK credential resolution */
  accountId?: string | null;
  /** Account rules directly supplied by the caller */
  accountRules?: Partial<AccountRules> | null;
  /** Explicit cloud provider override */
  cloudProvider?: CloudLlmProvider | null;
  /** Explicit decrypted API key override */
  cloudApiKey?: string | null;
  /** Explicit cloud model override */
  cloudModel?: string | null;
  /** If true, throws MissingLlmKeyError instead of returning null when no key is set */
  throwOnMissingKey?: boolean;
  /** If true, returns DispatchExecutionResult with telemetry lines instead of bare result */
  returnExecutionResult?: boolean;
};

function isCloudFallbackEnabled(options: CallLLMOptions): boolean {
  if (options.allowCloudFallback === true) return true;
  if (options.allowOpenRouterFallback === true) return true;
  const env =
    process.env.OLLAMA_ALLOW_OPENROUTER_FALLBACK?.trim().toLowerCase();
  return env === "1" || env === "true" || env === "yes";
}

/**
 * Resolves account-scoped cloud credentials in priority order:
 * 1. Direct `cloudApiKey` in options.
 * 2. `accountRules` object if passed by caller.
 * 3. Database query for AccountSettings if `accountId` is provided.
 * 4. Global process.env.OPENROUTER_API_KEY for dev/test compatibility.
 */
async function resolveCredentials(
  options: CallLLMOptions
): Promise<DecryptedAccountCredentials | null> {
  // 1. Direct options override
  if (options.cloudApiKey?.trim()) {
    return {
      provider: options.cloudProvider ?? "OPENROUTER",
      apiKey: options.cloudApiKey.trim(),
      model: options.cloudModel ?? null,
    };
  }

  // 2. Passed account rules
  if (options.accountRules) {
    const fromRules = resolveDecryptedAccountKey(options.accountRules);
    if (fromRules) return fromRules;
  }

  // 3. Database lookup if accountId is passed
  if (options.accountId?.trim()) {
    try {
      const settings = await prisma.accountSettings.findUnique({
        where: { accountId: options.accountId.trim() },
        select: { rules: true },
      });
      if (settings?.rules) {
        const rules = parseAccountRules(settings.rules);
        const fromDb = resolveDecryptedAccountKey(rules);
        if (fromDb) return fromDb;
      }
    } catch (e) {
      console.warn(
        "[dispatcher] Failed to query accountSettings for BYOK credentials:",
        e
      );
    }
  }

  // 4. Global process.env.OPENROUTER_API_KEY for dev/test compatibility
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    return {
      provider: "OPENROUTER",
      apiKey: process.env.OPENROUTER_API_KEY.trim(),
      model: options.cloudModel ?? null,
    };
  }

  return null;
}

function attachMeta(
  result: Record<string, unknown> | null,
  routingLines: string[],
  sourceTier: "TIER 1 (OLLAMA)" | "TIER 2 (CLOUD)" | "TIER 3 (HEURISTIC)"
): Record<string, unknown> | null {
  if (result && typeof result === "object") {
    (result as Record<string, unknown>)._routingLines = routingLines;
    (result as Record<string, unknown>)._sourceTier = sourceTier;
  }
  return result;
}

/**
 * Shared LLM router and dispatcher supporting 3-tier routing and circuit breaker telemetry.
 *
 * Tier 1: Local Ollama. Bypasses in 0ms if circuit is tripped. Trips circuit on failure.
 * Tier 2: Cloud BYOK. Escalates to cloud when Ollama fails and fallback is allowed.
 * Tier 3: Caller falls back to Grand Heuristic upon error.
 */
export async function callLLMWithFallback(
  options: CallLLMOptions & { returnExecutionResult: true }
): Promise<DispatchExecutionResult>;
export async function callLLMWithFallback(
  options: CallLLMOptions
): Promise<Record<string, unknown> | null>;
export async function callLLMWithFallback(
  options: CallLLMOptions & { returnExecutionResult?: boolean }
): Promise<Record<string, unknown> | null | DispatchExecutionResult> {
  const provider = options.llmProvider ?? "OPENROUTER";
  const routingLines: string[] = [];
  let sourceTier: "TIER 1 (OLLAMA)" | "TIER 2 (CLOUD)" | "TIER 3 (HEURISTIC)" =
    provider === "LOCAL_OLLAMA" ? "TIER 1 (OLLAMA)" : "TIER 2 (CLOUD)";

  // --------------------------------------------------------------------------
  // PATH A: LOCAL OLLAMA EXECUTION
  // --------------------------------------------------------------------------
  if (provider === "LOCAL_OLLAMA") {
    let localOllamaUrl = options.localOllamaUrl;
    let ollamaModel = options.ollamaModel;

    if ((!localOllamaUrl || !ollamaModel) && options.accountId?.trim()) {
      try {
        const settings = await prisma.accountSettings.findUnique({
          where: { accountId: options.accountId.trim() },
          select: { localOllamaUrl: true, ollamaModel: true },
        });
        if (settings) {
          if (!localOllamaUrl && settings.localOllamaUrl) {
            localOllamaUrl = settings.localOllamaUrl;
          }
          if (!ollamaModel && settings.ollamaModel) {
            ollamaModel = settings.ollamaModel;
          }
        }
      } catch (e) {
        console.warn(
          "[dispatcher] Failed to query accountSettings for Ollama configuration:",
          e
        );
      }
    }

    const baseUrl = resolveOllamaBaseUrl(localOllamaUrl);
    const allowFallback = isCloudFallbackEnabled(options);
    const resolvedModel = resolveOllamaModel(
      ollamaModel,
      options.devModelOverride
    );

    // 1. Circuit Breaker Fast-Check: bypass immediately (0ms) if open
    if (isOllamaCircuitTripped(baseUrl)) {
      routingLines.push(
        "Tier 1: LOCAL_OLLAMA -> BYPASSED (Circuit Open) [0ms]"
      );

      if (allowFallback) {
        const creds = await resolveCredentials(options);
        if (creds?.apiKey) {
          const targetModel =
            options.cloudModel?.trim() || creds.model?.trim() || null;

          const cloudStart = Date.now();
          try {
            const cloudResult = await callCloudLlmJson({
              provider: creds.provider,
              apiKey: creds.apiKey,
              model: targetModel,
              systemPrompt: options.systemPrompt,
              userPrompt: options.userPrompt,
            });

            if (cloudResult) {
              const cloudLatencyMs = Date.now() - cloudStart;
              routingLines.push(
                `Tier 2: CLOUD_BYOK (${creds.provider} / ${targetModel || "default"})`,
                `Status : 200 OK (${cloudLatencyMs}ms)`
              );
              sourceTier = "TIER 2 (CLOUD)";
              if (options.returnExecutionResult) {
                return { result: cloudResult, routingLines, sourceTier };
              }
              return attachMeta(cloudResult, routingLines, sourceTier);
            }
            routingLines.push(
              `Tier 2: CLOUD_BYOK (${creds.provider}) -> FAILED (null response)`
            );
          } catch (cloudErr) {
            const msg =
              cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
            routingLines.push(`Tier 2: CLOUD_BYOK -> FAILED (${msg})`);
            throw cloudErr;
          }
        } else {
          routingLines.push("Tier 2: CLOUD_BYOK -> SKIPPED (No API key)");
        }
      } else {
        routingLines.push(
          "Tier 2: CLOUD_BYOK -> DISABLED (allowCloudFallback=false)"
        );
      }

      // If circuit is tripped and cloud was not used / not configured, throw so caller lands on Tier 3 Heuristic
      throw new OllamaUnreachableError(
        baseUrl,
        "circuit breaker open (instance offline)"
      );
    }

    // 2. Circuit is closed: Attempt Ollama inference
    const start = Date.now();
    try {
      const result = await callOllamaJson(
        baseUrl,
        options.systemPrompt,
        options.userPrompt,
        resolvedModel,
        options.ollamaOptions,
        options.devModelOverride
      );

      if (result) {
        const latencyMs = Date.now() - start;
        routingLines.push(
          `Tier 1: LOCAL_OLLAMA (${resolvedModel})`,
          `Endpoint: ${baseUrl}`,
          `Status  : 200 OK (${latencyMs}ms)`
        );
        sourceTier = "TIER 1 (OLLAMA)";
        if (options.returnExecutionResult) {
          return { result, routingLines, sourceTier };
        }
        return attachMeta(result, routingLines, sourceTier);
      }

      throw new OllamaInvalidJsonError(
        "empty or invalid JSON after local retries"
      );
    } catch (error) {
      if (error instanceof OllamaInvalidJsonError) {
        routingLines.push("Tier 1: LOCAL_OLLAMA -> INVALID JSON RESPONSE");
      } else {
        const localError = toLocalOllamaError(baseUrl, error);
        // Trip circuit on failure
        tripOllamaCircuit(baseUrl, localError.message);
        routingLines.push(
          `Tier 1: LOCAL_OLLAMA -> FAILED (${localError.message})`,
          `Circuit: TRIPPED (Bypassing Ollama for 60s)`
        );
      }

      if (allowFallback) {
        const creds = await resolveCredentials(options);
        if (creds?.apiKey) {
          const targetModel =
            options.cloudModel?.trim() || creds.model?.trim() || null;

          const cloudStart = Date.now();
          try {
            const cloudResult = await callCloudLlmJson({
              provider: creds.provider,
              apiKey: creds.apiKey,
              model: targetModel,
              systemPrompt: options.systemPrompt,
              userPrompt: options.userPrompt,
            });

            if (cloudResult) {
              const cloudLatencyMs = Date.now() - cloudStart;
              routingLines.push(
                `Tier 2: CLOUD_BYOK (${creds.provider} / ${targetModel || "default"})`,
                `Status : 200 OK (${cloudLatencyMs}ms)`
              );
              sourceTier = "TIER 2 (CLOUD)";
              if (options.returnExecutionResult) {
                return { result: cloudResult, routingLines, sourceTier };
              }
              return attachMeta(cloudResult, routingLines, sourceTier);
            }
            routingLines.push(
              `Tier 2: CLOUD_BYOK (${creds.provider}) -> FAILED (null response)`
            );
          } catch (cloudErr) {
            const msg =
              cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
            routingLines.push(`Tier 2: CLOUD_BYOK -> FAILED (${msg})`);
            throw cloudErr;
          }
        } else {
          routingLines.push("Tier 2: CLOUD_BYOK -> SKIPPED (No API key)");
          if (options.throwOnMissingKey) {
            throw new MissingLlmKeyError(options.cloudProvider ?? "OPENROUTER");
          }
        }
      } else {
        routingLines.push(
          "Tier 2: CLOUD_BYOK -> DISABLED (allowCloudFallback=false)"
        );
      }

      // Re-throw so caller lands on Tier 3 Heuristic cleanly without stack dump
      if (error instanceof OllamaInvalidJsonError) {
        throw error;
      }
      throw toLocalOllamaError(baseUrl, error);
    }
  }

  // --------------------------------------------------------------------------
  // PATH B: CLOUD DISPATCH (BYOK as primary)
  // --------------------------------------------------------------------------
  const creds = await resolveCredentials(options);
  if (!creds?.apiKey) {
    routingLines.push("Tier 2: CLOUD_BYOK -> SKIPPED (No API key)");
    if (options.throwOnMissingKey) {
      throw new MissingLlmKeyError(
        (options.cloudProvider as CloudLlmProvider) ?? "OPENROUTER"
      );
    }
    return options.returnExecutionResult
      ? { result: null, routingLines, sourceTier: "TIER 2 (CLOUD)" }
      : null;
  }

  const targetModel =
    options.cloudModel?.trim() || creds.model?.trim() || null;

  const cloudStart = Date.now();
  try {
    const cloudResult = await callCloudLlmJson({
      provider: creds.provider,
      apiKey: creds.apiKey,
      model: targetModel,
      systemPrompt: options.systemPrompt,
      userPrompt: options.userPrompt,
    });

    const cloudLatencyMs = Date.now() - cloudStart;
    routingLines.push(
      `Tier 2: CLOUD_BYOK (${creds.provider} / ${targetModel || "default"})`,
      `Status : 200 OK (${cloudLatencyMs}ms)`
    );
    sourceTier = "TIER 2 (CLOUD)";

    if (options.returnExecutionResult) {
      return { result: cloudResult, routingLines, sourceTier };
    }
    return attachMeta(cloudResult, routingLines, sourceTier);
  } catch (cloudErr) {
    const msg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
    routingLines.push(`Tier 2: CLOUD_BYOK -> FAILED (${msg})`);
    throw cloudErr;
  }
}

export async function dispatchLLMWithFallback(
  options: CallLLMOptions
): Promise<DispatchExecutionResult> {
  return callLLMWithFallback({
    ...options,
    returnExecutionResult: true,
  });
}
