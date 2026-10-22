import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/core/prisma";
import {
  mergeRulesWithPermanentSettings,
  persistProfileScopedRules,
} from "@/lib/profile/persistent-profile";
import {
  parseAccountRules,
  type HasDataUsage,
} from "@/lib/validations/rules";
import { resolveDecryptedHasDataKey } from "@/lib/llm/vault";

/**
 * Default cache duration for HasData usage telemetry: 4 hours.
 */
export const HASDATA_USAGE_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export type HasDataDataBlock = {
  totalCredits?: number;
  availableCredits?: number;
  concurrentRequests?: number;
  availableConcurrency?: number;
  planName?: string;
  plan?: string;
  tier?: string;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  [key: string]: unknown;
};

export type HasDataUsageApiResponse = HasDataDataBlock & {
  status?: string;
  data?: HasDataDataBlock;
  message?: string;
};

/**
 * Infers human-readable tier label from HasData credit allowance or concurrency limit
 * if not explicitly provided by the endpoint payload.
 */
function inferHasDataPlanName(
  totalCredits: number,
  availableConcurrency: number | null,
  explicitPlan?: string | null
): string {
  if (explicitPlan && explicitPlan.trim().length > 0) {
    return explicitPlan.trim();
  }

  if (availableConcurrency === 1 || totalCredits <= 1000) {
    return "Free";
  }
  if (availableConcurrency === 5 || totalCredits <= 200000) {
    return "Startup";
  }
  if (availableConcurrency === 15 || totalCredits <= 1000000) {
    return "Basic";
  }
  if (availableConcurrency === 30 || totalCredits <= 3000000) {
    return "Growth";
  }
  if (totalCredits > 3000000 || (availableConcurrency !== null && availableConcurrency > 30)) {
    return "Scale";
  }

  return "Active";
}

function normalizeTimestampToIso(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof val === "number" && val > 0) {
    const ms = val < 1e11 ? val * 1000 : val;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

const START_DATE_KEYS = [
  "startDate",
  "start_date",
  "currentPeriodStart",
  "current_period_start",
  "periodStart",
  "period_start",
  "billingCycleStart",
  "billing_cycle_start",
  "cycleStart",
  "created_at",
  "createdAt",
];

const END_DATE_KEYS = [
  "endDate",
  "end_date",
  "renewalDate",
  "renewal_date",
  "currentPeriodEnd",
  "current_period_end",
  "periodEnd",
  "period_end",
  "nextBillingDate",
  "next_billing_date",
  "expiresAt",
  "expires_at",
  "cycleRenews",
  "cycleEnd",
];

function findFirstMatchingTimestamp(
  sources: (Record<string, unknown> | null | undefined)[],
  candidateKeys: string[]
): string | null {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const key of candidateKeys) {
      if (key in src) {
        const iso = normalizeTimestampToIso(src[key]);
        if (iso) return iso;
      }
    }
  }
  return null;
}

/**
 * Directly queries the HasData API /user/me/usage (and /user/me for subscription metadata) with an API key.
 * Never throws — returns null on network or authentication failure.
 */
export async function fetchHasDataUsageFromApi(
  apiKey: string
): Promise<HasDataUsage | null> {
  const trimmed = apiKey.trim();
  if (!trimmed) return null;

  try {
    const headers = {
      "x-api-key": trimmed,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const [usageResult, meResult] = await Promise.allSettled([
      fetch("https://api.hasdata.com/user/me/usage", {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }),
      fetch("https://api.hasdata.com/user/me", {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }),
    ]);

    let payload: HasDataUsageApiResponse | null = null;
    if (usageResult.status === "fulfilled" && usageResult.value.ok) {
      try {
        payload = (await usageResult.value.json()) as HasDataUsageApiResponse;
      } catch {
        payload = null;
      }
    } else if (usageResult.status === "fulfilled" && !usageResult.value.ok) {
      console.warn(
        `[hasdata] /user/me/usage returned HTTP ${usageResult.value.status} (${usageResult.value.statusText})`
      );
      return null;
    }

    if (!payload || typeof payload !== "object") {
      console.warn(
        "[hasdata] Unexpected or empty response payload from /user/me/usage",
        payload
      );
      return null;
    }

    let mePayload: Record<string, unknown> | null = null;
    if (meResult.status === "fulfilled" && meResult.value.ok) {
      try {
        mePayload = (await meResult.value.json()) as Record<string, unknown>;
      } catch {
        mePayload = null;
      }
    }

    const dataObj: HasDataDataBlock =
      payload.data && typeof payload.data === "object" ? payload.data : payload;

    const totalCredits =
      typeof dataObj.totalCredits === "number"
        ? dataObj.totalCredits
        : typeof payload.totalCredits === "number"
          ? payload.totalCredits
          : 0;

    const availableCredits =
      typeof dataObj.availableCredits === "number"
        ? dataObj.availableCredits
        : typeof payload.availableCredits === "number"
          ? payload.availableCredits
          : 0;

    const concurrentRequests =
      typeof dataObj.concurrentRequests === "number"
        ? dataObj.concurrentRequests
        : typeof payload.concurrentRequests === "number"
          ? payload.concurrentRequests
          : 0;

    const rawConcurrency =
      typeof dataObj.availableConcurrency === "number"
        ? dataObj.availableConcurrency
        : typeof payload.availableConcurrency === "number"
          ? payload.availableConcurrency
          : null;

    const explicitPlan =
      (typeof dataObj.planName === "string" && dataObj.planName) ||
      (typeof dataObj.plan === "string" && dataObj.plan) ||
      (typeof dataObj.tier === "string" && dataObj.tier) ||
      (typeof payload.planName === "string" && payload.planName) ||
      (typeof payload.plan === "string" && payload.plan) ||
      (typeof mePayload?.planName === "string" && (mePayload.planName as string)) ||
      (typeof mePayload?.plan === "string" && (mePayload.plan as string)) ||
      null;

    const planName = inferHasDataPlanName(totalCredits, rawConcurrency, explicitPlan);

    const sources = [
      dataObj,
      payload,
      (dataObj.subscription as Record<string, unknown> | undefined),
      (dataObj.billing as Record<string, unknown> | undefined),
      (dataObj.plan as Record<string, unknown> | undefined),
      mePayload,
      (mePayload?.data as Record<string, unknown> | undefined),
      (mePayload?.subscription as Record<string, unknown> | undefined),
      (mePayload?.billing as Record<string, unknown> | undefined),
    ];

    const startDate = findFirstMatchingTimestamp(sources, START_DATE_KEYS);
    const endDate = findFirstMatchingTimestamp(sources, END_DATE_KEYS);

    return {
      planName,
      totalCredits,
      availableCredits,
      concurrentRequests,
      availableConcurrency: rawConcurrency,
      startDate,
      endDate,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[hasdata] Failed to fetch usage from API: ${msg}`);
    return null;
  }
}

/**
 * Returns cached HasData usage if fresh (< 4 hours) or queries the API if stale or forced.
 * Automatically persists fresh usage to AccountSettings.rules and PermanentSettings.rules.
 */
export async function getOrRefreshHasDataUsage(options: {
  accountId: string;
  force?: boolean;
}): Promise<HasDataUsage | null> {
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

    const apiKey = resolveDecryptedHasDataKey(rules);
    if (!apiKey) return null;

    const cached = rules.hasDataUsage;
    if (!options.force && cached) {
      const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
      if (ageMs < HASDATA_USAGE_CACHE_TTL_MS) {
        return cached;
      }
    }

    const freshUsage = await fetchHasDataUsageFromApi(apiKey);
    if (!freshUsage) {
      // If network fetch failed, return existing cached data if available rather than wiping
      return cached ?? null;
    }

    // Persist to PermanentSettings.rules
    await persistProfileScopedRules(account.id, {
      hasDataUsage: freshUsage,
    });

    // Also persist to current AccountSettings.rules
    if (account.settings) {
      const updated = {
        ...accountRules,
        hasDataUsage: freshUsage,
      };
      await prisma.accountSettings.update({
        where: { accountId: account.id },
        data: { rules: updated as Prisma.InputJsonValue },
      });
    }

    return freshUsage;
  } catch (error) {
    console.warn("[hasdata] Error in getOrRefreshHasDataUsage:", error);
    return null;
  }
}

/**
 * Non-blocking helper called after Glassdoor or Indeed extraction completes via HasData.
 */
export async function refreshHasDataUsageAfterUse(
  accountId: string
): Promise<void> {
  try {
    await getOrRefreshHasDataUsage({ accountId, force: true });
  } catch (err) {
    console.warn("[hasdata] Background refresh after use failed:", err);
  }
}
