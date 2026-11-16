import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateFeatureFlag,
  updateRule,
  ruleKeySchema,
} from "../settings-rules.service";
import { prisma } from "@/lib/core/prisma";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules.schema";
import * as persistentProfile from "@/lib/profile/persistent-profile";

vi.mock("@/lib/profile/persistent-profile", () => ({
  ensurePersistentProfileForAccount: vi.fn().mockResolvedValue({ id: "prof_123" }),
  persistProfileScopedRules: vi.fn().mockResolvedValue(undefined),
}));

describe("Settings Rules Service - Feature Flags Isolation (Phase 1)", () => {
  const sampleAccountId = "acc_test_123";

  const mockSettings = {
    id: "settings_123",
    accountId: sampleAccountId,
    rules: { ...DEFAULT_ACCOUNT_RULES },
    account: {
      id: sampleAccountId,
      email: "test@example.com",
      persistentProfileId: "prof_123",
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("ruleKeySchema", () => {
    it("includes 'featureFlags' as a valid key", () => {
      expect(ruleKeySchema.safeParse("featureFlags").success).toBe(true);
    });
  });

  describe("updateFeatureFlag", () => {
    it("rejects invalid feature flag key", async () => {
      const result = await updateFeatureFlag(
        sampleAccountId,
        "invalid_flag" as any,
        true
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid feature flag key");
      }
    });

    it("rejects purged pseudo-flags as invalid feature flag keys", async () => {
      const purgedKeys = [
        "autonomous_dispatch",
        "ai_tailoring",
        "cloud_llm_fallback",
        "auto_unsubscribe_cleanup",
      ] as const;

      for (const purged of purgedKeys) {
        const result = await updateFeatureFlag(
          sampleAccountId,
          purged as any,
          true
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain("Invalid feature flag key");
        }
      }
    });

    it("returns error if account settings are not found", async () => {
      vi.spyOn(prisma.accountSettings, "findUnique").mockResolvedValue(null);

      const result = await updateFeatureFlag(
        sampleAccountId,
        "shadow_evaluation",
        true
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Account settings not found");
      }
    });

    it("toggles shadow_evaluation without mutating enableShadowEmbeddings user preference", async () => {
      vi.spyOn(prisma.accountSettings, "findUnique").mockResolvedValue(
        mockSettings as any
      );
      const updateSpy = vi
        .spyOn(prisma.accountSettings, "update")
        .mockResolvedValue({} as any);

      // Toggle to false
      const resultFalse = await updateFeatureFlag(
        sampleAccountId,
        "shadow_evaluation",
        false
      );
      expect(resultFalse.ok).toBe(true);
      if (resultFalse.ok) {
        expect(resultFalse.data?.featureFlags?.shadow_evaluation).toBe(false);
        // User preference must remain untouched
        expect(resultFalse.data?.enableShadowEmbeddings).toBe(
          DEFAULT_ACCOUNT_RULES.enableShadowEmbeddings
        );
      }

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: sampleAccountId },
          data: {
            rules: expect.objectContaining({
              featureFlags: expect.objectContaining({
                shadow_evaluation: false,
              }),
            }),
          },
        })
      );

      // Toggle to true
      const resultTrue = await updateFeatureFlag(
        sampleAccountId,
        "shadow_evaluation",
        true
      );
      expect(resultTrue.ok).toBe(true);
      if (resultTrue.ok) {
        expect(resultTrue.data?.featureFlags?.shadow_evaluation).toBe(true);
        expect(resultTrue.data?.enableShadowEmbeddings).toBe(
          DEFAULT_ACCOUNT_RULES.enableShadowEmbeddings
        );
      }
    });

    it("toggles mode_b_metric_synthesis without mutating inventMetrics user preference", async () => {
      vi.spyOn(prisma.accountSettings, "findUnique").mockResolvedValue(
        mockSettings as any
      );
      vi.spyOn(prisma.accountSettings, "update").mockResolvedValue({} as any);

      const result = await updateFeatureFlag(
        sampleAccountId,
        "mode_b_metric_synthesis",
        true
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data?.featureFlags?.mode_b_metric_synthesis).toBe(true);
        // User preference remains unchanged
        expect(result.data?.inventMetrics).toBe(
          DEFAULT_ACCOUNT_RULES.inventMetrics
        );
      }

      const resultFalse = await updateFeatureFlag(
        sampleAccountId,
        "mode_b_metric_synthesis",
        false
      );
      expect(resultFalse.ok).toBe(true);
      if (resultFalse.ok) {
        expect(resultFalse.data?.featureFlags?.mode_b_metric_synthesis).toBe(false);
        expect(resultFalse.data?.inventMetrics).toBe(
          DEFAULT_ACCOUNT_RULES.inventMetrics
        );
      }
    });

    it("toggles web_scraping_proxies without mutating enableWebScrapingProxies user preference", async () => {
      vi.spyOn(prisma.accountSettings, "findUnique").mockResolvedValue(
        mockSettings as any
      );
      vi.spyOn(prisma.accountSettings, "update").mockResolvedValue({} as any);

      const result = await updateFeatureFlag(
        sampleAccountId,
        "web_scraping_proxies",
        false
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data?.featureFlags?.web_scraping_proxies).toBe(false);
        expect(result.data?.enableWebScrapingProxies).toBe(
          DEFAULT_ACCOUNT_RULES.enableWebScrapingProxies
        );
      }
    });

    it("toggles embedded_ai cleanly and persists to profile-scoped rules", async () => {
      vi.spyOn(prisma.accountSettings, "findUnique").mockResolvedValue(
        mockSettings as any
      );
      vi.spyOn(prisma.accountSettings, "update").mockResolvedValue({} as any);

      const result = await updateFeatureFlag(
        sampleAccountId,
        "embedded_ai",
        true
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data?.featureFlags?.embedded_ai).toBe(true);
      }
      expect(persistentProfile.persistProfileScopedRules).toHaveBeenCalledWith(
        sampleAccountId,
        {
          featureFlags: expect.objectContaining({ embedded_ai: true }),
        }
      );
    });

    it("ensures updateFeatureFlag never mutates user settings like applicationMode or enableAiTailoringDefaults", async () => {
      const customSettings = {
        ...mockSettings,
        rules: {
          ...DEFAULT_ACCOUNT_RULES,
          applicationMode: "AUTO_SEND",
          allowCloudFallback: true,
          autoCleanAfterUnsub: "TRASH",
          enableAiTailoringDefaults: false,
        },
      };

      vi.spyOn(prisma.accountSettings, "findUnique").mockResolvedValue(
        customSettings as any
      );
      vi.spyOn(prisma.accountSettings, "update").mockResolvedValue({} as any);

      const result = await updateFeatureFlag(
        sampleAccountId,
        "shadow_evaluation",
        false
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data?.featureFlags?.shadow_evaluation).toBe(false);
        // Candidate user preferences must be completely preserved
        expect(result.data?.applicationMode).toBe("AUTO_SEND");
        expect(result.data?.allowCloudFallback).toBe(true);
        expect(result.data?.autoCleanAfterUnsub).toBe("TRASH");
        expect(result.data?.enableAiTailoringDefaults).toBe(false);
      }
    });
  });

  describe("updateRule with featureFlags", () => {
    it("updates featureFlags map via updateRule", async () => {
      vi.spyOn(prisma.accountSettings, "findUnique").mockResolvedValue(
        mockSettings as any
      );
      vi.spyOn(prisma.accountSettings, "update").mockResolvedValue({} as any);

      const result = await updateRule(sampleAccountId, "featureFlags", {
        shadow_evaluation: false,
        embedded_ai: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data?.featureFlags?.shadow_evaluation).toBe(false);
        expect(result.data?.featureFlags?.embedded_ai).toBe(true);
      }
    });
  });
});
