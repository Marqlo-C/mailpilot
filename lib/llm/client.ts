import {
  type CloudLlmProvider,
  PROVIDER_ENDPOINTS,
} from "./provider.ssot";
import { parseJsonObject } from "./local-ollama";

/**
 * ============================================================================
 * CLOUD LLM CLIENT
 *
 * Standardizes outbound request payloads across both OpenAI-compatible
 * endpoints (/chat/completions with Bearer tokens) and Anthropic's
 * native Messages API (/messages with x-api-key headers).
 * ============================================================================
 */

export type CloudLlmParams = {
  provider: CloudLlmProvider;
  apiKey: string;
  model?: string | null;
  systemPrompt: string;
  userPrompt: string;
  candidateModels?: string[];
  temperature?: number;
};

export class CloudLlmRateLimitError extends Error {
  constructor(provider: string, model: string) {
    super(`Rate limit reached for ${provider} (${model})`);
    this.name = "CloudLlmRateLimitError";
  }
}

/**
 * Dispatches an inference request to the designated cloud provider using
 * account-scoped credentials.
 */
export async function callCloudLlmJson(
  params: CloudLlmParams
): Promise<Record<string, unknown> | null> {
  const {
    provider,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    candidateModels,
    temperature = 0,
  } = params;

  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) {
    throw new Error(`Unsupported cloud provider: ${provider}`);
  }

  // 1. Anthropic Native Messages API
  if (endpoint.apiFormat === "ANTHROPIC_NATIVE") {
    const selectedModel = model?.trim() || endpoint.defaultModel;
    return callAnthropicMessages(
      endpoint.baseUrl,
      apiKey,
      selectedModel,
      systemPrompt,
      userPrompt,
      temperature
    );
  }

  // 2. OpenAI-compatible /chat/completions (OpenRouter, OpenAI, Groq, DeepSeek, Gemini)
  const explicitModel = model?.trim();
  const modelsToTry = explicitModel
    ? [explicitModel, ...(candidateModels ?? []).filter((m) => m !== explicitModel)]
    : candidateModels && candidateModels.length > 0
      ? candidateModels
      : [endpoint.defaultModel];

  let lastError: unknown = null;
  let rateLimitError: CloudLlmRateLimitError | null = null;
  for (const m of modelsToTry) {
    try {
      const result = await callOpenAiCompatibleModel(
        provider,
        endpoint.baseUrl,
        apiKey,
        m,
        systemPrompt,
        userPrompt,
        temperature
      );
      if (result) {
        return result;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isRateLimit =
        error instanceof CloudLlmRateLimitError || /\b(429|rate\s*limit)\b/i.test(msg);
      const is403 = /\b403\b/.test(msg);

      const normalizedError =
        isRateLimit && !(error instanceof CloudLlmRateLimitError)
          ? new CloudLlmRateLimitError(provider, m)
          : error;

      lastError = normalizedError;
      if (isRateLimit) {
        rateLimitError =
          normalizedError instanceof CloudLlmRateLimitError
            ? normalizedError
            : new CloudLlmRateLimitError(provider, m);
      }

      if ((isRateLimit || is403) && modelsToTry.length > 1) {
        console.warn(
          `[CloudLLM:${provider}] ${isRateLimit ? "429" : "403"} on ${m}; trying next candidate model...`
        );
        continue;
      }

      console.warn(`[CloudLLM:${provider}] Call failed on model ${m}:`, error);
      if (modelsToTry.length > 1) {
        continue;
      }
      throw normalizedError;
    }
  }

  if (rateLimitError) {
    throw rateLimitError;
  }

  return null;
}

/**
 * Executes a request against an OpenAI-compatible /chat/completions endpoint.
 */
async function callOpenAiCompatibleModel(
  provider: CloudLlmProvider,
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<Record<string, unknown> | null> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (provider === "OPENROUTER") {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_SITE_URL ?? "https://mailpilot.local";
    headers["X-Title"] = "MailPilot";
  }

  const makeBody = (withJsonFormat: boolean) =>
    JSON.stringify({
      model,
      temperature,
      ...(withJsonFormat ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

  let response = await fetch(url, {
    method: "POST",
    headers,
    body: makeBody(true),
  });

  // Gracefully retry without response_format if provider doesn't support json_object mode
  if (response.status === 400) {
    const errorText = await response.text().catch(() => "");
    if (/response_format/i.test(errorText)) {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: makeBody(false),
      });
    } else {
      throw new Error(
        `${provider} HTTP 400: ${errorText.slice(0, 200)}`
      );
    }
  }

  if (response.status === 429) {
    throw new CloudLlmRateLimitError(provider, model);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `${provider} HTTP ${response.status}: ${detail.slice(0, 200)}`
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  return parseJsonObject(content);
}

/**
 * Executes a request against Anthropic's native Messages API.
 */
async function callAnthropicMessages(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<Record<string, unknown> | null> {
  const url = `${baseUrl.replace(/\/+$/, "")}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (response.status === 429) {
    throw new CloudLlmRateLimitError("ANTHROPIC", model);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ANTHROPIC HTTP ${response.status}: ${detail.slice(0, 200)}`
    );
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlocks = json.content?.filter((c) => c.type === "text" && c.text);
  const text = textBlocks?.[0]?.text;
  if (!text) {
    return null;
  }

  return parseJsonObject(text);
}
