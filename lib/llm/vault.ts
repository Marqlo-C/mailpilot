import { decryptToken, encryptToken } from "@/lib/crypto";
import type { AccountRules } from "@/lib/validations/rules";
import type { CloudLlmProvider } from "./provider.ssot";

/**
 * ============================================================================
 * ACCOUNT CREDENTIAL VAULT (BYOK)
 *
 * Manages encryption, decryption, and secure display masking for customer
 * API keys. Plaintext keys must never be logged or serialized to client UI.
 * ============================================================================
 */

/**
 * Masks an API key for safe client presentation, e.g. "sk-...1234".
 */
export function maskApiKey(rawKey: string): string {
  if (!rawKey || typeof rawKey !== "string") {
    return "sk-...";
  }
  const clean = rawKey.trim();
  const prefix = clean.startsWith("ant-")
    ? "ant-"
    : clean.startsWith("jina_")
      ? "jina_"
      : "sk-";
  if (clean.length <= 4) {
    return `${prefix}...`;
  }
  return `${prefix}...${clean.slice(-4)}`;
}

/**
 * Masks a ScrapingAnt API key for safe client presentation, e.g. "ant-...39aF".
 */
export function maskScrapingAntApiKey(rawKey: string): string {
  if (!rawKey || typeof rawKey !== "string") {
    return "ant-...";
  }
  const clean = rawKey.trim();
  if (clean.length <= 4) {
    return "ant-...";
  }
  return `ant-...${clean.slice(-4)}`;
}

/**
 * Masks a HasData API key for safe client presentation, e.g. "hd-...1234".
 */
export function maskHasDataApiKey(rawKey: string): string {
  if (!rawKey || typeof rawKey !== "string") {
    return "hd-...";
  }
  const clean = rawKey.trim();
  if (clean.length <= 4) {
    return "hd-...";
  }
  return `hd-...${clean.slice(-4)}`;
}

/**
 * Encrypts a customer-provided API key with AES-256-GCM and generates its
 * safe UI mask for storage in AccountSettings.rules.
 */
export function encryptAccountKey(rawKey: string): {
  encryptedApiKey: string;
  maskedApiKey: string;
} {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    throw new Error("Cannot encrypt empty API key");
  }

  return {
    encryptedApiKey: encryptToken(trimmed),
    maskedApiKey: maskApiKey(trimmed),
  };
}

export type DecryptedAccountCredentials = {
  provider: CloudLlmProvider;
  apiKey: string;
  model: string | null;
};

/**
 * Returns the custom cloud model override only when it belongs to the active
 * (or specified) cloud provider. Prevents a model configured for one provider
 * (e.g. OpenRouter) from leaking when the user switches to another provider.
 */
export function resolveProviderScopedCloudModel(
  rules: Partial<AccountRules> | null | undefined,
  targetProvider?: CloudLlmProvider
): string | null {
  const trimmed = rules?.cloudModel?.trim() || null;
  if (!trimmed) return null;

  const provider: CloudLlmProvider =
    targetProvider ?? rules?.cloudProvider ?? "OPENROUTER";
  const modelProvider = rules?.cloudModelProvider ?? null;

  if (modelProvider && modelProvider !== provider) {
    return null;
  }

  return trimmed;
}

/**
 * Resolves and decrypts the account-scoped BYOK cloud credentials from
 * AccountSettings.rules. Returns null if no custom key is configured or
 * if decryption fails.
 */
export function resolveDecryptedAccountKey(
  rules: Partial<AccountRules> | null | undefined
): DecryptedAccountCredentials | null {
  if (!rules?.encryptedApiKey) {
    return null;
  }

  try {
    const decrypted = decryptToken(rules.encryptedApiKey).trim();
    if (!decrypted) {
      console.warn("[vault] Decrypted API key was empty string. Returning null.");
      return null;
    }

    const provider: CloudLlmProvider = rules.cloudProvider ?? "OPENROUTER";
    const model = resolveProviderScopedCloudModel(rules, provider);

    return {
      provider,
      apiKey: decrypted,
      model,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[vault] Failed to decrypt account API key: ${reason}`
    );
    return null;
  }
}

/**
 * Resolves and decrypts the ScrapingAnt API key from AccountSettings.rules.
 * Returns null if web scraping proxies are disabled, no custom key is configured,
 * or decryption fails.
 */
export function resolveDecryptedScrapingAntKey(
  rules: Partial<AccountRules> | null | undefined
): string | null {
  if (rules?.enableWebScrapingProxies === false) {
    return null;
  }
  if (!rules?.encryptedScrapingAntApiKey) {
    return null;
  }

  try {
    const decrypted = decryptToken(rules.encryptedScrapingAntApiKey).trim();
    if (!decrypted) {
      console.warn("[vault] Decrypted ScrapingAnt API key was empty string. Returning null.");
      return null;
    }
    return decrypted;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[vault] Failed to decrypt ScrapingAnt API key: ${reason}`
    );
    return null;
  }
}

/**
 * Resolves and decrypts the HasData API key from AccountSettings.rules.
 * Returns null if web scraping proxies are disabled, no custom key is configured,
 * or decryption fails.
 */
export function resolveDecryptedHasDataKey(
  rules: Partial<AccountRules> | null | undefined
): string | null {
  if (rules?.enableWebScrapingProxies === false) {
    return null;
  }
  if (!rules?.encryptedHasDataApiKey) {
    return null;
  }

  try {
    const decrypted = decryptToken(rules.encryptedHasDataApiKey).trim();
    if (!decrypted) {
      console.warn("[vault] Decrypted HasData API key was empty string. Returning null.");
      return null;
    }
    return decrypted;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[vault] Failed to decrypt HasData API key: ${reason}`
    );
    return null;
  }
}


