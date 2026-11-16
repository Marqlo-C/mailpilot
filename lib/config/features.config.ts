/**
 * Single Source of Truth (SSOT) configuration for MailPilot developer feature flags
 * and deployment environment resolution.
 *
 * This module isolates platform capabilities, infrastructure routing, and experimental
 * cutovers from user-scoped workflow preferences (which live in AccountSettings.rules).
 */

export type DeploymentEnvironment = "development" | "preview" | "production";

export const DEPLOYMENT_ENVIRONMENTS: readonly DeploymentEnvironment[] = [
  "development",
  "preview",
  "production",
] as const;

export const DEVELOPER_FEATURE_FLAG_KEYS = [
  "embedded_ai",
  "shadow_evaluation",
  "web_scraping_proxies",
  "mode_b_metric_synthesis",
] as const;

export type DeveloperFeatureFlagKey =
  (typeof DEVELOPER_FEATURE_FLAG_KEYS)[number];

export interface FeatureFlagEnvironmentDefaults {
  readonly development: boolean;
  readonly preview: boolean;
  readonly production: boolean;
}

export interface FeatureFlagConfigItem {
  /** Unique, canonical flag identifier */
  readonly id: DeveloperFeatureFlagKey;
  /** Human-readable display label for Developer Settings UI */
  readonly label: string;
  /** Description explaining functionality, safety fallbacks, and behavioral implications */
  readonly description: string;
  /** Risk classification for UI safety badges and confirmation gates */
  readonly risk: "LOW" | "MEDIUM" | "HIGH";
  /** Domain classification for settings grouping */
  readonly category: "ai" | "automation" | "scraping" | "subscriptions";
  /** Environment variable name for emergency kill-switch override */
  readonly killSwitchEnvVar: string;
  /** Legacy AccountRules key for backwards compatibility, if applicable */
  readonly legacyRuleKey?: string;
  /** Per-environment default boolean state */
  readonly envDefaults: FeatureFlagEnvironmentDefaults;
}

/**
 * Resolves the active deployment environment tier across serverless and developer environments.
 * Checks VERCEL_ENV first, then NODE_ENV, defaulting to 'development'.
 *
 * @param envOverrides Optional environment dictionary to support hermetic unit testing.
 * @returns Active DeploymentEnvironment ("development" | "preview" | "production").
 */
export function resolveDeploymentEnvironment(
  envOverrides?: Record<string, string | undefined>
): DeploymentEnvironment {
  const vercelEnv = (
    envOverrides?.VERCEL_ENV ??
    (typeof process !== "undefined" ? process.env?.VERCEL_ENV : undefined)
  )
    ?.trim()
    .toLowerCase();

  if (
    vercelEnv === "production" ||
    vercelEnv === "preview" ||
    vercelEnv === "development"
  ) {
    return vercelEnv;
  }

  const nodeEnv = (
    envOverrides?.NODE_ENV ??
    (typeof process !== "undefined" ? process.env?.NODE_ENV : undefined)
  )
    ?.trim()
    .toLowerCase();

  if (nodeEnv === "production") {
    return "production";
  }
  if (nodeEnv === "preview") {
    return "preview";
  }

  return "development";
}

/**
 * Comprehensive SSOT registry defining all platform/developer feature flags,
 * their risk tiers, operational kill-switch environment variables, and per-environment defaults.
 */
export const FEATURE_FLAGS_CONFIG: Record<
  DeveloperFeatureFlagKey,
  FeatureFlagConfigItem
> = Object.freeze({
  embedded_ai: {
    id: "embedded_ai",
    label: "Embedded Vector AI",
    description:
      "Enables vector crossover evaluation and semantic skill matching across candidate profiles and opportunities.",
    risk: "MEDIUM",
    category: "ai",
    legacyRuleKey: "scoringEngine",
    killSwitchEnvVar: "DISABLE_FEATURE_EMBEDDED_AI",
    envDefaults: {
      development: true,
      preview: true,
      production: false,
    },
  },
  shadow_evaluation: {
    id: "shadow_evaluation",
    label: "Shadow Vector Evaluation",
    description:
      "Runs vector crossover scoring concurrently in the background for telemetry and calibration without affecting primary matching.",
    risk: "LOW",
    category: "ai",
    legacyRuleKey: "enableShadowEmbeddings",
    killSwitchEnvVar: "DISABLE_FEATURE_SHADOW_EVALUATION",
    envDefaults: {
      development: true,
      preview: true,
      production: true,
    },
  },
  web_scraping_proxies: {
    id: "web_scraping_proxies",
    label: "Web Scraping Proxies",
    description:
      "Routes external job listing extraction through bot-bypass proxy networks (ScrapingAnt and HasData).",
    risk: "LOW",
    category: "scraping",
    legacyRuleKey: "enableWebScrapingProxies",
    killSwitchEnvVar: "DISABLE_FEATURE_WEB_SCRAPING_PROXIES",
    envDefaults: {
      development: false,
      preview: true,
      production: true,
    },
  },
  mode_b_metric_synthesis: {
    id: "mode_b_metric_synthesis",
    label: "Mode B Metric Synthesis",
    description:
      "Emergency platform kill-switch permitting generative AI to synthesize plausible impact metrics when source experience bullets lack quantified outcomes.",
    risk: "HIGH",
    category: "ai",
    legacyRuleKey: "inventMetrics",
    killSwitchEnvVar: "DISABLE_FEATURE_MODE_B_METRIC_SYNTHESIS",
    envDefaults: {
      development: true,
      preview: true,
      production: false,
    },
  },
});

/**
 * Resolves the default boolean state for a given developer feature flag in a specific environment.
 *
 * @param flagKey Canonical identifier of the developer feature flag.
 * @param env Optional explicit deployment environment; defaults to resolved environment.
 * @returns Boolean default state for that environment.
 */
export function getEnvironmentDefaultFeatureFlag(
  flagKey: DeveloperFeatureFlagKey,
  env?: DeploymentEnvironment
): boolean {
  const targetEnv = env ?? resolveDeploymentEnvironment();
  return FEATURE_FLAGS_CONFIG[flagKey].envDefaults[targetEnv];
}

/**
 * Resolves all developer feature flags with their boolean defaults for a given environment.
 *
 * @param env Optional explicit deployment environment; defaults to resolved environment.
 * @returns Record mapping all developer feature flags to their environment-specific boolean defaults.
 */
export function getEnvironmentDefaultFeatureFlags(
  env?: DeploymentEnvironment
): Record<DeveloperFeatureFlagKey, boolean> {
  const targetEnv = env ?? resolveDeploymentEnvironment();
  const result = {} as Record<DeveloperFeatureFlagKey, boolean>;
  for (const key of DEVELOPER_FEATURE_FLAG_KEYS) {
    result[key] = FEATURE_FLAGS_CONFIG[key].envDefaults[targetEnv];
  }
  return result;
}
