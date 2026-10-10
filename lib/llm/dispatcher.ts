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
  OllamaUnreachableError,
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
    num_ctx: number;
    num_predict: number;
    temperature: number;
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

  return null;
}

/**
 * Shared LLM router and dispatcher.
 *
 * Routing logic:
 * - If llmProvider === "LOCAL_OLLAMA", attempts local execution via Ollama JSON API.
 * - If local execution fails and allowCloudFallback is true, fails over to the account's BYOK provider.
 * - If cloud is selected (or after local failover), resolves customer credentials from vault.
 * - If no key is set and cloud is required, throws MissingLlmKeyError (or returns null for background sweeps).
 */
export async function callLLMWithFallback(
  options: CallLLMOptions
): Promise<Record<string, unknown> | null> {
  const provider = options.llmProvider ?? "OPENROUTER";

  // --------------------------------------------------------------------------
  // PATH A: LOCAL OLLAMA EXECUTION
  // --------------------------------------------------------------------------
  if (provider === "LOCAL_OLLAMA") {
    const baseUrl = resolveOllamaBaseUrl(options.localOllamaUrl);
    const allowFallback = isCloudFallbackEnabled(options);

    try {
      const result = await callOllamaJson(
        baseUrl,
        options.systemPrompt,
        options.userPrompt,
        options.ollamaModel,
        options.ollamaOptions,
        options.devModelOverride
      );
      if (result) {
        console.info("[Ollama:Done]", {
          url: baseUrl,
          status: "success",
          reachable: true,
          generated: true,
        });
        return result;
      }
      throw new OllamaUnreachableError(
        baseUrl,
        "empty or invalid JSON after local retries (service may be overloaded or model failed to respond)"
      );
    } catch (error) {
      const localError = toLocalOllamaError(baseUrl, error);

      if (allowFallback) {
        console.warn(
          "[Ollama:Fallback] Local generation failed. Failing over to configured cloud provider...",
          localError
        );

        const creds = await resolveCredentials(options);
        if (!creds) {
          if (options.throwOnMissingKey) {
            throw new MissingLlmKeyError(options.cloudProvider ?? "OPENROUTER");
          }
          console.error(
            "[Ollama:Fallback] Cloud failover failed: no customer or server API key configured."
          );
          return null;
        }

        const targetModel =
          options.cloudModel?.trim() || creds.model?.trim() || null;
        const candidateModels =
          creds.provider === "OPENROUTER"
            ? targetModel
              ? [
                  targetModel,
                  ...(options.openRouterModels ?? []).filter(
                    (m) => m !== targetModel
                  ),
                ]
              : options.openRouterModels
            : targetModel
              ? [targetModel]
              : undefined;

        const cloudResult = await callCloudLlmJson({
          provider: creds.provider,
          apiKey: creds.apiKey,
          model: targetModel,
          systemPrompt: options.systemPrompt,
          userPrompt: options.userPrompt,
          candidateModels,
        });

        if (cloudResult) {
          console.info(
            `[Ollama:Fallback] ${creds.provider} failover succeeded after local failure.`
          );
        } else {
          console.error(
            `[Ollama:Fallback] ${creds.provider} failover also failed after local failure.`
          );
        }
        return cloudResult;
      }

      console.error(
        "[Ollama:Error] Local generation failed. Cloud fallback disabled (allowCloudFallback=false) — not routing to cloud.",
        localError
      );
      throw localError;
    }
  }

  // --------------------------------------------------------------------------
  // PATH B: CLOUD DISPATCH (BYOK)
  // --------------------------------------------------------------------------
  const creds = await resolveCredentials(options);
  if (!creds) {
    if (options.throwOnMissingKey) {
      throw new MissingLlmKeyError(
        (options.cloudProvider as CloudLlmProvider) ?? "OPENROUTER"
      );
    }
    console.warn(
      `[dispatcher] No API key configured for ${
        options.cloudProvider ?? "cloud provider"
      }. Skipping cloud inference.`
    );
    return null;
  }

  const targetModel =
    options.cloudModel?.trim() || creds.model?.trim() || null;
  const candidateModels =
    creds.provider === "OPENROUTER"
      ? targetModel
        ? [
            targetModel,
            ...(options.openRouterModels ?? []).filter(
              (m) => m !== targetModel
            ),
          ]
        : options.openRouterModels
      : targetModel
        ? [targetModel]
        : undefined;

  return callCloudLlmJson({
    provider: creds.provider,
    apiKey: creds.apiKey,
    model: targetModel,
    systemPrompt: options.systemPrompt,
    userPrompt: options.userPrompt,
    candidateModels,
  });
}
