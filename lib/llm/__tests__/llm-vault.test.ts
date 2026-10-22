import { beforeAll, describe, expect, it } from "vitest";
import { encryptToken } from "@/lib/crypto";
import {
  encryptAccountKey,
  maskApiKey,
  maskHasDataApiKey,
  maskScrapingAntApiKey,
  resolveDecryptedAccountKey,
  resolveDecryptedHasDataKey,
  resolveDecryptedScrapingAntKey,
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
      expect(maskApiKey("jina_abcdef1234567890")).toBe("jina_...7890");
      expect(maskScrapingAntApiKey("7d97aada1292445e989d631f78bedca9")).toBe("ant-...dca9");
      expect(maskHasDataApiKey("hd_live_9876543210abcdef")).toBe("hd-...cdef");
    });

    it("handles short or empty keys gracefully", () => {
      expect(maskApiKey("abc")).toBe("sk-...");
      expect(maskApiKey("")).toBe("sk-...");
      expect(maskScrapingAntApiKey("abc")).toBe("ant-...");
      expect(maskScrapingAntApiKey("")).toBe("ant-...");
      expect(maskHasDataApiKey("abc")).toBe("hd-...");
      expect(maskHasDataApiKey("")).toBe("hd-...");
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

    it("scopes cloudModel to its configured cloudModelProvider and returns null on provider mismatch", () => {
      const rawKey = "sk-test-key-9999";
      const { encryptedApiKey } = encryptAccountKey(rawKey);

      const mismatchCredentials = resolveDecryptedAccountKey({
        cloudProvider: "OPENAI",
        cloudModel: "anthropic/claude-3.5-sonnet",
        cloudModelProvider: "OPENROUTER",
        encryptedApiKey,
      });
      expect(mismatchCredentials?.provider).toBe("OPENAI");
      expect(mismatchCredentials?.model).toBeNull();

      const matchingCredentials = resolveDecryptedAccountKey({
        cloudProvider: "OPENROUTER",
        cloudModel: "anthropic/claude-3.5-sonnet",
        cloudModelProvider: "OPENROUTER",
        encryptedApiKey,
      });
      expect(matchingCredentials?.provider).toBe("OPENROUTER");
      expect(matchingCredentials?.model).toBe("anthropic/claude-3.5-sonnet");
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

    it("decrypts ScrapingAnt key when present and valid", () => {
      const rawKey = "7d97aada1292445e989d631f78bedca9";
      const encrypted = encryptToken(rawKey);
      const decrypted = resolveDecryptedScrapingAntKey({
        encryptedScrapingAntApiKey: encrypted,
      } as any);
      expect(decrypted).toBe(rawKey);
    });

    it("returns null when ScrapingAnt key is not configured or invalid", () => {
      expect(resolveDecryptedScrapingAntKey(null)).toBeNull();
      expect(resolveDecryptedScrapingAntKey({})).toBeNull();
      expect(
        resolveDecryptedScrapingAntKey({
          encryptedScrapingAntApiKey: "invalid:corrupted:token",
        } as any)
      ).toBeNull();
    });

    it("decrypts HasData key when present and valid", () => {
      const rawKey = "hd_live_1234567890abcdef";
      const encrypted = encryptToken(rawKey);
      const decrypted = resolveDecryptedHasDataKey({
        encryptedHasDataApiKey: encrypted,
      } as any);
      expect(decrypted).toBe(rawKey);
    });

    it("returns null when HasData key is not configured or invalid", () => {
      expect(resolveDecryptedHasDataKey(null)).toBeNull();
      expect(resolveDecryptedHasDataKey({})).toBeNull();
      expect(
        resolveDecryptedHasDataKey({
          encryptedHasDataApiKey: "invalid:corrupted:token",
        } as any)
      ).toBeNull();
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
