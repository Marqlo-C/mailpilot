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
  if (clean.length <= 4) {
    return "sk-...";
  }
  return `sk-...${clean.slice(-4)}`;
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
      return null;
    }

    const provider: CloudLlmProvider = rules.cloudProvider ?? "OPENROUTER";
    const model = rules.cloudModel ?? null;

    return {
      provider,
      apiKey: decrypted,
      model,
    };
  } catch (error) {
    // Zero-leak logging: never log the payload or parts
    console.error(
      "[vault] Failed to decrypt account API key. The key may have been encrypted with a different secret."
    );
    return null;
  }
}
