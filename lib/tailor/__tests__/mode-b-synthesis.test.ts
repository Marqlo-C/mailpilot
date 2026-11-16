import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isModeBMetricSynthesisPermitted,
  enforceMetricGrounding,
} from "../mode-b-synthesis";
import type { AccountRules } from "@/lib/validations/rules.schema";

describe("Mode B Metric Synthesis Feature Guard", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isModeBMetricSynthesisPermitted", () => {
    it("returns false by default when rules are empty or null", () => {
      expect(isModeBMetricSynthesisPermitted(null)).toBe(false);
      expect(isModeBMetricSynthesisPermitted(undefined)).toBe(false);
      expect(isModeBMetricSynthesisPermitted({})).toBe(false);
    });

    it("returns true when mode_b_metric_synthesis feature flag is explicitly enabled", () => {
      const rules: Partial<AccountRules> = {
        featureFlags: { mode_b_metric_synthesis: true },
      };
      expect(isModeBMetricSynthesisPermitted(rules)).toBe(true);
    });

    it("returns false when mode_b_metric_synthesis feature flag is explicitly disabled", () => {
      const rules: Partial<AccountRules> = {
        inventMetrics: true, // legacy says true
        featureFlags: { mode_b_metric_synthesis: false },
      };
      expect(isModeBMetricSynthesisPermitted(rules)).toBe(false);
    });

    it("falls back to legacy inventMetrics when feature flag is not specified", () => {
      expect(
        isModeBMetricSynthesisPermitted({
          inventMetrics: true,
          featureFlags: {},
        })
      ).toBe(true);

      expect(
        isModeBMetricSynthesisPermitted({
          inventMetrics: false,
          featureFlags: {},
        })
      ).toBe(false);
    });

    it("falls back to legacy resumePreferences.inventMetrics when feature flag is not specified", () => {
      expect(
        isModeBMetricSynthesisPermitted({
          resumePreferences: {
            inventMetrics: true,
            includeSummary: true,
            attachPdfByDefault: true,
            maxPages: "auto",
            sectionOrder: [],
            disabledSections: [],
            orderingMode: "AI_OPTIMAL",
            inclusionMode: "AI_OPTIMAL",
          },
          featureFlags: {},
        })
      ).toBe(true);
    });

    it("respects explicit override parameter when provided", () => {
      expect(isModeBMetricSynthesisPermitted(null, true)).toBe(true);
      expect(isModeBMetricSynthesisPermitted(null, false)).toBe(false);
    });

    it("honors emergency kill-switches over all rules and overrides", () => {
      process.env.DISABLE_FEATURE_MODE_B_METRIC_SYNTHESIS = "true";

      expect(
        isModeBMetricSynthesisPermitted(
          { featureFlags: { mode_b_metric_synthesis: true } },
          true
        )
      ).toBe(false);

      delete process.env.DISABLE_FEATURE_MODE_B_METRIC_SYNTHESIS;
      process.env.FEATURE_MODE_B_METRIC_SYNTHESIS = "false";

      expect(
        isModeBMetricSynthesisPermitted(
          { featureFlags: { mode_b_metric_synthesis: true } },
          true
        )
      ).toBe(false);
    });
  });

  describe("enforceMetricGrounding", () => {
    it("preserves synthesized bullet when metric synthesis is permitted", () => {
      const source = "Coordinated team schedule and managed meeting rooms.";
      const synthesized =
        "Coordinated team schedule across 12 departments, accelerating room turnarounds by 15%.";

      const grounded = enforceMetricGrounding(
        synthesized,
        source,
        { featureFlags: { mode_b_metric_synthesis: true } }
      );

      expect(grounded).toBe(synthesized);
    });

    it("falls back to verbatim source bullet when metric synthesis is prohibited and hallucinations are detected", () => {
      const source = "Coordinated team schedule and managed meeting rooms.";
      const synthesized =
        "Coordinated team schedule across 12 departments, accelerating room turnarounds by 15%.";

      const grounded = enforceMetricGrounding(
        synthesized,
        source,
        { featureFlags: { mode_b_metric_synthesis: false } }
      );

      expect(grounded).toBe(source);
    });

    it("preserves restructured qualitative bullet when no new numbers were fabricated", () => {
      const source = "Coordinated team schedule and managed meeting rooms.";
      const synthesized =
        "Orchestrated cross-functional facility scheduling, establishing standardized meeting governance across departments.";

      const grounded = enforceMetricGrounding(
        synthesized,
        source,
        { featureFlags: { mode_b_metric_synthesis: false } }
      );

      expect(grounded).toBe(synthesized);
    });

    it("permits source numbers to remain in restructured bullet when synthesis is barred", () => {
      const source = "Managed 5 regional offices and reduced operating costs by 10%.";
      const synthesized =
        "Directed operational administration across 5 regional facilities, trimming aggregate overhead by 10% through vendor renegotiation.";

      const grounded = enforceMetricGrounding(
        synthesized,
        source,
        { featureFlags: { mode_b_metric_synthesis: false } }
      );

      expect(grounded).toBe(synthesized);
    });
  });
});
