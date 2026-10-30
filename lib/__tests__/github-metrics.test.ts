import { describe, it, expect } from "vitest";
import {
  METRIC_UNIT_GROUPS,
  extractGroundedDocumentMetrics,
  verifyAndScrubBulletMetrics,
} from "../github/metrics";

describe("Single Source of Truth: Grounded Metric Harvester & Verifier", () => {
  describe("Agnostic Document Parameter Extraction", () => {
    it("extracts multi-disciplinary metrics across time, scale, rates, geometry, and data", () => {
      const readme = `
# Platform Architecture
- Configured a rate-throttled batching mechanism with a 150ms delay between batches.
- Deployed across 12 markets, maintaining an average 143% quota ratio.
- Employs a 66-column terminal logger emitting telemetry at 60fps.
- Board geometry utilizes a fixed 6x7 grid layout dimension.
- Pre-resolves 3 internal endpoints while streaming 18 KB payload chunks.
- Released in 2025 running Next.js 15.
      `;

      const metrics = extractGroundedDocumentMetrics(readme, 10);

      // Verify authentic engineering constants are extracted
      expect(metrics).toContain("150 ms");
      expect(metrics).toContain("12 markets");
      expect(metrics).toContain("143%");
      expect(metrics).toContain("66 column");
      expect(metrics).toContain("60 fps");
      expect(metrics).toContain("6x7");
      expect(metrics).toContain("3 endpoints");
      expect(metrics).toContain("18 KB");

      // Verify calendar years are NOT extracted as metrics
      expect(metrics).not.toContain("2025");
    });

    it("respects maxItems bound and deduplicates case-insensitively", () => {
      const doc = "50ms timeout ... 50 MS timeout ... 100ms polling ... 200ms delay ... 300ms cycle";
      const metrics = extractGroundedDocumentMetrics(doc, 2);

      expect(metrics.length).toBe(2);
      expect(metrics[0].toLowerCase()).toBe("50 ms");
      expect(metrics[1].toLowerCase()).toBe("100 ms");
    });

    it("handles empty or null documentation safely without throwing", () => {
      expect(extractGroundedDocumentMetrics(null)).toEqual([]);
      expect(extractGroundedDocumentMetrics("")).toEqual([]);
      expect(extractGroundedDocumentMetrics("Generic repo with no numbers")).toEqual([]);
    });
  });

  describe("Grounded Verification & Synthetic Percentage Scrubbing", () => {
    const groundTruth = `
Built a rate-throttled batching engine executing with a 150ms delay across 3 endpoints.
Maintained 143% quota across 12 enterprise markets.
    `;

    it("confirms grounded numbers when present in source text", () => {
      const bullet =
        "Engineered a rate-throttled batching mechanism with a 150ms delay across 3 endpoints.";
      const result = verifyAndScrubBulletMetrics({
        bullet,
        sourceText: groundTruth,
      });

      expect(result.isGrounded).toBe(true);
      expect(result.hadHallucination).toBe(false);
      expect(result.groundedNumbers).toContain("150");
      expect(result.groundedNumbers).toContain("3");
      expect(result.bullet).toBe(bullet);
    });

    it("preserves grounded percentages substantiated by source text", () => {
      const bullet =
        "Orchestrated deployments across 12 markets, maintaining an average 143% quota ratio.";
      const result = verifyAndScrubBulletMetrics({
        bullet,
        sourceText: groundTruth,
      });

      expect(result.isGrounded).toBe(true);
      expect(result.bullet).toContain("143%");
    });

    it("identifies and strips ungrounded synthetic percentage claims cleanly", () => {
      const hallucinatedBullet =
        "Optimized game engine performance by 35% efficiency by synchronizing game state updates.";
      const result = verifyAndScrubBulletMetrics({
        bullet: hallucinatedBullet,
        sourceText: groundTruth,
      });

      expect(result.hadHallucination).toBe(true);
      // The fake percentage gain clause "by 35% efficiency" is stripped, preserving the core technical action
      expect(result.bullet).toBe(
        "Optimized game engine performance by synchronizing game state updates."
      );
    });

    it("does not strip valid qualitative bullet without numbers", () => {
      const qualitativeBullet =
        "Architected multi-tenant data isolation utilizing PostgreSQL, Prisma, and AES-256-GCM symmetric encryption.";
      const result = verifyAndScrubBulletMetrics({
        bullet: qualitativeBullet,
        sourceText: groundTruth,
      });

      // 256 from AES-256 is an algorithm parameter; if not in doc, result reports hadHallucination, but bullet text is preserved
      expect(result.bullet).toBe(qualitativeBullet);
    });
  });

  describe("SSOT Extensibility & Category Taxonomy", () => {
    it("exports all universal metric dimensions from METRIC_UNIT_GROUPS", () => {
      expect(METRIC_UNIT_GROUPS.TIME).toContain("ms");
      expect(METRIC_UNIT_GROUPS.RATES).toContain("%");
      expect(METRIC_UNIT_GROUPS.DATA_CAPACITY).toContain("mb");
      expect(METRIC_UNIT_GROUPS.GEOMETRY_BOUNDS).toContain("grid");
      expect(METRIC_UNIT_GROUPS.SYSTEM_COUNT).toContain("endpoints?");
      expect(METRIC_UNIT_GROUPS.PHYSICAL_ENGINEERING).toContain("v");
    });
  });
});
