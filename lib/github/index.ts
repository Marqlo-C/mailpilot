// Single Source of Truth
export {
  type ProjectItem,
  type RepoScaleTier,
  type RepoComplexityScale,
  type RepoScaleBudget,
  type GitHubRawRepo,
  type GitHubSyncOptions,
  type AnalyzeRepoParams,
  determineRepoScale,
  TIER_1_BUDGET,
  TIER_2_BUDGET,
  TIER_3_BUDGET,
} from "./schema.ssot";

// Semantic Prefilter & Markdown Scrubber
export {
  extractSemanticMarkdownDigest,
  FILTER_OUT_REGEX,
  PRIORITY_REGEX,
} from "./prefilter";

// Manifests & Systems Domain Grouping
export {
  COMMON_MANIFESTS,
  ROOT_MANIFESTS,
  MONOREPO_INDICATOR_FILES,
  SUBDIRECTORY_MANIFESTS,
  parseManifestDependencies,
  isMonorepoManifest,
  groupDependenciesByDomain,
} from "./manifests";

// Architectural Topology Deduction
export { deduceArchitecturalTopology } from "./topology";

// Deep Systems Inference
export {
  DEEP_ANALYSIS_SYSTEM_PROMPT,
  analyzeRepoArtifacts,
} from "./inference";

// Lens & Adapters
export {
  normalizeGitHubUsername,
  adaptRepoToProjectItem,
  sanitizeBulletString,
  LOW_SIGNAL_CHORE_REGEX,
} from "./lens";

// Main Syncer Orchestration
export { syncGitHubProjects } from "./syncer";
