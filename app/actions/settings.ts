"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { getActiveAccount } from "@/lib/data";
import {
  ensurePersistentProfileForAccount,
  persistProfileScopedRules,
} from "@/lib/profile/persistent-profile";
import { prisma } from "@/lib/core/prisma";
import {
  accountRulesSchema,
  parseAccountRules,
  type AccountRules,
} from "@/lib/validations/rules";
import {
  type CloudLlmProvider,
  cloudProviderSchema,
  PROVIDER_ENDPOINTS,
} from "@/lib/llm/provider.ssot";
import { encryptAccountKey, maskApiKey, maskScrapingAntApiKey, maskHasDataApiKey } from "@/lib/llm/vault";
import { encryptToken } from "@/lib/core/crypto";
import {
  fetchScrapingAntUsageFromApi,
  getOrRefreshScrapingAntUsage,
} from "@/lib/scraping/scrapingant";
import {
  fetchHasDataUsageFromApi,
  getOrRefreshHasDataUsage,
} from "@/lib/scraping/hasdata";
import type { ScrapingAntUsage, HasDataUsage } from "@/lib/validations/rules";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const ruleKeySchema = z.enum([
  "rejectionMode",
  "rejectionLabelName",
  "rejectionLabelId",
  "autoCleanAfterUnsub",
  "applicationMode",
  "matchScoreThreshold", // deprecated: routed to updateMatchThreshold
  "maxAutoSendsPerDay",
  "dismissedRetentionDays",
  "excludedTitles",
  "bridgeSecret",
  "allowCloudFallback",
  "cloudProvider",
  "cloudModel",
  "cloudModelProvider",
  "resumePreferences",
  "enableAiTailoringDefaults",
  "targetPageBudget",
  "sectionOrderingMode",
  "contentInclusionMode",
  "inventMetrics",
  "canonicalSectionOrder",
  "canonicalSectionVisibility",
  "scrapingAntUsage",
  "hasDataUsage",
  "enableWebScrapingProxies",
]);

const retentionDaysSchema = z.union([
  z.literal(7),
  z.literal(14),
  z.literal(30),
]);

const llmProviderSchema = z.enum(["OPENROUTER", "LOCAL_OLLAMA"]);

/**
 * Patches a single key inside AccountSettings.rules (Zod-validated).
 * Job Radar knobs are also mirrored to PermanentSettings on the durable profile.
 */
export async function updateRule(
  accountId: string,
  key: string,
  value: unknown
): Promise<ActionResult<AccountRules>> {
  const parsedKey = ruleKeySchema.safeParse(key);
  if (!parsedKey.success) {
    return { ok: false, error: `Invalid rule key: ${key}` };
  }

  // Threshold is not stored in AccountSettings.rules — sole writer is updateMatchThreshold.
  if (parsedKey.data === "matchScoreThreshold") {
    const { updateMatchThreshold } = await import("@/app/actions/profile");
    const numeric = typeof value === "number" ? value : Number(value);
    const result = await updateMatchThreshold(accountId, numeric);
    if (!result.ok) return result;
    const settings = await prisma.accountSettings.findUnique({
      where: { accountId },
    });
    return {
      ok: true,
      data: parseAccountRules(settings?.rules),
    };
  }

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
    include: { account: true },
  });

  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  const current = parseAccountRules(settings.rules);
  const candidate: Record<string, unknown> = {
    ...current,
    [parsedKey.data]: value,
  };

  if (parsedKey.data === "enableAiTailoringDefaults") {
    // Preserve the user's underlying settings. Do NOT overwrite current.sectionOrderingMode,
    // current.contentInclusionMode, or current.inventMetrics, so toggling off restores exact state.
    candidate.enableAiTailoringDefaults = Boolean(value);
    if (value === true) {
      candidate.targetPageBudget = "auto";
      candidate.resumePreferences = {
        ...current.resumePreferences,
        orderingMode: "AI_OPTIMAL",
        inclusionMode: "AI_OPTIMAL",
        inventMetrics: true,
        maxPages: "auto",
      };
    } else {
      candidate.targetPageBudget = current.targetPageBudget ?? "auto";
      candidate.resumePreferences = {
        ...current.resumePreferences,
        orderingMode: current.sectionOrderingMode,
        inclusionMode: current.contentInclusionMode,
        inventMetrics: current.inventMetrics,
        maxPages:
          current.targetPageBudget === "1"
            ? 1
            : current.targetPageBudget === "2"
              ? 2
              : "auto",
      };
    }
  } else if (parsedKey.data === "targetPageBudget") {
    const budgetVal = value === "1" ? "1" : value === "2" ? "2" : "auto";
    candidate.targetPageBudget = budgetVal;
    candidate.resumePreferences = {
      ...current.resumePreferences,
      maxPages: budgetVal === "1" ? 1 : budgetVal === "2" ? 2 : "auto",
    };
  } else if (parsedKey.data === "sectionOrderingMode") {
    candidate.resumePreferences = {
      ...current.resumePreferences,
      orderingMode: value,
    };
  } else if (parsedKey.data === "contentInclusionMode") {
    candidate.resumePreferences = {
      ...current.resumePreferences,
      inclusionMode: value,
    };
  } else if (parsedKey.data === "inventMetrics") {
    candidate.resumePreferences = {
      ...current.resumePreferences,
      inventMetrics: Boolean(value),
    };
  } else if (
    parsedKey.data === "canonicalSectionOrder" &&
    Array.isArray(value)
  ) {
    candidate.resumePreferences = {
      ...current.resumePreferences,
      sectionOrder: value,
    };
  } else if (
    parsedKey.data === "canonicalSectionVisibility" &&
    typeof value === "object" &&
    value !== null
  ) {
    const vis = value as Record<string, boolean>;
    const disabledSections = Object.entries(vis)
      .filter(([, visible]) => !visible)
      .map(([k]) => k);
    candidate.resumePreferences = {
      ...current.resumePreferences,
      disabledSections,
      includeSummary:
        typeof vis.summary === "boolean"
          ? vis.summary
          : current.resumePreferences.includeSummary,
    };
  } else if (parsedKey.data === "cloudModel") {
    const trimmedModel =
      typeof value === "string" ? value.trim() || null : null;
    candidate.cloudModel = trimmedModel;
    candidate.cloudModelProvider = trimmedModel
      ? current.cloudProvider
      : null;
  } else if (
    parsedKey.data === "cloudProvider" &&
    current.cloudModel &&
    !current.cloudModelProvider
  ) {
    // Pin any legacy un-scoped model override to the provider it was configured on before switching.
    candidate.cloudModelProvider = current.cloudProvider;
  }

  const validated = accountRulesSchema.safeParse(candidate);
  if (!validated.success) {
    return {
      ok: false,
      error: validated.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { matchScoreThreshold: _drop, ...rulesWithoutThreshold } =
    validated.data;

  await prisma.accountSettings.update({
    where: { accountId },
    data: { rules: rulesWithoutThreshold as Prisma.InputJsonValue },
  });

  if (
    parsedKey.data === "applicationMode" ||
    parsedKey.data === "maxAutoSendsPerDay"
  ) {
    const profile = await ensurePersistentProfileForAccount(settings.account);
    await prisma.permanentSettings.upsert({
      where: { persistentProfileId: profile.id },
      create: {
        persistentProfileId: profile.id,
        applicationMode: rulesWithoutThreshold.applicationMode,
        maxAutoSendsPerDay: rulesWithoutThreshold.maxAutoSendsPerDay,
      },
      update: {
        applicationMode: rulesWithoutThreshold.applicationMode,
        maxAutoSendsPerDay: rulesWithoutThreshold.maxAutoSendsPerDay,
      },
    });
  }

  if (
    parsedKey.data === "allowCloudFallback" ||
    parsedKey.data === "cloudProvider" ||
    parsedKey.data === "cloudModel" ||
    parsedKey.data === "cloudModelProvider" ||
    parsedKey.data === "enableWebScrapingProxies"
  ) {
    await persistProfileScopedRules(accountId, {
      allowCloudFallback: rulesWithoutThreshold.allowCloudFallback,
      cloudProvider: rulesWithoutThreshold.cloudProvider,
      cloudModel: rulesWithoutThreshold.cloudModel,
      cloudModelProvider: rulesWithoutThreshold.cloudModelProvider,
      enableWebScrapingProxies: rulesWithoutThreshold.enableWebScrapingProxies,
    });
  }

  revalidatePath("/settings");
  return { ok: true, data: rulesWithoutThreshold };
}

/**
 * Persists AccountSettings.rules.bridgeSecret without clobbering other rules.
 * Pass an empty string to clear (stored as null).
 */
export async function updateBridgeSecret(
  accountId: string,
  secret: string
): Promise<ActionResult<{ bridgeSecret: string | null }>> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  const trimmed = secret.trim();
  const encryptedBridgeSecret = trimmed ? encryptToken(trimmed) : null;

  const current = parseAccountRules(settings.rules);
  const validated = accountRulesSchema.safeParse({
    ...current,
    encryptedBridgeSecret,
    bridgeSecret: null,
  });
  if (!validated.success) {
    return {
      ok: false,
      error: validated.error.issues.map((i) => i.message).join("; "),
    };
  }

  await prisma.accountSettings.update({
    where: { accountId },
    data: { rules: validated.data as Prisma.InputJsonValue },
  });

  revalidatePath("/settings");
  return { ok: true, data: { bridgeSecret: trimmed.length > 0 ? trimmed : null } };
}

/**
 * Updates the LLM provider column on AccountSettings.
 * Preserves bridge credentials and tunnel URL so toggling does not require re-authentication.
 */
export async function updateLlmProvider(
  accountId: string,
  provider: string
): Promise<ActionResult> {
  const parsed = llmProviderSchema.safeParse(provider);
  if (!parsed.success) {
    return { ok: false, error: "Invalid LLM provider" };
  }

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  await prisma.accountSettings.update({
    where: { accountId },
    data: { llmProvider: parsed.data },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Updates the local Ollama endpoint URL and optionally the selected model.
 */
export async function updateOllamaUrl(
  accountId: string,
  url: string,
  ollamaModel?: string | null
): Promise<ActionResult> {
  const trimmed = url.trim();
  const parsed = z.string().url().safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false, error: "Invalid Ollama URL" };
  }

  const modelParsed =
    ollamaModel === undefined
      ? null
      : z
          .string()
          .trim()
          .min(1)
          .max(120)
          .safeParse(ollamaModel?.trim() || "llama3.1:8b");

  if (ollamaModel !== undefined && modelParsed && !modelParsed.success) {
    return { ok: false, error: "Invalid Ollama model" };
  }

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  await prisma.accountSettings.update({
    where: { accountId },
    data: {
      localOllamaUrl: parsed.data,
      ...(modelParsed?.success ? { ollamaModel: modelParsed.data } : {}),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Saves the Ollama model name only. Does not change the stored tunnel URL.
 */
export async function updateOllamaModel(
  accountId: string,
  ollamaModel: string
): Promise<ActionResult> {
  const modelParsed = z.string().trim().min(1).max(120).safeParse(ollamaModel);
  if (!modelParsed.success) {
    return { ok: false, error: "Invalid Ollama model" };
  }

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  await prisma.accountSettings.update({
    where: { accountId },
    data: { ollamaModel: modelParsed.data },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Updates dismissed History auto-delete retention (stored in AccountSettings.rules).
 */
export async function updateDismissedRetention(
  days: number
): Promise<ActionResult<{ dismissedRetentionDays: number }>> {
  const parsed = retentionDaysSchema.safeParse(days);
  if (!parsed.success) {
    return { ok: false, error: "Invalid retention period" };
  }

  const account = await getActiveAccount();
  if (!account) {
    return { ok: false, error: "Unauthorized" };
  }

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId: account.id },
  });
  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  const current = parseAccountRules(settings.rules);
  const validated = accountRulesSchema.safeParse({
    ...current,
    dismissedRetentionDays: parsed.data,
  });
  if (!validated.success) {
    return {
      ok: false,
      error: validated.error.issues.map((i) => i.message).join("; "),
    };
  }

  await prisma.accountSettings.update({
    where: { accountId: account.id },
    data: { rules: validated.data as Prisma.InputJsonValue },
  });

  revalidatePath("/settings");
  revalidatePath("/jobs");
  return {
    ok: true,
    data: { dismissedRetentionDays: validated.data.dismissedRetentionDays },
  };
}

/**
 * Appends a role title/pattern to AccountSettings.rules.excludedTitles.
 */
export async function addExcludedTitle(
  accountId: string,
  title: string
): Promise<ActionResult<{ excludedTitles: string[] }>> {
  const clean = title.trim();
  if (!clean) return { ok: false, error: "Title cannot be empty" };

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) return { ok: false, error: "Settings not found" };

  const rules = parseAccountRules(settings.rules);
  const existing = rules.excludedTitles ?? [];
  const already = existing.some(
    (t) => t.toLowerCase() === clean.toLowerCase()
  );
  const updated = already ? existing : [...existing, clean];

  if (!already) {
    const validated = accountRulesSchema.parse({
      ...rules,
      excludedTitles: updated,
    });
    await prisma.accountSettings.update({
      where: { accountId },
      data: { rules: validated as Prisma.InputJsonValue },
    });
  }

  revalidatePath("/settings");
  revalidatePath("/jobs");
  return { ok: true, data: { excludedTitles: updated } };
}

/**
 * Removes a role title/pattern from AccountSettings.rules.excludedTitles.
 */
export async function removeExcludedTitle(
  accountId: string,
  title: string
): Promise<ActionResult<{ excludedTitles: string[] }>> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) return { ok: false, error: "Settings not found" };

  const rules = parseAccountRules(settings.rules);
  const updated = (rules.excludedTitles ?? []).filter(
    (t) => t.toLowerCase() !== title.toLowerCase().trim()
  );

  const validated = accountRulesSchema.parse({
    ...rules,
    excludedTitles: updated,
  });
  await prisma.accountSettings.update({
    where: { accountId },
    data: { rules: validated as Prisma.InputJsonValue },
  });

  revalidatePath("/settings");
  revalidatePath("/jobs");
  return { ok: true, data: { excludedTitles: updated } };
}

const updateCustomLlmKeyInputSchema = z.object({
  provider: cloudProviderSchema,
  model: z.string().nullish(),
  apiKey: z.string().min(1, "API key cannot be empty"),
});

type UpdateCustomLlmKeyInput = z.infer<
  typeof updateCustomLlmKeyInputSchema
>;

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

  revalidatePath("/settings");
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

  revalidatePath("/settings");
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

  revalidatePath("/settings");
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
export async function getScrapingAntUsageAction(
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

  revalidatePath("/settings");
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
export async function getHasDataUsageAction(
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

  revalidatePath("/settings");
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

  revalidatePath("/settings");
  return { ok: true, data: { cleared: true } };
}


