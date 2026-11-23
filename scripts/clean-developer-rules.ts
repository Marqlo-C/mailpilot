/**
 * Database Hygiene & State Alignment Script (Phase 5)
 *
 * Sanitizes active developer accounts in PostgreSQL to strip contradictory
 * legacy overrides (e.g. `featureFlags.embedded_ai = false`), activates
 * `featureFlags.shadow_evaluation = true`, and aligns `embeddingProvider = "local_ollama"`
 * across AccountSettings and PermanentSettings.
 *
 * Usage:
 *   npx tsx scripts/clean-developer-rules.ts [email]
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { prisma as defaultPrisma } from "../lib/core/prisma";

export interface CleanRulesResult {
  accountId: string;
  email: string;
  accountSettingsUpdated: boolean;
  permanentSettingsUpdated: boolean;
  accountRules: Record<string, unknown>;
  permanentRules?: Record<string, unknown>;
}

/**
 * Sanitizes rules JSON object by removing contradictory embedded_ai overrides
 * and establishing shadow_evaluation and local_ollama embedding provider alignment.
 */
export function sanitizeRulesJson(rawRules: unknown): Record<string, unknown> {
  const rules =
    typeof rawRules === "object" && rawRules !== null
      ? (JSON.parse(JSON.stringify(rawRules)) as Record<string, unknown>)
      : {};

  // 1. Sanitize featureFlags map
  if (typeof rules.featureFlags === "object" && rules.featureFlags !== null) {
    const flags = rules.featureFlags as Record<string, unknown>;
    // Strip dead embedded_ai: false override that poisons scoring engine gates
    if (flags.embedded_ai === false) {
      delete flags.embedded_ai;
    }
    // Ensure shadow evaluation feature flag is explicitly enabled
    flags.shadow_evaluation = true;
  } else {
    rules.featureFlags = { shadow_evaluation: true };
  }

  // 2. Set embedding provider and model alignment
  rules.embeddingProvider = "local_ollama";
  rules.embeddingModel = "nomic-embed-text";
  rules.enableShadowEmbeddings = true;

  return rules;
}

/**
 * Cleans and aligns rules for the targeted account(s).
 */
export async function cleanDeveloperRules(options?: {
  targetEmail?: string;
  prisma?: PrismaClient;
}): Promise<CleanRulesResult[]> {
  const prismaClient = options?.prisma ?? defaultPrisma;
  const targetEmail =
    options?.targetEmail?.trim() ||
    process.env.TARGET_EMAIL ||
    process.argv[2] ||
    "qtrain3@gmail.com";

  try {
    const whereClause =
      targetEmail.toLowerCase() === "all"
        ? { isActive: true }
        : { email: { equals: targetEmail, mode: "insensitive" as const } };

    const accounts = await prismaClient.account.findMany({
      where: whereClause,
      include: {
        settings: true,
        persistentProfile: {
          include: {
            permanentSettings: true,
          },
        },
      },
    });

    if (accounts.length === 0) {
      console.warn(`[clean-developer-rules] No accounts found matching '${targetEmail}'`);
      return [];
    }

    const results: CleanRulesResult[] = [];

    for (const account of accounts) {
      console.log(`\n============================================================`);
      console.log(`Processing Account: ${account.email} (${account.id})`);
      console.log(`============================================================`);

      // 1. Sanitize AccountSettings.rules
      const currentAccountRules = account.settings?.rules ?? {};
      const sanitizedAccountRules = sanitizeRulesJson(currentAccountRules);

      await prismaClient.accountSettings.upsert({
        where: { accountId: account.id },
        create: {
          accountId: account.id,
          rules: sanitizedAccountRules as Prisma.InputJsonValue,
          llmProvider: account.settings?.llmProvider ?? "OPENROUTER",
          localOllamaUrl: account.settings?.localOllamaUrl ?? "http://localhost:11434",
          ollamaModel: account.settings?.ollamaModel ?? "llama3.1:8b",
        },
        update: {
          rules: sanitizedAccountRules as Prisma.InputJsonValue,
          localOllamaUrl: account.settings?.localOllamaUrl ?? "http://localhost:11434",
        },
      });

      console.log(`✓ AccountSettings.rules sanitized:`);
      console.log(JSON.stringify(sanitizedAccountRules, null, 2));

      // 2. Sanitize PermanentSettings.rules if persistent profile exists
      let sanitizedPermanentRules: Record<string, unknown> | undefined;
      const profile = account.persistentProfile;

      if (profile) {
        const currentPermanentRules = profile.permanentSettings?.rules ?? {};
        sanitizedPermanentRules = sanitizeRulesJson(currentPermanentRules);

        await prismaClient.permanentSettings.upsert({
          where: { persistentProfileId: profile.id },
          create: {
            persistentProfileId: profile.id,
            rules: sanitizedPermanentRules as Prisma.InputJsonValue,
          },
          update: {
            rules: sanitizedPermanentRules as Prisma.InputJsonValue,
          },
        });

        console.log(`✓ PermanentSettings.rules sanitized for profile (${profile.id}):`);
        console.log(JSON.stringify(sanitizedPermanentRules, null, 2));
      }

      results.push({
        accountId: account.id,
        email: account.email,
        accountSettingsUpdated: true,
        permanentSettingsUpdated: Boolean(profile),
        accountRules: sanitizedAccountRules,
        permanentRules: sanitizedPermanentRules,
      });
    }

    return results;
  } finally {
    if (!options?.prisma) {
      await prismaClient.$disconnect();
    }
  }
}

// Auto-run if executed directly as script
if (
  process.argv[1] &&
  (process.argv[1].endsWith("clean-developer-rules.ts") ||
    process.argv[1].endsWith("clean-developer-rules.js"))
) {
  cleanDeveloperRules()
    .then((results) => {
      console.log(
        `\n[clean-developer-rules] Finished successfully. Cleaned ${results.length} account(s).`
      );
      process.exit(0);
    })
    .catch((error) => {
      console.error("[clean-developer-rules] Error cleaning developer rules:", error);
      process.exit(1);
    });
}
