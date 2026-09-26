import { createHash } from "crypto";
import type { Account, PermanentSettings, PersistentProfile } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_ACCOUNT_RULES,
  type AccountRules,
} from "@/lib/validations/rules";

export type PersistentProfileWithSettings = PersistentProfile & {
  permanentSettings: PermanentSettings | null;
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
  seedRules?: Partial<AccountRules>;
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
      input.seedRules?.matchScoreThreshold ??
      DEFAULT_ACCOUNT_RULES.matchScoreThreshold,
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
            matchScoreThreshold: DEFAULT_ACCOUNT_RULES.matchScoreThreshold,
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
 */
export function mergeRulesWithPermanentSettings(
  accountRules: AccountRules,
  permanent: PermanentSettings | null | undefined
): AccountRules {
  if (!permanent) return accountRules;
  return {
    ...accountRules,
    applicationMode: permanent.applicationMode as AccountRules["applicationMode"],
    matchScoreThreshold: permanent.matchScoreThreshold,
    maxAutoSendsPerDay: permanent.maxAutoSendsPerDay,
  };
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
