import { beforeAll, describe, expect, it } from "vitest";
import {
  encryptAccountKey,
  maskApiKey,
  resolveDecryptedAccountKey,
} from "../vault";
import {
  CLOUD_LLM_PROVIDERS,
  PROVIDER_ENDPOINTS,
} from "../provider.ssot";

describe("LLM Vault & Multi-Provider SSOT", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  describe("API Key Masking", () => {
    it("safely masks sensitive keys preserving only trailing 4 characters", () => {
      expect(maskApiKey("sk-or-v1-abcdef12345678")).toBe("sk-...5678");
      expect(maskApiKey("gsk_1234567890abcdef")).toBe("sk-...cdef");
      expect(maskApiKey("secret-token-key-9999")).toBe("sk-...9999");
    });

    it("handles short or empty keys gracefully", () => {
      expect(maskApiKey("abc")).toBe("sk-...");
      expect(maskApiKey("")).toBe("sk-...");
    });
  });

  describe("Credential Encryption & Resolution", () => {
    it("encrypts and decrypts BYOK credentials for any supported cloud provider", () => {
      const rawKey = "sk-ant-api03-test-secret-key-12345";
      const { encryptedApiKey, maskedApiKey } = encryptAccountKey(rawKey);

      expect(encryptedApiKey).not.toBe(rawKey);
      expect(maskedApiKey).toBe("sk-...2345");

      const credentials = resolveDecryptedAccountKey({
        cloudProvider: "ANTHROPIC",
        cloudModel: "claude-3-5-sonnet-20241022",
        encryptedApiKey,
        maskedApiKey,
      } as any);

      expect(credentials).not.toBeNull();
      expect(credentials?.provider).toBe("ANTHROPIC");
      expect(credentials?.apiKey).toBe(rawKey);
      expect(credentials?.model).toBe("claude-3-5-sonnet-20241022");
    });

    it("defaults to OPENROUTER when cloudProvider is omitted", () => {
      const rawKey = "sk-or-v1-test-openrouter-key-8888";
      const { encryptedApiKey } = encryptAccountKey(rawKey);

      const credentials = resolveDecryptedAccountKey({
        encryptedApiKey,
      } as any);

      expect(credentials?.provider).toBe("OPENROUTER");
      expect(credentials?.apiKey).toBe(rawKey);
      expect(credentials?.model).toBeNull();
    });

    it("returns null when no encrypted key is configured", () => {
      expect(resolveDecryptedAccountKey(null)).toBeNull();
      expect(resolveDecryptedAccountKey({})).toBeNull();
      expect(resolveDecryptedAccountKey({ encryptedApiKey: null } as any)).toBeNull();
    });

    it("returns null without throwing when decrypting corrupted ciphertext", () => {
      const credentials = resolveDecryptedAccountKey({
        encryptedApiKey: "invalid:corrupted:tag",
      } as any);
      expect(credentials).toBeNull();
    });
  });

  describe("Provider SSOT Endpoints & Contracts", () => {
    it("defines endpoints and default models for all supported cloud providers", () => {
      expect(CLOUD_LLM_PROVIDERS).toEqual([
        "OPENROUTER",
        "OPENAI",
        "GROQ",
        "DEEPSEEK",
        "ANTHROPIC",
        "GEMINI",
      ]);

      for (const provider of CLOUD_LLM_PROVIDERS) {
        const config = PROVIDER_ENDPOINTS[provider];
        expect(config).toBeDefined();
        expect(config.baseUrl).toMatch(/^https:\/\//);
        expect(config.defaultModel.length).toBeGreaterThan(0);
        expect(["BEARER", "X_API_KEY"]).toContain(config.authHeaderType);
        expect(["OPENAI_COMPAT", "ANTHROPIC_NATIVE"]).toContain(config.apiFormat);
      }
    });

    it("correctly maps Anthropic to native Messages API format and x-api-key", () => {
      const anthropic = PROVIDER_ENDPOINTS.ANTHROPIC;
      expect(anthropic.apiFormat).toBe("ANTHROPIC_NATIVE");
      expect(anthropic.authHeaderType).toBe("X_API_KEY");
      expect(anthropic.baseUrl).toBe("https://api.anthropic.com/v1");
    });

    it("correctly maps OpenAI-compatible providers", () => {
      expect(PROVIDER_ENDPOINTS.OPENAI.apiFormat).toBe("OPENAI_COMPAT");
      expect(PROVIDER_ENDPOINTS.OPENROUTER.apiFormat).toBe("OPENAI_COMPAT");
      expect(PROVIDER_ENDPOINTS.GROQ.apiFormat).toBe("OPENAI_COMPAT");
      expect(PROVIDER_ENDPOINTS.DEEPSEEK.apiFormat).toBe("OPENAI_COMPAT");
      expect(PROVIDER_ENDPOINTS.GEMINI.apiFormat).toBe("OPENAI_COMPAT");
    });
  });
});
