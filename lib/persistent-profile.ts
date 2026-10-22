import { createHash } from "crypto";
import {
  type Account,
  type PermanentSettings,
  type PersistentProfile,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile";
import {
  accountRulesSchema,
  DEFAULT_ACCOUNT_RULES,
  parseAccountRules,
  type AccountRules,
} from "@/lib/validations/rules";

export type PersistentProfileWithSettings = PersistentProfile & {
  permanentSettings: PermanentSettings | null;
};

export type PermanentSettingsSeed = {
  applicationMode?: AccountRules["applicationMode"];
  matchScoreThreshold?: number;
  maxAutoSendsPerDay?: number;
};

/**
 * Stable fallback key when Google OpenID `sub` is not available.
 */
export function hashEmailAsGoogleSub(email: string): string {
  return `email:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;
}

/**
 * Finds or creates a PersistentProfile (+ PermanentSettings) and links the Account.
 */
export async function ensurePersistentProfile(input: {
  email: string;
  googleSub?: string | null;
  accountId?: string;
  seedRules?: PermanentSettingsSeed;
}): Promise<PersistentProfileWithSettings> {
  const email = input.email.trim().toLowerCase();
  const googleSub =
    input.googleSub?.trim() || hashEmailAsGoogleSub(email);

  const existing = await prisma.persistentProfile.findUnique({
    where: { googleSub },
    include: { permanentSettings: true },
  });

  const seed = {
    applicationMode:
      input.seedRules?.applicationMode ?? DEFAULT_ACCOUNT_RULES.applicationMode,
    matchScoreThreshold:
      input.seedRules?.matchScoreThreshold ?? DEFAULT_MATCH_THRESHOLD,
    maxAutoSendsPerDay:
      input.seedRules?.maxAutoSendsPerDay ??
      DEFAULT_ACCOUNT_RULES.maxAutoSendsPerDay,
  };

  const profile = existing
    ? await prisma.persistentProfile.update({
        where: { id: existing.id },
        data: { email },
        include: { permanentSettings: true },
      })
    : await prisma.persistentProfile.create({
        data: {
          googleSub,
          email,
          permanentSettings: { create: seed },
        },
        include: { permanentSettings: true },
      });

  if (!profile.permanentSettings) {
    await prisma.permanentSettings.create({
      data: { persistentProfileId: profile.id, ...seed },
    });
  }

  if (input.accountId) {
    await prisma.account.update({
      where: { id: input.accountId },
      data: { persistentProfileId: profile.id },
    });

    // Backfill any jobs still missing the durable owner.
    await prisma.jobApplication.updateMany({
      where: {
        accountId: input.accountId,
        persistentProfileId: null,
      },
      data: { persistentProfileId: profile.id },
    });
  }

  const refreshed = await prisma.persistentProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: { permanentSettings: true },
  });

  return refreshed;
}

/**
 * Resolves the durable profile for an account, creating one from email if needed.
 */
export async function ensurePersistentProfileForAccount(
  account: Pick<Account, "id" | "email" | "persistentProfileId">
): Promise<PersistentProfileWithSettings> {
  if (account.persistentProfileId) {
    const existing = await prisma.persistentProfile.findUnique({
      where: { id: account.persistentProfileId },
      include: { permanentSettings: true },
    });
    if (existing) {
      if (!existing.permanentSettings) {
        await prisma.permanentSettings.create({
          data: {
            persistentProfileId: existing.id,
            applicationMode: DEFAULT_ACCOUNT_RULES.applicationMode,
            matchScoreThreshold: DEFAULT_MATCH_THRESHOLD,
            maxAutoSendsPerDay: DEFAULT_ACCOUNT_RULES.maxAutoSendsPerDay,
          },
        });
        return prisma.persistentProfile.findUniqueOrThrow({
          where: { id: existing.id },
          include: { permanentSettings: true },
        });
      }
      return existing;
    }
  }

  return ensurePersistentProfile({
    email: account.email,
    accountId: account.id,
  });
}

/**
 * Merges AccountSettings.rules with PermanentSettings for UI/dispatch consumers.
 * Inherits durable profile-scoped BYOK & proxy API keys when present.
 * Match threshold is intentionally excluded — resolve via resolveMatchThreshold.
 */
export function mergeRulesWithPermanentSettings(
  accountRules: AccountRules,
  permanent:
    | Partial<PermanentSettings>
    | { rules?: unknown; applicationMode?: string; maxAutoSendsPerDay?: number }
    | null
    | undefined
): AccountRules {
  if (!permanent) return accountRules;

  const permanentRules = parseAccountRules(permanent.rules);

  return {
    ...accountRules,
    applicationMode:
      (permanent.applicationMode as AccountRules["applicationMode"]) ??
      accountRules.applicationMode,
    maxAutoSendsPerDay:
      permanent.maxAutoSendsPerDay ?? accountRules.maxAutoSendsPerDay,
    // BYOK Cloud LLM credentials
    encryptedApiKey:
      accountRules.encryptedApiKey ?? permanentRules.encryptedApiKey,
    maskedApiKey: accountRules.maskedApiKey ?? permanentRules.maskedApiKey,
    cloudProvider:
      accountRules.encryptedApiKey
        ? accountRules.cloudProvider
        : (permanentRules.cloudProvider ?? accountRules.cloudProvider),
    cloudModel: accountRules.cloudModel ?? permanentRules.cloudModel,
    cloudModelProvider:
      accountRules.cloudModel !== null
        ? accountRules.cloudModelProvider
        : (permanentRules.cloudModelProvider ?? accountRules.cloudModelProvider),
    allowCloudFallback:
      accountRules.allowCloudFallback || permanentRules.allowCloudFallback,
    // Scraping proxy credentials
    encryptedScrapingAntApiKey:
      accountRules.encryptedScrapingAntApiKey ??
      permanentRules.encryptedScrapingAntApiKey,
    maskedScrapingAntApiKey:
      accountRules.maskedScrapingAntApiKey ??
      permanentRules.maskedScrapingAntApiKey,
    scrapingAntUsage: (() => {
      const a = accountRules.scrapingAntUsage;
      const b = permanentRules.scrapingAntUsage;
      if (!a) return b ?? null;
      if (!b) return a;
      return new Date(a.fetchedAt).getTime() >= new Date(b.fetchedAt).getTime()
        ? a
        : b;
    })(),
    encryptedHasDataApiKey:
      accountRules.encryptedHasDataApiKey ??
      permanentRules.encryptedHasDataApiKey,
    maskedHasDataApiKey:
      accountRules.maskedHasDataApiKey ?? permanentRules.maskedHasDataApiKey,
    hasDataUsage: (() => {
      const a = accountRules.hasDataUsage;
      const b = permanentRules.hasDataUsage;
      if (!a) return b ?? null;
      if (!b) return a;
      return new Date(a.fetchedAt).getTime() >= new Date(b.fetchedAt).getTime()
        ? a
        : b;
    })(),
    // Deprecated Jina proxy credentials
    encryptedJinaApiKey:
      accountRules.encryptedJinaApiKey ?? permanentRules.encryptedJinaApiKey,
    maskedJinaApiKey:
      accountRules.maskedJinaApiKey ?? permanentRules.maskedJinaApiKey,
  };
}

/**
 * Persists profile-scoped rules (BYOK LLM and proxy credentials) directly
 * on the durable PermanentSettings record for an account or profile.
 */
export async function persistProfileScopedRules(
  target: string | { accountId?: string; persistentProfileId?: string },
  rulesPatch: Partial<AccountRules>
): Promise<void> {
  let profileId: string | null = null;

  if (typeof target === "string") {
    const account = await prisma.account.findUnique({
      where: { id: target },
      select: { id: true, email: true, persistentProfileId: true },
    });
    if (!account) return;
    const profile = await ensurePersistentProfileForAccount(account);
    profileId = profile.id;
  } else if (target.persistentProfileId) {
    profileId = target.persistentProfileId;
  } else if (target.accountId) {
    const account = await prisma.account.findUnique({
      where: { id: target.accountId },
      select: { id: true, email: true, persistentProfileId: true },
    });
    if (!account) return;
    const profile = await ensurePersistentProfileForAccount(account);
    profileId = profile.id;
  }

  if (!profileId) return;

  const permanent = await prisma.permanentSettings.findUnique({
    where: { persistentProfileId: profileId },
  });

  const currentRules = parseAccountRules(permanent?.rules);
  const updatedRules = accountRulesSchema.parse({
    ...currentRules,
    ...rulesPatch,
  });

  const { matchScoreThreshold: _deprecated, ...rulesToSave } = updatedRules;

  await prisma.permanentSettings.upsert({
    where: { persistentProfileId: profileId },
    create: {
      persistentProfileId: profileId,
      applicationMode: DEFAULT_ACCOUNT_RULES.applicationMode,
      matchScoreThreshold: DEFAULT_MATCH_THRESHOLD,
      maxAutoSendsPerDay: DEFAULT_ACCOUNT_RULES.maxAutoSendsPerDay,
      rules: rulesToSave as Prisma.InputJsonValue,
    },
    update: {
      rules: rulesToSave as Prisma.InputJsonValue,
    },
  });
}

/**
 * Writes or updates a SubscriptionHistory row for the durable profile.
 */
export async function recordSubscriptionHistory(input: {
  userProfileId: string;
  senderEmail: string;
  senderName?: string | null;
  status: "UNSUBSCRIBED" | "IGNORED";
}): Promise<void> {
  await prisma.subscriptionHistory.upsert({
    where: {
      userProfileId_senderEmail: {
        userProfileId: input.userProfileId,
        senderEmail: input.senderEmail.toLowerCase(),
      },
    },
    create: {
      userProfileId: input.userProfileId,
      senderEmail: input.senderEmail.toLowerCase(),
      senderName: input.senderName ?? null,
      status: input.status,
    },
    update: {
      senderName: input.senderName ?? undefined,
      status: input.status,
    },
  });
}
