// Single Source of Truth
export {
  GITHUB_PARSER_VERSION,
  type ProjectItem,
  type RepoScaleTier,
  type RepoComplexityScale,
  type RepoScaleBudget,
  type GitHubRawRepo,
  type GitHubSyncOptions,
  type AnalyzeRepoParams,
  type RepoCacheEntry,
  type StructuralMarkers,
  type SubsystemMarkers,
  type DetermineRepoScaleParams,
  determineRepoScale,
  calculatePureCodeBytes,
  countVerifiedSubsystems,
  NON_SIGNAL_LANGUAGES,
  TIER_1_BUDGET,
  TIER_2_BUDGET,
  TIER_3_BUDGET,
} from "./schema.ssot";

// Canonical Tool Deduplication & Micro-Exclusion Noise Denylist
export {
  CANONICAL_TOOL_MAP,
  MICRO_EXCLUSION_REGEX,
  isMicroExclusionTool,
  dedupeTools,
} from "./tools";

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
  stripFilenamePhrases,
  stripFileSystemArtifacts,
  unrollRoboticHeadingPrefix,
  unrollPermissivePhrasing,
  cleanTrivialPrimitives,
  auditBulletSubstantiveness,
  deduplicateOrSynthesizeBullets,
  isUngroundedHallucination,
  diversifyLeadingVerbs,
  LOW_SIGNAL_CHORE_REGEX,
  detectArchitecturalDimension,
  type ArchitecturalDimension,
  type AuditedBullet,
} from "./lens";

// Main Syncer Orchestration & ETag Cache
export {
  syncGitHubProjects,
  getGlobalRepoCache,
  clearGlobalRepoCache,
} from "./syncer";
