"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/core/auth";
import { verifyAccountOwnership } from "@/lib/services/account-lifecycle.service";
import {
  type ActionResult,
  type OllamaStatus,
  updateRule as updateRuleService,
  updateFeatureFlag as updateFeatureFlagService,
  updateBridgeSecret as updateBridgeSecretService,
  updateLlmProvider as updateLlmProviderService,
  updateOllamaUrl as updateOllamaUrlService,
  updateOllamaModel as updateOllamaModelService,
  updateDismissedRetention as updateDismissedRetentionService,
  addExcludedTitle as addExcludedTitleService,
  removeExcludedTitle as removeExcludedTitleService,
  readOllamaStatus as readOllamaStatusService,
} from "@/lib/services/settings-rules.service";
import {
  type ApiKeyStatus,
  updateCustomLlmKey as updateCustomLlmKeyService,
  saveCustomLlmKey as saveCustomLlmKeyService,
  clearCustomLlmKey as clearCustomLlmKeyService,
  saveScrapingAntApiKey as saveScrapingAntApiKeyService,
  clearScrapingAntApiKey as clearScrapingAntApiKeyService,
  getScrapingAntUsage as getScrapingAntUsageService,
  saveHasDataApiKey as saveHasDataApiKeyService,
  clearHasDataApiKey as clearHasDataApiKeyService,
  getHasDataUsage as getHasDataUsageService,
  saveJinaApiKey as saveJinaApiKeyService,
  clearJinaApiKey as clearJinaApiKeyService,
  readApiKeyStatus as readApiKeyStatusService,
} from "@/lib/services/api-keys.service";
import {
  updateCustomLlmKeyInputSchema,
  type UpdateCustomLlmKeyInput,
  toggleFeatureFlagSchema,
  type ToggleFeatureFlagInput,
} from "@/lib/validations/settings.schema";
import type { FeatureFlagKey } from "@/lib/validations/feature-flags.schema";
import type { AccountRules } from "@/lib/validations/rules.schema";

export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type {
  ActionResult,
  ApiKeyStatus,
  OllamaStatus,
  UpdateCustomLlmKeyInput,
  ToggleFeatureFlagInput,
};


export async function updateRule(accountId: string, key: string, value: unknown) {
  const result = await updateRuleService(accountId, key, value);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function updateBridgeSecret(accountId: string, secret: string) {
  const result = await updateBridgeSecretService(accountId, secret);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function updateLlmProvider(accountId: string, provider: string) {
  const result = await updateLlmProviderService(accountId, provider);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function updateOllamaUrl(accountId: string, url: string, ollamaModel?: string | null) {
  const result = await updateOllamaUrlService(accountId, url, ollamaModel);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function updateOllamaModel(accountId: string, ollamaModel: string) {
  const result = await updateOllamaModelService(accountId, ollamaModel);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function updateDismissedRetention(days: number) {
  const result = await updateDismissedRetentionService(days);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function addExcludedTitle(accountId: string, title: string) {
  const result = await addExcludedTitleService(accountId, title);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function removeExcludedTitle(accountId: string, title: string) {
  const result = await removeExcludedTitleService(accountId, title);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function updateCustomLlmKey(accountId: string, input: UpdateCustomLlmKeyInput) {
  const result = await updateCustomLlmKeyService(accountId, input);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function saveCustomLlmKey(accountId: string, input: UpdateCustomLlmKeyInput) {
  const result = await saveCustomLlmKeyService(accountId, input);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function clearCustomLlmKey(accountId: string) {
  const result = await clearCustomLlmKeyService(accountId);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function saveScrapingAntApiKey(accountId: string, rawKey: string | null) {
  const result = await saveScrapingAntApiKeyService(accountId, rawKey);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function clearScrapingAntApiKey(accountId: string) {
  const result = await clearScrapingAntApiKeyService(accountId);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function getScrapingAntUsageAction(accountId: string, force?: boolean) {
  return getScrapingAntUsageService(accountId, force);
}

export async function saveHasDataApiKey(accountId: string, rawKey: string | null) {
  const result = await saveHasDataApiKeyService(accountId, rawKey);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function clearHasDataApiKey(accountId: string) {
  const result = await clearHasDataApiKeyService(accountId);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function getHasDataUsageAction(accountId: string, force?: boolean) {
  return getHasDataUsageService(accountId, force);
}

export async function saveJinaApiKey(accountId: string, apiKey: string) {
  const result = await saveJinaApiKeyService(accountId, apiKey);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function clearJinaApiKey(accountId: string) {
  const result = await clearJinaApiKeyService(accountId);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function readApiKeyStatus(accountId: string) {
  return readApiKeyStatusService(accountId);
}

export async function readOllamaStatus(accountId: string) {
  return readOllamaStatusService(accountId);
}

/**
 * Toggles a single feature flag for an account via server action mutation boundary.
 *
 * Guarantees:
 * - Session authentication via `auth()`
 * - Strict input validation against `toggleFeatureFlagSchema`
 * - Multi-tenant account ownership authorization via `verifyAccountOwnership`
 * - Production environment guard prohibiting UI toggling when `NODE_ENV === "production"`
 * - Synchronizes legacy rule aliases to maintain 100% backward compatibility
 * - Revalidates `/settings` and `/jobs` cache paths upon successful mutation
 * - Returns a standardized tagged union contract (`{ success: true, data } | { success: false, error }`)
 *
 * @param inputOrAccountId - ToggleFeatureFlagInput object payload or target account ID
 * @param maybeFlagKey - Canonical feature flag key (when using positional arguments)
 * @param maybeEnabled - Target boolean enabled state (when using positional arguments)
 * @returns Standardized tagged union with updated AccountRules on success or error string on failure
 */
export async function toggleFeatureFlagAction(
  inputOrAccountId: ToggleFeatureFlagInput | string,
  maybeFlagKey?: FeatureFlagKey,
  maybeEnabled?: boolean
): Promise<ServerActionResult<AccountRules>> {
  try {
    const session = await auth();
    if (!session) {
      return { success: false, error: "Unauthorized" };
    }

    const rawInput =
      typeof inputOrAccountId === "object" && inputOrAccountId !== null
        ? inputOrAccountId
        : {
            accountId: inputOrAccountId,
            flagKey: maybeFlagKey,
            enabled: maybeEnabled,
          };

    const parsed = toggleFeatureFlagSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join("; "),
      };
    }

    const verification = await verifyAccountOwnership(
      session.accountId,
      parsed.data.accountId
    );
    if (!verification.ok) {
      return {
        success: false,
        error: verification.error ?? "Account not found for this user",
      };
    }

    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        error:
          "Developer feature flags cannot be toggled via UI in production",
      };
    }

    const result = await updateFeatureFlagService(
      parsed.data.accountId,
      parsed.data.flagKey,
      parsed.data.enabled
    );

    if (!result.ok) {
      return {
        success: false,
        error: result.error,
      };
    }

    if (!result.data) {
      return {
        success: false,
        error: "Failed to update feature flag",
      };
    }

    revalidatePath("/settings");
    revalidatePath("/jobs");

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    };
  }
}

