import type { LlmProvider } from "@/lib/llm";
import type { AccountRules } from "@/lib/validations/rules";

/**
 * Global GitHub Parser Version.
 *
 * BUMP THIS VERSION whenever you make updates to:
 * - Parsing rules, manifests, or regexes
 * - System prompts or heuristic bullet generators
 * - Architectural density, code byte thresholds, or bullet count targets
 * - Oversampling ratios, tournament evaluation, or pruning algorithms
 * - Universal architectural dimension classification and technology filtering
 * - Calibrated sparse and Tier 1 minimum bullet floors to 3
 * - Suffix stemming deduplication, rogue metric math scrubbing, and verb diversification
 * - Full-capacity backfilling up to maxBullets and calibrated semantic deduplication
 *
 * Bumping this version automatically invalidates all cached ETag entries in
 * local/in-memory ledgers, ensuring unchanged repositories are re-scanned and re-inferred.
 */
export const GITHUB_PARSER_VERSION = 12;

/**
 * Universal file extension taxonomy across tech stacks and ecosystems.
 * Extensible single-source-of-truth for source code, markup, configuration, and data assets.
 */
export const FILE_EXTENSIONS = {
  code: [
    "py", "ts", "tsx", "js", "jsx", "go", "rs", "cpp", "c", "h", "hpp",
    "java", "rb", "php", "cs", "swift", "kt", "scala", "r", "sh", "bash",
    "zsh", "sql", "dart", "lua", "zig", "ex", "exs", "erl", "clj"
  ],
  markupAndData: [
    "json", "txt", "csv", "tsv", "yaml", "yml", "toml", "xml", "proto",
    "graphql", "md", "mdx", "html", "css", "scss", "sass", "less"
  ],
  configAndEnv: [
    "env", "ini", "cfg", "conf", "lock", "properties", "dockerfile", "tf"
  ],
  binaryAndModels: [
    "wasm", "bin", "onnx", "pt", "pth", "pkl", "gguf", "safetensors"
  ]
} as const;

export const ALL_FILE_EXTENSIONS_SET = new Set<string>([
  ...FILE_EXTENSIONS.code,
  ...FILE_EXTENSIONS.markupAndData,
  ...FILE_EXTENSIONS.configAndEnv,
  ...FILE_EXTENSIONS.binaryAndModels,
]);

/**
 * Universal POSIX directory roots across all major languages and frameworks.
 */
export const UNIVERSAL_DIRECTORY_ROOTS = [
  "src", "app", "lib", "pkg", "internal", "cmd", "bin", "dist", "build",
  "out", "target", "vendor", "node_modules", "public", "static", "assets",
  "data", "config", "tests", "test", "spec", "contracts", "migrations",
  "routes", "controllers", "models", "views", "services", "middleware",
  "utils", "helpers", "core", "domain", "infra", "scripts", "templates"
] as const;

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
  created_at?: string;
  pushed_at?: string;
  updated_at?: string;
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

export interface RepoCacheEntry {
  etag?: string;
  pushedAt?: string;
  parserVersion?: number | string;
  project: ProjectItem;
}

export interface SubsystemMarkers {
  hasDatabase?: boolean;
  hasTests?: boolean;
  hasContainerization?: boolean;
  hasCiCd?: boolean;
  hasMonorepo?: boolean;
  hasMultiDomainTopology?: boolean;
}

export interface StructuralMarkers extends SubsystemMarkers {
  manifestPaths?: string[];
  languages?: Record<string, number>;
  rawLanguages?: Record<string, number>;
  pureCodeBytes?: number;
}

export interface GitHubSyncOptions {
  accountId?: string | null;
  githubUsername?: string;
  githubToken?: string | null;
  /** Maximum number of repos to ingest. Defaults to 100 for broad coverage */
  maxReposLimit?: number;
  /** Max parallel worker concurrency (default: 3) */
  concurrencyLimit?: number;
  llmProvider?: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  devModelOverride?: string | null;
  allowCloudFallback?: boolean;
  accountRules?: Partial<AccountRules> | null;
  llmOptions?: {
    llmProvider?: LlmProvider;
    localOllamaUrl?: string | null;
    ollamaModel?: string | null;
    devModelOverride?: string | null;
    allowCloudFallback?: boolean;
  };
  rawFetcher?: (
    username: string,
    repo: string,
    branch: string,
    filepath: string
  ) => Promise<string | null>;
  cacheLedger?: Map<string, RepoCacheEntry>;
}

export interface AnalyzeRepoParams {
  repoName: string;
  description: string;
  readme: string | null;
  manifestTechnologies: string[];
  repoSize?: number | null;
  pureCodeBytes?: number | null;
  manifestPaths?: string[];
  hasMonorepoStructure?: boolean;
  structuralMarkers?: StructuralMarkers;
  languageMetrics?: Record<string, number>;
  llmOptions?: GitHubSyncOptions;
}

export const TIER_1_BUDGET = 2500;
export const TIER_2_BUDGET = 5500;
export const TIER_3_BUDGET = 10000;

/**
 * Non-signal markup, styling, or scaffolding languages excluded when calculating pure source code bytes.
 */
export const NON_SIGNAL_LANGUAGES = new Set([
  "html",
  "css",
  "scss",
  "less",
  "sass",
  "tex",
  "postscript",
  "makefile",
  "dockerfile",
  "vim script",
  "cmake",
  "shell",
  "batchfile",
  "powershell",
  "markdown",
  "mdx",
  "svg",
  "text",
  "yaml",
  "json",
  "csv",
  "xml",
  "jupyter notebook",
]);

/**
 * Computes the total bytes of pure application/systems source code from GitHub's /languages breakdown,
 * excluding non-code markup, styling, or scaffolding.
 */
export function calculatePureCodeBytes(
  langData?: Record<string, number> | null
): number {
  if (!langData) return 0;
  let codeBytes = 0;
  for (const [lang, bytes] of Object.entries(langData)) {
    if (!NON_SIGNAL_LANGUAGES.has(lang.toLowerCase())) {
      codeBytes += bytes;
    }
  }
  return codeBytes;
}

/**
 * Counts the verified structural engineering subsystems discovered via Git Trees and manifests.
 */
export function countVerifiedSubsystems(subsystems?: SubsystemMarkers): number {
  if (!subsystems) return 0;
  let count = 0;
  if (subsystems.hasDatabase) count++;
  if (subsystems.hasTests) count++;
  if (subsystems.hasContainerization) count++;
  if (subsystems.hasCiCd) count++;
  if (subsystems.hasMonorepo) count++;
  if (subsystems.hasMultiDomainTopology) count++;
  return count;
}

export interface DetermineRepoScaleParams {
  size?: number | null; // Size in KB from repo.size (fallback)
  codeBytes?: number | null; // Pure source code bytes from /languages (excluding markup)
  subsystems?: SubsystemMarkers;
  manifestCount?: number;
  hasMonorepoStructure?: boolean;
  hasReadme?: boolean;
}

/**
 * Evaluates architectural density using pure source code bytes, verified subsystem count,
 * manifest topology, and README presence to dynamically calibrate inference budget and target bullet density.
 *
 * Architectural Density Dimensions:
 * - Pure Code Bytes (via /languages):
 *   < 20 KB pure code: Script / small utility -> Tier 1 (3-5 bullets)
 *   20 KB - 120 KB pure code: Full-stack app / service -> Tier 2 (6-8 bullets)
 *   > 120 KB pure code: Substantive distributed architecture / engine -> Tier 3 (8-14 bullets)
 * - Verified Subsystems (from Git Trees):
 *   >= 4 subsystems -> Tier 3
 *   >= 2 subsystems -> Tier 2
 * - No-README Safeguard:
 *   Constrains target density strictly to 3-5 bullets grounded in verified subsystems to prevent hallucination.
 */
export function determineRepoScale(info: DetermineRepoScaleParams): RepoComplexityScale {
  const codeBytes = typeof info.codeBytes === "number" ? info.codeBytes : null;
  const subsystemCount = countVerifiedSubsystems(info.subsystems);
  const size = typeof info.size === "number" ? info.size : 0;
  const manifestCount = info.manifestCount ?? 0;
  const hasMonorepo = Boolean(info.hasMonorepoStructure || info.subsystems?.hasMonorepo);
  const hasReadme = info.hasReadme ?? true;

  let tier: RepoScaleTier = 1;
  let budget = TIER_1_BUDGET;
  let targetScope = "CLI tools, localized utility algorithms, or self-contained scripts";

  if (codeBytes !== null) {
    // Primary Model: Pure Source Code Bytes + Verified Subsystem Count
    if (codeBytes >= 120000 || subsystemCount >= 4 || hasMonorepo) {
      tier = 3;
      budget = TIER_3_BUDGET;
      targetScope =
        "Multi-service distributed architectures, event-driven pipelines, or high-throughput engines";
    } else if (codeBytes >= 25000 || subsystemCount >= 2 || manifestCount >= 2) {
      tier = 2;
      budget = TIER_2_BUDGET;
      targetScope =
        "Containerized full-stack apps, background workers, or standalone REST services";
    }
  } else {
    // Fallback: When /languages data is unavailable, use repo.size (in KB) and manifest counts
    if (size >= 15000 || hasMonorepo || subsystemCount >= 4) {
      tier = 3;
      budget = TIER_3_BUDGET;
      targetScope =
        "Multi-service distributed architectures, event-driven pipelines, or high-throughput engines";
    } else if (
      (size >= 3000 && size < 15000) ||
      subsystemCount >= 2 ||
      manifestCount >= 2 ||
      (manifestCount > 1 && size >= 1000)
    ) {
      tier = 2;
      budget = TIER_2_BUDGET;
      targetScope =
        "Containerized full-stack apps, background workers, or standalone REST services";
    }
  }

  // No-README Safeguard: Ground density strictly to 3–4 bullets
  if (!hasReadme) {
    return {
      tier,
      targetScope: `${targetScope} (no README)`,
      ingestCharBudget: budget,
      minBullets: 3,
      maxBullets: 4,
    };
  }

  if (tier === 3) {
    return {
      tier: 3,
      targetScope,
      ingestCharBudget: budget,
      minBullets: 6,
      maxBullets: 10,
    };
  }

  if (tier === 2) {
    return {
      tier: 2,
      targetScope,
      ingestCharBudget: budget,
      minBullets: 4,
      maxBullets: 8,
    };
  }

  return {
    tier: 1,
    targetScope,
    ingestCharBudget: budget,
    minBullets: 3,
    maxBullets: 4,
  };
}
