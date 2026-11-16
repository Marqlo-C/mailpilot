/**
 * ============================================================================
 * SEMANTIC CROSSOVER EVALUATION ENGINE
 *
 * In-memory domain service that vectorizes candidate profile accomplishments
 * and job description requirements, calculates semantic crossover scores,
 * and maps grounded transferable skills across disjoint industries.
 * ============================================================================
 */

import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import type { AccountRules } from "@/lib/validations/rules.schema";
import type { NormalizedJobOpportunity } from "@/lib/opportunities/context/context.schema";
import { parseStructuredJobSections } from "@/lib/opportunities/context/section-classifier";
import { cosineSimilarity } from "./vector-math";
import {
  getBatchEmbeddings,
  resolveEmbeddingConfig,
} from "./embedding-registry";
import {
  extractCandidateAccomplishments,
  mapTransferableSkills,
  validateVerbatimAnchor,
} from "./transferable-skills";
import type {
  EmbeddedEvaluationResult,
  EmbeddingDriverConfig,
  SemanticCrossoverOptions,
} from "./embedding-types";

/** Maximum number of job requirements to evaluate in a single batch to respect serverless timeouts */
export const MAX_EVALUATED_REQUIREMENTS = 25;

/** Maximum number of candidate accomplishments to evaluate in a single batch */
export const MAX_EVALUATED_ACCOMPLISHMENTS = 30;

const BOILERPLATE_REGEX =
  /\b(equal\s+opportunity|affirmative\s+action|\beeo\b|all\s+qualified\s+applicants|accommodations?\s+for\s+disabilit|background\s+check|drug\s+screen|we\s+celebrate\s+diversity)\b/i;

const BULLET_START_REGEX = /^\s*[-*•·●]\s+|\s*^\d+\.\s+/;

/**
 * Extracts itemized requirement and responsibility statements from an opportunity.
 * Supports structured sections, markdown bullet points, and plain text.
 *
 * @param opportunity - Job opportunity record or raw description string
 * @returns Array of clean, distinct requirement strings
 */
export function extractJobRequirements(
  opportunity: Partial<NormalizedJobOpportunity> | string
): string[] {
  const requirements: string[] = [];
  const rawText =
    typeof opportunity === "string"
      ? opportunity
      : opportunity.jobDescription || opportunity.inboundSnippet || "";

  if (!rawText.trim()) {
    if (typeof opportunity !== "string" && opportunity.roleTitle?.trim()) {
      return [`Core responsibilities and duties for ${opportunity.roleTitle.trim()}`];
    }
    return [];
  }

  // 1. Check if structured sections are present or parse them
  const parsedSections =
    typeof opportunity !== "string" && opportunity.jobDescription
      ? parseStructuredJobSections(opportunity.jobDescription).sections
      : parseStructuredJobSections(rawText).sections;

  const relevantSections = parsedSections.filter((sec) =>
    [
      "responsibilities",
      "qualifications_required",
      "qualifications_preferred",
      "candidate_profile",
      "overview",
    ].includes(sec.category)
  );

  const textsToScan =
    relevantSections.length > 0
      ? relevantSections.map((sec) => sec.body)
      : [rawText];

  for (const block of textsToScan) {
    const lines = block.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || BOILERPLATE_REGEX.test(line)) {
        continue;
      }

      // Check if line is a bullet item
      if (BULLET_START_REGEX.test(line)) {
        const cleaned = line
          .replace(BULLET_START_REGEX, "")
          .replace(/\*\*/g, "")
          .trim();
        if (cleaned.length >= 15 && cleaned.length <= 400) {
          requirements.push(cleaned);
        }
      }
    }
  }

  // 2. If no bullet items found, split by sentence boundaries
  if (requirements.length === 0) {
    const sentences = rawText
      .replace(/#{1,6}\s+[^\n]+/g, "") // strip headers
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.replace(/\*\*/g, "").trim())
      .filter(
        (s) =>
          s.length >= 25 &&
          s.length <= 300 &&
          !BOILERPLATE_REGEX.test(s) &&
          !s.startsWith("#")
      );

    requirements.push(...sentences);
  }

  // 3. Fallback to role title context if still empty
  if (
    requirements.length === 0 &&
    typeof opportunity !== "string" &&
    opportunity.roleTitle?.trim()
  ) {
    requirements.push(
      `Core responsibilities and duties for ${opportunity.roleTitle.trim()}`
    );
  }

  // Deduplicate and cap to safe serverless batch limit
  const uniqueReqs = [...new Set(requirements)];
  return uniqueReqs.slice(0, MAX_EVALUATED_REQUIREMENTS);
}

/**
 * Computes the pairwise cosine similarity matrix between requirement vectors
 * and candidate accomplishment vectors.
 *
 * @param reqEmbeddings - Array of requirement embedding vectors (M items)
 * @param accEmbeddings - Array of accomplishment embedding vectors (N items)
 * @returns 2D matrix of dimensions M x N
 */
export function computePairwiseSimilarityMatrix(
  reqEmbeddings: number[][],
  accEmbeddings: number[][]
): number[][] {
  const matrix: number[][] = [];

  for (let r = 0; r < reqEmbeddings.length; r++) {
    const row: number[] = [];
    const reqVec = reqEmbeddings[r];

    for (let a = 0; a < accEmbeddings.length; a++) {
      const accVec = accEmbeddings[a];
      try {
        const sim = cosineSimilarity(reqVec, accVec);
        row.push(sim);
      } catch {
        row.push(0);
      }
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * Derives a normalized 0 - 100 semantic crossover score from a similarity matrix.
 *
 * Uses a calibrated blend of mean requirement coverage and top-quartile alignment,
 * mapped smoothly to a 0–100 integer.
 *
 * @param similarityMatrix - 2D matrix of cosine similarities [requirements x accomplishments]
 * @returns Integer score between 0 and 100
 */
export function calculateCrossoverScore(similarityMatrix: number[][]): number {
  if (
    similarityMatrix.length === 0 ||
    !similarityMatrix[0] ||
    similarityMatrix[0].length === 0
  ) {
    return 0;
  }

  const reqCoverages: number[] = [];

  for (let r = 0; r < similarityMatrix.length; r++) {
    const row = similarityMatrix[r];
    let maxSim = 0;
    for (let c = 0; c < row.length; c++) {
      const sim = row[c];
      if (sim > maxSim) {
        maxSim = sim;
      }
    }
    reqCoverages.push(Math.max(0, maxSim));
  }

  if (reqCoverages.length === 0) {
    return 0;
  }

  // 1. Mean coverage across all requirements
  const sum = reqCoverages.reduce((acc, val) => acc + val, 0);
  const meanCoverage = sum / reqCoverages.length;

  // 2. Top-half alignment strength
  const sorted = [...reqCoverages].sort((a, b) => b - a);
  const halfCount = Math.max(1, Math.ceil(sorted.length / 2));
  const topHalfSum = sorted
    .slice(0, halfCount)
    .reduce((acc, val) => acc + val, 0);
  const topHalfAvg = topHalfSum / halfCount;

  // 3. Blended raw similarity: 60% overall coverage + 40% top strengths
  const rawSimilarity = 0.6 * meanCoverage + 0.4 * topHalfAvg;

  // 4. Smooth calibration:
  // Baseline ambient similarity floor for dense models is ~0.20;
  // strong semantic crossover is ~0.75 - 0.80.
  if (rawSimilarity <= 0.2) {
    return Math.max(0, Math.round(rawSimilarity * 50));
  }

  const normalized = ((rawSimilarity - 0.2) / (0.8 - 0.2)) * 100;
  return Math.min(100, Math.max(0, Math.round(normalized)));
}

/**
 * Evaluates an opportunity against a candidate profile using embedded vector AI.
 *
 * Vectorizes requirements and accomplishments in memory, calculates semantic
 * crossover score, and extracts grounded transferable skills with 100% verbatim
 * quote guarantees.
 *
 * @param params - Configuration, profile, opportunity, and options
 * @returns Embedded evaluation result with crossover score and transferable skills
 */
export async function evaluateSemanticCrossover(params: {
  opportunity: Partial<NormalizedJobOpportunity> | string;
  profile: MasterProfileInput;
  config?: EmbeddingDriverConfig | null;
  rules?: Partial<AccountRules> | null;
  options?: SemanticCrossoverOptions;
}): Promise<EmbeddedEvaluationResult> {
  const startTime = performance.now();

  // 1. Resolve active embedding configuration
  const config =
    params.config ?? (params.rules ? resolveEmbeddingConfig(params.rules) : null);

  if (!config || config.provider === "disabled") {
    return {
      crossoverScore: 0,
      transferableSkills: [],
      providerUsed: config?.provider ?? "disabled",
      latencyMs: 0,
    };
  }

  // 2. Extract job requirements and candidate accomplishments
  const requirements = extractJobRequirements(params.opportunity);
  const allAccomplishments = extractCandidateAccomplishments(params.profile);
  const accomplishments = allAccomplishments.slice(
    0,
    MAX_EVALUATED_ACCOMPLISHMENTS
  );

  if (requirements.length === 0 || accomplishments.length === 0) {
    return {
      crossoverScore: 0,
      transferableSkills: [],
      providerUsed: config.provider,
      latencyMs: Math.round(performance.now() - startTime),
      error: "Insufficient requirements or accomplishments for evaluation",
    };
  }

  // 3. Generate batch embeddings for both sets concurrently
  const accTexts = accomplishments.map((a) => a.text);
  const allTexts = [...requirements, ...accTexts];

  const embeddings = await getBatchEmbeddings(allTexts, config);
  if (!embeddings || embeddings.length !== allTexts.length) {
    return {
      crossoverScore: 0,
      transferableSkills: [],
      providerUsed: config.provider,
      latencyMs: Math.round(performance.now() - startTime),
      error: "Failed to generate embeddings from provider",
    };
  }

  const reqEmbeddings = embeddings.slice(0, requirements.length);
  const accEmbeddings = embeddings.slice(requirements.length);

  // 4. Compute similarity matrix & crossover score
  const similarityMatrix = computePairwiseSimilarityMatrix(
    reqEmbeddings,
    accEmbeddings
  );
  const crossoverScore = calculateCrossoverScore(similarityMatrix);

  // 5. Map grounded transferable skills
  const targetRoleTitle =
    typeof params.opportunity === "string"
      ? undefined
      : params.opportunity.roleTitle;

  const threshold =
    params.options?.transferableThreshold ??
    (params.rules?.crossoverScoreThreshold
      ? params.rules.crossoverScoreThreshold / 100
      : undefined);

  const rawMappings = mapTransferableSkills({
    requirements,
    accomplishments,
    similarityMatrix,
    targetRoleTitle,
    threshold,
    maxResults: params.options?.maxTransferableSkills,
  });

  // 6. Guarantee 100% verbatim anchor integrity against hallucination
  const verifiedMappings = rawMappings.filter((mapping) =>
    validateVerbatimAnchor(mapping, params.profile)
  );

  return {
    crossoverScore,
    transferableSkills: verifiedMappings,
    providerUsed: config.provider,
    latencyMs: Math.round(performance.now() - startTime),
  };
}
