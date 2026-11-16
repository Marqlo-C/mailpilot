import { after } from "next/server";
import type { AccountRules } from "@/lib/validations/rules.schema";
import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import {
  isFeatureEnabled,
  isSystemKillSwitchEngaged,
} from "@/lib/core/feature-flags";
import {
  evaluateSemanticCrossover,
  resolveEmbeddingConfig,
  type EmbeddedEvaluationResult,
} from "@/lib/ai";
import { loadMasterProfileForDraft, getCachedMasterProfile } from "@/lib/profile/master-profile";
import {
  evaluateOpportunityMatch,
  extractMatchCandidateLens,
} from "@/lib/matching";
import { resolveJobOpportunity } from "@/lib/opportunities/context";
import {
  logShadowEvaluationTelemetry,
  syncLog,
} from "@/lib/logging";

/**
 * Opportunity details required for running a shadow evaluation.
 */
export interface ShadowEvaluationOpportunity {
  /** Unique database identifier of the opportunity record */
  id: string;
  /** Role or job title */
  title: string;
  /** Employer or company name */
  company: string;
  /** Job description or inbound snippet text */
  description?: string | null;
  /** Primary persisted match score (0 - 100) */
  matchScore?: number | null;
  /** True deterministic heuristic score baseline (0 - 100) */
  heuristicScore?: number | null;
}

/**
 * Execution parameters for shadow embedded evaluation.
 */
export interface ExecuteShadowEvaluationParams {
  /** User account identifier */
  accountId: string;
  /** Target opportunity being evaluated */
  opportunity: ShadowEvaluationOpportunity;
  /** Account rules governing embedding provider and shadow mode settings */
  rules: AccountRules;
  /** Optional pre-loaded master profile to bypass database query */
  profile?: MasterProfileInput | null;
}

/** In-memory cache for profile lookups to avoid redundant database round-trips during digest syncs */
const profileMemoryCache = new Map<
  string,
  { profile: MasterProfileInput; expiresAt: number }
>();
const PROFILE_CACHE_TTL_MS = 30_000;

/** In-memory signature deduplication cache for dev skip notices to avoid repetitive terminal spam */
let lastShadowSkipKey: string | null = null;
let lastShadowSkipLoggedAt = 0;
const SHADOW_SKIP_LOG_WINDOW_MS = 60_000;

/**
 * Resets the shadow skip log deduplication throttle (used by test suites).
 */
export function resetShadowSkipLogThrottle(): void {
  lastShadowSkipKey = null;
  lastShadowSkipLoggedAt = 0;
}

/**
 * Clears the in-memory profile cache and reset throttled log state (primarily for test environments).
 */
export function clearShadowProfileCache(): void {
  profileMemoryCache.clear();
  resetShadowSkipLogThrottle();
}

/**
 * Evaluates whether an account's configuration permits running shadow vector evaluations.
 *
 * Requirements:
 * 1. An embedding provider is explicitly configured and not "disabled" (or inferred in dev/bridge).
 * 2. Embedded AI / shadow evaluation is not globally killed (via `DISABLE_FEATURE_SHADOW_EVALUATION` or `DISABLE_FEATURE_EMBEDDED_AI`).
 * 3. Shadow evaluations are permitted via `isFeatureEnabled("shadow_evaluation", rules)`.
 *
 * Note: Shadow evaluation operates independently of whether the primary scoring engine uses
 * `embedded_ai` (i.e., shadow evaluations run freely even when `scoringEngine` is "heuristic").
 *
 * @param rules - Parsed account rules configuration
 * @returns True if shadow evaluation should proceed
 */
export function shouldRunShadowEvaluation(
  rules: Partial<AccountRules> | null | undefined
): boolean {
  if (!rules) return false;
  let provider = rules.embeddingProvider ?? "disabled";
  // Auto-infer local Ollama when bridge is connected, or in development mode, and provider was left at default
  if (
    provider === "disabled" &&
    (rules.bridgeConnected || process.env.NODE_ENV === "development")
  ) {
    provider = "local_ollama";
  }
  if (provider === "disabled") return false;

  // Emergency kill-switch for embedded AI neutralizes all vector operations
  if (
    process.env.DISABLE_FEATURE_EMBEDDED_AI === "true" ||
    process.env.DISABLE_FEATURE_EMBEDDED_AI === "1" ||
    process.env.FEATURE_EMBEDDED_AI === "false" ||
    process.env.FEATURE_EMBEDDED_AI === "0"
  ) {
    return false;
  }

  // Evaluates kill-switch, account override (featureFlags.shadow_evaluation), and legacy fallback
  return isFeatureEnabled("shadow_evaluation", rules);
}

/**
 * Safely resolves the candidate master profile, utilizing in-memory cache
 * when available, falling back to database read via `loadMasterProfileForDraft`.
 */
async function resolveCandidateProfile(
  accountId: string,
  providedProfile?: MasterProfileInput | null
): Promise<MasterProfileInput | null> {
  if (providedProfile) {
    return providedProfile;
  }
  const cached = profileMemoryCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }
  try {
    const profile = await loadMasterProfileForDraft(accountId);
    profileMemoryCache.set(accountId, {
      profile,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
    });
    return profile;
  } catch {
    return null;
  }
}

/**
 * Executes a shadow crossover evaluation against a job opportunity in-memory,
 * logs side-by-side comparison telemetry, and guarantees zero mutation to
 * the opportunity's persisted matchScore or lifecycle status.
 *
 * Any network, provider, or parsing failures are caught silently and logged
 * without throwing, preserving the caller's execution flow.
 *
 * @param params - Execution parameters including opportunity, rules, and account
 * @returns The embedded evaluation result, or null if skipped or failed
 */
export async function executeShadowEvaluation(
  params: ExecuteShadowEvaluationParams
): Promise<EmbeddedEvaluationResult | null> {
  const startTime = performance.now();
  const { accountId, opportunity, rules, profile: preloadedProfile } = params;

  if (!shouldRunShadowEvaluation(rules)) {
    return null;
  }

  const config = resolveEmbeddingConfig(rules);
  if (!config || config.provider === "disabled") {
    if (process.env.NODE_ENV === "development") {
      const configKey = `config_unresolvable:${rules?.embeddingProvider ?? "disabled"}`;
      const now = Date.now();
      if (
        lastShadowSkipKey !== configKey ||
        now - lastShadowSkipLoggedAt > SHADOW_SKIP_LOG_WINDOW_MS
      ) {
        lastShadowSkipKey = configKey;
        lastShadowSkipLoggedAt = now;
        console.log(
          `[Shadow Evaluation Dev Skip] Provider configuration unresolvable or disabled (provider: '${rules?.embeddingProvider ?? "disabled"}')`
        );
      }
    }
    return null;
  }

  try {
    const profile = await resolveCandidateProfile(accountId, preloadedProfile);

    let heuristicScore = opportunity.heuristicScore;
    if (typeof heuristicScore !== "number") {
      if (rules.scoringEngine === "heuristic" && typeof opportunity.matchScore === "number") {
        heuristicScore = opportunity.matchScore;
      } else if (profile) {
        const candidateLens = extractMatchCandidateLens(profile, null);
        const normalizedOpp = resolveJobOpportunity({
          title: opportunity.title,
          company: opportunity.company,
          description: opportunity.description ?? "",
        });
        const heurEval = evaluateOpportunityMatch({
          opportunity: normalizedOpp,
          candidate: candidateLens,
          mode: "HEURISTIC",
        });
        heuristicScore = heurEval.score;
      } else {
        heuristicScore = opportunity.matchScore ?? 0;
      }
    }

    if (!profile) {
      logShadowEvaluationTelemetry({
        opportunityId: opportunity.id,
        title: opportunity.title,
        company: opportunity.company,
        heuristicScore: heuristicScore ?? 0,
        crossoverScore: 0,
        transferableSkillsCount: 0,
        provider: config.provider,
        model: config.model,
        latencyMs: Math.round(performance.now() - startTime),
        error: "Candidate profile not found or empty",
      });
      return null;
    }

    const result = await evaluateSemanticCrossover({
      opportunity: {
        roleTitle: opportunity.title,
        company: opportunity.company,
        jobDescription: opportunity.description ?? undefined,
      },
      profile,
      config,
      rules,
    });

    logShadowEvaluationTelemetry({
      opportunityId: opportunity.id,
      title: opportunity.title,
      company: opportunity.company,
      heuristicScore: heuristicScore ?? 0,
      crossoverScore: result.crossoverScore,
      transferableSkillsCount: result.transferableSkills.length,
      provider: result.providerUsed,
      model: config.model,
      latencyMs: result.latencyMs,
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Shadow evaluation failed";

    logShadowEvaluationTelemetry({
      opportunityId: opportunity.id,
      title: opportunity.title,
      company: opportunity.company,
      heuristicScore: opportunity.heuristicScore ?? opportunity.matchScore ?? 0,
      crossoverScore: 0,
      transferableSkillsCount: 0,
      provider: config.provider,
      model: config.model,
      latencyMs: Math.round(performance.now() - startTime),
      error: errorMessage,
    });

    return null;
  }
}

/**
 * Dispatches a shadow evaluation non-blockingly in the background.
 *
 * Utilizes Next.js 15 `after()` when inside a serverless request scope,
 * seamlessly falling back to an unhandled asynchronous Promise when outside
 * request context (such as during test execution or scheduled scripts).
 *
 * Returns a Promise that resolves when dispatch is scheduled (or completes),
 * allowing synchronous callers to fire-and-forget while enabling unit tests
 * to await completion when needed.
 *
 * @param params - Execution parameters including opportunity, rules, and account
 */
export function dispatchShadowEvaluation(
  params: ExecuteShadowEvaluationParams
): Promise<EmbeddedEvaluationResult | null> {
  if (!shouldRunShadowEvaluation(params.rules)) {
    if (process.env.NODE_ENV === "development") {
      const provider = params.rules?.embeddingProvider ?? "disabled";
      const killSwitch =
        isSystemKillSwitchEngaged("shadow_evaluation") ||
        isSystemKillSwitchEngaged("embedded_ai");
      const flagValue = isFeatureEnabled("shadow_evaluation", params.rules);
      const skipKey = `${params.accountId ?? "unknown"}:${provider}:${flagValue}:${killSwitch}`;
      const now = Date.now();

      if (
        lastShadowSkipKey !== skipKey ||
        now - lastShadowSkipLoggedAt > SHADOW_SKIP_LOG_WINDOW_MS
      ) {
        lastShadowSkipKey = skipKey;
        lastShadowSkipLoggedAt = now;
        console.log(
          `[Shadow Evaluation Dev Skip] Provider: '${provider}', shadow_evaluation: ${flagValue}, KillSwitch: ${killSwitch}`
        );
      }
    }
    return Promise.resolve(null);
  }

  const runEvaluation = async (): Promise<EmbeddedEvaluationResult | null> => {
    try {
      return await executeShadowEvaluation(params);
    } catch (unexpectedError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Shadow Evaluation Dev Error]", unexpectedError);
      }
      syncLog.debug(
        { err: unexpectedError },
        "Silent catch inside dispatchShadowEvaluation"
      );
      return null;
    }
  };

  // In development, run directly so shadow telemetry cards print immediately to terminal
  if (process.env.NODE_ENV === "development") {
    return runEvaluation();
  }

  let dispatchedWithAfter = false;
  try {
    after(async () => {
      await runEvaluation();
    });
    dispatchedWithAfter = true;
  } catch {
    // Calling `after()` outside a Next.js request context throws; fallback to promise.
  }

  if (dispatchedWithAfter) {
    return Promise.resolve(null);
  }

  return runEvaluation();
}
