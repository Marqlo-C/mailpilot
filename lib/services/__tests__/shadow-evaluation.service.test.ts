import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  shouldRunShadowEvaluation,
  executeShadowEvaluation,
  dispatchShadowEvaluation,
  clearShadowProfileCache,
} from "../shadow-evaluation.service";
import { parseAccountRules, type AccountRules } from "@/lib/validations/rules.schema";
import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import * as aiModule from "@/lib/ai";
import * as profileModule from "@/lib/profile/master-profile";
import * as loggingModule from "@/lib/logging";

describe("Shadow Evaluation Service", () => {
  const originalEnv = { ...process.env };

  const sampleRules: AccountRules = parseAccountRules({
    embeddingProvider: "local_ollama",
    embeddingModel: "nomic-embed-text",
    enableShadowEmbeddings: true,
    crossoverScoreThreshold: 60,
  });

  const sampleProfile: MasterProfileInput = {
    fullName: "Alex Taylor",
    email: "alex@example.com",
    location: "Chicago, IL",
    summary: "Versatile operational leader with track record of team excellence.",
    links: [],
    skills: [
      {
        label: "Operational Leadership",
        parentCategory: null,
        items: [
          { name: "Crisis Triage", proficiency: null },
          { name: "Resource Orchestration", proficiency: null },
          { name: "Process Governance", proficiency: null },
        ],
      },
    ],
    experiences: [
      {
        id: "exp_1",
        company: "Metro Emergency Hospital",
        role: "Triage Operations Lead",
        location: "Chicago, IL",
        category: "Operations",
        startDate: "2020-01",
        endDate: "Present",
        displayOrder: 1,
        bullets: [
          {
            id: "b_1",
            rawText: "Coordinated cross-functional response during high-volume incidents.",
            technologies: [],
            hasMetric: false,
          },
          {
            id: "b_2",
            rawText: "Orchestrated critical resource allocation under stringent timelines.",
            technologies: [],
            hasMetric: false,
          },
        ],
      },
    ],
    projects: [],
    education: [
      {
        id: "edu_1",
        institution: "State University",
        degree: "Bachelor of Science",
        fieldOfStudy: "Operations Management",
        startDate: "2015",
        graduationDate: "2019",
        status: "GRADUATED",
        honors: [],
        coursework: [],
      },
    ],
    certifications: [],
    awards: [],
    interests: [],
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearShadowProfileCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
    clearShadowProfileCache();
    vi.restoreAllMocks();
  });

  describe("shouldRunShadowEvaluation", () => {
    it("returns false when rules is undefined or null", () => {
      expect(shouldRunShadowEvaluation(undefined)).toBe(false);
      expect(shouldRunShadowEvaluation(null)).toBe(false);
    });

    it("returns false when embeddingProvider is 'disabled'", () => {
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          embeddingProvider: "disabled",
          enableShadowEmbeddings: true,
        })
      ).toBe(false);
    });

    it("auto-infers local_ollama when bridgeConnected is true even if provider was disabled", () => {
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          embeddingProvider: "disabled",
          bridgeConnected: true,
          enableShadowEmbeddings: true,
        })
      ).toBe(true);
    });

    it("auto-infers local_ollama in development mode even if provider was disabled", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          embeddingProvider: "disabled",
          enableShadowEmbeddings: true,
        })
      ).toBe(true);
    });

    it("returns false when enableShadowEmbeddings is false", () => {
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          embeddingProvider: "local_ollama",
          enableShadowEmbeddings: false,
        })
      ).toBe(false);
    });

    it("returns true when embeddingProvider is active and enableShadowEmbeddings is true", () => {
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          embeddingProvider: "local_ollama",
          enableShadowEmbeddings: true,
        })
      ).toBe(true);

      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          embeddingProvider: "openai",
          enableShadowEmbeddings: true,
        })
      ).toBe(true);
    });

    it("respects shadow_evaluation feature flag override", () => {
      // Explicit flag false overrides legacy enableShadowEmbeddings: true
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          enableShadowEmbeddings: true,
          featureFlags: { shadow_evaluation: false },
        })
      ).toBe(false);

      // Explicit flag true overrides legacy enableShadowEmbeddings: false
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          enableShadowEmbeddings: false,
          featureFlags: { shadow_evaluation: true },
        })
      ).toBe(true);
    });

    it("operates independently of embedded_ai primary engine flag while respecting emergency kill-switches", () => {
      // Primary engine embedded_ai being false does NOT suppress shadow evaluation
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          enableShadowEmbeddings: true,
          featureFlags: { embedded_ai: false },
        })
      ).toBe(true);

      // Primary engine scoringEngine = "heuristic" does NOT suppress shadow evaluation
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          scoringEngine: "heuristic",
          enableShadowEmbeddings: true,
        })
      ).toBe(true);

      // Both scoringEngine = "heuristic" AND featureFlags.embedded_ai = false do NOT suppress shadow evaluation
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          scoringEngine: "heuristic",
          enableShadowEmbeddings: true,
          featureFlags: { embedded_ai: false, shadow_evaluation: true },
        })
      ).toBe(true);

      // Emergency kill-switch for shadow evaluation halts execution
      process.env.DISABLE_FEATURE_SHADOW_EVALUATION = "true";
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          enableShadowEmbeddings: true,
        })
      ).toBe(false);
      delete process.env.DISABLE_FEATURE_SHADOW_EVALUATION;

      // Emergency kill-switch for embedded AI halts execution
      process.env.DISABLE_FEATURE_EMBEDDED_AI = "true";
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          enableShadowEmbeddings: true,
        })
      ).toBe(false);
      delete process.env.DISABLE_FEATURE_EMBEDDED_AI;
    });

    it("stops execution via DISABLE_FEATURE_EMBEDDED_AI even when dev auto-inference would activate", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DISABLE_FEATURE_EMBEDDED_AI", "true");
      expect(
        shouldRunShadowEvaluation({
          ...sampleRules,
          embeddingProvider: "disabled",
          enableShadowEmbeddings: true,
        })
      ).toBe(false);
    });
  });

  describe("executeShadowEvaluation", () => {
    it("returns null early when shadow evaluation is not enabled", async () => {
      const result = await executeShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_1",
          title: "Incident Commander",
          company: "Apex Tech",
          matchScore: 65,
        },
        rules: {
          ...sampleRules,
          enableShadowEmbeddings: false,
        },
      });

      expect(result).toBeNull();
    });

    it("logs actionable dev notice when resolveEmbeddingConfig returns null or disabled in development mode", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(aiModule, "resolveEmbeddingConfig").mockReturnValueOnce(null);

      const result = await executeShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_unresolvable",
          title: "Support Lead",
          company: "Gamma Corp",
          matchScore: 70,
        },
        rules: sampleRules,
      });

      expect(result).toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "[Shadow Evaluation Dev Skip] Provider configuration unresolvable or disabled"
        )
      );
    });

    it("executes crossover evaluation and emits telemetry", async () => {
      const telemetrySpy = vi
        .spyOn(loggingModule, "logShadowEvaluationTelemetry")
        .mockImplementation(() => {});

      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValue({
        crossoverScore: 82,
        transferableSkills: [
          {
            targetRequirement: "Incident triage and coordination",
            sourceExperienceId: "exp_1",
            verbatimAnchorText:
              "Coordinated cross-functional response during high-volume incidents.",
            similarity: 0.88,
            transferRationale:
              "Direct cross-functional emergency triage transfers to technical incident resolution.",
          },
        ],
        providerUsed: "local_ollama",
        latencyMs: 120,
      });

      const initialOpportunity = {
        id: "opp_1",
        title: "Site Reliability Coordinator",
        company: "Apex Cloud",
        description:
          "Responsibilities:\n* Coordinate cross-functional incident response\n* Triage system alarms",
        matchScore: 65,
      };

      const result = await executeShadowEvaluation({
        accountId: "acc_1",
        opportunity: initialOpportunity,
        rules: sampleRules,
        profile: sampleProfile,
      });

      expect(result).not.toBeNull();
      expect(result?.crossoverScore).toBe(82);
      expect(result?.transferableSkills).toHaveLength(1);

      // Verify non-destructive invariant: opportunity's input score was NOT changed
      expect(initialOpportunity.matchScore).toBe(65);

      // Verify telemetry logged with exact metrics
      expect(telemetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunityId: "opp_1",
          title: "Site Reliability Coordinator",
          company: "Apex Cloud",
          heuristicScore: 65,
          crossoverScore: 82,
          transferableSkillsCount: 1,
          provider: "local_ollama",
          model: "nomic-embed-text",
        })
      );
    });

    it("loads candidate profile from master-profile service when not pre-provided", async () => {
      const profileSpy = vi
        .spyOn(profileModule, "loadMasterProfileForDraft")
        .mockResolvedValue({
          ...sampleProfile,
          accountId: "acc_db",
          fullName: "Alex DB",
        } as unknown as Awaited<
          ReturnType<typeof profileModule.loadMasterProfileForDraft>
        >);

      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValue({
        crossoverScore: 78,
        transferableSkills: [],
        providerUsed: "local_ollama",
        latencyMs: 90,
      });

      const result = await executeShadowEvaluation({
        accountId: "acc_db",
        opportunity: {
          id: "opp_2",
          title: "Operations Manager",
          company: "Omega Corp",
          matchScore: 70,
        },
        rules: sampleRules,
      });

      expect(profileSpy).toHaveBeenCalledWith("acc_db");
      expect(result?.crossoverScore).toBe(78);
    });

    it("fails silently and emits error telemetry when profile is missing", async () => {
      vi.spyOn(profileModule, "loadMasterProfileForDraft").mockRejectedValue(
        new Error("Profile not found")
      );
      const telemetrySpy = vi
        .spyOn(loggingModule, "logShadowEvaluationTelemetry")
        .mockImplementation(() => {});

      const result = await executeShadowEvaluation({
        accountId: "acc_missing",
        opportunity: {
          id: "opp_3",
          title: "Operations Manager",
          company: "Omega Corp",
          matchScore: 60,
        },
        rules: sampleRules,
      });

      expect(result).toBeNull();
      expect(telemetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunityId: "opp_3",
          error: "Candidate profile not found or empty",
          crossoverScore: 0,
        })
      );
    });

    it("fails silently without throwing when embedding evaluation throws a network timeout", async () => {
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockRejectedValue(
        new Error("Connection timeout to Ollama endpoint (5000ms)")
      );

      const telemetrySpy = vi
        .spyOn(loggingModule, "logShadowEvaluationTelemetry")
        .mockImplementation(() => {});

      // Must NOT throw
      const result = await executeShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_4",
          title: "Operations Manager",
          company: "Omega Corp",
          matchScore: 55,
        },
        rules: sampleRules,
        profile: sampleProfile,
      });

      expect(result).toBeNull();
      expect(telemetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunityId: "opp_4",
          heuristicScore: 55,
          crossoverScore: 0,
          error: "Connection timeout to Ollama endpoint (5000ms)",
        })
      );
    });
  });

  describe("dispatchShadowEvaluation", () => {
    it("returns null immediately when shadow mode is disabled", async () => {
      const result = await dispatchShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_5",
          title: "DevOps Engineer",
          company: "Alpha Inc",
          matchScore: 80,
        },
        rules: {
          ...sampleRules,
          enableShadowEmbeddings: false,
        },
      });

      expect(result).toBeNull();
    });

    it("logs actionable dev skip notice when shadow evaluation is skipped in development mode", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await dispatchShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_skip_dev",
          title: "Support Lead",
          company: "Gamma Corp",
          matchScore: 70,
        },
        rules: {
          ...sampleRules,
          enableShadowEmbeddings: false,
          featureFlags: { shadow_evaluation: false },
        },
      });

      expect(result).toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        "[Shadow Evaluation Dev Skip] Provider: 'local_ollama', shadow_evaluation: false, KillSwitch: false"
      );
    });

    it("logs actionable dev skip notice including active kill-switch in development mode", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DISABLE_FEATURE_SHADOW_EVALUATION", "true");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await dispatchShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_kill_dev",
          title: "Support Lead",
          company: "Gamma Corp",
          matchScore: 70,
        },
        rules: sampleRules,
      });

      expect(result).toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[Shadow Evaluation Dev Skip\] Provider: 'local_ollama', shadow_evaluation: false, KillSwitch: true/
        )
      );
    });

    it("throttles and deduplicates consecutive dev skip notices during the same sync window", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const params = {
        accountId: "acc_dedupe_test",
        opportunity: {
          id: "opp_1",
          title: "Role 1",
          company: "Company 1",
          matchScore: 70,
        },
        rules: {
          ...sampleRules,
          enableShadowEmbeddings: false,
          featureFlags: { shadow_evaluation: false },
        },
      };

      // Call 5 times consecutively (simulating multiple opportunities in a single digest email)
      for (let i = 0; i < 5; i++) {
        await dispatchShadowEvaluation({
          ...params,
          opportunity: { ...params.opportunity, id: `opp_${i}` },
        });
      }

      // Should only log once instead of spamming 5 times
      const devSkipCalls = logSpy.mock.calls.filter(
        (c) => typeof c[0] === "string" && c[0].includes("[Shadow Evaluation Dev Skip]")
      );
      expect(devSkipCalls.length).toBe(1);
    });

    it("dispatches and completes evaluation via promise fallback when outside Next.js request context", async () => {
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValue({
        crossoverScore: 90,
        transferableSkills: [],
        providerUsed: "local_ollama",
        latencyMs: 75,
      });

      const result = await dispatchShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_6",
          title: "Lead Analyst",
          company: "Data Corp",
          matchScore: 75,
        },
        rules: sampleRules,
        profile: sampleProfile,
      });

      expect(result).not.toBeNull();
      expect(result?.crossoverScore).toBe(90);
    });

    it("runs synchronously and returns execution promise directly in development mode", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValue({
        crossoverScore: 95,
        transferableSkills: [],
        providerUsed: "local_ollama",
        latencyMs: 50,
      });

      const result = await dispatchShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_dev_1",
          title: "Staff Engineer",
          company: "Beta Inc",
          matchScore: 85,
        },
        rules: sampleRules,
        profile: sampleProfile,
      });

      expect(result).not.toBeNull();
      expect(result?.crossoverScore).toBe(95);
    });

    it("surfaces evaluation errors via console.error in development mode", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Force an error inside executeShadowEvaluation by causing resolveCandidateProfile to fail abnormally
      vi.spyOn(profileModule, "loadMasterProfileForDraft").mockImplementationOnce(() => {
        throw new Error("Unexpected crash during profile resolution");
      });

      // Cause logShadowEvaluationTelemetry to throw unconditionally so executeShadowEvaluation rejects
      vi.spyOn(loggingModule, "logShadowEvaluationTelemetry").mockImplementation(() => {
        throw new Error("Unexpected logger fault");
      });

      const result = await dispatchShadowEvaluation({
        accountId: "acc_1",
        opportunity: {
          id: "opp_dev_err",
          title: "Staff Engineer",
          company: "Beta Inc",
          matchScore: 85,
        },
        rules: sampleRules,
      });

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Shadow Evaluation Dev Error]",
        expect.any(Error)
      );
    });
  });
});
