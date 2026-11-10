import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import {
  accountRulesSchema,
  parseAccountRules,
} from "@/lib/validations/rules.schema";

/**
 * Service orchestrating account credentials, lifecycle linking, and settings mutations.
 * Encapsulates direct Prisma access away from Next.js server actions.
 */

export interface AccountSessionVerification {
  ok: boolean;
  error?: string;
  accountId?: string;
}

/**
 * Verifies that the target account belongs to the same persistent profile as the session account.
 */
export async function verifyAccountOwnership(
  sessionToken: string,
  targetAccountId: string
): Promise<AccountSessionVerification> {
  const sessionAccount = await prisma.account.findFirst({
    where: { id: sessionToken, isActive: true },
    select: { id: true, persistentProfileId: true },
  });

  if (!sessionAccount) {
    return { ok: false, error: "Session expired" };
  }

  const account = await prisma.account.findFirst({
    where: {
      id: targetAccountId,
      isActive: true,
      ...(sessionAccount.persistentProfileId
        ? { persistentProfileId: sessionAccount.persistentProfileId }
        : { id: sessionAccount.id }),
    },
    select: { id: true },
  });

  if (!account) {
    return { ok: false, error: "Account not found for this user" };
  }

  return { ok: true, accountId: account.id };
}

/**
 * Clears Gmail OAuth tokens for an account while retaining its history and settings rows.
 */
export async function unlinkAccountTokens(
  accountId: string
): Promise<{ ok: boolean; error?: string }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true },
  });

  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  await prisma.account.update({
    where: { id: accountId },
    data: {
      encryptedAccess: null,
      encryptedRefresh: null,
      tokenExpiry: null,
      historyId: null,
      isActive: true,
    },
  });

  return { ok: true };
}

/**
 * Retrieves account sync credentials for running an isolated inbox delta.
 */
export async function getAccountForManualSync(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      email: true,
      isActive: true,
      encryptedAccess: true,
      historyId: true,
    },
  });

  if (!account || !account.isActive || !account.encryptedAccess) {
    return null;
  }

  return account;
}

/**
 * Retrieves full account data necessary for probing Gmail API connectivity.
 */
export async function getAccountForGmailProbe(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
  });
}

/**
 * Retrieves local Ollama URL and settings for an account.
 */
export async function getAccountOllamaSettings(accountId: string) {
  return prisma.accountSettings.findUnique({
    where: { accountId },
  });
}

/**
 * Persists detected Ollama models and endpoint configuration to account settings rules.
 */
export async function updateOllamaSettings(
  accountId: string,
  normalizedBaseUrl: string,
  models: string[]
): Promise<void> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });

  const currentRules = parseAccountRules(settings?.rules);
  const validatedRules = accountRulesSchema.parse({
    ...currentRules,
    availableModels: models,
    bridgeConnected: true,
  });

  await prisma.accountSettings.update({
    where: { accountId },
    data: {
      localOllamaUrl: normalizedBaseUrl,
      llmProvider: "LOCAL_OLLAMA",
      rules: validatedRules as Prisma.InputJsonValue,
    },
  });
}
