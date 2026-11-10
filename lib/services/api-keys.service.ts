import { Prisma } from "@prisma/client";
import { getActiveAccount } from "@/lib/data";
import { persistProfileScopedRules } from "@/lib/profile/persistent-profile";
import { prisma } from "@/lib/core/prisma";
import {
  accountRulesSchema,
  parseAccountRules,
  type ScrapingAntUsage,
  type HasDataUsage,
} from "@/lib/validations/rules";
import {
  type CloudLlmProvider,
  PROVIDER_ENDPOINTS,
} from "@/lib/llm/provider.ssot";
import {
  encryptAccountKey,
  maskApiKey,
  maskScrapingAntApiKey,
  maskHasDataApiKey,
} from "@/lib/llm/vault";
import { encryptToken } from "@/lib/core/crypto";
import {
  fetchScrapingAntUsageFromApi,
  getOrRefreshScrapingAntUsage,
} from "@/lib/scraping/scrapingant";
import {
  fetchHasDataUsageFromApi,
  getOrRefreshHasDataUsage,
} from "@/lib/scraping/hasdata";
import {
  updateCustomLlmKeyInputSchema,
  type UpdateCustomLlmKeyInput,
} from "@/lib/validations/settings";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type ApiKeyStatus = {
  cloudProvider: CloudLlmProvider;
  maskedApiKey: string | null;
  maskedScrapingAntApiKey: string | null;
  maskedHasDataApiKey: string | null;
};

/**
 * Encrypts and persists a customer-provided BYOK API key on AccountSettings.rules.
 * Never stores or returns the plaintext API key.
 */
export async function updateCustomLlmKey(
  accountId: string,
  input: UpdateCustomLlmKeyInput
): Promise<
  ActionResult<{
    provider: CloudLlmProvider;
    model: string;
    maskedApiKey: string;
  }>
> {
  const parsed = updateCustomLlmKeyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { provider, model, apiKey } = parsed.data;
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  const { encryptedApiKey, maskedApiKey } = encryptAccountKey(apiKey);
  const explicitModel = model?.trim() || null;
  const resolvedModel =
    explicitModel || PROVIDER_ENDPOINTS[provider].defaultModel;
  const modelProvider = explicitModel ? provider : null;

  const currentRules = parseAccountRules(settings.rules);
  const updatedRules = accountRulesSchema.parse({
    ...currentRules,
    cloudProvider: provider,
    cloudModel: explicitModel,
    cloudModelProvider: modelProvider,
    encryptedApiKey,
    maskedApiKey,
    allowCloudFallback: true,
  });

  const { matchScoreThreshold: _deprecated, ...rulesToSave } = updatedRules;

  await prisma.accountSettings.update({
    where: { accountId },
    data: { rules: rulesToSave as Prisma.InputJsonValue },
  });

  await persistProfileScopedRules(accountId, {
    cloudProvider: provider,
    cloudModel: explicitModel,
    cloudModelProvider: modelProvider,
    encryptedApiKey,
    maskedApiKey,
    allowCloudFallback: true,
  });

  return {
    ok: true,
    data: {
      provider,
      model: resolvedModel,
      maskedApiKey,
    },
  };
}

/**
 * Saves or updates customer BYOK credentials (alias for updateCustomLlmKey).
 */
export async function saveCustomLlmKey(
  accountId: string,
  input: UpdateCustomLlmKeyInput
): Promise<
  ActionResult<{
    provider: CloudLlmProvider;
    model: string;
    maskedApiKey: string;
  }>
> {
  return updateCustomLlmKey(accountId, input);
}

/**
 * Clears the customer-provided BYOK API key and associated custom model
 * from AccountSettings.rules.
 */
export async function clearCustomLlmKey(
  accountId: string
): Promise<ActionResult<{ cleared: true }>> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  const currentRules = parseAccountRules(settings.rules);
  const updatedRules = accountRulesSchema.parse({
    ...currentRules,
    encryptedApiKey: null,
    maskedApiKey: null,
    cloudModel: null,
    cloudModelProvider: null,
  });

  const { matchScoreThreshold: _deprecated, ...rulesToSave } = updatedRules;

  await prisma.accountSettings.update({
    where: { accountId },
    data: { rules: rulesToSave as Prisma.InputJsonValue },
  });

  await persistProfileScopedRules(accountId, {
    encryptedApiKey: null,
    maskedApiKey: null,
    cloudModel: null,
    cloudModelProvider: null,
  });

  return { ok: true, data: { cleared: true } };
}

/**
 * Encrypts and persists a customer-provided ScrapingAnt API key on AccountSettings.rules,
 * or clears it if rawKey is null or empty.
 */
export async function saveScrapingAntApiKey(
  accountId: string,
  rawKey: string | null
): Promise<
  ActionResult<{
    maskedScrapingAntApiKey: string | null;
    scrapingAntUsage?: ScrapingAntUsage | null;
  }>
> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account) return { ok: false, error: "Account not found" };

  const rules = parseAccountRules(account.settings?.rules);

  const trimmed = rawKey?.trim() ?? "";
  const encrypted = trimmed ? encryptToken(trimmed) : null;
  const masked = trimmed ? maskScrapingAntApiKey(trimmed) : null;
  const usage = trimmed ? await fetchScrapingAntUsageFromApi(trimmed) : null;

  const updatedRules = accountRulesSchema.parse({
    ...rules,
    encryptedScrapingAntApiKey: encrypted,
    maskedScrapingAntApiKey: masked,
    scrapingAntUsage: usage,
  });

  const { matchScoreThreshold: _deprecated, ...rulesToSave } = updatedRules;

  await prisma.accountSettings.upsert({
    where: { accountId },
    create: {
      accountId,
      rules: rulesToSave as Prisma.InputJsonValue,
    },
    update: {
      rules: rulesToSave as Prisma.InputJsonValue,
    },
  });

  await persistProfileScopedRules(accountId, {
    encryptedScrapingAntApiKey: encrypted,
    maskedScrapingAntApiKey: masked,
    scrapingAntUsage: usage,
  });

  return {
    ok: true,
    data: {
      maskedScrapingAntApiKey: masked,
      scrapingAntUsage: usage,
    },
  };
}

/**
 * Clears the customer-provided ScrapingAnt API key from AccountSettings.rules.
 */
export async function clearScrapingAntApiKey(
  accountId: string
): Promise<ActionResult<{ cleared: true }>> {
  const result = await saveScrapingAntApiKey(accountId, null);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, data: { cleared: true } };
}

/**
 * Retrieves or forces a refresh of the ScrapingAnt account plan and credit usage.
 */
export async function getScrapingAntUsage(
  accountId: string,
  force?: boolean
): Promise<ActionResult<ScrapingAntUsage | null>> {
  try {
    const data = await getOrRefreshScrapingAntUsage({ accountId, force });
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load ScrapingAnt usage",
    };
  }
}

/**
 * Encrypts and persists a customer-provided HasData API key on AccountSettings.rules,
 * or clears it if rawKey is null or empty.
 */
export async function saveHasDataApiKey(
  accountId: string,
  rawKey: string | null
): Promise<
  ActionResult<{
    maskedHasDataApiKey: string | null;
    hasDataUsage?: HasDataUsage | null;
  }>
> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account) return { ok: false, error: "Account not found" };

  const rules = parseAccountRules(account.settings?.rules);

  const trimmed = rawKey?.trim() ?? "";
  const encrypted = trimmed ? encryptToken(trimmed) : null;
  const masked = trimmed ? maskHasDataApiKey(trimmed) : null;
  const usage = trimmed ? await fetchHasDataUsageFromApi(trimmed) : null;

  const updatedRules = accountRulesSchema.parse({
    ...rules,
    encryptedHasDataApiKey: encrypted,
    maskedHasDataApiKey: masked,
    hasDataUsage: usage,
  });

  const { matchScoreThreshold: _deprecated, ...rulesToSave } = updatedRules;

  await prisma.accountSettings.upsert({
    where: { accountId },
    create: {
      accountId,
      rules: rulesToSave as Prisma.InputJsonValue,
    },
    update: {
      rules: rulesToSave as Prisma.InputJsonValue,
    },
  });

  await persistProfileScopedRules(accountId, {
    encryptedHasDataApiKey: encrypted,
    maskedHasDataApiKey: masked,
    hasDataUsage: usage,
  });

  return {
    ok: true,
    data: {
      maskedHasDataApiKey: masked,
      hasDataUsage: usage,
    },
  };
}

/**
 * Clears the customer-provided HasData API key from AccountSettings.rules.
 */
export async function clearHasDataApiKey(
  accountId: string
): Promise<ActionResult<{ cleared: true }>> {
  const result = await saveHasDataApiKey(accountId, null);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, data: { cleared: true } };
}

/**
 * Retrieves or forces a refresh of the HasData account plan and credit usage.
 */
export async function getHasDataUsage(
  accountId: string,
  force?: boolean
): Promise<ActionResult<HasDataUsage | null>> {
  try {
    const data = await getOrRefreshHasDataUsage({ accountId, force });
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load HasData usage",
    };
  }
}

/**
 * @deprecated Use saveScrapingAntApiKey. Retained for backwards compatibility.
 */
export async function saveJinaApiKey(
  accountId: string,
  apiKey: string
): Promise<ActionResult<{ maskedJinaApiKey: string }>> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { ok: false, error: "API key cannot be empty" };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account) return { ok: false, error: "Account not found" };

  const rules = parseAccountRules(account.settings?.rules);
  const encrypted = encryptToken(trimmed);
  const masked = maskApiKey(trimmed);

  const updatedRules = accountRulesSchema.parse({
    ...rules,
    encryptedJinaApiKey: encrypted,
    maskedJinaApiKey: masked,
  });

  const { matchScoreThreshold: _deprecated, ...rulesToSave } = updatedRules;

  await prisma.accountSettings.upsert({
    where: { accountId },
    create: {
      accountId,
      rules: rulesToSave as Prisma.InputJsonValue,
    },
    update: {
      rules: rulesToSave as Prisma.InputJsonValue,
    },
  });

  await persistProfileScopedRules(accountId, {
    encryptedJinaApiKey: encrypted,
    maskedJinaApiKey: masked,
  });

  return { ok: true, data: { maskedJinaApiKey: masked } };
}

/**
 * @deprecated Use clearScrapingAntApiKey. Retained for backwards compatibility.
 */
export async function clearJinaApiKey(
  accountId: string
): Promise<ActionResult<{ cleared: true }>> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });
  if (!account) return { ok: false, error: "Account not found" };

  const rules = parseAccountRules(account.settings?.rules);
  const updatedRules = accountRulesSchema.parse({
    ...rules,
    encryptedJinaApiKey: null,
    maskedJinaApiKey: null,
  });

  const { matchScoreThreshold: _deprecated, ...rulesToSave } = updatedRules;

  await prisma.accountSettings.update({
    where: { accountId },
    data: {
      rules: rulesToSave as Prisma.InputJsonValue,
    },
  });

  await persistProfileScopedRules(accountId, {
    encryptedJinaApiKey: null,
    maskedJinaApiKey: null,
  });

  return { ok: true, data: { cleared: true } };
}

/** Masked key status for the sidebar key flyout. Never returns raw secrets. */
export async function readApiKeyStatus(
  accountId: string
): Promise<ActionResult<ApiKeyStatus>> {
  const active = await getActiveAccount();
  if (!active || active.id !== accountId) {
    return { ok: false, error: "Account not found" };
  }

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  const rules = parseAccountRules(settings?.rules);
  return {
    ok: true,
    data: {
      cloudProvider: rules.cloudProvider,
      maskedApiKey: rules.maskedApiKey,
      maskedScrapingAntApiKey: rules.maskedScrapingAntApiKey,
      maskedHasDataApiKey: rules.maskedHasDataApiKey,
    },
  };
}
