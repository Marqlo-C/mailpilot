import { describe, expect, it, vi } from "vitest";
import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import type { NormalizedJobOpportunity } from "@/lib/opportunities/context/context.schema";
import {
  calculateCrossoverScore,
  computePairwiseSimilarityMatrix,
  evaluateSemanticCrossover,
  extractJobRequirements,
} from "../semantic-crossover";
import * as embeddingRegistry from "../embedding-registry";

describe("Semantic Crossover Evaluation Engine", () => {
  describe("extractJobRequirements", () => {
    it("extracts markdown bullet items from a job description", () => {
      const jobDescription = `
### About the Role
We are seeking an Operations Lead to join our logistics organization.

### Key Responsibilities
- Coordinate emergency incident resolution across field fulfillment units
- Conduct weekly compliance audits for equipment and safety regulations
- Manage cross-functional shift scheduling and resource allocation
- Equal Opportunity Employer. We celebrate diversity and are committed to creating an inclusive environment.
`;

      const requirements = extractJobRequirements({
        roleTitle: "Operations Lead",
        jobDescription,
      });

      expect(requirements).toHaveLength(3);
      expect(requirements[0]).toBe(
        "Coordinate emergency incident resolution across field fulfillment units"
      );
      expect(requirements[1]).toBe(
        "Conduct weekly compliance audits for equipment and safety regulations"
      );
      expect(requirements[2]).toBe(
        "Manage cross-functional shift scheduling and resource allocation"
      );
      // EEO boilerplate is filtered out
      expect(
        requirements.some((r) => r.toLowerCase().includes("equal opportunity"))
      ).toBe(false);
    });

    it("falls back to sentence-level segmentation when no bullet markers exist", () => {
      const rawText =
        "The Candidate will lead regional site compliance inspection tours. They must orchestrate hazardous material inventory reporting to government authorities. Successful candidates will manage multi-tiered emergency response protocols under high stress.";

      const requirements = extractJobRequirements(rawText);

      expect(requirements.length).toBeGreaterThanOrEqual(2);
      expect(requirements[0]).toContain("lead regional site compliance");
      expect(requirements[1]).toContain("orchestrate hazardous material");
    });

    it("falls back to role title when description is empty", () => {
      const requirements = extractJobRequirements({
        roleTitle: "Facilities Safety Supervisor",
        jobDescription: "",
      });

      expect(requirements).toHaveLength(1);
      expect(requirements[0]).toBe(
        "Core responsibilities and duties for Facilities Safety Supervisor"
      );
    });
  });

  describe("computePairwiseSimilarityMatrix", () => {
    it("computes an M x N cosine similarity matrix", () => {
      const reqEmbeddings = [
        [1, 0, 0],
        [0, 1, 0],
      ];
      const accEmbeddings = [
        [1, 0, 0], // exact match with req 0
        [0, 1, 0], // exact match with req 1
        [0, 0, 1], // orthogonal to both
      ];

      const matrix = computePairwiseSimilarityMatrix(
        reqEmbeddings,
        accEmbeddings
      );

      expect(matrix).toHaveLength(2);
      expect(matrix[0]).toHaveLength(3);
      expect(matrix[0][0]).toBeCloseTo(1.0, 3);
      expect(matrix[0][1]).toBeCloseTo(0.0, 3);
      expect(matrix[1][1]).toBeCloseTo(1.0, 3);
      expect(matrix[1][2]).toBeCloseTo(0.0, 3);
    });
  });

  describe("calculateCrossoverScore", () => {
    it("returns 0 for empty similarity matrix", () => {
      expect(calculateCrossoverScore([])).toBe(0);
      expect(calculateCrossoverScore([[]])).toBe(0);
    });

    it("calculates high normalized score (>= 85) for strong semantic overlap (>= 0.75)", () => {
      // 3 requirements, all matching with ~0.78-0.85 similarity
      const matrix = [
        [0.82, 0.4, 0.3],
        [0.3, 0.79, 0.2],
        [0.25, 0.35, 0.85],
      ];

      const score = calculateCrossoverScore(matrix);
      expect(score).toBeGreaterThanOrEqual(85);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("calculates mid-tier score (50-70) for moderate semantic alignment (0.50 - 0.60)", () => {
      const matrix = [
        [0.55, 0.3],
        [0.2, 0.52],
      ];

      const score = calculateCrossoverScore(matrix);
      expect(score).toBeGreaterThanOrEqual(50);
      expect(score).toBeLessThanOrEqual(70);
    });

    it("returns low score (< 20) for ambient or noise-level similarity (<= 0.20)", () => {
      const matrix = [
        [0.15, 0.1],
        [0.08, 0.18],
      ];

      const score = calculateCrossoverScore(matrix);
      expect(score).toBeLessThan(20);
    });
  });

  describe("evaluateSemanticCrossover end-to-end", () => {
    it("returns zero score and disabled status if provider is disabled", async () => {
      const profile: MasterProfileInput = {
        fullName: "Taylor Morgan",
        email: "taylor@example.com",
        links: [],
        skills: [],
        experiences: [],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      };

      const result = await evaluateSemanticCrossover({
        opportunity: {
          roleTitle: "Logistics Analyst",
          jobDescription: "Sample description",
        },
        profile,
        rules: {
          embeddingProvider: "disabled",
        },
      });

      expect(result).toEqual({
        crossoverScore: 0,
        transferableSkills: [],
        providerUsed: "disabled",
        latencyMs: 0,
      });
    });

    it("handles cross-disciplinary career-switcher fixture (Automotive Technician to Quality Assurance Specialist)", async () => {
      const profile: MasterProfileInput = {
        fullName: "Devon Reed",
        email: "devon@example.com",
        summary:
          "Experienced lead diagnostics technician with deep expertise in root-cause failure analysis and process adherence.",
        links: [],
        skills: [],
        experiences: [
          {
            id: "exp-auto-1",
            company: "Precision Fleet Maintenance",
            role: "Master Diagnostic Technician",
            location: null,
            category: "Work",
            startDate: "2018-03",
            endDate: "2023-11",
            displayOrder: 0,
            bullets: [
              {
                id: "b-auto-1",
                rawText:
                  "Conducted systematic root-cause failure investigations on complex mechanical-electrical systems, reducing vehicle breakdown recalls by 42%.",
                hasMetric: true,
                technologies: [],
              },
              {
                id: "b-auto-2",
                rawText:
                  "Formulated standardized inspection checklists and safety compliance logs for apprentice technicians across 14 service bays.",
                hasMetric: true,
                technologies: [],
              },
            ],
          },
        ],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      };

      const opportunity: Partial<NormalizedJobOpportunity> = {
        roleTitle: "Quality Assurance Specialist",
        company: "Vanguard Manufacturing",
        jobDescription: `
### Role Description
We need a Quality Assurance Specialist to govern production standards and defect minimization.

### Responsibilities
- Perform detailed root-cause failure analysis on defective components
- Establish standard inspection audit checklists for assembly line procedures
`,
      };

      // Mock batch embeddings with synthetic vectors reflecting semantic alignment
      // Requirement 0 (root cause failure analysis) is near-identical to bullet 0
      // Requirement 1 (standard inspection audit checklists) is near-identical to bullet 1
      vi.spyOn(embeddingRegistry, "getBatchEmbeddings").mockResolvedValueOnce([
        // Requirements:
        [1, 0, 0, 0], // Req 0: root cause failure analysis
        [0, 1, 0, 0], // Req 1: standard inspection audit checklists
        // Candidate accomplishments:
        [0.92, 0.1, 0, 0], // Bullet 0: root-cause failure investigations (high similarity with req 0)
        [0.1, 0.88, 0, 0], // Bullet 1: standardized inspection checklists (high similarity with req 1)
      ]);

      const result = await evaluateSemanticCrossover({
        opportunity,
        profile,
        config: {
          provider: "openai",
          model: "text-embedding-3-small",
          apiKey: "test-mock-key",
        },
        options: {
          transferableThreshold: 0.6,
        },
      });

      expect(result.providerUsed).toBe("openai");
      expect(result.crossoverScore).toBeGreaterThanOrEqual(80);
      expect(result.transferableSkills.length).toBeGreaterThanOrEqual(1);

      // Verify transferable skill contents
      const firstSkill = result.transferableSkills[0];
      expect(firstSkill.sourceExperienceId).toBe("exp-auto-1");
      expect(firstSkill.similarity).toBeGreaterThanOrEqual(0.8);
      expect(firstSkill.transferRationale).toContain("Master Diagnostic Technician");
      expect(firstSkill.transferRationale).toContain("Precision Fleet Maintenance");

      // Verify 100% verbatim anchor guarantee:
      // The verbatimAnchorText MUST be a literal substring of the candidate bullet in the profile!
      const matchingBullet = profile.experiences[0].bullets[0] as {
        rawText: string;
      };
      expect(matchingBullet.rawText).toContain(firstSkill.verbatimAnchorText);
    });

    it("evaluates a non-tech candidate fixture (Executive Chef to Culinary Operations Director)", async () => {
      const profile: MasterProfileInput = {
        fullName: "Marcus Vance",
        email: "marcus@example.com",
        links: [],
        skills: [],
        experiences: [
          {
            id: "exp-chef-1",
            company: "Grand Harbor Hospitality",
            role: "Executive Head Chef",
            location: null,
            category: "Work",
            startDate: "2017-06",
            endDate: "2024-02",
            displayOrder: 0,
            bullets: [
              {
                id: "b-chef-1",
                rawText:
                  "Negotiated supplier purchase agreements and restructured procurement schedules, lowering ingredient waste by 28% across 3 venues.",
                hasMetric: true,
                technologies: [],
              },
            ],
          },
        ],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      };

      const opportunity: Partial<NormalizedJobOpportunity> = {
        roleTitle: "Regional Procurement & Inventory Director",
        jobDescription: `
### Key Duties
- Negotiate high-volume vendor procurement contracts and streamline raw material waste reduction
`,
      };

      vi.spyOn(embeddingRegistry, "getBatchEmbeddings").mockResolvedValueOnce([
        [0.85, 0.5, 0], // Req 0
        [0.88, 0.45, 0], // Bullet 0
      ]);

      const result = await evaluateSemanticCrossover({
        opportunity,
        profile,
        config: {
          provider: "local_ollama",
          model: "nomic-embed-text",
          baseUrl: "http://localhost:11434",
        },
      });

      expect(result.providerUsed).toBe("local_ollama");
      expect(result.crossoverScore).toBeGreaterThanOrEqual(75);
      expect(result.transferableSkills).toHaveLength(1);
      expect(result.transferableSkills[0].verbatimAnchorText).toContain(
        "Negotiated supplier purchase agreements"
      );
    });

    it("fails gracefully returning score 0 when the embedding provider returns null or fails", async () => {
      const profile: MasterProfileInput = {
        fullName: "Robin Quinn",
        email: "robin@example.com",
        links: [],
        skills: [],
        experiences: [
          {
            id: "exp-1",
            company: "Acme Corp",
            role: "Analyst",
            location: null,
            category: "Work",
            startDate: "2020-01",
            displayOrder: 0,
            bullets: [
              {
                id: "b-1",
                rawText: "Analyzed operational datasets to identify inefficiencies.",
                hasMetric: false,
                technologies: [],
              },
            ],
          },
        ],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      };

      // Mock provider failure (e.g. offline Ollama or rate limit)
      vi.spyOn(embeddingRegistry, "getBatchEmbeddings").mockResolvedValueOnce(
        null
      );

      const result = await evaluateSemanticCrossover({
        opportunity: {
          roleTitle: "Operations Analyst",
          jobDescription: "- Analyze dataset discrepancies",
        },
        profile,
        config: {
          provider: "local_ollama",
          model: "nomic-embed-text",
        },
      });

      expect(result.crossoverScore).toBe(0);
      expect(result.transferableSkills).toEqual([]);
      expect(result.providerUsed).toBe("local_ollama");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
