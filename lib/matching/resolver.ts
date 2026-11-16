/**
 * ============================================================================
 * OPPORTUNITY MATCHING RESOLVER
 *
 * Orchestrates multi-engine opportunity fit evaluation across heuristic,
 * embedded vector crossover, and hybrid scoring pipelines. Enforces resilient
 * fallback defense to legacy heuristics whenever local Ollama is unreachable
 * or cloud embedding quotas are exhausted.
 * ============================================================================
 */

import type { NormalizedJobOpportunity } from "@/lib/opportunities/context";
import type {
  MatchCandidateLens,
  MatchResult,
} from "@/lib/validations/matching.schema";
import type {
  AccountRules,
  ScoringEngine,
} from "@/lib/validations/rules.schema";
import {
  getEmptyMasterProfileData,
  type MasterProfileInput,
} from "@/lib/validations/profile.schema";
import type {
  CandidateProfileSummary,
} from "@/lib/ai/classifier";
import {
  evaluateOpportunityMatch,
  computeMatchTier,
} from "./evaluator";
import {
  evaluateSemanticCrossover,
  resolveEmbeddingConfig,
  type EmbeddedEvaluationResult,
  type EmbeddingDriverConfig,
} from "@/lib/ai";
import { isFeatureEnabled } from "@/lib/core/feature-flags";
import { getCachedMasterProfile } from "@/lib/profile/master-profile";

/**
 * Execution parameters for resolving opportunity matching fit.
 */
export interface ResolveOpportunityMatchParams {
  /** Target normalized job opportunity */
  opportunity: NormalizedJobOpportunity;
  /** Candidate facts and profile lens */
  candidate: MatchCandidateLens;
  /** Account rules containing scoringEngine cutover toggle and embedding settings */
  rules?: Partial<AccountRules> | null;
  /** Full master candidate profile or summary (synthesizes fallback if omitted) */
  profile?: MasterProfileInput | CandidateProfileSummary | null;
  /** Optional manual driver override for testing or BYOK scoping */
  config?: EmbeddingDriverConfig | null;
  /** User account ID to retrieve cached master profile when summary is provided */
  accountId?: string;
}

/**
 * Enhanced match evaluation result carrying scoring engine metadata,
 * vector crossover results, and transparent fallback attribution.
 */
export interface ResolvedMatchResult extends MatchResult {
  /** The actual scoring engine that produced the final score */
  scoringEngineUsed: ScoringEngine;
  /** Configured scoring engine requested by account settings */
  scoringEngineRequested: ScoringEngine;
  /** Semantic crossover evaluation result, if vector scoring was executed */
  crossoverResult?: EmbeddedEvaluationResult | null;
  /** Baseline heuristic evaluation result computed as standard or fallback */
  heuristicResult: MatchResult;
  /** Explanatory message when fallback occurred */
  fallbackReason?: string;
}

/**
 * Constructs a minimal MasterProfileInput from MatchCandidateLens when a full profile is omitted.
 */
function candidateLensToProfileFallback(
  lens: MatchCandidateLens
): MasterProfileInput {
  return {
    ...getEmptyMasterProfileData(),
    fullName: "Candidate",
    summary: lens.summary ?? "",
    skills:
      lens.skills.length > 0
        ? [
            {
              label: lens.titleFamily || "Core Competencies",
              parentCategory: null,
              items: lens.skills.map((name) => ({ name, proficiency: null })),
            },
          ]
        : [],
    experiences: lens.recentRoles.map((role, idx) => ({
      id: `syn-exp-${idx}`,
      role,
      company: "Organization",
      location: null,
      category: "Work",
      startDate: "2020-01",
      endDate: null,
      bullets: [
        {
          id: `syn-b-${idx}`,
          rawText: lens.summary ? lens.summary : `Professional experience in ${role}.`,
          hasMetric: false,
          technologies: [],
        },
      ],
      displayOrder: idx,
    })),
  };
}

/**
 * Formats a user-facing explanation when semantic vector crossover drives the primary score.
 */
function formatEmbeddedMatchReason(params: {
  crossoverScore: number;
  crossoverResult: EmbeddedEvaluationResult;
  heuristicReason: string;
}): string {
  const { crossoverScore, crossoverResult, heuristicReason } = params;
  const parts: string[] = [];

  if (crossoverResult.transferableSkills.length > 0) {
    const topTransferSkills = crossoverResult.transferableSkills
      .slice(0, 2)
      .map((skill) => skill.targetRequirement)
      .join("; ");
    parts.push(
      `Semantic vector alignment (${crossoverScore}%). Transferable competencies identified: ${topTransferSkills}.`
    );
  } else {
    parts.push(
      `Semantic vector crossover alignment indicates a ${crossoverScore}% match based on verified profile competencies.`
    );
  }

  if (heuristicReason) {
    parts.push(heuristicReason);
  }

  return parts.join(" ");
}

/**
 * Formats an explanation when a 50/50 hybrid blend of heuristic and vector crossover is used.
 */
function formatHybridMatchReason(params: {
  blendedScore: number;
  heuristicScore: number;
  crossoverScore: number;
  heuristicReason: string;
}): string {
  const { blendedScore, heuristicScore, crossoverScore, heuristicReason } =
    params;
  return `Hybrid evaluation (${blendedScore}%): 50% heuristic profile overlap (${heuristicScore}%), 50% semantic vector crossover (${crossoverScore}%). ${heuristicReason}`;
}

/**
 * Resolves the effective scoring engine by harmonizing the legacy `scoringEngine` rule
 * and the canonical `embedded_ai` feature flag toggle.
 *
 * Precedence:
 * 1. If featureFlags.embedded_ai (or kill-switch) evaluates to false -> "heuristic"
 * 2. If rules.scoringEngine === "hybrid" and embedded_ai is active -> "hybrid"
 * 3. If rules.scoringEngine === "embedded" or embedded_ai is active -> "embedded"
 * 4. Fallback -> "heuristic"
 */
export function resolveEffectiveScoringEngine(
  rules?: Partial<AccountRules> | null
): ScoringEngine {
  if (!rules) return "heuristic";

  // If kill-switch is engaged or embedded AI is disabled, force heuristic baseline
  if (!isFeatureEnabled("embedded_ai", rules)) {
    return "heuristic";
  }

  // If hybrid is requested in rules, blend 50/50
  if (rules.scoringEngine === "hybrid") {
    return "hybrid";
  }

  // If embedded is requested in rules, or explicitly enabled in featureFlags override
  if (
    rules.scoringEngine === "embedded" ||
    rules.featureFlags?.embedded_ai === true
  ) {
    return "embedded";
  }

  return rules.scoringEngine ?? "heuristic";
}

/**
 * Resolves opportunity fit by branching across "heuristic", "embedded", and "hybrid" engines.
 *
 * Guaranteed Behaviors:
 * 1. "heuristic": Evaluates purely via deterministic heuristic rules (default).
 * 2. "embedded": Uses vector crossoverScore as primary matchScore.
 * 3. "hybrid": Blends heuristic (50%) and crossoverScore (50%).
 * 4. Resilient Fallback: If "embedded" or "hybrid" is selected but the embedding driver
 *    is disabled, offline, times out, or errors, logs a warning and returns the heuristic score.
 *
 * @param params - Match parameters including opportunity, candidate, rules, and optional profile
 * @returns Standardized ResolvedMatchResult compatible with MatchResult interface
 */
export async function resolveOpportunityMatch(
  params: ResolveOpportunityMatchParams
): Promise<ResolvedMatchResult> {
  const {
    opportunity,
    candidate,
    rules,
    profile,
    config: configOverride,
    accountId,
  } = params;

  // 1. Always compute the deterministic heuristic baseline first.
  const heuristicResult = evaluateOpportunityMatch({
    opportunity,
    candidate,
    mode: "HEURISTIC",
  });

  const requestedEngine: ScoringEngine =
    rules?.scoringEngine ??
    (rules?.featureFlags?.embedded_ai ? "embedded" : "heuristic");

  // Fast-path: When "heuristic" is selected, return heuristic result directly.
  if (requestedEngine === "heuristic") {
    return {
      ...heuristicResult,
      scoringEngineUsed: "heuristic",
      scoringEngineRequested: "heuristic",
      heuristicResult,
    };
  }

  // Feature Flag: If embedded_ai is disabled via feature flag or emergency kill-switch,
  // gracefully fall back to deterministic heuristic match scores.
  if (!isFeatureEnabled("embedded_ai", rules)) {
    const warningMsg = `Embedded AI is disabled via feature flag; falling back to heuristic scoring.`;
    return {
      ...heuristicResult,
      scoringEngineUsed: "heuristic",
      scoringEngineRequested: requestedEngine,
      fallbackReason: warningMsg,
      heuristicResult,
    };
  }

  // 2. Resolve embedding configuration for "embedded" or "hybrid" modes.
  const config =
    configOverride ?? (rules ? resolveEmbeddingConfig(rules) : null);

  if (!config || config.provider === "disabled") {
    const warningMsg = `Embedding provider is disabled or not configured; falling back to heuristic scoring.`;
    console.warn(`[matching-resolver] ${warningMsg}`);
    return {
      ...heuristicResult,
      scoringEngineUsed: "heuristic",
      scoringEngineRequested: requestedEngine,
      fallbackReason: warningMsg,
      heuristicResult,
    };
  }

  // 3. Attempt vector semantic crossover evaluation with fallback defense.
  try {
    let effectiveProfile: MasterProfileInput | null =
      profile && "fullName" in profile ? (profile as MasterProfileInput) : null;

    if (!effectiveProfile && accountId) {
      effectiveProfile = await getCachedMasterProfile(accountId);
    }

    if (!effectiveProfile) {
      effectiveProfile = candidateLensToProfileFallback(candidate);
    }

    const crossoverResult = await evaluateSemanticCrossover({
      opportunity: {
        roleTitle: opportunity.roleTitle,
        company: opportunity.company,
        jobDescription:
          opportunity.jobDescription ||
          opportunity.inboundSnippet ||
          undefined,
      },
      profile: effectiveProfile,
      config,
      rules,
    });

    // Detect provider or generation errors reported by crossover evaluator
    if (crossoverResult.error) {
      console.warn(
        `[matching-resolver] Embedded evaluation failed (${crossoverResult.error}); falling back to heuristic scoring.`
      );
      return {
        ...heuristicResult,
        scoringEngineUsed: "heuristic",
        scoringEngineRequested: requestedEngine,
        crossoverResult,
        fallbackReason: crossoverResult.error,
        heuristicResult,
      };
    }

    // 4. Branch to Embedded Primary Scoring
    if (requestedEngine === "embedded") {
      const primaryScore = Math.max(
        0,
        Math.min(100, Math.round(crossoverResult.crossoverScore))
      );
      const tier = computeMatchTier(primaryScore);
      const reason = formatEmbeddedMatchReason({
        crossoverScore: primaryScore,
        crossoverResult,
        heuristicReason: heuristicResult.reason,
      });

      return {
        score: primaryScore,
        tier,
        reason,
        matchedSkills: heuristicResult.matchedSkills,
        missingRequirements: heuristicResult.missingRequirements,
        seniorityFit: heuristicResult.seniorityFit,
        scoringEngineUsed: "embedded",
        scoringEngineRequested: "embedded",
        crossoverResult,
        heuristicResult,
      };
    }

    // 5. Branch to Hybrid 50/50 Blended Scoring
    const blendedScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          heuristicResult.score * 0.5 + crossoverResult.crossoverScore * 0.5
        )
      )
    );
    const tier = computeMatchTier(blendedScore);
    const reason = formatHybridMatchReason({
      blendedScore,
      heuristicScore: heuristicResult.score,
      crossoverScore: crossoverResult.crossoverScore,
      heuristicReason: heuristicResult.reason,
    });

    return {
      score: blendedScore,
      tier,
      reason,
      matchedSkills: heuristicResult.matchedSkills,
      missingRequirements: heuristicResult.missingRequirements,
      seniorityFit: heuristicResult.seniorityFit,
      scoringEngineUsed: "hybrid",
      scoringEngineRequested: "hybrid",
      crossoverResult,
      heuristicResult,
    };
  } catch (error) {
    const errorDetail =
      error instanceof Error ? error.message : "Unknown embedding error";
    console.warn(
      `[matching-resolver] Unexpected error in vector scoring (${errorDetail}); falling back to heuristic scoring.`
    );
    return {
      ...heuristicResult,
      scoringEngineUsed: "heuristic",
      scoringEngineRequested: requestedEngine,
      fallbackReason: errorDetail,
      heuristicResult,
    };
  }
}
