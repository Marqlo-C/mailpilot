import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveOpportunityMatch } from "../resolver";
import { evaluateOpportunityMatch } from "../evaluator";
import { extractMatchCandidateLens } from "../lens";
import { resolveJobOpportunity } from "@/lib/opportunities/context";
import {
  getEmptyMasterProfileData,
  type MasterProfileInput,
} from "@/lib/validations/profile.schema";
import type { CandidatePersona } from "@/lib/persona";
import * as aiModule from "@/lib/ai";

describe("Opportunity Matching Resolver & Cutover Engine (Phase 5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Universal fixture: candidate with verified background
  const mockProfile: MasterProfileInput = {
    ...getEmptyMasterProfileData(),
    fullName: "Morgan Taylor",
    email: "morgan@example.com",
    experiences: [
      {
        id: "exp-ops-1",
        role: "Facilities Operations Lead",
        company: "Apex Logistics",
        location: null,
        category: "Work",
        startDate: "2019-03",
        endDate: null,
        bullets: [
          {
            id: "b-ops-1",
            rawText:
              "Coordinated incident containment procedures and scheduled daily preventative maintenance across 12 facilities.",
            hasMetric: true,
            technologies: [],
          },
        ],
        displayOrder: 0,
      },
    ],
    skills: [
      {
        label: "Operations",
        parentCategory: null,
        items: [
          { name: "Incident Containment", proficiency: null },
          { name: "Preventative Maintenance", proficiency: null },
          { name: "Shift Scheduling", proficiency: null },
        ],
      },
    ],
    summary:
      "Operational leader with 6+ years orchestrating safety and facility readiness.",
  };

  const mockPersona: CandidatePersona = {
    archetype: "Applied Practitioner / Skill-Certified",
    seniorityTier: "Senior / Lead Professional",
    leadershipScope: "Project / Team Lead",
    distinctionAnchor: "None / Production Tenure",
    inFieldYears: 6,
    calendarYears: 6,
    titleFamily: "Operations",
    timelineContext: "6 years in Operations",
    toneGuidance: "Direct and procedural",
  };

  const candidateLens = extractMatchCandidateLens(mockProfile, mockPersona);

  const mockOpportunity = resolveJobOpportunity({
    company: "Vanguard Systems",
    title: "Regional Facilities Operations Manager",
    description: `
### Key Requirements & Qualifications
- Demonstrated expertise in Incident Containment and multi-site safety protocols
- Direct Preventative Maintenance programs across regional fulfillment centers
- Orchestrate cross-departmental Shift Scheduling and rapid resource deployment
- 5+ years of verified facilities management or operational leadership experience
`,
    salary: "$110,000 - $135,000",
  });

  describe("1. Heuristic Scoring (Default Mode)", () => {
    it("defaults to heuristic scoring when scoringEngine is not explicitly specified in rules", async () => {
      const result = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        profile: mockProfile,
        rules: {},
      });

      expect(result.scoringEngineRequested).toBe("heuristic");
      expect(result.scoringEngineUsed).toBe("heuristic");
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.tier).toBeDefined();
      expect(result.matchedSkills).toContain("Incident Containment");
      expect(result.fallbackReason).toBeUndefined();
    });

    it("matches evaluateOpportunityMatch exactly when scoringEngine is 'heuristic'", async () => {
      const heuristicDirect = evaluateOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        mode: "HEURISTIC",
      });

      const resolverResult = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        profile: mockProfile,
        rules: { scoringEngine: "heuristic" },
      });

      expect(resolverResult.score).toBe(heuristicDirect.score);
      expect(resolverResult.tier).toBe(heuristicDirect.tier);
      expect(resolverResult.reason).toBe(heuristicDirect.reason);
      expect(resolverResult.scoringEngineUsed).toBe("heuristic");
    });
  });

  describe("2. Embedded Primary Scoring Cutover", () => {
    it("uses vector crossoverScore as primary matchScore when scoringEngine is 'embedded'", async () => {
      // Mock vector crossover engine to simulate high semantic crossover score
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValueOnce({
        crossoverScore: 88,
        transferableSkills: [
          {
            targetRequirement: "Lead emergency incident containment",
            sourceExperienceId: "exp-ops-1",
            verbatimAnchorText: "Coordinated incident containment procedures",
            similarity: 0.91,
            transferRationale:
              "Direct procedural transferability between containment duties",
          },
        ],
        providerUsed: "local_ollama",
        latencyMs: 140,
      });

      const result = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        profile: mockProfile,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "local_ollama",
          embeddingModel: "nomic-embed-text",
        },
      });

      expect(result.scoringEngineRequested).toBe("embedded");
      expect(result.scoringEngineUsed).toBe("embedded");
      expect(result.score).toBe(88);
      expect(result.tier).toBe("HIGH");
      expect(result.reason).toContain("Semantic vector alignment (88%)");
      expect(result.reason).toContain("Lead emergency incident containment");
      expect(result.crossoverResult?.crossoverScore).toBe(88);
      expect(result.fallbackReason).toBeUndefined();
    });

    it("uses vector crossoverScore when featureFlags.embedded_ai is explicitly enabled", async () => {
      const crossoverSpy = vi
        .spyOn(aiModule, "evaluateSemanticCrossover")
        .mockResolvedValueOnce({
          crossoverScore: 88,
          transferableSkills: [
            {
              targetRequirement: "Incident containment",
              sourceExperienceId: "exp_1",
              verbatimAnchorText: "Incident Containment",
              similarity: 0.92,
              transferRationale: "Functional alignment",
            },
          ],
          providerUsed: "local_ollama",
          latencyMs: 45,
        });

      const result = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        profile: mockProfile,
        rules: {
          embeddingProvider: "local_ollama",
          featureFlags: { embedded_ai: true },
        },
      });

      expect(result.scoringEngineRequested).toBe("embedded");
      expect(result.scoringEngineUsed).toBe("embedded");
      expect(result.score).toBe(88);
    });

    it("synthesizes profile from candidateLens when full profile is not provided", async () => {
      const crossoverSpy = vi
        .spyOn(aiModule, "evaluateSemanticCrossover")
        .mockResolvedValueOnce({
          crossoverScore: 82,
          transferableSkills: [],
          providerUsed: "openai",
          latencyMs: 110,
        });

      const result = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "openai",
          embeddingModel: "text-embedding-3-small",
        },
        config: {
          provider: "openai",
          model: "text-embedding-3-small",
          apiKey: "test-sk",
        },
      });

      expect(result.scoringEngineUsed).toBe("embedded");
      expect(result.score).toBe(82);
      expect(crossoverSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Hybrid 50/50 Blended Scoring", () => {
    it("blends heuristic and embedded scores (50/50) when scoringEngine is 'hybrid'", async () => {
      const heuristicDirect = evaluateOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        mode: "HEURISTIC",
      });

      const mockCrossoverScore = 90;
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValueOnce({
        crossoverScore: mockCrossoverScore,
        transferableSkills: [],
        providerUsed: "gemini",
        latencyMs: 95,
      });

      const expectedBlended = Math.round(
        heuristicDirect.score * 0.5 + mockCrossoverScore * 0.5
      );

      const result = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        profile: mockProfile,
        rules: {
          scoringEngine: "hybrid",
          embeddingProvider: "gemini",
          embeddingModel: "text-embedding-004",
        },
        config: {
          provider: "gemini",
          model: "text-embedding-004",
          apiKey: "test-gemini-key",
        },
      });

      expect(result.scoringEngineRequested).toBe("hybrid");
      expect(result.scoringEngineUsed).toBe("hybrid");
      expect(result.score).toBe(expectedBlended);
      expect(result.reason).toContain("Hybrid evaluation");
      expect(result.reason).toContain(`${heuristicDirect.score}%`);
      expect(result.reason).toContain(`${mockCrossoverScore}%`);
      expect(result.fallbackReason).toBeUndefined();
    });
  });

  describe("4. Resilient Fallback Defense", () => {
    it("falls back to heuristic scoring when embeddingProvider is disabled", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const heuristicDirect = evaluateOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        mode: "HEURISTIC",
      });

      const result = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        profile: mockProfile,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "disabled",
        },
      });

      expect(result.scoringEngineRequested).toBe("embedded");
      expect(result.scoringEngineUsed).toBe("heuristic");
      expect(result.score).toBe(heuristicDirect.score);
      expect(result.fallbackReason).toContain("disabled");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[matching-resolver]")
      );
    });

    it("falls back to heuristic scoring when embedding provider returns an error (e.g. offline Ollama)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const heuristicDirect = evaluateOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        mode: "HEURISTIC",
      });

      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValueOnce({
        crossoverScore: 0,
        transferableSkills: [],
        providerUsed: "local_ollama",
        latencyMs: 25,
        error: "Failed to generate embeddings from provider",
      });

      const result = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        profile: mockProfile,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "local_ollama",
        },
      });

      expect(result.scoringEngineRequested).toBe("embedded");
      expect(result.scoringEngineUsed).toBe("heuristic");
      expect(result.score).toBe(heuristicDirect.score);
      expect(result.fallbackReason).toBe(
        "Failed to generate embeddings from provider"
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to generate embeddings")
      );
    });

    it("falls back to heuristic scoring on timeout or thrown exception in hybrid mode", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const heuristicDirect = evaluateOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        mode: "HEURISTIC",
      });

      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockRejectedValueOnce(
        new Error("Connection to Ollama timed out after 5500ms")
      );

      const result = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        profile: mockProfile,
        rules: {
          scoringEngine: "hybrid",
          embeddingProvider: "local_ollama",
        },
        config: {
          provider: "local_ollama",
          model: "nomic-embed-text",
        },
      });

      expect(result.scoringEngineRequested).toBe("hybrid");
      expect(result.scoringEngineUsed).toBe("heuristic");
      expect(result.score).toBe(heuristicDirect.score);
      expect(result.fallbackReason).toContain("timed out");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unexpected error in vector scoring")
      );
    });
  });

  describe("5. Dynamic Engine Switching & Non-Tech Career Neutrality", () => {
    it("dynamically switches scoring mechanism across settings toggles without crashing", async () => {
      // Step A: Heuristic
      const heuristicRun = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        rules: { scoringEngine: "heuristic" },
      });
      expect(heuristicRun.scoringEngineUsed).toBe("heuristic");

      // Step B: Embedded (with mock)
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValueOnce({
        crossoverScore: 85,
        transferableSkills: [],
        providerUsed: "jina",
        latencyMs: 120,
      });

      const embeddedRun = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "jina",
        },
        config: {
          provider: "jina",
          model: "jina-embeddings-v3",
          apiKey: "jina-test-key",
        },
      });
      expect(embeddedRun.scoringEngineUsed).toBe("embedded");
      expect(embeddedRun.score).toBe(85);

      // Step C: Hybrid (with mock)
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValueOnce({
        crossoverScore: 75,
        transferableSkills: [],
        providerUsed: "jina",
        latencyMs: 115,
      });

      const hybridRun = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        rules: {
          scoringEngine: "hybrid",
          embeddingProvider: "jina",
        },
        config: {
          provider: "jina",
          model: "jina-embeddings-v3",
          apiKey: "jina-test-key",
        },
      });
      expect(hybridRun.scoringEngineUsed).toBe("hybrid");
      expect(hybridRun.score).toBe(
        Math.round(heuristicRun.score * 0.5 + 75 * 0.5)
      );

      // Step D: Dynamic toggle back to heuristic
      const revertedRun = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: candidateLens,
        rules: { scoringEngine: "heuristic" },
      });
      expect(revertedRun.scoringEngineUsed).toBe("heuristic");
      expect(revertedRun.score).toBe(heuristicRun.score);
    });

    it("evaluates a clinical healthcare candidate fixture neutrally across all engines", async () => {
      const nurseProfile: MasterProfileInput = {
        ...getEmptyMasterProfileData(),
        fullName: "Sarah Chen, RN",
        email: "sarah@example.com",
        experiences: [
          {
            id: "exp-nurse-1",
            role: "Intensive Care Unit Staff Nurse",
            company: "Valley General Hospital",
            location: null,
            category: "Work",
            startDate: "2018-06",
            endDate: null,
            bullets: [
              {
                id: "b-nurse-1",
                rawText:
                  "Managed rapid triage, continuous vital monitoring, and medication titration protocols in high-acuity trauma care unit.",
                hasMetric: false,
                technologies: [],
              },
            ],
            displayOrder: 0,
          },
        ],
        skills: [
          {
            label: "Clinical",
            parentCategory: null,
            items: [
              { name: "Trauma Care", proficiency: null },
              { name: "Medication Titration", proficiency: null },
              { name: "Triage Protocol", proficiency: null },
            ],
          },
        ],
        summary:
          "Experienced critical care registered nurse specializing in trauma triage and patient stabilization.",
      };

      const nursePersona: CandidatePersona = {
        archetype: "Applied Practitioner / Skill-Certified",
        seniorityTier: "Senior / Lead Professional",
        leadershipScope: "Project / Team Lead",
        distinctionAnchor: "None / Production Tenure",
        inFieldYears: 7,
        calendarYears: 7,
        titleFamily: "Nursing & Healthcare",
        timelineContext: "7 years in Critical Care Nursing",
        toneGuidance: "Clinical and objective",
      };

      const nurseLens = extractMatchCandidateLens(nurseProfile, nursePersona);

      const clinicalOpp = resolveJobOpportunity({
        company: "St. Jude Regional Medical",
        title: "Clinical Nurse Specialist - Critical Care",
        description: `
Requirements:
- Coordinate rapid emergency triage and medication titration in intensive care
- Oversee continuous patient vital monitoring and clinical quality audits
`,
      });

      // 1. Heuristic evaluation
      const heuristicRun = await resolveOpportunityMatch({
        opportunity: clinicalOpp,
        candidate: nurseLens,
        profile: nurseProfile,
        rules: { scoringEngine: "heuristic" },
      });
      expect(heuristicRun.score).toBeGreaterThanOrEqual(60);
      expect(heuristicRun.scoringEngineUsed).toBe("heuristic");

      // 2. Embedded evaluation
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValueOnce({
        crossoverScore: 92,
        transferableSkills: [
          {
            targetRequirement: "Coordinate rapid emergency triage",
            sourceExperienceId: "exp-nurse-1",
            verbatimAnchorText: "Managed rapid triage",
            similarity: 0.94,
            transferRationale: "Direct clinical competency correspondence",
          },
        ],
        providerUsed: "local_ollama",
        latencyMs: 130,
      });

      const embeddedRun = await resolveOpportunityMatch({
        opportunity: clinicalOpp,
        candidate: nurseLens,
        profile: nurseProfile,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "local_ollama",
        },
      });
      expect(embeddedRun.score).toBe(92);
      expect(embeddedRun.scoringEngineUsed).toBe("embedded");
      expect(embeddedRun.reason).toContain("Coordinate rapid emergency triage");
    });
  });
});
