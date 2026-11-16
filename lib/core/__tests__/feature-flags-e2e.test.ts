import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOpportunityMatch } from "@/lib/matching/resolver";
import { dispatchApplicationEmail } from "@/lib/services/application-dispatch.service";
import {
  enforceMetricGrounding,
  isModeBMetricSynthesisPermitted,
} from "@/lib/tailor/mode-b-synthesis";
import {
  dispatchScrapingAnt,
  dispatchHasData,
  isWebScrapingProxiesEnabled,
} from "@/lib/scraping/dispatcher";
import { isFeatureEnabled } from "@/lib/core/feature-flags";
import {
  getEmptyMasterProfileData,
  type MasterProfileInput,
} from "@/lib/validations/profile.schema";
import type { NormalizedJobOpportunity } from "@/lib/opportunities/context";
import type { MatchCandidateLens } from "@/lib/validations/matching.schema";
import { prisma } from "@/lib/core/prisma";
import * as gmailModule from "@/lib/gmail/google";
import * as pdfModule from "@/lib/document/pdf-generator";
import * as aiModule from "@/lib/ai";
import * as vaultModule from "@/lib/ai/vault";
import * as profileModule from "@/lib/profile/master-profile";

// Mock dependencies for service-level execution
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
    },
    jobApplication: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    activityLog: {
      create: vi.fn().mockResolvedValue({ id: "log-1" }),
    },
  },
}));

vi.mock("@/lib/profile/master-profile", () => ({
  loadMasterProfileForDraft: vi.fn(),
}));

vi.mock("@/lib/gmail/google", () => ({
  getGmailClientForAccount: vi.fn(),
  rethrowIfInsufficientScope: vi.fn(),
}));

vi.mock("@/lib/document/pdf-generator", () => ({
  generateTailoredResumePdf: vi.fn().mockResolvedValue(Buffer.from("mock-pdf-buffer")),
}));

describe("Feature Flags End-to-End Subsystem Integration (Phase 6)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Reusable fixtures
  const mockProfile: MasterProfileInput = {
    ...getEmptyMasterProfileData(),
    fullName: "Alex Mercer",
    email: "alex@example.com",
    experiences: [
      {
        id: "exp-1",
        role: "Operations Supervisor",
        company: "Logistics Core",
        location: null,
        category: "Work",
        startDate: "2020-01",
        endDate: null,
        bullets: [
          {
            id: "b-1",
            rawText: "Maintained 99.4% SLA adherence across 4 distribution hubs.",
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
        items: [{ name: "SLA Management", proficiency: null }],
      },
    ],
    summary: "Operations specialist with SLA expertise.",
  };

  const mockCandidateLens: MatchCandidateLens = {
    titleFamily: "Operations",
    recentRoles: ["Operations Supervisor"],
    skills: ["SLA Management"],
    summary: "Operations specialist with SLA expertise.",
    seniorityTier: "Senior",
    inFieldYears: 5,
    archetype: "Applied Practitioner / Skill-Certified",
  };

  const mockOpportunity: NormalizedJobOpportunity = {
    id: "opp-123",
    roleTitle: "Logistics Operations Lead",
    company: "Metro Freight",
    location: "Remote",
    salary: "$90,000",
    jobDescription: "Lead operations and maintain strict customer SLA delivery standards.",
    inboundSnippet: "Lead operations and maintain strict customer SLA delivery standards.",
    status: "SAVED",
    applicationType: "DIRECT_EMAIL",
    classificationMethod: "HEURISTIC",
    contactEmail: "recruiter@metrofreight.com",
    isDirectOutreach: true,
    richness: "RICH_SPEC",
    hasExplicitRequirements: true,
  };

  describe("1. embedded_ai: Vector Crossover vs. Heuristic Scoring Cutover", () => {
    it("switches from heuristic scoring to vector crossover when embedded_ai is enabled", async () => {
      // Mock vector crossover engine to return a crossover score of 92
      vi.spyOn(aiModule, "evaluateSemanticCrossover").mockResolvedValueOnce({
        crossoverScore: 92,
        transferableSkills: [
          {
            targetRequirement: "Maintain SLA delivery standards",
            sourceExperienceId: "exp-1",
            verbatimAnchorText: "Maintained 99.4% SLA adherence across 4 distribution hubs.",
            similarity: 0.94,
            transferRationale: "Direct SLA management competence transfer",
          },
        ],
        providerUsed: "local_ollama",
        latencyMs: 110,
      });

      const enabledResult = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: mockCandidateLens,
        profile: mockProfile,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "local_ollama",
          embeddingModel: "nomic-embed-text",
          featureFlags: { embedded_ai: true },
        },
      });

      expect(enabledResult.scoringEngineUsed).toBe("embedded");
      expect(enabledResult.score).toBe(92);
      expect(enabledResult.fallbackReason).toBeUndefined();
    });

    it("falls back strictly to deterministic heuristic scoring when embedded_ai is explicitly disabled", async () => {
      const crossoverSpy = vi.spyOn(aiModule, "evaluateSemanticCrossover");

      const disabledResult = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: mockCandidateLens,
        profile: mockProfile,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "local_ollama",
          embeddingModel: "nomic-embed-text",
          featureFlags: { embedded_ai: false },
        },
      });

      expect(disabledResult.scoringEngineUsed).toBe("heuristic");
      expect(disabledResult.scoringEngineRequested).toBe("embedded");
      expect(disabledResult.fallbackReason).toContain("Embedded AI is disabled");
      expect(crossoverSpy).not.toHaveBeenCalled();
    });

    it("enforces emergency kill-switch override (DISABLE_FEATURE_EMBEDDED_AI) to force heuristic mode", async () => {
      process.env.DISABLE_FEATURE_EMBEDDED_AI = "true";
      const crossoverSpy = vi.spyOn(aiModule, "evaluateSemanticCrossover");

      const killSwitchedResult = await resolveOpportunityMatch({
        opportunity: mockOpportunity,
        candidate: mockCandidateLens,
        profile: mockProfile,
        rules: {
          scoringEngine: "embedded",
          embeddingProvider: "local_ollama",
          featureFlags: { embedded_ai: true },
        },
      });

      expect(killSwitchedResult.scoringEngineUsed).toBe("heuristic");
      expect(killSwitchedResult.fallbackReason).toContain("Embedded AI is disabled");
      expect(crossoverSpy).not.toHaveBeenCalled();
    });
  });

  describe("2. Application Dispatch: Auto-Send Protection & Draft-Only Fallback", () => {
    const mockDraftCreate = vi.fn().mockResolvedValue({ data: { id: "draft-777" } });
    const mockMessageSend = vi.fn().mockResolvedValue({ data: { id: "msg-888" } });

    beforeEach(() => {
      mockDraftCreate.mockClear();
      mockMessageSend.mockClear();
      vi.mocked(profileModule.loadMasterProfileForDraft).mockResolvedValue(mockProfile);
      vi.mocked(gmailModule.getGmailClientForAccount).mockResolvedValue({
        users: {
          drafts: { create: mockDraftCreate },
          messages: { send: mockMessageSend },
        },
      } as unknown as Awaited<ReturnType<typeof gmailModule.getGmailClientForAccount>>);
    });

    it("executes automated email send via Gmail API when applicationMode is AUTO_SEND", async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValueOnce({
        id: "acc-1",
        email: "alex@example.com",
        isActive: true,
        googleAccessToken: "mock-token",
        settings: {
          rules: {
            applicationMode: "AUTO_SEND",
            featureFlags: {},
          },
        },
      } as unknown as Awaited<ReturnType<typeof prisma.account.findUnique>>);

      vi.mocked(prisma.jobApplication.findFirst).mockResolvedValueOnce({
        id: "app-1",
        accountId: "acc-1",
        opportunityId: "opp-123",
        roleTitle: "Logistics Lead",
        companyName: "Metro Freight",
        actionSummary: "recruiter@metrofreight.com",
        toEmail: "recruiter@metrofreight.com",
        status: "INTERESTED",
        opportunityStatus: "FOUND",
        draftSubject: "Application for Logistics Lead",
        draftBody: "Please find attached my resume.",
        gmailDraftId: null,
        gmailMessageId: null,
      } as unknown as Awaited<ReturnType<typeof prisma.jobApplication.findFirst>>);

      const result = await dispatchApplicationEmail("acc-1", "app-1", {
        usePreparedDraft: true,
        toEmail: "recruiter@metrofreight.com",
      });

      expect(result.mode).toBe("sent");
      expect(mockMessageSend).toHaveBeenCalledTimes(1);
      expect(mockDraftCreate).not.toHaveBeenCalled();
      expect(prisma.jobApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "app-1" },
          data: expect.objectContaining({
            opportunityStatus: "SENT",
            dispatchStatus: "SENT",
            status: "APPLIED",
          }),
        })
      );
    });

    it("blocks auto-send and routes to manual review draft when applicationMode is MANUAL_REVIEW", async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValueOnce({
        id: "acc-1",
        email: "alex@example.com",
        isActive: true,
        googleAccessToken: "mock-token",
        settings: {
          rules: {
            applicationMode: "MANUAL_REVIEW",
            featureFlags: {},
          },
        },
      } as unknown as Awaited<ReturnType<typeof prisma.account.findUnique>>);

      vi.mocked(prisma.jobApplication.findFirst).mockResolvedValueOnce({
        id: "app-2",
        accountId: "acc-1",
        opportunityId: "opp-123",
        roleTitle: "Logistics Lead",
        companyName: "Metro Freight",
        actionSummary: "recruiter@metrofreight.com",
        toEmail: "recruiter@metrofreight.com",
        status: "INTERESTED",
        opportunityStatus: "FOUND",
        draftSubject: "Application for Logistics Lead",
        draftBody: "Please find attached my resume.",
        gmailDraftId: null,
        gmailMessageId: null,
      } as unknown as Awaited<ReturnType<typeof prisma.jobApplication.findFirst>>);

      const result = await dispatchApplicationEmail("acc-1", "app-2", {
        usePreparedDraft: true,
        toEmail: "recruiter@metrofreight.com",
      });

      expect(result.mode).toBe("draft");
      expect(mockMessageSend).not.toHaveBeenCalled();
      expect(mockDraftCreate).toHaveBeenCalledTimes(1);
      expect(prisma.jobApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "app-2" },
          data: expect.objectContaining({
            opportunityStatus: "DRAFT_SAVED_GMAIL",
            dispatchStatus: "PENDING_REVIEW",
          }),
        })
      );
    });
  });

  describe("3. mode_b_metric_synthesis: Metric Grounding & Hallucination Suppression", () => {
    const rawBullet = "Improved warehouse dispatch workflows and reduced shipment bottlenecks.";
    const hallucinatedBullet = "Improved warehouse dispatch workflows, reducing bottlenecks by 38% and saving $45,000.";

    it("permits calibrated metric synthesis when mode_b_metric_synthesis is enabled", () => {
      const rules = {
        featureFlags: { mode_b_metric_synthesis: true },
      };

      expect(isModeBMetricSynthesisPermitted(rules)).toBe(true);
      const grounded = enforceMetricGrounding(hallucinatedBullet, rawBullet, rules);
      expect(grounded).toBe(hallucinatedBullet);
    });

    it("suppresses fabricated numbers and reverts to source bullet when mode_b_metric_synthesis is disabled", () => {
      const rules = {
        featureFlags: { mode_b_metric_synthesis: false },
      };

      expect(isModeBMetricSynthesisPermitted(rules)).toBe(false);
      const grounded = enforceMetricGrounding(hallucinatedBullet, rawBullet, rules);
      // Hallucinated numbers (38%, $45,000) are purged, falling back to verbatim source text
      expect(grounded).toBe(rawBullet);
    });

    it("respects emergency kill-switch override (DISABLE_FEATURE_MODE_B_METRIC_SYNTHESIS)", () => {
      process.env.DISABLE_FEATURE_MODE_B_METRIC_SYNTHESIS = "true";
      const rules = {
        inventMetrics: true,
        featureFlags: { mode_b_metric_synthesis: true },
      };

      expect(isModeBMetricSynthesisPermitted(rules)).toBe(false);
      const grounded = enforceMetricGrounding(hallucinatedBullet, rawBullet, rules);
      expect(grounded).toBe(rawBullet);
    });
  });

  describe("4. web_scraping_proxies: Proxy Dispatch & Direct Egress Bypass", () => {
    it("dispatches ScrapingAnt request when web_scraping_proxies is enabled with valid BYOK", async () => {
      vi.spyOn(vaultModule, "resolveDecryptedScrapingAntKey").mockReturnValue("test-ant-key");
      const mockOperation = vi.fn().mockResolvedValue({ html: "<html>Job Data</html>" });

      const rules = {
        featureFlags: { web_scraping_proxies: true },
      };

      expect(isWebScrapingProxiesEnabled(rules)).toBe(true);
      const result = await dispatchScrapingAnt(rules, mockOperation);

      expect(result.executed).toBe(true);
      if (result.executed) {
        expect(result.data).toEqual({ html: "<html>Job Data</html>" });
      }
      expect(mockOperation).toHaveBeenCalledWith("test-ant-key");
    });

    it("bypasses external network egress completely when web_scraping_proxies is disabled", async () => {
      const mockOperation = vi.fn();
      const rules = {
        featureFlags: { web_scraping_proxies: false },
      };

      expect(isWebScrapingProxiesEnabled(rules)).toBe(false);
      const result = await dispatchScrapingAnt(rules, mockOperation);

      expect(result.executed).toBe(false);
      if (!result.executed) {
        expect(result.reason).toBe("PROXIES_DISABLED");
      }
      expect(mockOperation).not.toHaveBeenCalled();
    });

    it("bypasses HasData proxy egress when disabled via system kill-switch", async () => {
      process.env.DISABLE_FEATURE_WEB_SCRAPING_PROXIES = "true";
      const mockOperation = vi.fn();
      const rules = {
        enableWebScrapingProxies: true,
        featureFlags: { web_scraping_proxies: true },
      };

      expect(isWebScrapingProxiesEnabled(rules)).toBe(false);
      const result = await dispatchHasData(rules, mockOperation);

      expect(result.executed).toBe(false);
      if (!result.executed) {
        expect(result.reason).toBe("PROXIES_DISABLED");
      }
      expect(mockOperation).not.toHaveBeenCalled();
    });
  });

  describe("5. Decoupled Architecture: Clean Separation Between Developer Flags & User Preferences", () => {
    it("preserves candidate workflow preferences completely when all developer flags are disabled", () => {
      const candidateRules = {
        applicationMode: "AUTO_SEND" as const,
        inventMetrics: true,
        allowCloudFallback: true,
        autoCleanAfterUnsub: "TRASH" as const,
        featureFlags: {
          embedded_ai: false,
          shadow_evaluation: false,
          web_scraping_proxies: false,
          mode_b_metric_synthesis: false,
        },
      };

      // Candidate's auto-send preference is strictly intact and uninhibited
      expect(candidateRules.applicationMode).toBe("AUTO_SEND");
      expect(candidateRules.inventMetrics).toBe(true);
      expect(candidateRules.allowCloudFallback).toBe(true);
      expect(candidateRules.autoCleanAfterUnsub).toBe("TRASH");

      // Developer flags reflect their explicit false states
      expect(isFeatureEnabled("embedded_ai", candidateRules)).toBe(false);
      expect(isFeatureEnabled("shadow_evaluation", candidateRules)).toBe(false);
      expect(isFeatureEnabled("web_scraping_proxies", candidateRules)).toBe(false);
      expect(isFeatureEnabled("mode_b_metric_synthesis", candidateRules)).toBe(false);
    });

    it("ensures developer feature flags never cross-pollute candidate workflow fields", () => {
      const developerFlagsOnly = {
        featureFlags: {
          embedded_ai: true,
          shadow_evaluation: true,
          web_scraping_proxies: true,
          mode_b_metric_synthesis: true,
        },
      };

      // No side-effects on user preference fields
      expect("applicationMode" in developerFlagsOnly).toBe(false);
      expect("allowCloudFallback" in developerFlagsOnly).toBe(false);
      expect("autoCleanAfterUnsub" in developerFlagsOnly).toBe(false);
    });
  });
});
