import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_ENVIRONMENTS,
  DEVELOPER_FEATURE_FLAG_KEYS,
  FEATURE_FLAGS_CONFIG,
  getEnvironmentDefaultFeatureFlag,
  getEnvironmentDefaultFeatureFlags,
  resolveDeploymentEnvironment,
} from "../features.config";

describe("lib/config/features.config", () => {
  describe("DEVELOPER_FEATURE_FLAG_KEYS & DEPLOYMENT_ENVIRONMENTS", () => {
    it("defines the 4 canonical developer flags", () => {
      expect(DEVELOPER_FEATURE_FLAG_KEYS).toEqual([
        "embedded_ai",
        "shadow_evaluation",
        "web_scraping_proxies",
        "mode_b_metric_synthesis",
      ]);
    });

    it("defines the 3 supported deployment environments", () => {
      expect(DEPLOYMENT_ENVIRONMENTS).toEqual([
        "development",
        "preview",
        "production",
      ]);
    });
  });

  describe("resolveDeploymentEnvironment", () => {
    it("resolves from VERCEL_ENV when present and valid", () => {
      expect(
        resolveDeploymentEnvironment({ VERCEL_ENV: "production" })
      ).toBe("production");
      expect(
        resolveDeploymentEnvironment({ VERCEL_ENV: "preview" })
      ).toBe("preview");
      expect(
        resolveDeploymentEnvironment({ VERCEL_ENV: "development" })
      ).toBe("development");
    });

    it("falls back to NODE_ENV when VERCEL_ENV is absent", () => {
      expect(
        resolveDeploymentEnvironment({ NODE_ENV: "production" })
      ).toBe("production");
      expect(
        resolveDeploymentEnvironment({ NODE_ENV: "preview" })
      ).toBe("preview");
      expect(
        resolveDeploymentEnvironment({ NODE_ENV: "development" })
      ).toBe("development");
    });

    it("defaults to development when neither is set or when unmapped", () => {
      expect(resolveDeploymentEnvironment({})).toBe("development");
      expect(resolveDeploymentEnvironment({ NODE_ENV: "test" })).toBe(
        "development"
      );
    });
  });

  describe("FEATURE_FLAGS_CONFIG invariants", () => {
    it("defines expected defaults per environment according to specification", () => {
      // embedded_ai: dev: true, preview: true, production: false
      expect(FEATURE_FLAGS_CONFIG.embedded_ai.envDefaults).toEqual({
        development: true,
        preview: true,
        production: false,
      });

      // shadow_evaluation: dev: true, preview: true, production: true
      expect(FEATURE_FLAGS_CONFIG.shadow_evaluation.envDefaults).toEqual({
        development: true,
        preview: true,
        production: true,
      });

      // web_scraping_proxies: dev: false, preview: true, production: true
      expect(FEATURE_FLAGS_CONFIG.web_scraping_proxies.envDefaults).toEqual({
        development: false,
        preview: true,
        production: true,
      });

      // mode_b_metric_synthesis: dev: true, preview: true, production: false
      expect(
        FEATURE_FLAGS_CONFIG.mode_b_metric_synthesis.envDefaults
      ).toEqual({
        development: true,
        preview: true,
        production: false,
      });
    });

    it("maps valid kill-switch environment variable names", () => {
      for (const key of DEVELOPER_FEATURE_FLAG_KEYS) {
        const item = FEATURE_FLAGS_CONFIG[key];
        expect(item.killSwitchEnvVar).toBe(
          `DISABLE_FEATURE_${key.toUpperCase()}`
        );
      }
    });
  });

  describe("getEnvironmentDefaultFeatureFlag & getEnvironmentDefaultFeatureFlags", () => {
    it("returns correct flag defaults for specific environments", () => {
      expect(
        getEnvironmentDefaultFeatureFlag("embedded_ai", "production")
      ).toBe(false);
      expect(
        getEnvironmentDefaultFeatureFlag("embedded_ai", "development")
      ).toBe(true);
      expect(
        getEnvironmentDefaultFeatureFlag("web_scraping_proxies", "development")
      ).toBe(false);
      expect(
        getEnvironmentDefaultFeatureFlag("web_scraping_proxies", "production")
      ).toBe(true);
    });

    it("resolves complete dictionary for given environment", () => {
      const prodDefaults = getEnvironmentDefaultFeatureFlags("production");
      expect(prodDefaults).toEqual({
        embedded_ai: false,
        shadow_evaluation: true,
        web_scraping_proxies: true,
        mode_b_metric_synthesis: false,
      });

      const devDefaults = getEnvironmentDefaultFeatureFlags("development");
      expect(devDefaults).toEqual({
        embedded_ai: true,
        shadow_evaluation: true,
        web_scraping_proxies: false,
        mode_b_metric_synthesis: true,
      });
    });
  });
});
