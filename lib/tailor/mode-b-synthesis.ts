/**
 * ============================================================================
 * MODE B METRIC SYNTHESIS FEATURE GUARD & EVALUATOR
 *
 * Implements strict grounding and career-agnostic metric synthesis controls.
 * Governed by the `mode_b_metric_synthesis` feature flag.
 *
 * When enabled:
 * - Permits generative AI to synthesize plausible, modest impact metrics
 *   calibrated to candidate seniority when source experience bullets lack them.
 *
 * When disabled (Fallback / Strict Grounding):
 * - Strict prohibition on metric fabrication.
 * - Forces verbatim retention of verified metrics and purely qualitative XYZ reframing.
 * ============================================================================
 */

import { isFeatureEnabled } from "@/lib/core/feature-flags";
import type { AccountRules } from "@/lib/validations/rules.schema";

/**
 * Determines whether Mode B Metric Synthesis is permitted for the given account rules
 * and optional explicit request override.
 *
 * Precedence hierarchy:
 * 1. Priority 1 (System Kill-Switch): If `DISABLE_FEATURE_MODE_B_METRIC_SYNTHESIS=true`,
 *    returns false immediately (safety override).
 * 2. Priority 2 (Explicit Account Override): If `rules.featureFlags.mode_b_metric_synthesis`
 *    is explicitly set, returns that boolean.
 * 3. Priority 3 (Caller Request Override): If an explicit override boolean is provided by
 *    the caller (e.g. from manual tailoring modal options), respects that override.
 * 4. Priority 4 (SSOT Resolution): Evaluates effective state via `isFeatureEnabled`.
 *
 * @param rules Optional account rules configuration
 * @param explicitOverride Optional caller-specified override (e.g. from TailorOptions)
 * @returns Boolean indicating whether metric synthesis is permitted
 */
export function isModeBMetricSynthesisPermitted(
  rules?: Partial<AccountRules> | null,
  explicitOverride?: boolean
): boolean {
  // Priority 1: System emergency kill-switch
  if (
    process.env.DISABLE_FEATURE_MODE_B_METRIC_SYNTHESIS === "true" ||
    process.env.DISABLE_FEATURE_MODE_B_METRIC_SYNTHESIS === "1" ||
    process.env.FEATURE_MODE_B_METRIC_SYNTHESIS === "false" ||
    process.env.FEATURE_MODE_B_METRIC_SYNTHESIS === "0"
  ) {
    return false;
  }

  // Priority 2: Explicit account featureFlag override
  if (rules?.featureFlags && typeof rules.featureFlags.mode_b_metric_synthesis === "boolean") {
    return rules.featureFlags.mode_b_metric_synthesis;
  }

  // Priority 3: Explicit caller option override (e.g., interactive tailoring UI)
  if (typeof explicitOverride === "boolean") {
    return explicitOverride;
  }

  // Priority 4: User preference check (inventMetrics / resumePreferences.inventMetrics)
  const userWantsMetrics =
    rules?.inventMetrics === true ||
    rules?.resumePreferences?.inventMetrics === true;

  if (!userWantsMetrics) {
    return false;
  }

  // Priority 5: Platform gate check via isFeatureEnabled
  return isFeatureEnabled("mode_b_metric_synthesis", rules);
}

/**
 * Enforces strict metric grounding on synthesized bullet text.
 *
 * When Mode B Metric Synthesis is disabled:
 * - Prohibits synthetic metric creation.
 * - If the synthesized bullet contains numbers not present in the verbatim source,
 *   falls back to the verbatim source text to guarantee zero hallucinated metrics.
 *
 * @param synthesizedText Reframed bullet text from the tailoring engine
 * @param rawSourceText Verbatim original bullet text from candidate profile
 * @param rules Account rules governing metric synthesis
 * @param explicitOverride Optional interactive tailoring override
 * @returns Grounded bullet string conforming to active metric synthesis policies
 */
export function enforceMetricGrounding(
  synthesizedText: string,
  rawSourceText: string,
  rules?: Partial<AccountRules> | null,
  explicitOverride?: boolean
): string {
  if (isModeBMetricSynthesisPermitted(rules, explicitOverride)) {
    return synthesizedText;
  }

  // Extract all digit sequences from source and synthesized text
  const sourceNumbers = new Set(rawSourceText.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const synthNumbers = synthesizedText.match(/\d+(?:[.,]\d+)?/g) ?? [];

  // Check if synthesized bullet introduced novel numbers not in source
  const hasHallucinatedNumbers = synthNumbers.some(
    (num) => !sourceNumbers.has(num)
  );

  if (hasHallucinatedNumbers) {
    return rawSourceText;
  }

  return synthesizedText;
}
