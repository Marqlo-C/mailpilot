import { z } from "zod";
import {
  DEVELOPER_FEATURE_FLAG_KEYS,
  FEATURE_FLAGS_CONFIG,
  resolveDeploymentEnvironment,
  type DeveloperFeatureFlagKey,
} from "@/lib/config/features.config";

/**
 * Risk tier classification for feature flags.
 * Governs UI badge accents and safety confirmation gates:
 * - LOW: Minimal side-effect surface area (e.g., telemetry, background shadow runs).
 * - MEDIUM: Significant UX or compute impact (e.g., heuristic fallback, embedding cutover).
 * - HIGH: Irreversible or outbound mutations (e.g., generative metric synthesis).
 */
export const FEATURE_FLAG_RISK_TIERS = ["LOW", "MEDIUM", "HIGH"] as const;
export type FeatureFlagRiskTier = (typeof FEATURE_FLAG_RISK_TIERS)[number];
export const featureFlagRiskTierSchema = z.enum(FEATURE_FLAG_RISK_TIERS);

/**
 * Functional category groupings for feature flag organization in Developer Settings and telemetry.
 */
export const FEATURE_FLAG_CATEGORIES = [
  "ai",
  "automation",
  "scraping",
  "subscriptions",
] as const;
export type FeatureFlagCategory = (typeof FEATURE_FLAG_CATEGORIES)[number];
export const featureFlagCategorySchema = z.enum(FEATURE_FLAG_CATEGORIES);

/**
 * Canonical array of all supported developer/platform feature flag keys in MailPilot.
 * Single Source of Truth (SSOT) derived directly from `lib/config/features.config.ts`.
 */
export const FEATURE_FLAG_KEYS = DEVELOPER_FEATURE_FLAG_KEYS;
export type FeatureFlagKey = DeveloperFeatureFlagKey;
export const featureFlagKeySchema = z.enum(FEATURE_FLAG_KEYS);

/**
 * Metadata definition contract for a registered developer feature flag.
 */
export interface FeatureFlagDefinition {
  /** Unique, canonical flag identifier */
  id: FeatureFlagKey;
  /** Human-readable display label for Settings UI */
  label: string;
  /** Description explaining functionality, safety fallbacks, and behavioral implications */
  description: string;
  /** Default boolean state when unset in the current environment */
  defaultValue: boolean;
  /** Risk classification for UI safety badges and confirmation gates */
  risk: FeatureFlagRiskTier;
  /** Domain classification for settings grouping */
  category: FeatureFlagCategory;
  /** Legacy AccountRules key for backwards compatibility, if applicable */
  legacyRuleKey?: string;
  /** Environment variable name for emergency kill-switch override */
  killSwitchEnvVar?: string;
}

/**
 * SSOT registry defining all developer feature flags derived from `lib/config/features.config.ts`,
 * incorporating environment-specific defaults, risk classifications, and kill-switches.
 */
export const FEATURE_FLAGS_REGISTRY: Record<
  FeatureFlagKey,
  FeatureFlagDefinition
> = Object.freeze(
  FEATURE_FLAG_KEYS.reduce((acc, key) => {
    const config = FEATURE_FLAGS_CONFIG[key];
    const currentEnv = resolveDeploymentEnvironment();
    acc[key] = {
      id: config.id,
      label: config.label,
      description: config.description,
      defaultValue: config.envDefaults[currentEnv],
      risk: config.risk,
      category: config.category,
      legacyRuleKey: config.legacyRuleKey,
      killSwitchEnvVar: config.killSwitchEnvVar,
    };
    return acc;
  }, {} as Record<FeatureFlagKey, FeatureFlagDefinition>)
);

/**
 * Resolved map of canonical default boolean states for all registered developer feature flags
 * in the active deployment environment.
 */
export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> =
  Object.freeze(
    FEATURE_FLAG_KEYS.reduce((acc, key) => {
      acc[key] = FEATURE_FLAGS_REGISTRY[key].defaultValue;
      return acc;
    }, {} as Record<FeatureFlagKey, boolean>)
  );

/**
 * Zod schema validating a record of account-scoped developer feature flag overrides.
 * Stored inside AccountSettings.rules JSON field.
 */
export const featureFlagsShape = {
  embedded_ai: z.boolean().optional(),
  shadow_evaluation: z.boolean().optional(),
  web_scraping_proxies: z.boolean().optional(),
  mode_b_metric_synthesis: z.boolean().optional(),
} as const;

export const featureFlagsMapSchema = z
  .object(featureFlagsShape)
  .strict()
  .default({});

export type FeatureFlagsMap = z.infer<typeof featureFlagsMapSchema>;

/**
 * Validation schema for toggling a single developer feature flag via Server Actions.
 */
export const toggleFeatureFlagSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  flagKey: featureFlagKeySchema,
  enabled: z.boolean(),
});

export type ToggleFeatureFlagInput = z.infer<typeof toggleFeatureFlagSchema>;
