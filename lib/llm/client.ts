import {
  type CloudLlmProvider,
  PROVIDER_ENDPOINTS,
} from "./provider.ssot";
import { parseJsonObject } from "./local-ollama";
import { logEngineExecutionTable } from "@/lib/logging";

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
    temperature = 0,
  } = params;

  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) {
    throw new Error(`Unsupported cloud provider: ${provider}`);
  }

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

  // Target strictly the model specified by the user or provider default
  const targetModel = model?.trim() || endpoint.defaultModel;

  try {
    return await callOpenAiCompatibleModel(
      provider,
      endpoint.baseUrl,
      apiKey,
      targetModel,
      systemPrompt,
      userPrompt,
      temperature
    );
  } catch (error) {
    if (error instanceof CloudLlmRateLimitError) {
      throw error;
    }
    throw error;
  }
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
  const startTime = Date.now();
  const promptChars = systemPrompt.length + userPrompt.length;

  try {
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

    const signal = AbortSignal.timeout(25_000);

    let response = await fetch(url, {
      method: "POST",
      headers,
      body: makeBody(true),
      signal,
    });

    // Gracefully retry without response_format if provider doesn't support json_object mode
    if (response.status === 400) {
      const errorText = await response.text().catch(() => "");
      if (/response_format/i.test(errorText)) {
        response = await fetch(url, {
          method: "POST",
          headers,
          body: makeBody(false),
          signal: AbortSignal.timeout(25_000),
        });
      } else {
        const errorMsg = `${provider} HTTP 400: ${errorText.slice(0, 250)}`;
        console.error(`[cloud-llm] ${errorMsg}`);
        throw new Error(errorMsg);
      }
    }

    if (response.status === 429) {
      const durationMs = Date.now() - startTime;
      logEngineExecutionTable({
        engineType: "CLOUD_BYOK",
        provider,
        model,
        endpoint: baseUrl,
        phase: "RATE_LIMIT",
        promptChars,
        durationMs,
        rotationNote: "HTTP 429 Rate Limit - Parking as PENDING_AI",
      });
      throw new CloudLlmRateLimitError(provider, model);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const errorMsg = `${provider} HTTP ${response.status}: ${detail.slice(0, 250)}`;
      console.error(`[cloud-llm] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    const durationMs = Date.now() - startTime;
    const outputChars = content ? content.length : 0;

    logEngineExecutionTable({
      engineType: "CLOUD_BYOK",
      provider,
      model,
      endpoint: baseUrl,
      phase: "COMPLETE",
      promptChars,
      outputChars,
      durationMs,
    });

    if (!content) {
      return null;
    }

    return parseJsonObject(content);
  } catch (error) {
    if (error instanceof CloudLlmRateLimitError) {
      throw error;
    }
    const durationMs = Date.now() - startTime;
    logEngineExecutionTable({
      engineType: "CLOUD_BYOK",
      provider,
      model,
      endpoint: baseUrl,
      phase: "ERROR",
      promptChars,
      durationMs,
      errorDetail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
  const startTime = Date.now();
  const promptChars = systemPrompt.length + userPrompt.length;

  try {
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
      signal: AbortSignal.timeout(25_000),
    });

    if (response.status === 429) {
      const durationMs = Date.now() - startTime;
      logEngineExecutionTable({
        engineType: "CLOUD_BYOK",
        provider: "ANTHROPIC",
        model,
        endpoint: baseUrl,
        phase: "RATE_LIMIT",
        promptChars,
        durationMs,
        rotationNote: "HTTP 429 Rate Limit - Parking as PENDING_AI",
      });
      throw new CloudLlmRateLimitError("ANTHROPIC", model);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const errorMsg = `ANTHROPIC HTTP ${response.status}: ${detail.slice(0, 250)}`;
      console.error(`[cloud-llm] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const json = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textBlocks = json.content?.filter((c) => c.type === "text" && c.text);
    const text = textBlocks?.[0]?.text;
    const durationMs = Date.now() - startTime;
    const outputChars = text ? text.length : 0;

    logEngineExecutionTable({
      engineType: "CLOUD_BYOK",
      provider: "ANTHROPIC",
      model,
      endpoint: baseUrl,
      phase: "COMPLETE",
      promptChars,
      outputChars,
      durationMs,
    });

    if (!text) {
      return null;
    }

    return parseJsonObject(text);
  } catch (error) {
    if (error instanceof CloudLlmRateLimitError) {
      throw error;
    }
    const durationMs = Date.now() - startTime;
    logEngineExecutionTable({
      engineType: "CLOUD_BYOK",
      provider: "ANTHROPIC",
      model,
      endpoint: baseUrl,
      phase: "ERROR",
      promptChars,
      durationMs,
      errorDetail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
