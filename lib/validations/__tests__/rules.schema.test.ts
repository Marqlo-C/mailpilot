import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  accountRulesSchema,
  DEFAULT_ACCOUNT_RULES,
  EMBEDDING_PROVIDERS,
  embeddingProviderSchema,
  SCORING_ENGINES,
  scoringEngineSchema,
  parseAccountRules,
} from "../rules.schema";

describe("Embedded AI Settings Schema Extension (Phase 1)", () => {
  describe("EMBEDDING_PROVIDERS SSOT Constant & Enum Schema", () => {
    it("defines the canonical 5 embedding providers", () => {
      expect(EMBEDDING_PROVIDERS).toEqual([
        "disabled",
        "local_ollama",
        "openai",
        "gemini",
        "jina",
      ]);
    });

    it.each(EMBEDDING_PROVIDERS)("successfully parses valid provider '%s'", (provider) => {
      expect(embeddingProviderSchema.parse(provider)).toBe(provider);
    });

    it("rejects unsupported embedding providers", () => {
      expect(() => embeddingProviderSchema.parse("anthropic")).toThrow(ZodError);
      expect(() => embeddingProviderSchema.parse("groq")).toThrow(ZodError);
      expect(() => embeddingProviderSchema.parse("invalid_provider")).toThrow(ZodError);
    });
  });

  describe("accountRulesSchema defaults", () => {
    it("applies safe defaults for embedding configuration when given an empty object", () => {
      const parsed = accountRulesSchema.parse({});

      expect(parsed.embeddingProvider).toBe("disabled");
      expect(parsed.embeddingModel).toBe("nomic-embed-text");
      expect(parsed.enableShadowEmbeddings).toBe(true);
      expect(parsed.crossoverScoreThreshold).toBe(60);
      expect(parsed.scoringEngine).toBe("heuristic");
    });

    it("ensures DEFAULT_ACCOUNT_RULES includes canonical embedded AI defaults", () => {
      expect(DEFAULT_ACCOUNT_RULES.embeddingProvider).toBe("disabled");
      expect(DEFAULT_ACCOUNT_RULES.embeddingModel).toBe("nomic-embed-text");
      expect(DEFAULT_ACCOUNT_RULES.enableShadowEmbeddings).toBe(true);
      expect(DEFAULT_ACCOUNT_RULES.crossoverScoreThreshold).toBe(60);
      expect(DEFAULT_ACCOUNT_RULES.scoringEngine).toBe("heuristic");
    });
  });

  describe("SCORING_ENGINES SSOT Constant & Enum Schema (Phase 5)", () => {
    it("defines the canonical scoring engines: heuristic, embedded, hybrid", () => {
      expect(SCORING_ENGINES).toEqual(["heuristic", "embedded", "hybrid"]);
    });

    it.each(SCORING_ENGINES)(
      "successfully parses valid scoring engine '%s'",
      (engine) => {
        expect(scoringEngineSchema.parse(engine)).toBe(engine);
      }
    );

    it("rejects unsupported scoring engines", () => {
      expect(() => scoringEngineSchema.parse("neural")).toThrow(ZodError);
      expect(() => scoringEngineSchema.parse("random")).toThrow(ZodError);
      expect(() => scoringEngineSchema.parse(123)).toThrow(ZodError);
    });
  });

  describe("Custom valid embedding configurations", () => {
    it("accepts valid embedding provider selections and custom models", () => {
      const customRules = {
        embeddingProvider: "openai",
        embeddingModel: "text-embedding-3-small",
        enableShadowEmbeddings: false,
        crossoverScoreThreshold: 75,
        scoringEngine: "hybrid",
      };

      const parsed = accountRulesSchema.parse(customRules);
      expect(parsed.embeddingProvider).toBe("openai");
      expect(parsed.embeddingModel).toBe("text-embedding-3-small");
      expect(parsed.enableShadowEmbeddings).toBe(false);
      expect(parsed.crossoverScoreThreshold).toBe(75);
      expect(parsed.scoringEngine).toBe("hybrid");
    });

    it("accepts boundary threshold values (0 and 100)", () => {
      const atZero = accountRulesSchema.parse({ crossoverScoreThreshold: 0 });
      expect(atZero.crossoverScoreThreshold).toBe(0);

      const atHundred = accountRulesSchema.parse({ crossoverScoreThreshold: 100 });
      expect(atHundred.crossoverScoreThreshold).toBe(100);
    });
  });

  describe("Invalid value rejections", () => {
    it("rejects invalid embeddingProvider values", () => {
      expect(() =>
        accountRulesSchema.parse({ embeddingProvider: "deepseek" })
      ).toThrow(ZodError);

      expect(() =>
        accountRulesSchema.parse({ embeddingProvider: 123 })
      ).toThrow(ZodError);
    });

    it("rejects non-string embeddingModel values", () => {
      expect(() =>
        accountRulesSchema.parse({ embeddingModel: 12345 })
      ).toThrow(ZodError);

      expect(() =>
        accountRulesSchema.parse({ embeddingModel: true })
      ).toThrow(ZodError);
    });

    it("rejects invalid scoringEngine values", () => {
      expect(() =>
        accountRulesSchema.parse({ scoringEngine: "machine_learning" })
      ).toThrow(ZodError);

      expect(() =>
        accountRulesSchema.parse({ scoringEngine: false })
      ).toThrow(ZodError);
    });

    it("rejects non-boolean enableShadowEmbeddings values", () => {
      expect(() =>
        accountRulesSchema.parse({ enableShadowEmbeddings: "true" })
      ).toThrow(ZodError);

      expect(() =>
        accountRulesSchema.parse({ enableShadowEmbeddings: 1 })
      ).toThrow(ZodError);
    });

    it("rejects out-of-bounds or non-integer crossoverScoreThreshold", () => {
      // Below 0
      expect(() =>
        accountRulesSchema.parse({ crossoverScoreThreshold: -1 })
      ).toThrow(ZodError);

      // Above 100
      expect(() =>
        accountRulesSchema.parse({ crossoverScoreThreshold: 101 })
      ).toThrow(ZodError);

      // Non-integer float
      expect(() =>
        accountRulesSchema.parse({ crossoverScoreThreshold: 60.5 })
      ).toThrow(ZodError);

      // Non-number string
      expect(() =>
        accountRulesSchema.parse({ crossoverScoreThreshold: "60" })
      ).toThrow(ZodError);
    });
  });

  describe("Backwards compatibility with legacy and empty payloads", () => {
    it("parses empty, null, or undefined rules cleanly via parseAccountRules", () => {
      const fromEmpty = parseAccountRules({});
      expect(fromEmpty.embeddingProvider).toBe("disabled");
      expect(fromEmpty.embeddingModel).toBe("nomic-embed-text");
      expect(fromEmpty.enableShadowEmbeddings).toBe(true);
      expect(fromEmpty.crossoverScoreThreshold).toBe(60);

      const fromNull = parseAccountRules(null);
      expect(fromNull.embeddingProvider).toBe("disabled");
      expect(fromNull.embeddingModel).toBe("nomic-embed-text");
      expect(fromNull.enableShadowEmbeddings).toBe(true);
      expect(fromNull.crossoverScoreThreshold).toBe(60);

      const fromUndefined = parseAccountRules(undefined);
      expect(fromUndefined.embeddingProvider).toBe("disabled");
      expect(fromUndefined.embeddingModel).toBe("nomic-embed-text");
      expect(fromUndefined.enableShadowEmbeddings).toBe(true);
      expect(fromUndefined.crossoverScoreThreshold).toBe(60);
    });

    it("preserves legacy rule fields while injecting embedded AI defaults", () => {
      const legacyPayload = {
        rejectionMode: "AUTO_TRASH",
        rejectionLabelName: "Custom Rejections",
        maxAutoSendsPerDay: 10,
        excludedTitles: ["Director of Architecture", "Clinical Lead"],
        matchScoreThreshold: 85, // Deprecated legacy field
      };

      const result = parseAccountRules(legacyPayload);

      // Verifies legacy fields are preserved
      expect(result.rejectionMode).toBe("AUTO_TRASH");
      expect(result.rejectionLabelName).toBe("Custom Rejections");
      expect(result.maxAutoSendsPerDay).toBe(10);
      expect(result.excludedTitles).toEqual([
        "Director of Architecture",
        "Clinical Lead",
      ]);

      // Verifies deprecated matchScoreThreshold is omitted from returned AccountRules
      expect("matchScoreThreshold" in result).toBe(false);

      // Verifies embedded AI defaults are safely backfilled
      expect(result.embeddingProvider).toBe("disabled");
      expect(result.embeddingModel).toBe("nomic-embed-text");
      expect(result.enableShadowEmbeddings).toBe(true);
      expect(result.crossoverScoreThreshold).toBe(60);
      expect(result.scoringEngine).toBe("heuristic");
    });
  });
});
