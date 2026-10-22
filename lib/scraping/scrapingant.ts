import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/core/prisma";
import {
  mergeRulesWithPermanentSettings,
  persistProfileScopedRules,
} from "@/lib/profile/persistent-profile";
import {
  parseAccountRules,
  type ScrapingAntUsage,
} from "@/lib/validations/rules";
import { resolveDecryptedScrapingAntKey } from "@/lib/llm/vault";

/**
 * Default cache duration for ScrapingAnt usage to save API quota: 4 hours.
 */
export const SCRAPINGANT_USAGE_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export type ScrapingAntUsageApiResponse = {
  plan_name?: string;
  start_date?: string;
  end_date?: string;
  plan_total_credits?: number;
  remained_credits?: number;
};

/**
 * Directly queries the ScrapingAnt API /v2/usage endpoint with an API key.
 * Never throws — returns null on network or authentication failure.
 */
export async function fetchScrapingAntUsageFromApi(
  apiKey: string
): Promise<ScrapingAntUsage | null> {
  const trimmed = apiKey.trim();
  if (!trimmed) return null;

  try {
    const endpoint = new URL("https://api.scrapingant.com/v2/usage");
    endpoint.searchParams.set("x-api-key", trimmed);

    const res = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        `[scrapingant] /v2/usage returned HTTP ${res.status} (${res.statusText})`
      );
      return null;
    }

    const data = (await res.json()) as ScrapingAntUsageApiResponse;
    if (!data || typeof data.plan_total_credits !== "number") {
      console.warn(
        "[scrapingant] Unexpected response payload from /v2/usage",
        data
      );
      return null;
    }

    const planName = data.plan_name?.trim() || "Free";
    const isFree = planName.toLowerCase().includes("free");
    // ScrapingAnt free tier is restricted to 1 concurrent request; paid plans feature parallel threads without a 1-thread cap.
    const concurrencyLimit = isFree ? 1 : null;

    return {
      planName,
      startDate: data.start_date || new Date().toISOString(),
      endDate: data.end_date || new Date().toISOString(),
      planTotalCredits: Number(data.plan_total_credits || 0),
      remainedCredits: Number(data.remained_credits || 0),
      concurrencyLimit,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[scrapingant] Failed to fetch usage from API: ${msg}`);
    return null;
  }
}

/**
 * Returns cached ScrapingAnt usage if fresh (< 4 hours) or queries the API if stale or forced.
 * Automatically persists fresh usage to AccountSettings.rules and PermanentSettings.rules.
 */
export async function getOrRefreshScrapingAntUsage(options: {
  accountId: string;
  force?: boolean;
}): Promise<ScrapingAntUsage | null> {
  try {
    const account = await prisma.account.findUnique({
      where: { id: options.accountId },
      select: {
        id: true,
        email: true,
        persistentProfileId: true,
        settings: { select: { rules: true } },
        persistentProfile: {
          select: {
            id: true,
            permanentSettings: { select: { rules: true } },
          },
        },
      },
    });

    if (!account) return null;

    const accountRules = parseAccountRules(account.settings?.rules);
    const rules = mergeRulesWithPermanentSettings(
      accountRules,
      account.persistentProfile?.permanentSettings
    );

    const apiKey = resolveDecryptedScrapingAntKey(rules);
    if (!apiKey) return null;

    const cached = rules.scrapingAntUsage;
    if (!options.force && cached) {
      const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
      if (ageMs < SCRAPINGANT_USAGE_CACHE_TTL_MS) {
        return cached;
      }
    }

    const freshUsage = await fetchScrapingAntUsageFromApi(apiKey);
    if (!freshUsage) {
      // If network fetch failed, return existing cached data if available rather than wiping
      return cached ?? null;
    }

    // Persist to PermanentSettings.rules
    await persistProfileScopedRules(account.id, {
      scrapingAntUsage: freshUsage,
    });

    // Also persist to current AccountSettings.rules
    if (account.settings) {
      const updated = {
        ...accountRules,
        scrapingAntUsage: freshUsage,
      };
      await prisma.accountSettings.update({
        where: { accountId: account.id },
        data: { rules: updated as Prisma.InputJsonValue },
      });
    }

    return freshUsage;
  } catch (error) {
    console.warn("[scrapingant] Error in getOrRefreshScrapingAntUsage:", error);
    return null;
  }
}

/**
 * Non-blocking helper called after sync completes when ScrapingAnt proxy was consumed.
 */
export async function refreshScrapingAntUsageAfterSync(
  accountId: string
): Promise<void> {
  try {
    await getOrRefreshScrapingAntUsage({ accountId, force: true });
  } catch (err) {
    console.warn("[scrapingant] Background refresh after sync failed:", err);
  }
}
