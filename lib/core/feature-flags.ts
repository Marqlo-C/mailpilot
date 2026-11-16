import {
  FEATURE_FLAGS_CONFIG,
  resolveDeploymentEnvironment,
  getEnvironmentDefaultFeatureFlag,
} from "@/lib/config/features.config";
import {
  FEATURE_FLAGS_REGISTRY,
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
} from "@/lib/validations/feature-flags.schema";
import type { AccountRules } from "@/lib/validations/rules.schema";

/**
 * Resolves an environment variable string from explicit runtime overrides or process.env.
 * Supports isolated testing in serverless and vitest environments without polluting global state.
 */
function resolveEnvValue(
  key: string,
  envOverrides?: Record<string, string | undefined>
): string | undefined {
  if (envOverrides && Object.prototype.hasOwnProperty.call(envOverrides, key)) {
    return envOverrides[key];
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Checks whether an emergency operational kill-switch is engaged for a given feature flag.
 *
 * Kill-switches allow platform operators to instantly neutralize high-compute, outbound,
 * or unstable subsystems across all tenants in serverless environments without requiring
 * code redeployments or database migrations.
 *
 * Evaluates:
 * 1. Dedicated kill-switch variable: `DISABLE_FEATURE_<KEY>=true` or `1`
 * 2. Inverted enablement variable: `FEATURE_<KEY>=false` or `0`
 */
export function isSystemKillSwitchEngaged(
  flagKey: FeatureFlagKey,
  killSwitchEnvVar?: string,
  envOverrides?: Record<string, string | undefined>
): boolean {
  const envVarToCheck =
    killSwitchEnvVar ??
    FEATURE_FLAGS_CONFIG[flagKey]?.killSwitchEnvVar ??
    `DISABLE_FEATURE_${flagKey.toUpperCase()}`;
  const killVal = resolveEnvValue(envVarToCheck, envOverrides)
    ?.trim()
    .toLowerCase();

  if (killVal === "true" || killVal === "1") {
    return true;
  }

  const featureVal = resolveEnvValue(
    `FEATURE_${flagKey.toUpperCase()}`,
    envOverrides
  )
    ?.trim()
    .toLowerCase();

  if (featureVal === "false" || featureVal === "0") {
    return true;
  }

  return false;
}

/**
 * Maps legacy AccountRules configuration fields to their corresponding feature flag states.
 *
 * Ensures seamless backward compatibility with existing user accounts and prevents
 * regressions for clients that have not yet migrated to the unified `featureFlags` JSON map.
 */
function resolveLegacyRuleAlias(
  flagKey: FeatureFlagKey,
  rules: Partial<AccountRules>
): boolean | undefined {
  switch (flagKey) {
    case "shadow_evaluation": {
      // Deprecated: rules.featureFlags.shadow_evaluation is SSOT. Kept for legacy DB JSON fallback.
      if (typeof rules.enableShadowEmbeddings === "boolean") {
        return rules.enableShadowEmbeddings;
      }
      return undefined;
    }
    case "mode_b_metric_synthesis": {
      if (typeof rules.inventMetrics === "boolean") {
        return rules.inventMetrics;
      }
      if (typeof rules.resumePreferences?.inventMetrics === "boolean") {
        return rules.resumePreferences.inventMetrics;
      }
      return undefined;
    }
    case "web_scraping_proxies": {
      if (typeof rules.enableWebScrapingProxies === "boolean") {
        return rules.enableWebScrapingProxies;
      }
      if (rules.encryptedScrapingAntApiKey || rules.encryptedHasDataApiKey) {
        return true;
      }
      return undefined;
    }
    case "embedded_ai": {
      if (
        rules.scoringEngine === "embedded" ||
        rules.scoringEngine === "hybrid"
      ) {
        return true;
      }
      if (rules.scoringEngine === "heuristic") {
        return false;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Evaluates whether a specific feature flag is currently active for an account.
 *
 * Resolution follows a strict 4-tier precedence hierarchy:
 * 1. Priority 1 (System Kill-Switch): If emergency kill-switch env var is active, returns false.
 * 2. Priority 2 (Explicit Developer/Account Override): If rules.featureFlags[flagKey] is boolean, returns it.
 *    (Backward compatibility fallback): If mapped legacy rule property exists, evaluates its state.
 * 3. Priority 3 (Deployment Environment Default): Reads environment default from FEATURE_FLAGS_CONFIG.
 * 4. Priority 4 (Canonical fallback): Returns false.
 *
 * Resolution is strictly synchronous and in-memory with zero I/O or database overhead,
 * maintaining the <10s Vercel serverless execution budget during ingestion loops.
 *
 * @param flagKey Canonical identifier of the feature flag to evaluate.
 * @param rules Optional account rules JSON object from AccountSettings.rules.
 * @param envOverrides Optional environment variable overrides (useful for testing and sandbox).
 * @returns Resolved boolean state indicating whether the feature should execute.
 */
export function isFeatureEnabled(
  flagKey: FeatureFlagKey,
  rules?: Partial<AccountRules> | null,
  envOverrides?: Record<string, string | undefined>
): boolean {
  const config = FEATURE_FLAGS_CONFIG[flagKey];
  if (!config) {
    return false;
  }

  // Priority 1: System Emergency Kill-Switch
  if (
    isSystemKillSwitchEngaged(
      flagKey,
      config.killSwitchEnvVar,
      envOverrides
    )
  ) {
    return false;
  }

  // Priority 2: Explicit Account Flag Override
  if (
    rules?.featureFlags &&
    typeof rules.featureFlags[flagKey] === "boolean"
  ) {
    return rules.featureFlags[flagKey]!;
  }

  // Legacy Rule Property Alias (backwards compatibility fallback)
  if (rules) {
    const legacyState = resolveLegacyRuleAlias(flagKey, rules);
    if (typeof legacyState === "boolean") {
      return legacyState;
    }
  }

  // Priority 3: Deployment Environment Default from FEATURE_FLAGS_CONFIG
  const targetEnv = resolveDeploymentEnvironment(envOverrides);
  const envDefault = getEnvironmentDefaultFeatureFlag(flagKey, targetEnv);
  if (typeof envDefault === "boolean") {
    return envDefault;
  }

  // Priority 4: Canonical fallback
  return false;
}

/**
 * Resolves the effective boolean state across all registered feature flags.
 *
 * Operates purely in-memory with zero database round-trips. Useful for rendering
 * comprehensive Settings UI views, client-side state hydration, and telemetry payload generation.
 *
 * @param rules Optional account rules JSON object from AccountSettings.rules.
 * @param envOverrides Optional environment variable overrides for deterministic evaluation.
 * @returns Complete dictionary of all FeatureFlagKey identifiers mapped to their effective states.
 */
export function getEffectiveFeatureFlags(
  rules?: Partial<AccountRules> | null,
  envOverrides?: Record<string, string | undefined>
): Record<FeatureFlagKey, boolean> {
  const result = {} as Record<FeatureFlagKey, boolean>;
  for (const key of FEATURE_FLAG_KEYS) {
    result[key] = isFeatureEnabled(key, rules, envOverrides);
  }
  return result;
}

/**
 * Resolves a dictionary indicating which feature flags currently have an active
 * emergency operational kill-switch engaged via system environment variables.
 *
 * @param envOverrides Optional environment variable overrides for deterministic evaluation.
 * @returns Complete dictionary of all FeatureFlagKey identifiers mapped to their kill-switch status.
 */
export function getKillSwitchedFlags(
  envOverrides?: Record<string, string | undefined>
): Record<FeatureFlagKey, boolean> {
  const result = {} as Record<FeatureFlagKey, boolean>;
  for (const key of FEATURE_FLAG_KEYS) {
    result[key] = isSystemKillSwitchEngaged(
      key,
      FEATURE_FLAGS_REGISTRY[key].killSwitchEnvVar,
      envOverrides
    );
  }
  return result;
}
