import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAGS_REGISTRY,
  type FeatureFlagKey,
} from "@/lib/validations/feature-flags.schema";
import type { AccountRules } from "@/lib/validations/rules.schema";
import {
  getEffectiveFeatureFlags,
  getKillSwitchedFlags,
  isFeatureEnabled,
  isSystemKillSwitchEngaged,
} from "../feature-flags";

describe("Core Feature Flag In-Memory Resolution Engine (Phase 1)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Priority 1: System Emergency Kill-Switches", () => {
    it("kill-switch overrides explicit account flag enabling the feature", () => {
      const rules: Partial<AccountRules> = {
        featureFlags: { embedded_ai: true },
      };

      // When kill-switch is active via envOverrides, it must return false
      const resolved = isFeatureEnabled("embedded_ai", rules, {
        DISABLE_FEATURE_EMBEDDED_AI: "true",
      });
      expect(resolved).toBe(false);
    });

    it("supports '1' as a truthy kill-switch value", () => {
      const rules: Partial<AccountRules> = {
        featureFlags: { shadow_evaluation: true },
      };

      const resolved = isFeatureEnabled("shadow_evaluation", rules, {
        DISABLE_FEATURE_SHADOW_EVALUATION: "1",
      });
      expect(resolved).toBe(false);
    });

    it("supports FEATURE_<KEY>=false as an inverted system kill-switch", () => {
      const rules: Partial<AccountRules> = {
        featureFlags: { web_scraping_proxies: true },
      };

      const resolved = isFeatureEnabled("web_scraping_proxies", rules, {
        FEATURE_WEB_SCRAPING_PROXIES: "false",
      });
      expect(resolved).toBe(false);
    });

    it("supports FEATURE_<KEY>=0 as an inverted system kill-switch", () => {
      const rules: Partial<AccountRules> = {
        featureFlags: { embedded_ai: true },
      };

      const resolved = isFeatureEnabled("embedded_ai", rules, {
        FEATURE_EMBEDDED_AI: "0",
      });
      expect(resolved).toBe(false);
    });

    it("falls back to process.env when envOverrides is omitted", () => {
      process.env.DISABLE_FEATURE_WEB_SCRAPING_PROXIES = "true";

      const rules: Partial<AccountRules> = {
        featureFlags: { web_scraping_proxies: true },
      };

      expect(isFeatureEnabled("web_scraping_proxies", rules)).toBe(false);
    });

    it("does not engage kill-switch when env variable is 'false' or non-truthy", () => {
      const rules: Partial<AccountRules> = {
        featureFlags: { shadow_evaluation: true },
      };

      const resolved = isFeatureEnabled("shadow_evaluation", rules, {
        DISABLE_FEATURE_SHADOW_EVALUATION: "false",
        FEATURE_SHADOW_EVALUATION: "true",
      });
      expect(resolved).toBe(true);
    });
  });

  describe("Priority 2: Explicit Account Flag Overrides", () => {
    it("account override takes precedence over legacy rule alias", () => {
      // Legacy says true, but featureFlags explicitly sets false
      const rules: Partial<AccountRules> = {
        enableShadowEmbeddings: true,
        featureFlags: {
          shadow_evaluation: false,
        },
      };

      expect(isFeatureEnabled("shadow_evaluation", rules)).toBe(false);
    });

    it("account override true takes precedence over legacy rule false", () => {
      // Legacy says false, but featureFlags explicitly sets true
      const rules: Partial<AccountRules> = {
        enableShadowEmbeddings: false,
        featureFlags: {
          shadow_evaluation: true,
        },
      };

      expect(isFeatureEnabled("shadow_evaluation", rules)).toBe(true);
    });

    it.each(FEATURE_FLAG_KEYS)(
      "respects explicit false and true overrides for '%s'",
      (flagKey) => {
        const falseRules: Partial<AccountRules> = {
          featureFlags: { [flagKey]: false },
        };
        expect(isFeatureEnabled(flagKey, falseRules)).toBe(false);

        const trueRules: Partial<AccountRules> = {
          featureFlags: { [flagKey]: true },
        };
        expect(isFeatureEnabled(flagKey, trueRules)).toBe(true);
      }
    );
  });

  describe("Priority 3: Legacy Rule Aliases", () => {
    it("maps shadow_evaluation to enableShadowEmbeddings", () => {
      expect(
        isFeatureEnabled("shadow_evaluation", {
          enableShadowEmbeddings: true,
          featureFlags: {},
        })
      ).toBe(true);

      expect(
        isFeatureEnabled("shadow_evaluation", {
          enableShadowEmbeddings: false,
          featureFlags: {},
        })
      ).toBe(false);
    });

    it("maps mode_b_metric_synthesis to inventMetrics and resumePreferences.inventMetrics", () => {
      expect(
        isFeatureEnabled("mode_b_metric_synthesis", {
          inventMetrics: true,
          featureFlags: {},
        })
      ).toBe(true);

      expect(
        isFeatureEnabled("mode_b_metric_synthesis", {
          inventMetrics: false,
          featureFlags: {},
        })
      ).toBe(false);

      expect(
        isFeatureEnabled("mode_b_metric_synthesis", {
          resumePreferences: {
            inventMetrics: true,
            includeSummary: true,
            attachPdfByDefault: true,
            maxPages: "auto",
            sectionOrder: [],
            disabledSections: [],
            orderingMode: "AI_OPTIMAL",
            inclusionMode: "AI_OPTIMAL",
          },
          featureFlags: {},
        })
      ).toBe(true);
    });

    it("maps web_scraping_proxies to enableWebScrapingProxies", () => {
      expect(
        isFeatureEnabled("web_scraping_proxies", {
          enableWebScrapingProxies: true,
          featureFlags: {},
        })
      ).toBe(true);

      expect(
        isFeatureEnabled("web_scraping_proxies", {
          enableWebScrapingProxies: false,
          featureFlags: {},
        })
      ).toBe(false);
    });

    it("maps embedded_ai to scoringEngine (embedded / hybrid)", () => {
      expect(
        isFeatureEnabled("embedded_ai", {
          scoringEngine: "embedded",
          featureFlags: {},
        })
      ).toBe(true);

      expect(
        isFeatureEnabled("embedded_ai", {
          scoringEngine: "hybrid",
          featureFlags: {},
        })
      ).toBe(true);

      expect(
        isFeatureEnabled("embedded_ai", {
          scoringEngine: "heuristic",
          featureFlags: {},
        })
      ).toBe(false);
    });

    it("falls through to environment default when embedded_ai scoringEngine is omitted", () => {
      expect(
        isFeatureEnabled(
          "embedded_ai",
          { featureFlags: {} },
          { NODE_ENV: "production" }
        )
      ).toBe(false);

      expect(
        isFeatureEnabled(
          "embedded_ai",
          { featureFlags: {} },
          { NODE_ENV: "development" }
        )
      ).toBe(true);
    });

    it("does not alias purged pseudo-flags to user workflow rules", () => {
      const purgedKeys = [
        "autonomous_dispatch",
        "ai_tailoring",
        "cloud_llm_fallback",
        "auto_unsubscribe_cleanup",
      ] as const;

      const rulesWithUserPrefs: Partial<AccountRules> = {
        applicationMode: "AUTO_SEND",
        allowCloudFallback: true,
        autoCleanAfterUnsub: "TRASH",
      };

      for (const purged of purgedKeys) {
        // Purged keys are not registered developer flags and must resolve to false
        expect(isFeatureEnabled(purged as unknown as FeatureFlagKey, rulesWithUserPrefs)).toBe(false);
      }
    });
  });

  describe("Priority 3 & 4: Deployment Environment Defaults from SSOT Config", () => {
    it("resolves exact per-environment defaults for development", () => {
      const devEnv = { NODE_ENV: "development" };
      expect(isFeatureEnabled("embedded_ai", {}, devEnv)).toBe(true);
      expect(isFeatureEnabled("shadow_evaluation", {}, devEnv)).toBe(true);
      expect(isFeatureEnabled("web_scraping_proxies", {}, devEnv)).toBe(false);
      expect(isFeatureEnabled("mode_b_metric_synthesis", {}, devEnv)).toBe(true);
    });

    it("resolves exact per-environment defaults for preview", () => {
      const previewEnv = { VERCEL_ENV: "preview" };
      expect(isFeatureEnabled("embedded_ai", {}, previewEnv)).toBe(true);
      expect(isFeatureEnabled("shadow_evaluation", {}, previewEnv)).toBe(true);
      expect(isFeatureEnabled("web_scraping_proxies", {}, previewEnv)).toBe(true);
      expect(isFeatureEnabled("mode_b_metric_synthesis", {}, previewEnv)).toBe(true);
    });

    it("resolves exact per-environment defaults for production", () => {
      const prodEnv = { NODE_ENV: "production" };
      expect(isFeatureEnabled("embedded_ai", {}, prodEnv)).toBe(false);
      expect(isFeatureEnabled("shadow_evaluation", {}, prodEnv)).toBe(true);
      expect(isFeatureEnabled("web_scraping_proxies", {}, prodEnv)).toBe(true);
      expect(isFeatureEnabled("mode_b_metric_synthesis", {}, prodEnv)).toBe(false);
    });

    it("falls back to default value when rules is null or undefined", () => {
      for (const key of FEATURE_FLAG_KEYS) {
        const expected = FEATURE_FLAGS_REGISTRY[key].defaultValue;
        expect(isFeatureEnabled(key, null)).toBe(expected);
        expect(isFeatureEnabled(key, undefined)).toBe(expected);
      }
    });

    it("falls back to default value when rules has empty properties", () => {
      for (const key of FEATURE_FLAG_KEYS) {
        const expected = FEATURE_FLAGS_REGISTRY[key].defaultValue;
        expect(isFeatureEnabled(key, {})).toBe(expected);
      }
    });

    it("returns false for unknown/unregistered flag key", () => {
      expect(isFeatureEnabled("unknown_flag" as FeatureFlagKey, null)).toBe(
        false
      );
    });
  });

  describe("getEffectiveFeatureFlags", () => {
    it("returns all 4 canonical flags matching registry defaults when rules is empty", () => {
      const resolved = getEffectiveFeatureFlags(null);

      expect(Object.keys(resolved).sort()).toEqual(
        [...FEATURE_FLAG_KEYS].sort()
      );
      expect(resolved).toEqual(DEFAULT_FEATURE_FLAGS);
    });

    it("resolves a mixed map of overrides, legacy aliases, and defaults", () => {
      const rules: Partial<AccountRules> = {
        enableShadowEmbeddings: true, // legacy alias -> shadow_evaluation: true
        featureFlags: {
          embedded_ai: true, // explicit override
        },
      };

      const envOverrides = {
        DISABLE_FEATURE_WEB_SCRAPING_PROXIES: "true", // kill-switch -> false
        NODE_ENV: "production",
      };

      const effective = getEffectiveFeatureFlags(rules, envOverrides);

      expect(effective.embedded_ai).toBe(true);
      expect(effective.shadow_evaluation).toBe(true);
      expect(effective.web_scraping_proxies).toBe(false);
      expect(effective.mode_b_metric_synthesis).toBe(false); // production default
    });
  });

  describe("getKillSwitchedFlags", () => {
    it("returns all flags false when no kill switches are active in environment", () => {
      const killSwitches = getKillSwitchedFlags({});
      for (const key of FEATURE_FLAG_KEYS) {
        expect(killSwitches[key]).toBe(false);
      }
    });

    it("correctly identifies flags that have active system kill switches", () => {
      const killSwitches = getKillSwitchedFlags({
        DISABLE_FEATURE_EMBEDDED_AI: "1",
        DISABLE_FEATURE_WEB_SCRAPING_PROXIES: "true",
      });

      expect(killSwitches.embedded_ai).toBe(true);
      expect(killSwitches.web_scraping_proxies).toBe(true);
      expect(killSwitches.shadow_evaluation).toBe(false);
      expect(killSwitches.mode_b_metric_synthesis).toBe(false);
    });

    it("correctly identifies inverted FEATURE_<KEY>=false as kill-switched", () => {
      const killSwitches = getKillSwitchedFlags({
        FEATURE_MODE_B_METRIC_SYNTHESIS: "false",
      });

      expect(killSwitches.mode_b_metric_synthesis).toBe(true);
      expect(killSwitches.embedded_ai).toBe(false);
    });
  });
});
