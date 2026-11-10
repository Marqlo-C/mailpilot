import { describe, it, expect } from "vitest";
import { mergeRulesWithPermanentSettings } from "@/lib/profile/persistent-profile";
import { DEFAULT_ACCOUNT_RULES, type AccountRules } from "@/lib/validations/rules";

describe("mergeRulesWithPermanentSettings", () => {
  it("returns base account rules unchanged when permanent is null or undefined", () => {
    const base: AccountRules = { ...DEFAULT_ACCOUNT_RULES };
    expect(mergeRulesWithPermanentSettings(base, null)).toEqual(base);
    expect(mergeRulesWithPermanentSettings(base, undefined)).toEqual(base);
  });

  it("merges applicationMode and maxAutoSendsPerDay from permanent settings", () => {
    const base: AccountRules = {
      ...DEFAULT_ACCOUNT_RULES,
      applicationMode: "MANUAL_REVIEW",
      maxAutoSendsPerDay: 5,
    };
    const merged = mergeRulesWithPermanentSettings(base, {
      applicationMode: "AUTO_SEND",
      maxAutoSendsPerDay: 15,
      rules: {},
    });

    expect(merged.applicationMode).toBe("AUTO_SEND");
    expect(merged.maxAutoSendsPerDay).toBe(15);
  });

  it("inherits BYOK cloud LLM credentials from durable permanent settings when account rules are empty", () => {
    const base: AccountRules = {
      ...DEFAULT_ACCOUNT_RULES,
      encryptedApiKey: null,
      maskedApiKey: null,
      cloudModel: null,
      allowCloudFallback: false,
    };

    const permanentRules = {
      encryptedApiKey: "enc:test-openrouter-key",
      maskedApiKey: "sk-...9999",
      cloudProvider: "OPENROUTER" as const,
      cloudModel: "deepseek/deepseek-r1",
      allowCloudFallback: true,
    };

    const merged = mergeRulesWithPermanentSettings(base, {
      rules: permanentRules,
    });

    expect(merged.encryptedApiKey).toBe("enc:test-openrouter-key");
    expect(merged.maskedApiKey).toBe("sk-...9999");
    expect(merged.cloudProvider).toBe("OPENROUTER");
    expect(merged.cloudModel).toBe("deepseek/deepseek-r1");
    expect(merged.allowCloudFallback).toBe(true);
  });

  it("inherits ScrapingAnt and HasData credentials from durable permanent settings", () => {
    const base: AccountRules = {
      ...DEFAULT_ACCOUNT_RULES,
      encryptedScrapingAntApiKey: null,
      maskedScrapingAntApiKey: null,
      encryptedHasDataApiKey: null,
      maskedHasDataApiKey: null,
    };

    const permanentRules = {
      encryptedScrapingAntApiKey: "enc:scrapingant-1234",
      maskedScrapingAntApiKey: "ant-...1234",
      encryptedHasDataApiKey: "enc:hasdata-5678",
      maskedHasDataApiKey: "hd-...5678",
    };

    const merged = mergeRulesWithPermanentSettings(base, {
      rules: permanentRules,
    });

    expect(merged.encryptedScrapingAntApiKey).toBe("enc:scrapingant-1234");
    expect(merged.maskedScrapingAntApiKey).toBe("ant-...1234");
    expect(merged.encryptedHasDataApiKey).toBe("enc:hasdata-5678");
    expect(merged.maskedHasDataApiKey).toBe("hd-...5678");
  });

  it("preserves account-level keys when explicitly configured", () => {
    const base: AccountRules = {
      ...DEFAULT_ACCOUNT_RULES,
      encryptedApiKey: "enc:account-specific-key",
      maskedApiKey: "sk-...1111",
      cloudProvider: "OPENROUTER",
      cloudModel: "google/gemini-2.5-flash",
    };

    const permanentRules = {
      encryptedApiKey: "enc:permanent-key",
      maskedApiKey: "sk-...9999",
      cloudProvider: "OPENROUTER" as const,
      cloudModel: "anthropic/claude-3.5-sonnet",
    };

    const merged = mergeRulesWithPermanentSettings(base, {
      rules: permanentRules,
    });

    expect(merged.encryptedApiKey).toBe("enc:account-specific-key");
    expect(merged.maskedApiKey).toBe("sk-...1111");
    expect(merged.cloudModel).toBe("google/gemini-2.5-flash");
  });

  it("inherits ScrapingAnt usage info from permanent rules or picks the freshest one", () => {
    const base: AccountRules = {
      ...DEFAULT_ACCOUNT_RULES,
      scrapingAntUsage: null,
    };

    const usage = {
      planName: "Enthusiast",
      startDate: "2026-06-01T00:00:00",
      endDate: "2026-07-01T00:00:00",
      planTotalCredits: 100000,
      remainedCredits: 85000,
      concurrencyLimit: null,
      fetchedAt: "2026-06-02T12:00:00Z",
    };

    const merged = mergeRulesWithPermanentSettings(base, {
      rules: { scrapingAntUsage: usage },
    });

    expect(merged.scrapingAntUsage).toEqual(usage);
  });

  it("inherits HasData usage info from permanent rules or picks the freshest one", () => {
    const base: AccountRules = {
      ...DEFAULT_ACCOUNT_RULES,
      hasDataUsage: null,
    };

    const usage = {
      planName: "Startup",
      totalCredits: 200000,
      availableCredits: 195000,
      concurrentRequests: 0,
      availableConcurrency: 5,
      startDate: "2026-06-01T00:00:00Z",
      endDate: "2026-07-01T00:00:00Z",
      fetchedAt: "2026-06-02T12:00:00Z",
    };

    const merged = mergeRulesWithPermanentSettings(base, {
      rules: { hasDataUsage: usage },
    });

    expect(merged.hasDataUsage).toEqual(usage);
  });
});
