import type { LlmProvider } from "@/lib/llm";
import type { AccountRules } from "@/lib/validations/rules";

export type RepoScaleTier = 1 | 2 | 3;

export interface RepoComplexityScale {
  tier: RepoScaleTier;
  ingestCharBudget: number;
  minBullets: number;
  maxBullets: number;
  targetScope: string;
}

export type RepoScaleBudget = RepoComplexityScale;

export interface GitHubRawRepo {
  name: string;
  description: string | null;
  html_url: string;
  fork: boolean;
  archived: boolean;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  default_branch?: string;
  size?: number; // Size in KB returned by GitHub REST API
}

export type ProjectItem = {
  id?: string;
  name: string;
  description: string;
  technologies: string[];
  link: string | null;
  bullets: string[];
  origin?: "HUMAN_VERIFIED" | "GITHUB_INFERRED" | "AI_SUGGESTED";
};

export interface GitHubSyncOptions {
  llmProvider?: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  devModelOverride?: string | null;
  allowCloudFallback?: boolean;
  accountId?: string | null;
  accountRules?: Partial<AccountRules> | null;
  rawFetcher?: (
    username: string,
    repo: string,
    branch: string,
    filepath: string
  ) => Promise<string | null>;
}

export interface AnalyzeRepoParams {
  repoName: string;
  description: string;
  readme: string | null;
  manifestTechnologies: string[];
  repoSize?: number | null;
  manifestPaths?: string[];
  hasMonorepoStructure?: boolean;
  llmOptions?: GitHubSyncOptions;
}

export const TIER_1_BUDGET = 2500;
export const TIER_2_BUDGET = 5500;
export const TIER_3_BUDGET = 10000;

/**
 * Evaluates repository size (in KB), manifest counts, and directory structure
 * to dynamically calibrate inference budget and target bullet density.
 */
export function determineRepoScale(info: {
  size?: number | null;
  manifestCount?: number;
  hasMonorepoStructure?: boolean;
}): RepoComplexityScale {
  const size = typeof info.size === "number" ? info.size : 0;
  const manifestCount = info.manifestCount ?? 0;
  const hasMonorepo = Boolean(info.hasMonorepoStructure);

  // Tier 3: Flagship / Distributed Architecture (repo.size >= 15000 KB or monorepo subdirectories)
  if (size >= 15000 || hasMonorepo) {
    return {
      tier: 3,
      targetScope:
        "Multi-service distributed architectures, event-driven pipelines, or high-throughput engines",
      ingestCharBudget: TIER_3_BUDGET,
      minBullets: 6,
      maxBullets: 10,
    };
  }

  // Tier 2: Mid-Scale Application / Service (repo.size between 3000 KB and 15000 KB, or 2 manifests)
  if ((size >= 3000 && size < 15000) || manifestCount === 2 || (manifestCount > 1 && size >= 1000)) {
    return {
      tier: 2,
      targetScope:
        "Containerized full-stack apps, background workers, or standalone REST services",
      ingestCharBudget: TIER_2_BUDGET,
      minBullets: 4,
      maxBullets: 6,
    };
  }

  // Tier 1: Utility / Small Component (repo.size < 3000 KB or 1 manifest)
  return {
    tier: 1,
    targetScope:
      "CLI tools, localized utility algorithms, or self-contained scripts",
    ingestCharBudget: TIER_1_BUDGET,
    minBullets: 2,
    maxBullets: 3,
  };
}
