import { z } from "zod";

/**
 * ============================================================================
 * SINGLE SOURCE OF TRUTH (SSOT) FOR LLM PROVIDERS & ENDPOINTS
 *
 * If you add, remove, or modify supported LLM providers, base URLs, or
 * default models, THIS is the sole contract file to update.
 * ============================================================================
 */

export const CLOUD_LLM_PROVIDERS = [
  "OPENROUTER",
  "OPENAI",
  "GROQ",
  "DEEPSEEK",
  "ANTHROPIC",
  "GEMINI",
] as const;

export type CloudLlmProvider = (typeof CLOUD_LLM_PROVIDERS)[number];

export const ALL_LLM_PROVIDERS = [
  "LOCAL_OLLAMA",
  ...CLOUD_LLM_PROVIDERS,
] as const;

export type LlmProvider = (typeof ALL_LLM_PROVIDERS)[number];

export const cloudProviderSchema = z.enum(CLOUD_LLM_PROVIDERS);
export const llmProviderSchema = z.enum(ALL_LLM_PROVIDERS);

export type ProviderEndpointConfig = {
  baseUrl: string;
  defaultModel: string;
  authHeaderType: "BEARER" | "X_API_KEY";
  apiFormat: "OPENAI_COMPAT" | "ANTHROPIC_NATIVE";
};

export const PROVIDER_ENDPOINTS: Record<CloudLlmProvider, ProviderEndpointConfig> = {
  OPENROUTER: {
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.5-flash",
    authHeaderType: "BEARER",
    apiFormat: "OPENAI_COMPAT",
  },
  OPENAI: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    authHeaderType: "BEARER",
    apiFormat: "OPENAI_COMPAT",
  },
  GROQ: {
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    authHeaderType: "BEARER",
    apiFormat: "OPENAI_COMPAT",
  },
  DEEPSEEK: {
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    authHeaderType: "BEARER",
    apiFormat: "OPENAI_COMPAT",
  },
  ANTHROPIC: {
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-haiku-20241022",
    authHeaderType: "X_API_KEY",
    apiFormat: "ANTHROPIC_NATIVE",
  },
  GEMINI: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    authHeaderType: "BEARER",
    apiFormat: "OPENAI_COMPAT",
  },
};

export const providerConfigSchema = z.object({
  baseUrl: z.string().url(),
  defaultModel: z.string().min(1),
  authHeaderType: z.enum(["BEARER", "X_API_KEY"]).default("BEARER"),
  apiFormat: z
    .enum(["OPENAI_COMPAT", "ANTHROPIC_NATIVE"])
    .default("OPENAI_COMPAT"),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
