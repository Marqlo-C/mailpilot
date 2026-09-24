"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";

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
]);

const llmProviderSchema = z.enum(["OPENROUTER", "LOCAL_OLLAMA"]);

/**
 * Patches a single key inside AccountSettings.rules (Zod-validated).
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

  revalidatePath("/settings");
  return { ok: true, data: validated.data };
}

/**
 * Updates the LLM provider column on AccountSettings.
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
 * Updates the local Ollama endpoint URL.
 */
export async function updateOllamaUrl(
  accountId: string,
  url: string
): Promise<ActionResult> {
  const trimmed = url.trim();
  const parsed = z.string().url().safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false, error: "Invalid Ollama URL" };
  }

  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) {
    return { ok: false, error: "Account settings not found" };
  }

  await prisma.accountSettings.update({
    where: { accountId },
    data: { localOllamaUrl: parsed.data },
  });

  revalidatePath("/settings");
  return { ok: true };
}
