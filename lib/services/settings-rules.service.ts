import { Prisma } from "@prisma/client";
import { z } from "zod";
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
} from "@/lib/validations/rules.schema";
import { encryptToken } from "@/lib/core/crypto";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export const ruleKeySchema = z.enum([
  "rejectionMode",
  "rejectionLabelName",
  "rejectionLabelId",
  "autoCleanAfterUnsub",
  "applicationMode",
  "matchScoreThreshold", // deprecated: routed to updateMatchThreshold
  "maxAutoSendsPerDay",
  "syncMaxMessages",
  "pendingAiDrainLimit",
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

export const retentionDaysSchema = z.union([
  z.literal(7),
  z.literal(14),
  z.literal(30),
]);

export const llmProviderSchema = z.enum(["OPENROUTER", "LOCAL_OLLAMA"]);

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
    const { updateMatchThreshold } = await import("@/lib/services/profile-snapshot.service");
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

  return { ok: true, data: { excludedTitles: updated } };
}

export type OllamaStatus = {
  ollamaModel: string;
  localOllamaUrl: string;
  bridgeConnected: boolean;
  availableModels: string[];
};

/** Current local-model settings for the sidebar Ollama flyout. */
export async function readOllamaStatus(
  accountId: string
): Promise<ActionResult<OllamaStatus>> {
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
      ollamaModel: settings?.ollamaModel?.trim() || "llama3.1:8b",
      localOllamaUrl: settings?.localOllamaUrl?.trim() || "",
      bridgeConnected: rules.bridgeConnected,
      availableModels: rules.availableModels,
    },
  };
}
