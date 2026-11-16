import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isWebScrapingProxiesEnabled,
  dispatchScrapingAnt,
  dispatchHasData,
} from "../dispatcher";
import { encryptToken } from "@/lib/core/crypto";
import type { AccountRules } from "@/lib/validations/rules.schema";

describe("Web Scraping Proxy Dispatcher", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isWebScrapingProxiesEnabled", () => {
    it("returns false in development environment by default when rules are empty", () => {
      expect(isWebScrapingProxiesEnabled({})).toBe(false);
      expect(isWebScrapingProxiesEnabled(null)).toBe(false);
    });

    it("returns true in production environment by default when rules are empty", () => {
      process.env.VERCEL_ENV = "production";
      expect(isWebScrapingProxiesEnabled({})).toBe(true);
      expect(isWebScrapingProxiesEnabled(null)).toBe(true);
    });

    it("returns true when legacy enableWebScrapingProxies is true", () => {
      expect(isWebScrapingProxiesEnabled({ enableWebScrapingProxies: true })).toBe(true);
    });

    it("returns false when web_scraping_proxies feature flag is false", () => {
      const rules: Partial<AccountRules> = {
        featureFlags: { web_scraping_proxies: false },
      };
      expect(isWebScrapingProxiesEnabled(rules)).toBe(false);
    });

    it("returns false when emergency kill switch is engaged", () => {
      process.env.DISABLE_FEATURE_WEB_SCRAPING_PROXIES = "true";
      expect(
        isWebScrapingProxiesEnabled({
          featureFlags: { web_scraping_proxies: true },
        })
      ).toBe(false);
    });
  });

  describe("dispatchScrapingAnt", () => {
    it("returns skipped status without calling operation when flag is disabled", async () => {
      const op = vi.fn();
      const result = await dispatchScrapingAnt(
        { featureFlags: { web_scraping_proxies: false } },
        op
      );

      expect(result).toEqual({
        executed: false,
        reason: "PROXIES_DISABLED",
      });
      expect(op).not.toHaveBeenCalled();
    });

    it("returns skipped status when API key is missing", async () => {
      const op = vi.fn();
      const result = await dispatchScrapingAnt(
        {
          featureFlags: { web_scraping_proxies: true },
          encryptedScrapingAntApiKey: null,
        },
        op
      );

      expect(result).toEqual({
        executed: false,
        reason: "MISSING_KEY",
      });
      expect(op).not.toHaveBeenCalled();
    });

    it("executes operation when enabled and valid key is present", async () => {
      const encryptedKey = encryptToken("ant-test-key-1234");
      const op = vi.fn().mockResolvedValue({ status: 200, html: "<html></html>" });

      const result = await dispatchScrapingAnt(
        {
          featureFlags: { web_scraping_proxies: true },
          encryptedScrapingAntApiKey: encryptedKey,
        },
        op
      );

      expect(result).toEqual({
        executed: true,
        data: { status: 200, html: "<html></html>" },
      });
      expect(op).toHaveBeenCalledWith("ant-test-key-1234");
    });
  });

  describe("dispatchHasData", () => {
    it("returns skipped status without calling operation when flag is disabled", async () => {
      const op = vi.fn();
      const result = await dispatchHasData(
        { featureFlags: { web_scraping_proxies: false } },
        op
      );

      expect(result).toEqual({
        executed: false,
        reason: "PROXIES_DISABLED",
      });
      expect(op).not.toHaveBeenCalled();
    });

    it("returns skipped status when API key is missing", async () => {
      const op = vi.fn();
      const result = await dispatchHasData(
        {
          featureFlags: { web_scraping_proxies: true },
          encryptedHasDataApiKey: null,
        },
        op
      );

      expect(result).toEqual({
        executed: false,
        reason: "MISSING_KEY",
      });
      expect(op).not.toHaveBeenCalled();
    });

    it("executes operation when enabled and valid key is present", async () => {
      const encryptedKey = encryptToken("hd-test-key-5678");
      const op = vi.fn().mockResolvedValue({ status: 200, jobTitle: "Software Lead" });

      const result = await dispatchHasData(
        {
          featureFlags: { web_scraping_proxies: true },
          encryptedHasDataApiKey: encryptedKey,
        },
        op
      );

      expect(result).toEqual({
        executed: true,
        data: { status: 200, jobTitle: "Software Lead" },
      });
      expect(op).toHaveBeenCalledWith("hd-test-key-5678");
    });
  });
});
