import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/core/auth";
import { verifyAccountOwnership } from "@/lib/services/account-lifecycle.service";
import { updateFeatureFlag as updateFeatureFlagService } from "@/lib/services/settings-rules.service";
import { toggleFeatureFlagAction } from "../settings";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules.schema";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/core/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/services/account-lifecycle.service", () => ({
  verifyAccountOwnership: vi.fn(),
}));

vi.mock("@/lib/services/settings-rules.service", () => ({
  updateFeatureFlag: vi.fn(),
  updateRule: vi.fn(),
  updateBridgeSecret: vi.fn(),
  updateLlmProvider: vi.fn(),
  updateOllamaUrl: vi.fn(),
  updateOllamaModel: vi.fn(),
  updateDismissedRetention: vi.fn(),
  addExcludedTitle: vi.fn(),
  removeExcludedTitle: vi.fn(),
  readOllamaStatus: vi.fn(),
}));

describe("toggleFeatureFlagAction (Phase 4 Server Action Mutation Boundary)", () => {
  const sampleAccountId = "acc_user_123";
  const mockRules = {
    ...DEFAULT_ACCOUNT_RULES,
    featureFlags: {
      embedded_ai: true,
    },
    applicationMode: "AUTO_SEND" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication Gate", () => {
    it("returns unauthorized error when user session is missing", async () => {
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await toggleFeatureFlagAction({
        accountId: sampleAccountId,
        flagKey: "embedded_ai",
        enabled: true,
      });

      expect(result).toEqual({
        success: false,
        error: "Unauthorized",
      });
      expect(verifyAccountOwnership).not.toHaveBeenCalled();
      expect(updateFeatureFlagService).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("Input Validation", () => {
    it("rejects payload with empty accountId", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });

      const result = await toggleFeatureFlagAction({
        accountId: "",
        flagKey: "embedded_ai",
        enabled: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Account ID is required");
      }
      expect(verifyAccountOwnership).not.toHaveBeenCalled();
      expect(updateFeatureFlagService).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("rejects payload with invalid feature flag key", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });

      const result = await toggleFeatureFlagAction({
        accountId: sampleAccountId,
        flagKey: "invalid_unknown_flag" as any,
        enabled: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/Invalid option|expected one of/i);
      }
      expect(updateFeatureFlagService).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("rejects payload with non-boolean enabled state", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });

      const result = await toggleFeatureFlagAction({
        accountId: sampleAccountId,
        flagKey: "embedded_ai",
        enabled: "true" as any,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/expected boolean/i);
      }
      expect(updateFeatureFlagService).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("Multi-Tenant Account Authorization", () => {
    it("rejects mutation when target account is not owned by the session", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });
      vi.mocked(verifyAccountOwnership).mockResolvedValueOnce({
        ok: false,
        error: "Account not found for this user",
      });

      const result = await toggleFeatureFlagAction({
        accountId: "foreign_account_id",
        flagKey: "embedded_ai",
        enabled: true,
      });

      expect(result).toEqual({
        success: false,
        error: "Account not found for this user",
      });
      expect(verifyAccountOwnership).toHaveBeenCalledWith(
        sampleAccountId,
        "foreign_account_id"
      );
      expect(updateFeatureFlagService).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("Service Layer Delegation & Failure Handling", () => {
    it("returns service error when updateFeatureFlag fails", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });
      vi.mocked(verifyAccountOwnership).mockResolvedValueOnce({
        ok: true,
        accountId: sampleAccountId,
      });
      vi.mocked(updateFeatureFlagService).mockResolvedValueOnce({
        ok: false,
        error: "Account settings not found",
      });

      const result = await toggleFeatureFlagAction({
        accountId: sampleAccountId,
        flagKey: "shadow_evaluation",
        enabled: false,
      });

      expect(result).toEqual({
        success: false,
        error: "Account settings not found",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("catches and encapsulates unexpected service exceptions", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });
      vi.mocked(verifyAccountOwnership).mockResolvedValueOnce({
        ok: true,
        accountId: sampleAccountId,
      });
      vi.mocked(updateFeatureFlagService).mockRejectedValueOnce(
        new Error("Prisma connection pool timeout")
      );

      const result = await toggleFeatureFlagAction({
        accountId: sampleAccountId,
        flagKey: "shadow_evaluation",
        enabled: false,
      });

      expect(result).toEqual({
        success: false,
        error: "Prisma connection pool timeout",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("Successful Mutations & Route Revalidation", () => {
    it("successfully toggles flag via object input and revalidates /settings and /jobs", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });
      vi.mocked(verifyAccountOwnership).mockResolvedValueOnce({
        ok: true,
        accountId: sampleAccountId,
      });
      vi.mocked(updateFeatureFlagService).mockResolvedValueOnce({
        ok: true,
        data: mockRules,
      });

      const result = await toggleFeatureFlagAction({
        accountId: sampleAccountId,
        flagKey: "embedded_ai",
        enabled: true,
      });

      expect(result).toEqual({
        success: true,
        data: mockRules,
      });
      expect(updateFeatureFlagService).toHaveBeenCalledWith(
        sampleAccountId,
        "embedded_ai",
        true
      );
      expect(revalidatePath).toHaveBeenCalledWith("/settings");
      expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    });

    it("successfully toggles flag via positional arguments", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });
      vi.mocked(verifyAccountOwnership).mockResolvedValueOnce({
        ok: true,
        accountId: sampleAccountId,
      });
      vi.mocked(updateFeatureFlagService).mockResolvedValueOnce({
        ok: true,
        data: mockRules,
      });

      const result = await toggleFeatureFlagAction(
        sampleAccountId,
        "embedded_ai",
        true
      );

      expect(result).toEqual({
        success: true,
        data: mockRules,
      });
      expect(updateFeatureFlagService).toHaveBeenCalledWith(
        sampleAccountId,
        "embedded_ai",
        true
      );
      expect(revalidatePath).toHaveBeenCalledWith("/settings");
      expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    });
  });

  describe("Production Environment Guard", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("rejects feature flag toggling in production environment", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.mocked(auth).mockResolvedValueOnce({
        accountId: sampleAccountId,
        user: { id: sampleAccountId },
      });
      vi.mocked(verifyAccountOwnership).mockResolvedValueOnce({
        ok: true,
        accountId: sampleAccountId,
      });

      const result = await toggleFeatureFlagAction({
        accountId: sampleAccountId,
        flagKey: "embedded_ai",
        enabled: true,
      });

      expect(result).toEqual({
        success: false,
        error:
          "Developer feature flags cannot be toggled via UI in production",
      });
      expect(updateFeatureFlagService).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
