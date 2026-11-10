"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  type OllamaStatus,
  updateRule as updateRuleService,
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
} from "@/lib/validations/settings.schema";

export type { ActionResult, ApiKeyStatus, OllamaStatus, UpdateCustomLlmKeyInput };

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
