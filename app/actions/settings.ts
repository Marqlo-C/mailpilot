"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/core/auth";
import { verifyAccountOwnership } from "@/lib/services/account-lifecycle.service";
import {
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
import type { ScrapingAntUsage, HasDataUsage } from "@/lib/validations/rules.schema";
import type { CloudLlmProvider } from "@/lib/ai/provider.schema";
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
import {
  accountIdParamSchema,
  actionError,
  actionSuccess,
  type ActionResult,
  type ServerActionResult,
} from "@/lib/validations/action.schema";
import type { FeatureFlagKey } from "@/lib/validations/feature-flags.schema";
import type { AccountRules } from "@/lib/validations/rules.schema";

export type {
  ActionResult,
  ApiKeyStatus,
  OllamaStatus,
  UpdateCustomLlmKeyInput,
  ToggleFeatureFlagInput,
  ServerActionResult,
};

async function verifyAuthAndAccount(targetAccountId: string): Promise<ServerActionResult<string>> {
  const session = await auth();
  if (!session) return actionError("Unauthorized");
  const parsed = accountIdParamSchema.safeParse(targetAccountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid account ID");
  }
  const verification = await verifyAccountOwnership(session.accountId, parsed.data);
  if (!verification.ok) {
    return actionError(verification.error ?? "Account not found for this user");
  }
  return actionSuccess(parsed.data);
}

export async function updateRule(
  accountId: string,
  key: string,
  value: unknown
): Promise<ServerActionResult<AccountRules>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const keyParsed = z.string().trim().min(1, "Rule key cannot be empty").safeParse(key);
  if (!keyParsed.success) {
    return actionError(keyParsed.error.issues[0]?.message ?? "Invalid rule key");
  }

  const result = await updateRuleService(authCheck.data, keyParsed.data, value);
  if (result.ok) revalidatePath("/settings");
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to update rule");
}

export async function updateBridgeSecret(
  accountId: string,
  secret: string
): Promise<ServerActionResult<{ bridgeSecret: string | null }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await updateBridgeSecretService(authCheck.data, secret);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to update bridge secret");
}

export async function updateLlmProvider(
  accountId: string,
  provider: string
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const providerParsed = z.string().trim().min(1, "Provider cannot be empty").safeParse(provider);
  if (!providerParsed.success) {
    return actionError(providerParsed.error.issues[0]?.message ?? "Invalid LLM provider");
  }

  const result = await updateLlmProviderService(authCheck.data, providerParsed.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to update LLM provider");
}

export async function updateOllamaUrl(
  accountId: string,
  url: string,
  ollamaModel?: string | null
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const urlParsed = z.string().trim().min(1, "URL cannot be empty").safeParse(url);
  if (!urlParsed.success) {
    return actionError(urlParsed.error.issues[0]?.message ?? "Invalid Ollama URL");
  }

  const result = await updateOllamaUrlService(authCheck.data, urlParsed.data, ollamaModel);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to update Ollama URL");
}

export async function updateOllamaModel(
  accountId: string,
  ollamaModel: string
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const modelParsed = z.string().trim().min(1, "Model name cannot be empty").safeParse(ollamaModel);
  if (!modelParsed.success) {
    return actionError(modelParsed.error.issues[0]?.message ?? "Invalid Ollama model");
  }

  const result = await updateOllamaModelService(authCheck.data, modelParsed.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to update Ollama model");
}

export async function updateDismissedRetention(days: number): Promise<ServerActionResult<void>> {
  const session = await auth();
  if (!session) return actionError("Unauthorized");

  const daysParsed = z.number().int().positive("Retention days must be a positive number").safeParse(days);
  if (!daysParsed.success) {
    return actionError(daysParsed.error.issues[0]?.message ?? "Invalid retention days");
  }

  const result = await updateDismissedRetentionService(daysParsed.data);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to update dismissed retention");
}

export async function addExcludedTitle(
  accountId: string,
  title: string
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const titleParsed = z.string().trim().min(1, "Title cannot be empty").safeParse(title);
  if (!titleParsed.success) {
    return actionError(titleParsed.error.issues[0]?.message ?? "Invalid excluded title");
  }

  const result = await addExcludedTitleService(authCheck.data, titleParsed.data);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to add excluded title");
}

export async function removeExcludedTitle(
  accountId: string,
  title: string
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const titleParsed = z.string().trim().min(1, "Title cannot be empty").safeParse(title);
  if (!titleParsed.success) {
    return actionError(titleParsed.error.issues[0]?.message ?? "Invalid excluded title");
  }

  const result = await removeExcludedTitleService(authCheck.data, titleParsed.data);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to remove excluded title");
}

export async function updateCustomLlmKey(
  accountId: string,
  input: UpdateCustomLlmKeyInput
): Promise<ServerActionResult<{ provider: CloudLlmProvider; model: string; maskedApiKey: string }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const inputParsed = updateCustomLlmKeyInputSchema.safeParse(input);
  if (!inputParsed.success) {
    return actionError(inputParsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await updateCustomLlmKeyService(authCheck.data, inputParsed.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to update custom LLM key");
}

export async function saveCustomLlmKey(
  accountId: string,
  input: UpdateCustomLlmKeyInput
): Promise<ServerActionResult<{ provider: CloudLlmProvider; model: string; maskedApiKey: string }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const inputParsed = updateCustomLlmKeyInputSchema.safeParse(input);
  if (!inputParsed.success) {
    return actionError(inputParsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await saveCustomLlmKeyService(authCheck.data, inputParsed.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to save custom LLM key");
}

export async function clearCustomLlmKey(
  accountId: string
): Promise<ServerActionResult<{ cleared: true }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await clearCustomLlmKeyService(authCheck.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to clear custom LLM key");
}

export async function saveScrapingAntApiKey(
  accountId: string,
  rawKey: string | null
): Promise<ServerActionResult<{ maskedScrapingAntApiKey: string | null; scrapingAntUsage?: ScrapingAntUsage | null }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await saveScrapingAntApiKeyService(authCheck.data, rawKey);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to save ScrapingAnt key");
}

export async function clearScrapingAntApiKey(
  accountId: string
): Promise<ServerActionResult<{ cleared: true }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await clearScrapingAntApiKeyService(authCheck.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to clear ScrapingAnt key");
}

export async function getScrapingAntUsageAction(
  accountId: string,
  force?: boolean
): Promise<ServerActionResult<ScrapingAntUsage | null>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await getScrapingAntUsageService(authCheck.data, force);
  return result.ok
    ? actionSuccess(result.data ?? null)
    : actionError(result.error ?? "Failed to fetch ScrapingAnt usage");
}

export async function saveHasDataApiKey(
  accountId: string,
  rawKey: string | null
): Promise<ServerActionResult<{ maskedHasDataApiKey: string | null; hasDataUsage?: HasDataUsage | null }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await saveHasDataApiKeyService(authCheck.data, rawKey);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to save HasData key");
}

export async function clearHasDataApiKey(
  accountId: string
): Promise<ServerActionResult<{ cleared: true }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await clearHasDataApiKeyService(authCheck.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to clear HasData key");
}

export async function getHasDataUsageAction(
  accountId: string,
  force?: boolean
): Promise<ServerActionResult<HasDataUsage | null>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await getHasDataUsageService(authCheck.data, force);
  return result.ok
    ? actionSuccess(result.data ?? null)
    : actionError(result.error ?? "Failed to fetch HasData usage");
}

export async function saveJinaApiKey(
  accountId: string,
  apiKey: string
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const keyParsed = z.string().trim().min(1, "API key cannot be empty").safeParse(apiKey);
  if (!keyParsed.success) {
    return actionError(keyParsed.error.issues[0]?.message ?? "Invalid Jina API key");
  }

  const result = await saveJinaApiKeyService(authCheck.data, keyParsed.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to save Jina key");
}

export async function clearJinaApiKey(
  accountId: string
): Promise<ServerActionResult<{ cleared: true }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await clearJinaApiKeyService(authCheck.data);
  if (result.ok) revalidatePath("/settings");
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to clear Jina key");
}

export async function readApiKeyStatus(accountId: string): Promise<ServerActionResult<ApiKeyStatus>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await readApiKeyStatusService(authCheck.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to read API key status");
}

export async function readOllamaStatus(accountId: string): Promise<ServerActionResult<OllamaStatus>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await readOllamaStatusService(authCheck.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to read Ollama status");
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
      return actionError("Unauthorized");
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
      return actionError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const verification = await verifyAccountOwnership(
      session.accountId,
      parsed.data.accountId
    );
    if (!verification.ok) {
      return actionError(verification.error ?? "Account not found for this user");
    }

    if (process.env.NODE_ENV === "production") {
      return actionError("Developer feature flags cannot be toggled via UI in production");
    }

    const result = await updateFeatureFlagService(
      parsed.data.accountId,
      parsed.data.flagKey,
      parsed.data.enabled
    );

    if (!result.ok) {
      return actionError(result.error);
    }

    if (!result.data) {
      return actionError("Failed to update feature flag");
    }

    revalidatePath("/settings");
    revalidatePath("/jobs");

    return actionSuccess(result.data);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Internal server error");
  }
}
