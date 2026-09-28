"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { getActiveAccount } from "@/lib/data";
import { ensurePersistentProfileForAccount } from "@/lib/persistent-profile";
import { prisma } from "@/lib/prisma";
import {
  accountRulesSchema,
  parseAccountRules,
  type AccountRules,
} from "@/lib/validations/rules";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const ruleKeySchema = z.enum([
  "rejectionMode",
  "rejectionLabelName",
  "rejectionLabelId",
  "autoCleanAfterUnsub",
  "applicationMode",
  "matchScoreThreshold",
  "maxAutoSendsPerDay",
  "dismissedRetentionDays",
  "excludedTitles",
  "bridgeSecret",
]);

const retentionDaysSchema = z.union([
  z.literal(10),
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal(60),
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

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
    include: { account: true },
  });

  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  const current = parseAccountRules(settings.rules);
  const candidate = { ...current, [parsedKey.data]: value };

  const validated = accountRulesSchema.safeParse(candidate);
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

  if (
    parsedKey.data === "applicationMode" ||
    parsedKey.data === "matchScoreThreshold" ||
    parsedKey.data === "maxAutoSendsPerDay"
  ) {
    const profile = await ensurePersistentProfileForAccount(settings.account);
    await prisma.permanentSettings.upsert({
      where: { persistentProfileId: profile.id },
      create: {
        persistentProfileId: profile.id,
        applicationMode: validated.data.applicationMode,
        matchScoreThreshold: validated.data.matchScoreThreshold,
        maxAutoSendsPerDay: validated.data.maxAutoSendsPerDay,
      },
      update: {
        applicationMode: validated.data.applicationMode,
        matchScoreThreshold: validated.data.matchScoreThreshold,
        maxAutoSendsPerDay: validated.data.maxAutoSendsPerDay,
      },
    });
  }

  revalidatePath("/settings");
  return { ok: true, data: validated.data };
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

  const current = parseAccountRules(settings.rules);
  const validated = accountRulesSchema.safeParse({
    ...current,
    bridgeSecret: secret,
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
  return { ok: true, data: { bridgeSecret: validated.data.bridgeSecret } };
}

/**
 * Updates the LLM provider column on AccountSettings.
 * Switching off Local Ollama clears the tunnel URL and invalidates bridgeSecret.
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

  if (parsed.data === "OPENROUTER") {
    const current = parseAccountRules(settings.rules);
    const validated = accountRulesSchema.parse({
      ...current,
      bridgeSecret: null,
      availableModels: [],
      bridgeConnected: false,
    });

    await prisma.accountSettings.update({
      where: { accountId },
      data: {
        llmProvider: "OPENROUTER",
        localOllamaUrl: null,
        rules: validated as Prisma.InputJsonValue,
      },
    });
  } else {
    await prisma.accountSettings.update({
      where: { accountId },
      data: { llmProvider: parsed.data },
    });
  }

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
