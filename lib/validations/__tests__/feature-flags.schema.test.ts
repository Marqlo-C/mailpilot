import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_CATEGORIES,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_RISK_TIERS,
  FEATURE_FLAGS_REGISTRY,
  featureFlagCategorySchema,
  featureFlagKeySchema,
  featureFlagRiskTierSchema,
  featureFlagsMapSchema,
  toggleFeatureFlagSchema,
} from "../feature-flags.schema";
import {
  DEFAULT_ACCOUNT_RULES,
  accountRulesSchema,
  parseAccountRules,
} from "../rules.schema";

describe("Feature Flags SSOT Schema & Registry (Phase 0)", () => {
  describe("FEATURE_FLAG_KEYS & featureFlagKeySchema", () => {
    it("defines the canonical 4 developer feature flag keys", () => {
      expect(FEATURE_FLAG_KEYS).toEqual([
        "embedded_ai",
        "shadow_evaluation",
        "web_scraping_proxies",
        "mode_b_metric_synthesis",
      ]);
    });

    it.each(FEATURE_FLAG_KEYS)(
      "successfully parses valid flag key '%s'",
      (key) => {
        expect(featureFlagKeySchema.parse(key)).toBe(key);
      }
    );

    it("rejects purged pseudo-flags and invalid keys", () => {
      expect(() => featureFlagKeySchema.parse("autonomous_dispatch")).toThrow(ZodError);
      expect(() => featureFlagKeySchema.parse("ai_tailoring")).toThrow(ZodError);
      expect(() => featureFlagKeySchema.parse("cloud_llm_fallback")).toThrow(ZodError);
      expect(() => featureFlagKeySchema.parse("auto_unsubscribe_cleanup")).toThrow(ZodError);
      expect(() => featureFlagKeySchema.parse("invalid_flag")).toThrow(ZodError);
      expect(() => featureFlagKeySchema.parse(123)).toThrow(ZodError);
      expect(() => featureFlagKeySchema.parse(null)).toThrow(ZodError);
    });
  });

  describe("FEATURE_FLAG_RISK_TIERS & featureFlagRiskTierSchema", () => {
    it("defines LOW, MEDIUM, and HIGH risk tiers", () => {
      expect(FEATURE_FLAG_RISK_TIERS).toEqual(["LOW", "MEDIUM", "HIGH"]);
    });

    it.each(FEATURE_FLAG_RISK_TIERS)(
      "successfully parses valid risk tier '%s'",
      (tier) => {
        expect(featureFlagRiskTierSchema.parse(tier)).toBe(tier);
      }
    );

    it("rejects unknown risk tiers", () => {
      expect(() => featureFlagRiskTierSchema.parse("CRITICAL")).toThrow(ZodError);
      expect(() => featureFlagRiskTierSchema.parse("low")).toThrow(ZodError);
    });
  });

  describe("FEATURE_FLAG_CATEGORIES & featureFlagCategorySchema", () => {
    it("defines the canonical 4 feature flag categories", () => {
      expect(FEATURE_FLAG_CATEGORIES).toEqual([
        "ai",
        "automation",
        "scraping",
        "subscriptions",
      ]);
    });

    it.each(FEATURE_FLAG_CATEGORIES)(
      "successfully parses valid category '%s'",
      (cat) => {
        expect(featureFlagCategorySchema.parse(cat)).toBe(cat);
      }
    );

    it("rejects unknown categories", () => {
      expect(() => featureFlagCategorySchema.parse("finance")).toThrow(ZodError);
      expect(() => featureFlagCategorySchema.parse("AI")).toThrow(ZodError);
    });
  });

  describe("FEATURE_FLAGS_REGISTRY completeness & invariants", () => {
    it("contains a definition for every canonical key", () => {
      for (const key of FEATURE_FLAG_KEYS) {
        const def = FEATURE_FLAGS_REGISTRY[key];
        expect(def).toBeDefined();
        expect(def.id).toBe(key);
        expect(typeof def.label).toBe("string");
        expect(def.label.length).toBeGreaterThan(0);
        expect(typeof def.description).toBe("string");
        expect(def.description.length).toBeGreaterThan(0);
        expect(typeof def.defaultValue).toBe("boolean");
        expect(FEATURE_FLAG_RISK_TIERS).toContain(def.risk);
        expect(FEATURE_FLAG_CATEGORIES).toContain(def.category);
      }
    });

    it("verifies emergency kill-switch environment variable naming conventions", () => {
      for (const key of FEATURE_FLAG_KEYS) {
        const def = FEATURE_FLAGS_REGISTRY[key];
        if (def.killSwitchEnvVar) {
          expect(def.killSwitchEnvVar).toBe(
            `DISABLE_FEATURE_${key.toUpperCase()}`
          );
        }
      }
    });

    it("ensures DEFAULT_FEATURE_FLAGS contains default boolean states for all keys", () => {
      for (const key of FEATURE_FLAG_KEYS) {
        expect(DEFAULT_FEATURE_FLAGS[key]).toBe(
          FEATURE_FLAGS_REGISTRY[key].defaultValue
        );
      }
      expect(Object.isFrozen(DEFAULT_FEATURE_FLAGS)).toBe(true);
    });
  });

  describe("featureFlagsMapSchema", () => {
    it("defaults to empty object when given empty object, nullish, or undefined", () => {
      expect(featureFlagsMapSchema.parse({})).toEqual({});
      expect(featureFlagsMapSchema.parse(undefined)).toEqual({});
    });

    it("accepts valid partial flag overrides", () => {
      const overrides = {
        embedded_ai: true,
        shadow_evaluation: false,
      };
      const parsed = featureFlagsMapSchema.parse(overrides);
      expect(parsed).toEqual(overrides);
    });

    it("rejects non-boolean values for flags", () => {
      expect(() =>
        featureFlagsMapSchema.parse({ embedded_ai: "true" })
      ).toThrow(ZodError);
      expect(() =>
        featureFlagsMapSchema.parse({ shadow_evaluation: 1 })
      ).toThrow(ZodError);
      expect(() =>
        featureFlagsMapSchema.parse({ web_scraping_proxies: null })
      ).toThrow(ZodError);
    });

    it("rejects purged pseudo-flags and unknown keys", () => {
      expect(() =>
        featureFlagsMapSchema.parse({ autonomous_dispatch: true })
      ).toThrow(ZodError);
      expect(() =>
        featureFlagsMapSchema.parse({ unknown_flag: true })
      ).toThrow(ZodError);
    });
  });

  describe("toggleFeatureFlagSchema", () => {
    it("accepts valid toggle mutation payload", () => {
      const payload = {
        accountId: "acc_abc123",
        flagKey: "embedded_ai" as const,
        enabled: true,
      };
      expect(toggleFeatureFlagSchema.parse(payload)).toEqual(payload);
    });

    it("rejects empty accountId", () => {
      expect(() =>
        toggleFeatureFlagSchema.parse({
          accountId: "",
          flagKey: "embedded_ai",
          enabled: true,
        })
      ).toThrow(ZodError);
    });

    it("rejects invalid flag key", () => {
      expect(() =>
        toggleFeatureFlagSchema.parse({
          accountId: "acc_1",
          flagKey: "non_existent_flag",
          enabled: true,
        })
      ).toThrow(ZodError);
    });

    it("rejects non-boolean enabled parameter", () => {
      expect(() =>
        toggleFeatureFlagSchema.parse({
          accountId: "acc_1",
          flagKey: "embedded_ai",
          enabled: "true",
        })
      ).toThrow(ZodError);
    });
  });

  describe("accountRulesSchema & parseAccountRules integration", () => {
    it("defaults featureFlags to empty object on empty rule payloads", () => {
      const parsed = accountRulesSchema.parse({});
      expect(parsed.featureFlags).toEqual({});

      expect(DEFAULT_ACCOUNT_RULES.featureFlags).toEqual({});
    });

    it("parses rules cleanly via parseAccountRules with empty or null payload", () => {
      const fromEmpty = parseAccountRules({});
      expect(fromEmpty.featureFlags).toEqual({});

      const fromNull = parseAccountRules(null);
      expect(fromNull.featureFlags).toEqual({});

      const fromUndefined = parseAccountRules(undefined);
      expect(fromUndefined.featureFlags).toEqual({});
    });

    it("preserves explicit featureFlags overrides through parseAccountRules", () => {
      const payload = {
        featureFlags: {
          embedded_ai: true,
          mode_b_metric_synthesis: true,
        },
      };
      const result = parseAccountRules(payload);
      expect(result.featureFlags).toEqual({
        embedded_ai: true,
        mode_b_metric_synthesis: true,
      });
    });

    it("maintains 100% backwards compatibility with legacy rules payloads lacking featureFlags", () => {
      const legacyPayload = {
        rejectionMode: "AUTO_TRASH",
        enableShadowEmbeddings: false,
        applicationMode: "AUTO_SEND",
        allowCloudFallback: false,
        enableWebScrapingProxies: false,
        matchScoreThreshold: 70, // Deprecated legacy field
      };

      const result = parseAccountRules(legacyPayload);

      expect(result.rejectionMode).toBe("AUTO_TRASH");
      expect(result.enableShadowEmbeddings).toBe(false);
      expect(result.applicationMode).toBe("AUTO_SEND");
      expect(result.allowCloudFallback).toBe(false);
      expect(result.enableWebScrapingProxies).toBe(false);
      expect(result.featureFlags).toEqual({});
      expect("matchScoreThreshold" in result).toBe(false);
    });

    it("rejects invalid featureFlags in accountRulesSchema", () => {
      expect(() =>
        accountRulesSchema.parse({
          featureFlags: { invalid_flag_key: true },
        })
      ).toThrow(ZodError);

      expect(() =>
        accountRulesSchema.parse({
          featureFlags: { embedded_ai: "not_a_boolean" },
        })
      ).toThrow(ZodError);
    });
  });
});
