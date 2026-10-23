import { describe, it, expect, vi } from "vitest";
import * as dispatcher from "@/lib/llm/dispatcher";
import {
  calculateElasticPageBudget,
  DEFAULT_SECTION_ORDER,
  CAREER_SWITCHER_SECTION_ORDER,
  isCareerSwitcherOrEarlyTenure,
  resolveSectionOrder,
  resolveResumeDraftLens,
  sortExperiencesReverseChronological,
  sortEducationReverseChronological,
  digestTailoredResume,
  draftToPdfInput,
  normalizeProjectName,
  cleanProjectUrl,
  getProjectBaseName,
  isAuthenticContactItem,
  isAuthenticLocation,
  sanitizeResumeContactLine,
} from "../index";
import { buildResumeContactLine } from "@/lib/utils/format";
import { isResumeHeaderLink, isDisallowedContactHost } from "@/lib/utils/url";
import { compileResumeDocx } from "@/lib/document/resume-docx";
import {
  BANNED_SUMMARY_PERSONA_TERMS,
  sanitizeTailoredSummary,
  buildReframeSystemPrompt,
  buildTailoredStrategySystemPrompt,
  tailorSchema,
  heuristicProjectIds,
  tailorResumeForJob,
  type TailorResult,
} from "@/lib/resume-tailor";
import type { MasterProfileInput, WorkExperienceInput } from "@/lib/validations/profile";
import type { CandidatePersona } from "@/lib/persona/schema.ssot";

describe("Resume Drafting & Tailoring Architecture", () => {
  const baseProfile: MasterProfileInput = {
    fullName: "Alex Taylor",
    email: "alex@example.com",
    phone: "555-0100",
    location: "San Francisco, CA",
    summary: "Senior Systems Engineer with broad distributed systems background.",
    links: [{ label: "portfolio", url: "https://portfolio.example.com" }],
    skills: [
      {
        label: "Languages",
        parentCategory: null,
        items: [
          { name: "Go", proficiency: null },
          { name: "TypeScript", proficiency: null },
        ],
      },
    ],
    experiences: [
      {
        id: "exp-old",
        company: "Legacy Co",
        role: "Software Developer",
        location: "Oakland, CA",
        category: "Work",
        startDate: "Jan 2018",
        endDate: "Dec 2020",
        bullets: [
          { id: "b1", rawText: "Built microservices in Go", technologies: ["Go"], hasMetric: false },
        ],
        displayOrder: 1,
      },
      {
        id: "exp-current",
        company: "Cloud Scale",
        role: "Staff Engineer",
        location: "San Francisco, CA",
        category: "Work",
        startDate: "Jan 2021",
        endDate: "Present",
        bullets: [
          { id: "b2", rawText: "Architected distributed queue processing 10M events/day", technologies: ["Go"], hasMetric: true },
        ],
        displayOrder: 0,
      },
    ],
    projects: [
      {
        id: "proj-1",
        name: "Distributed KV Store",
        description: "Raft consensus implementation in Rust",
        technologies: ["Rust", "Raft"],
        link: "https://github.com/example/kv",
        bullets: ["Implemented Raft consensus algorithm handling network partitions"],
      },
    ],
    education: [
      {
        id: "edu-1",
        institution: "State University",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        startDate: "2014",
        graduationDate: "2018",
        status: "GRADUATED",
        honors: [],
        coursework: [],
      },
      {
        id: "edu-current",
        institution: "Tech Institute",
        degree: "Master of Science",
        fieldOfStudy: "Distributed Computing",
        startDate: "2023",
        graduationDate: "Ongoing",
        status: "IN_PROGRESS",
        honors: [],
        coursework: [],
      },
    ],
    certifications: [
      {
        name: "Cloud Certified Architect",
        issuer: "Cloud Provider",
        date: "2022",
        url: null,
      },
    ],
    awards: [],
    interests: ["Rock Climbing"],
  };

  const sampleTailorResult: TailorResult = {
    tailoredSummary: "Accomplished engineer specializing in distributed systems and fault-tolerant infrastructure.",
    tailoredSkills: baseProfile.skills,
    selectedExperience: baseProfile.experiences,
    selectedProjects: baseProfile.projects,
    strategyRationale: {
      roleFitAnalysis: "High alignment with distributed systems engineering needs.",
      selectedSkillsReasoning: "Focused on core systems programming capabilities.",
      featuredExperiencesReasoning: "Showcased high-throughput queue and cloud architecture.",
      featuredProjectsReasoning: "Highlighted consensus algorithms.",
    },
    coverLetter: "Cover letter text",
    selectedBullets: ["b1", "b2"],
    jobRequirements: ["Go", "TypeScript"],
    warningFlags: [],
  };

  describe("Chronological Sorting Guarantees", () => {
    it("sorts experiences reverse-chronologically with ongoing roles first", () => {
      const sorted = sortExperiencesReverseChronological(baseProfile.experiences);
      expect(sorted[0].id).toBe("exp-current");
      expect(sorted[1].id).toBe("exp-old");
    });

    it("sorts education reverse-chronologically with ongoing degrees first", () => {
      const sorted = sortEducationReverseChronological(baseProfile.education);
      expect(sorted[0].id).toBe("edu-current");
      expect(sorted[1].id).toBe("edu-1");
    });
  });

  describe("Career Switcher Detection & Section Ordering", () => {
    it("detects career switcher via persona seniorityTier", () => {
      const persona: CandidatePersona = {
        archetype: "Cross-Disciplinary Hybrid",
        seniorityTier: "Career Switcher",
        leadershipScope: "Individual Contributor / Practitioner",
        distinctionAnchor: "None / Production Tenure",
        titleFamily: "Engineering",
        timelineContext: "Career switcher with 7 years in finance, then 1 year in engineering.",
        toneGuidance: "Highlight target discipline portfolio.",
        inFieldYears: 1,
        calendarYears: 8,
      };
      expect(isCareerSwitcherOrEarlyTenure(persona, baseProfile)).toBe(true);
    });

    it("detects early in-field tenure (< 2 yrs) via inFieldYears", () => {
      const persona: CandidatePersona = {
        archetype: "Applied Practitioner / Skill-Certified",
        seniorityTier: "Mid-Level Professional",
        leadershipScope: "Individual Contributor / Practitioner",
        distinctionAnchor: "None / Production Tenure",
        titleFamily: "Engineering",
        timelineContext: "1.2 years in target field.",
        toneGuidance: "Direct and technical.",
        inFieldYears: 1.2,
        calendarYears: 4,
      };
      expect(isCareerSwitcherOrEarlyTenure(persona, baseProfile)).toBe(true);
    });

    it("orders projects before experience in AI_OPTIMAL mode for career switchers", () => {
      const order = resolveSectionOrder({
        orderingMode: "AI_OPTIMAL",
        isSwitcherOrEarlyTenure: true,
        hasProjects: true,
      });

      const projIdx = order.indexOf("projects");
      const expIdx = order.indexOf("experience");
      expect(projIdx).toBeGreaterThan(-1);
      expect(expIdx).toBeGreaterThan(-1);
      expect(projIdx).toBeLessThan(expIdx);
    });

    it("orders experience before projects in AI_OPTIMAL mode for standard profiles", () => {
      const order = resolveSectionOrder({
        orderingMode: "AI_OPTIMAL",
        isSwitcherOrEarlyTenure: false,
        hasProjects: true,
      });

      const projIdx = order.indexOf("projects");
      const expIdx = order.indexOf("experience");
      expect(expIdx).toBeLessThan(projIdx);
    });

    it("honors MANUAL mode preferredOrder and filters disabledSections", () => {
      const order = resolveSectionOrder({
        orderingMode: "MANUAL",
        isSwitcherOrEarlyTenure: true,
        hasProjects: true,
        preferredOrder: ["education", "skills", "experience", "summary"],
        disabledSections: ["summary"],
      });

      expect(order).not.toContain("summary");
      expect(order[0]).toBe("education");
      expect(order[1]).toBe("skills");
      expect(order[2]).toBe("experience");
    });
  });

  describe("Elastic Page Budgeting", () => {
    it("budgets single-page dense profiles with bullet caps", () => {
      const result = calculateElasticPageBudget({
        targetPages: 1,
        careerYears: 8,
        roleCount: 4,
        projectCount: 2,
        hasSummary: true,
        totalSourceBullets: 25,
      });

      expect(result.targetPages).toBe(1);
      expect(result.density).toBe("DENSE");
      expect(result.bulletsPerRoleMax).toBe(3);
      expect(result.bulletBudgetMax).toBeLessThanOrEqual(14);
    });

    it("budgets sparse profiles with expanded bullet allocations", () => {
      const result = calculateElasticPageBudget({
        targetPages: "auto",
        careerYears: 1,
        roleCount: 1,
        projectCount: 1,
        hasSummary: true,
        totalSourceBullets: 4,
      });

      expect(result.targetPages).toBe(1);
      expect(result.density).toBe("SPARSE");
      expect(result.bulletsPerRoleMax).toBe(5);
    });

    it("raises PAGE_BUDGET_OVERFLOW warning flag when requirements exceed 1-page budget", () => {
      const result = calculateElasticPageBudget({
        targetPages: 1,
        careerYears: 12,
        roleCount: 6,
        projectCount: 4,
        hasSummary: true,
        totalSourceBullets: 35,
        matchedRequirementsCount: 18,
      });

      expect(result.warningFlags).toContain("PAGE_BUDGET_OVERFLOW");
    });

    it("respects explicit manual page overrides (1, 2, '1', '2') regardless of tenure", () => {
      // Junior profile (< 7 years) forced to 2 pages via override
      const forcedTwo = calculateElasticPageBudget({
        targetPages: 2,
        careerYears: 2,
        roleCount: 2,
        projectCount: 1,
        hasSummary: false,
        totalSourceBullets: 6,
      });
      expect(forcedTwo.targetPages).toBe(2);

      const forcedTwoString = calculateElasticPageBudget({
        targetPages: "2" as any,
        careerYears: 2,
        roleCount: 2,
        projectCount: 1,
        hasSummary: false,
        totalSourceBullets: 6,
      });
      expect(forcedTwoString.targetPages).toBe(2);

      // Veteran profile (>= 7 years & >= 4 roles) forced to 1 page via override
      const forcedOne = calculateElasticPageBudget({
        targetPages: 1,
        careerYears: 10,
        roleCount: 5,
        projectCount: 3,
        hasSummary: true,
        totalSourceBullets: 28,
      });
      expect(forcedOne.targetPages).toBe(1);

      const forcedOneString = calculateElasticPageBudget({
        targetPages: "1" as any,
        careerYears: 10,
        roleCount: 5,
        projectCount: 3,
        hasSummary: true,
        totalSourceBullets: 28,
      });
      expect(forcedOneString.targetPages).toBe(1);
    });
  });

  describe("Persona Diagnostic Blacklist for Summaries", () => {
    it("strips internal diagnostic labels and instructions from summary copy", () => {
      const dirtySummary =
        "Accomplished developer. Note: Career switcher with 1.2 years in-field tenure and 9 calendar years. Do NOT treat legacy time as seniority.";
      const cleaned = sanitizeTailoredSummary(dirtySummary);

      expect(cleaned).not.toMatch(/career switcher/i);
      expect(cleaned).not.toMatch(/in-field tenure/i);
      expect(cleaned).not.toMatch(/calendar years/i);
      expect(cleaned).not.toMatch(/do not treat/i);
      expect(cleaned?.length).toBeGreaterThan(10);
    });

    it("verifies BANNED_SUMMARY_PERSONA_TERMS includes key diagnostic phrases", () => {
      expect(BANNED_SUMMARY_PERSONA_TERMS).toContain("career switcher");
      expect(BANNED_SUMMARY_PERSONA_TERMS).toContain("in-field tenure");
      expect(BANNED_SUMMARY_PERSONA_TERMS).toContain("title family");
      expect(BANNED_SUMMARY_PERSONA_TERMS).toContain("calendar years");
    });
  });

  describe("Google XYZ Reframing & Metric Integrity Prompts", () => {
    it("enforces Google XYZ pattern in reframe prompt", () => {
      const prompt = buildReframeSystemPrompt(false);
      expect(prompt).toContain("Accomplished [X] as measured by [Y] by doing [Z]");
      expect(prompt).toContain("60%–70%");
    });

    it("strictly bars inventing numbers when inventMetrics is false", () => {
      const prompt = buildReframeSystemPrompt(false);
      expect(prompt).toContain("STRICT - NO INVENTED NUMBERS");
      expect(prompt).toContain("do NOT invent any numbers");
      expect(prompt).toContain("NEVER change or overwrite those metrics");
    });

    it("permits modest leveling-calibrated metrics when inventMetrics is true", () => {
      const prompt = buildReframeSystemPrompt(true);
      expect(prompt).toContain("METRIC SYNTHESIS PERMITTED");
      expect(prompt).toContain("modest, plausible metric");
      expect(prompt).toContain("NEVER invent massive corporate revenue");
    });

    it("embodies universal 4-dimensional metric taxonomy without tech-domain bias", () => {
      const prompt = buildReframeSystemPrompt(true);
      expect(prompt).toContain("Efficiency & Velocity");
      expect(prompt).toContain("Quality & Accuracy");
      expect(prompt).toContain("Volume & Throughput");
      expect(prompt).toContain("Satisfaction & Adoption");

      // Verify removal of software-specific metric few-shots
      expect(prompt).not.toContain("test runtime");
      expect(prompt).not.toContain("build latency");
      expect(prompt).not.toContain("pipeline failure");
    });

    it("enforces strict domain discipline and ground truth across cross-discipline roles", () => {
      const prompt = buildReframeSystemPrompt(true);
      expect(prompt).toContain("STRICT DOMAIN DISCIPLINE");
      expect(prompt).toContain("Never inject software/code tools, tech jargon, or foreign domain concepts");
      expect(prompt).toContain("FUNCTIONAL CROSSOVER & GROUND TRUTH");
      expect(prompt).toContain("UNBENDING GROUND TRUTH: Never invent tools, languages, platforms, certifications, systems");
    });

    it("instructs structural pattern over rigid literal template tags", () => {
      const prompt = buildReframeSystemPrompt(false);
      expect(prompt).toContain(
        "[Strong Action Verb] + [Quantifiable Impact / Scope / Metric] + [Method / Technical Approach]"
      );
      expect(prompt).toContain("STRUCTURAL PATTERN OVER RIGID TAGS");
      expect(prompt).toContain(
        'Do NOT force awkward literal template tags like "as measured by" or "by doing"'
      );
      expect(prompt).toContain("Action + Metric + Method");
    });

    it("Mode A (inventMetrics: false): enforces XYZ structure on qualitative bullets with zero fabricated numbers", () => {
      const prompt = buildReframeSystemPrompt(false);
      expect(prompt).toContain(
        "[Strong Action Verb] + [Outcome / Verified Impact] + [Method / Tooling]"
      );
      expect(prompt).toContain("STRICT - NO INVENTED NUMBERS");
      expect(prompt).toContain("do NOT invent any numbers");
      expect(prompt).toContain(
        "You MUST STILL RESTRUCTURE the bullet into the Google XYZ pattern"
      );
      expect(prompt).toContain("NEVER leave the bullet un-reframed");
    });

    it("Mode A (inventMetrics: false): preserves existing metric bullets into XYZ structure with original numbers intact", () => {
      const prompt = buildReframeSystemPrompt(false);
      expect(prompt).toContain("keeping all verified figures intact");
      expect(prompt).toContain("NEVER change or overwrite those metrics");
    });

    it("Mode B (inventMetrics: true): permits modest, domain-native metric synthesis across 4 dimensions", () => {
      const prompt = buildReframeSystemPrompt(true);
      expect(prompt).toContain("METRIC SYNTHESIS PERMITTED");
      expect(prompt).toContain(
        "modest, plausible metric calibrated strictly to the candidate's verified leveling"
      );
      expect(prompt).toContain("Efficiency & Velocity");
      expect(prompt).toContain("Quality & Accuracy");
      expect(prompt).toContain("Volume & Throughput");
      expect(prompt).toContain("Satisfaction & Adoption");
    });

    it("Stage B reframe updates selectedExperience and selectedProjects, and digestTailoredResume constructs nodes with reframed text", async () => {
      const testProfile: MasterProfileInput = {
        ...baseProfile,
        experiences: [
          {
            id: "exp-1",
            company: "Acme Corp",
            role: "Backend Engineer",
            location: "San Francisco, CA",
            category: "Work",
            startDate: "2022-01",
            bullets: [
              {
                id: "b-exp-1",
                rawText: "Worked on distributed cache service",
                technologies: ["Go"],
                hasMetric: false,
              },
            ],
            displayOrder: 0,
          },
        ],
        projects: [
          {
            id: "proj-1",
            name: "CloudTelemetry",
            description: "Telemetry app",
            technologies: ["TypeScript"],
            bullets: ["Wrote telemetry handlers"],
            link: null,
          },
        ],
      };

      vi.spyOn(dispatcher, "callLLMWithFallback").mockImplementation(async (opts) => {
        // Stage A call
        if (opts.systemPrompt.includes("Tailoring Strategy Engine")) {
          return {
            selectedBulletIds: ["b-exp-1"],
            selectedProjectIds: ["proj-1"],
            strategyRationale: {
              roleFitAnalysis: "Strong match",
              selectedSkillsReasoning: "Relevant skills",
              featuredExperiencesReasoning: "Matches backend requirements",
              featuredProjectsReasoning: "Demonstrates practical execution",
            },
            jobRequirements: ["Go", "Distributed Systems"],
          };
        }
        // Stage B call
        if (opts.systemPrompt.includes("Google XYZ resume framework")) {
          return {
            reframedBullets: [
              {
                id: "b-exp-1",
                rawText:
                  "Engineered distributed caching layer ensuring sub-10ms query latency across 12 nodes by implementing Redis cluster sharding.",
              },
              {
                id: "proj-1-b-0",
                rawText:
                  "Architected real-time telemetry streaming pipeline capturing 100% of event streams by authoring custom WebSocket dispatchers.",
              },
            ],
          };
        }
        return null;
      });

      try {
        const result = await tailorResumeForJob(
          ["Go", "Distributed Systems"],
          testProfile,
          { inventMetrics: true }
        );

        // Verify that bullets were transformed to the Google XYZ reframed text
        expect(result.selectedExperience[0]!.bullets[0]!.rawText).toBe(
          "Engineered distributed caching layer ensuring sub-10ms query latency across 12 nodes by implementing Redis cluster sharding."
        );
        expect(result.selectedProjects[0]!.bullets[0]).toBe(
          "Architected real-time telemetry streaming pipeline capturing 100% of event streams by authoring custom WebSocket dispatchers."
        );

        // Verify digestTailoredResume receives the reframed text into the draft nodes
        const draft = digestTailoredResume({
          opportunityId: "opp-xyz-test",
          profile: testProfile,
          tailored: result,
          includeSummary: false,
        });

        const expNode = draft.nodes.find((n) => n.id.startsWith("exp-bullet"));
        expect(expNode?.content).toBe(
          "Engineered distributed caching layer ensuring sub-10ms query latency across 12 nodes by implementing Redis cluster sharding."
        );

        const projNode = draft.nodes.find((n) => n.id.startsWith("proj-bullet"));
        expect(projNode?.content).toBe(
          "Architected real-time telemetry streaming pipeline capturing 100% of event streams by authoring custom WebSocket dispatchers."
        );
      } finally {
        vi.restoreAllMocks();
      }
    });

    it("Stage B reframe gracefully parses alternative schema variations like { bullets: [...] } and transforms bullets", async () => {
      const testProfile: MasterProfileInput = {
        ...baseProfile,
        experiences: [
          {
            id: "exp-2",
            company: "Legacy Co",
            role: "Software Developer",
            location: "Oakland, CA",
            category: "Work",
            startDate: "2021-01",
            bullets: [
              {
                id: "b-alt-1",
                rawText: "Built microservices in Go",
                technologies: ["Go"],
                hasMetric: false,
              },
            ],
            displayOrder: 0,
          },
        ],
      };

      vi.spyOn(dispatcher, "callLLMWithFallback").mockImplementation(async (opts) => {
        if (opts.systemPrompt.includes("Tailoring Strategy Engine")) {
          return {
            selectedBulletIds: ["b-alt-1"],
            selectedProjectIds: [],
            strategyRationale: {
              roleFitAnalysis: "Fit",
              selectedSkillsReasoning: "Skills",
              featuredExperiencesReasoning: "Exp",
              featuredProjectsReasoning: "Proj",
            },
            jobRequirements: ["Go"],
          };
        }
        if (opts.systemPrompt.includes("Google XYZ resume framework")) {
          // Model returns { bullets: [...] } with { id, text }
          return {
            bullets: [
              {
                id: "b-alt-1",
                text: "Developed 8 containerized Go microservices eliminating database bottlenecks by establishing connection pooling.",
              },
            ],
          };
        }
        return null;
      });

      try {
        const result = await tailorResumeForJob(
          ["Go"],
          testProfile,
          { inventMetrics: false }
        );

        expect(result.selectedExperience[0]!.bullets[0]!.rawText).toBe(
          "Developed 8 containerized Go microservices eliminating database bottlenecks by establishing connection pooling."
        );
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  describe("Digestion & PDF Input Compilation", () => {
    it("digests draft with career switcher layout placing projects before experience", () => {
      const switcherPersona: CandidatePersona = {
        archetype: "Cross-Disciplinary Hybrid",
        seniorityTier: "Career Switcher",
        leadershipScope: "Individual Contributor / Practitioner",
        distinctionAnchor: "None / Production Tenure",
        titleFamily: "Engineering",
        timelineContext: "Career switcher with 1 year experience.",
        toneGuidance: "Practical and direct.",
        inFieldYears: 1,
        calendarYears: 8,
      };

      const draft = digestTailoredResume({
        opportunityId: "opp-123",
        profile: baseProfile,
        tailored: sampleTailorResult,
        includeSummary: true,
        persona: switcherPersona,
      });

      expect(draft.exportConfig.orderingMode).toBe("AI_OPTIMAL");
      expect(draft.exportConfig.sectionOrder).toBeDefined();

      const projNodeIndex = draft.nodes.findIndex((n) => n.section === "projects");
      const expNodeIndex = draft.nodes.findIndex((n) => n.section === "experience");
      expect(projNodeIndex).toBeGreaterThan(-1);
      expect(expNodeIndex).toBeGreaterThan(-1);
      expect(projNodeIndex).toBeLessThan(expNodeIndex);
    });

    it("supports draft export overrides without mutating account defaults", () => {
      const draft = digestTailoredResume({
        opportunityId: "opp-456",
        profile: baseProfile,
        tailored: sampleTailorResult,
        includeSummary: true,
        exportOverrides: {
          orderingMode: "MANUAL",
          sectionOrder: ["skills", "experience", "education"],
          disabledSections: ["summary", "projects"],
          inventMetrics: true,
          pageBudget: 2,
        },
      });

      expect(draft.exportConfig.orderingMode).toBe("MANUAL");
      expect(draft.exportConfig.disabledSections).toContain("summary");
      expect(draft.exportConfig.disabledSections).toContain("projects");
      expect(draft.exportConfig.inventMetrics).toBe(true);
      expect(draft.exportConfig.pageBudget).toBe(2);

      const nodeSections = new Set(draft.nodes.map((n) => n.section));
      expect(nodeSections.has("summary")).toBe(false);
      expect(nodeSections.has("projects")).toBe(false);
      expect(nodeSections.has("skills")).toBe(true);
      expect(nodeSections.has("experience")).toBe(true);
    });

    it("draftToPdfInput extracts compiled structures with sectionOrder and disabledSections", () => {
      const draft = digestTailoredResume({
        opportunityId: "opp-789",
        profile: baseProfile,
        tailored: sampleTailorResult,
        includeSummary: true,
        exportOverrides: {
          disabledSections: ["interests"],
        },
      });

      const compiled = draftToPdfInput(draft, baseProfile);
      expect(compiled.headerName).toBe("Alex Taylor");
      expect(compiled.experiences.length).toBe(2);
      expect(compiled.sectionOrder).toBeDefined();
      expect(compiled.disabledSections).toContain("interests");
    });

    it("normalizes unformatted repo slugs into clean Title Case in digestTailoredResume and draftToPdfInput", () => {
      const profileWithSlugs: MasterProfileInput = {
        ...baseProfile,
        projects: [
          {
            id: "proj-slug-1",
            name: "wildfire-response-system",
            description: "Emergency dispatch coordination system",
            technologies: ["TypeScript", "FastAPI"],
            link: "https://github.com/org/wildfire-response-system.git",
            bullets: ["Dispatched units"],
          },
          {
            id: "proj-slug-2",
            name: "https://github.com/org/distributed-kv-store.git",
            description: "KV database engine",
            technologies: ["Rust"],
            link: null,
            bullets: ["Built raft store"],
          },
        ],
      };

      const tailoredResultWithSlugs: TailorResult = {
        ...sampleTailorResult,
        selectedProjects: profileWithSlugs.projects,
      };

      const draft = digestTailoredResume({
        opportunityId: "opp-slugs",
        profile: profileWithSlugs,
        tailored: tailoredResultWithSlugs,
        includeSummary: false,
      });

      // Verify draft nodes have normalized Title Case names
      const projectHeaderNodes = draft.nodes.filter((n) => n.type === "project_header");
      expect(projectHeaderNodes[0].content).toBe("Wildfire Response System");
      expect(projectHeaderNodes[1].content).toBe("Distributed KV Store");

      // Verify draftToPdfInput compiles clean Title Case project names
      const compiled = draftToPdfInput(draft, profileWithSlugs);
      expect(compiled.projects[0].name).toBe("Wildfire Response System");
      expect(compiled.projects[1].name).toBe("Distributed KV Store");
    });
  });

  describe("Project Selection, Gating & Schema Resilience", () => {
    it("allows tailorSchema to parse tailoredSummary: null when summary is omitted", () => {
      const payloadWithNull = {
        tailoredSummary: null,
        selectedBulletIds: ["b1", "b2"],
        selectedProjectIds: ["proj-1"],
        strategyRationale: {
          roleFitAnalysis: "Good fit",
          selectedSkillsReasoning: "Relevant skills",
          featuredExperiencesReasoning: "Strong background",
          featuredProjectsReasoning: "Key outcomes",
        },
      };

      const parsed = tailorSchema.safeParse(payloadWithNull);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.tailoredSummary).toBeNull();
        expect(parsed.data.coverLetter).toBe("");
        expect(parsed.data.selectedBulletIds).toEqual(["b1", "b2"]);
        expect(parsed.data.selectedProjectIds).toEqual(["proj-1"]);
      }
    });

    it("allows tailorSchema to parse string or undefined tailoredSummary", () => {
      const withString = tailorSchema.safeParse({
        tailoredSummary: "Experienced engineer.",
      });
      expect(withString.success).toBe(true);

      const withUndefined = tailorSchema.safeParse({});
      expect(withUndefined.success).toBe(true);
      if (withUndefined.success) {
        expect(withUndefined.data.tailoredSummary).toBeUndefined();
      }
    });

    it("instructs null tailoredSummary and combined budget in prompt when summary is omitted", () => {
      const prompt = buildTailoredStrategySystemPrompt({
        seniorityTier: "Mid-Level",
        timelineContext: "3 years experience",
        professionalYears: 3,
        includeSummary: false,
      });

      expect(prompt).toContain("SUMMARY OMITTED");
      expect(prompt).toContain("Set tailoredSummary to null.");
      expect(prompt).toContain('"tailoredSummary": string | null');
      expect(prompt).not.toContain("COMBINED across all experiences and projects");
      expect(prompt).toContain("fill the single-page budget by featuring 2–3 relevant projects");
    });

    it("instructs empty selectedProjectIds when projects are disabled", () => {
      const prompt = buildTailoredStrategySystemPrompt({
        seniorityTier: "Mid-Level",
        timelineContext: "3 years experience",
        professionalYears: 3,
        projectsDisabled: true,
      });

      expect(prompt).toContain("Set selectedProjectIds to [].");
      expect(prompt).toContain("candidate has opted to omit the Projects section");
    });

    it("prioritizes practical projects when isCareerSwitcherOrEarlyTenure is true", () => {
      const prompt = buildTailoredStrategySystemPrompt({
        seniorityTier: "Career Switcher",
        timelineContext: "Transitioning to engineering",
        professionalYears: 1,
        isCareerSwitcherOrEarlyTenure: true,
      });

      expect(prompt).toContain("For career switchers or early-tenure candidates, select 2–3 distinct practical projects");
    });

    it("classifies career switchers as SPARSE density and expands 1-page budget", () => {
      const budget = calculateElasticPageBudget({
        targetPages: "auto",
        careerYears: 1.5,
        roleCount: 4,
        projectCount: 8,
        hasSummary: false,
        totalSourceBullets: 9,
        isCareerSwitcher: true,
      });

      expect(budget.density).toBe("SPARSE");
      expect(budget.bulletBudgetMax).toBe(14);
      expect(budget.bulletsPerProjectMax).toBe(4);
    });

    it("ranks and selects relevant projects in heuristicProjectIds", () => {
      const projects = [
        {
          id: "p-irrelevant",
          name: "Recipe Blog",
          description: "A blog about baking sourdough",
          technologies: ["WordPress", "PHP"],
          bullets: ["Wrote recipes"],
        },
        {
          id: "p-match",
          name: "Distributed Stream Processor",
          description: "Kafka-based real-time event pipeline",
          technologies: ["Kafka", "Go", "Docker"],
          bullets: ["Processed 50k events/sec with fault tolerance"],
        },
      ];

      const selected = heuristicProjectIds(["kafka", "distributed", "event pipeline"], projects, 1);
      expect(selected).toEqual(["p-match"]);
    });

    it("handles heuristicProjectIds with empty projects gracefully", () => {
      const selected = heuristicProjectIds(["golang", "react"], [], 2);
      expect(selected).toEqual([]);
    });
  });

  describe("Career-Agnostic Functional Crossover & Multi-Role Continuity", () => {
    it("includes functional crossover translation directives in strategy prompt", () => {
      const prompt = buildTailoredStrategySystemPrompt({
        seniorityTier: "Mid-Level Professional",
        timelineContext: "2 years in target domain, 5 years in operations.",
        professionalYears: 7,
      });

      expect(prompt).toContain("FUNCTIONAL CROSSOVER & MULTI-ROLE CONTINUITY");
      expect(prompt).toContain("workflow orchestration");
      expect(prompt).toContain("Ground Truth vs. Framing Agility");
      expect(prompt).toContain("For candidates with under 2 years in their current field or career switchers, do NOT drop preceding history");
    });

    it("directs candidate metric measurement advice in strategy rationale when inventMetrics is false", () => {
      const promptWithoutInvent = buildTailoredStrategySystemPrompt({
        seniorityTier: "Mid-Level Professional",
        timelineContext: "3 years experience",
        professionalYears: 3,
        inventMetrics: false,
      });

      expect(promptWithoutInvent).toContain("Do NOT invent metrics or unverified numbers");
      expect(promptWithoutInvent).toContain("In strategyRationale (under featuredExperiencesReasoning or roleFitAnalysis), include constructive advice on what metrics the candidate could measure themselves");

      const promptWithInvent = buildTailoredStrategySystemPrompt({
        seniorityTier: "Mid-Level Professional",
        timelineContext: "3 years experience",
        professionalYears: 3,
        inventMetrics: true,
      });

      expect(promptWithInvent).toContain("using domain-native impact dimensions (efficiency, quality, volume, satisfaction)");
    });

    it("preserves cross-discipline prior roles during tailoring backfill so employment history is not dropped", async () => {
      const crossDisciplineProfile: MasterProfileInput = {
        ...baseProfile,
        experiences: [
          {
            id: "exp-infield",
            company: "Current Tech",
            role: "Software Developer",
            location: "San Francisco, CA",
            category: "Work",
            startDate: "Jan 2023",
            endDate: "Present",
            bullets: [
              { id: "b-in1", rawText: "Built microservices in Go", technologies: ["Go"], hasMetric: false },
              { id: "b-in2", rawText: "Designed REST endpoints", technologies: ["Go"], hasMetric: false },
            ],
            displayOrder: 0,
          },
          {
            id: "exp-crossover",
            company: "Global Logistics",
            role: "Operations Coordinator",
            location: "Oakland, CA",
            category: "Work",
            startDate: "Jan 2018",
            endDate: "Dec 2022",
            bullets: [
              { id: "b-cross1", rawText: "Orchestrated cross-dock dispatch operations handling 500+ daily shipments", technologies: [], hasMetric: true },
              { id: "b-cross2", rawText: "Enforced compliance and safety protocols reducing turnaround time by 15%", technologies: [], hasMetric: true },
            ],
            displayOrder: 1,
          },
        ],
      };

      const result = await tailorResumeForJob(
        ["Go", "microservices", "distributed systems"],
        crossDisciplineProfile,
        {
          includeSummary: false,
          inventMetrics: false,
        }
      );

      // Verify both in-field role and cross-discipline prior role are preserved
      expect(result.selectedExperience.length).toBe(2);
      const expIds = result.selectedExperience.map((e) => e.id);
      expect(expIds).toContain("exp-infield");
      expect(expIds).toContain("exp-crossover");

      // Verify rationale contains constructive measurement guidance when inventMetrics is false
      expect(result.strategyRationale?.featuredExperiencesReasoning).toContain("recommend measuring");
    });
  });

  describe("normalizeProjectName Pure Utility", () => {
    it("strips GitHub and GitLab URLs, .git suffixes, and query/hashes", () => {
      expect(
        normalizeProjectName("https://github.com/marqlott/distributed-kv-store.git")
      ).toBe("Distributed KV Store");
      expect(
        normalizeProjectName("http://gitlab.com/org/subgroup/wildfire-response-system/")
      ).toBe("Wildfire Response System");
      expect(
        normalizeProjectName("github.com/user/embergency-wildfire-app?ref=main#readme")
      ).toBe("Embergency Wildfire App");
      expect(
        normalizeProjectName("user/real-time-api-gateway")
      ).toBe("Real Time API Gateway");
    });

    it("de-kebabs and de-snakes raw slugs into clean titles", () => {
      expect(normalizeProjectName("wildfire-response-system")).toBe(
        "Wildfire Response System"
      );
      expect(normalizeProjectName("embergency-wildfire-app")).toBe(
        "Embergency Wildfire App"
      );
      expect(normalizeProjectName("real_time_metrics_pipeline")).toBe(
        "Real Time Metrics Pipeline"
      );
    });

    it("preserves technical and domain acronyms with accurate casing", () => {
      expect(normalizeProjectName("distributed-kv-store")).toBe(
        "Distributed KV Store"
      );
      expect(normalizeProjectName("rest-api-cli-tools")).toBe(
        "REST API CLI Tools"
      );
      expect(normalizeProjectName("ci-cd-pipeline-orchestrator")).toBe(
        "CI/CD Pipeline Orchestrator"
      );
      expect(normalizeProjectName("saas-iot-telemetry-sdk")).toBe(
        "SaaS IoT Telemetry SDK"
      );
      expect(normalizeProjectName("p2p-sql-db-query-engine")).toBe(
        "P2P SQL DB Query Engine"
      );
      expect(normalizeProjectName("sla-monitoring-daemon")).toBe(
        "SLA Monitoring Daemon"
      );
    });

    it("preserves already polished titles and brand camelCase without corruption", () => {
      expect(normalizeProjectName("Distributed KV Store")).toBe(
        "Distributed KV Store"
      );
      expect(normalizeProjectName("Embergency Wildfire App")).toBe(
        "Embergency Wildfire App"
      );
      expect(normalizeProjectName("FastAPI Telematics Pipeline")).toBe(
        "FastAPI Telematics Pipeline"
      );
      expect(normalizeProjectName("GraphQL & React Native Hub")).toBe(
        "GraphQL & React Native Hub"
      );
      expect(normalizeProjectName("PyTorch Image Classifier")).toBe(
        "PyTorch Image Classifier"
      );
    });

    it("handles empty or null inputs gracefully", () => {
      expect(normalizeProjectName("")).toBe("");
      expect(normalizeProjectName(null)).toBe("");
      expect(normalizeProjectName(undefined)).toBe("");
      expect(normalizeProjectName("   ")).toBe("");
    });

    it("handles double hyphens and trailing branch/archive flags cleanly", () => {
      expect(
        normalizeProjectName("https://github.com/owner/wildfire--response-system/tree/main")
      ).toBe("Wildfire Response System");
      expect(
        normalizeProjectName("https://github.com/owner/distributed-kv-store/blob/master")
      ).toBe("Distributed KV Store");
      expect(
        normalizeProjectName("https://github.com/owner/ci--cd--pipeline/archive/v1.0.tar.gz")
      ).toBe("CI/CD Pipeline");
      expect(
        normalizeProjectName("real_time--metrics__stream")
      ).toBe("Real Time Metrics Stream");
    });
  });

  describe("Contact Line Sanitation & Rogue Ingestion Bleed Prevention", () => {
    it("validates authentic email addresses, phone numbers, verified URLs, and locations", () => {
      expect(isAuthenticContactItem("alex@example.com")).toBe(true);
      expect(isAuthenticContactItem("user.name+tag@sub.domain.org")).toBe(true);
      expect(isAuthenticContactItem("555-0100")).toBe(true);
      expect(isAuthenticContactItem("(555) 123-4567")).toBe(true);
      expect(isAuthenticContactItem("+1 555-123-4567")).toBe(true);
      expect(isAuthenticContactItem("portfolio.example.com")).toBe(true);
      expect(isAuthenticContactItem("https://github.com/alextaylor")).toBe(true);
      expect(isAuthenticContactItem("linkedin.com/in/alextaylor")).toBe(true);
      expect(isAuthenticContactItem("San Francisco, CA")).toBe(true);
      expect(isAuthenticContactItem("Austin, TX")).toBe(true);
      expect(isAuthenticContactItem("London, UK")).toBe(true);
      expect(isAuthenticContactItem("Remote")).toBe(true);
      expect(isAuthenticContactItem("San Francisco Bay Area")).toBe(true);
    });

    it("strictly rejects serialized skills, programming languages, and tools from contact items", () => {
      expect(isAuthenticContactItem("Docker")).toBe(false);
      expect(isAuthenticContactItem("Kubernetes")).toBe(false);
      expect(isAuthenticContactItem("React")).toBe(false);
      expect(isAuthenticContactItem("React.js")).toBe(false);
      expect(isAuthenticContactItem("Node.js")).toBe(false);
      expect(isAuthenticContactItem("Python")).toBe(false);
      expect(isAuthenticContactItem("Python, Java, C++")).toBe(false);
      expect(isAuthenticContactItem("AWS")).toBe(false);
      expect(isAuthenticContactItem("FastAPI")).toBe(false);
      expect(isAuthenticContactItem("GraphQL")).toBe(false);
      expect(isAuthenticContactItem("CI/CD")).toBe(false);
      expect(isAuthenticContactItem("SQL")).toBe(false);
      expect(isAuthenticContactItem("TypeScript")).toBe(false);
    });

    it("sanitizes composite contact lines by removing rogue skills and keyword bleed", () => {
      const contaminated =
        "alex@example.com • 555-0100 • San Francisco, CA • portfolio.example.com • Docker • React.js • Kubernetes";
      const sanitized = sanitizeResumeContactLine(contaminated);
      expect(sanitized).toBe(
        "alex@example.com • 555-0100 • San Francisco, CA • portfolio.example.com"
      );
    });

    it("supports pipe and middle-dot delimited contact strings", () => {
      const pipeContaminated =
        "alex@example.com | 555-0100 | Austin, TX | github.com/alextaylor | Python | AWS";
      const sanitized = sanitizeResumeContactLine(pipeContaminated);
      expect(sanitized).toBe(
        "alex@example.com • 555-0100 • Austin, TX • github.com/alextaylor"
      );
    });

    it("prevents rogue skills in profile.links from entering buildResumeContactLine", () => {
      const profileWithRogueLinks: MasterProfileInput = {
        fullName: "Alex Taylor",
        email: "alex@example.com",
        phone: "555-0100",
        location: "San Francisco, CA",
        summary: "Engineer",
        links: [
          { label: "Portfolio", url: "https://portfolio.example.com" },
          { label: "SkillBleed1", url: "Docker" },
          { label: "SkillBleed2", url: "React.js" },
          { label: "SkillBleed3", url: "Python" },
        ],
        skills: [],
        experiences: [],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      };

      const line = buildResumeContactLine(profileWithRogueLinks);
      expect(line).toContain("alex@example.com");
      expect(line).toContain("555-0100");
      expect(line).toContain("San Francisco, CA");
      expect(line).toContain("portfolio.example.com");
      expect(line).not.toContain("Docker");
      expect(line).not.toContain("React.js");
      expect(line).not.toContain("Python");
    });

    it("strictly rejects third-party framework/tool domains and bare roots like Socket.io", () => {
      expect(isDisallowedContactHost("socket.io")).toBe(true);
      expect(isDisallowedContactHost("https://Socket.io")).toBe(true);
      expect(isDisallowedContactHost("react.dev")).toBe(true);
      expect(isDisallowedContactHost("nextjs.org")).toBe(true);
      expect(isDisallowedContactHost("prisma.io")).toBe(true);

      expect(isResumeHeaderLink("https://Socket.io")).toBe(false);
      expect(isResumeHeaderLink("Socket.io")).toBe(false);
      expect(isResumeHeaderLink("https://react.dev")).toBe(false);
      expect(isResumeHeaderLink("https://github.com")).toBe(false); // bare root rejected
      expect(isResumeHeaderLink("https://linkedin.com")).toBe(false); // bare root rejected

      expect(isAuthenticContactItem("Socket.io")).toBe(false);
      expect(isAuthenticContactItem("https://Socket.io")).toBe(false);
      expect(isAuthenticContactItem("github.com")).toBe(false);

      // Authentic profile links still pass cleanly
      expect(isResumeHeaderLink("https://github.com/Marqlo-C")).toBe(true);
      expect(isResumeHeaderLink("https://linkedin.com/in/marq-lott")).toBe(true);
      expect(isResumeHeaderLink("https://marqlo-c.github.io")).toBe(true);
      expect(isAuthenticContactItem("github.com/Marqlo-C")).toBe(true);
      expect(isAuthenticContactItem("linkedin.com/in/marq-lott")).toBe(true);
      expect(isAuthenticContactItem("marqlo-c.github.io")).toBe(true);

      // Sanitizing the real-world contaminated contact line
      const realWorldContaminated =
        "marquiseclott@gmail.com • (213) 817-0484 • Sacramento, CA • linkedin.com/in/marq-lott • marqlo-c.github.io • github.com/Marqlo-C • Socket.io";
      const sanitized = sanitizeResumeContactLine(realWorldContaminated);
      expect(sanitized).toBe(
        "marquiseclott@gmail.com • (213) 817-0484 • Sacramento, CA • linkedin.com/in/marq-lott • marqlo-c.github.io • github.com/Marqlo-C"
      );
      expect(sanitized).not.toContain("Socket.io");
    });
  });

  describe("WYSIWYG Parity & Project Link Cleanliness", () => {
    it("cleanProjectUrl strips protocol, www, .git extension, and trailing slashes", () => {
      expect(cleanProjectUrl("https://github.com/example/kv.git")).toBe(
        "github.com/example/kv"
      );
      expect(cleanProjectUrl("http://www.myproject.io/")).toBe("myproject.io");
      expect(cleanProjectUrl("https://gitlab.com/group/iot-telemetry.git/")).toBe(
        "gitlab.com/group/iot-telemetry"
      );
    });

    it("getProjectBaseName strips subtitles, taglines, and separators", () => {
      expect(
        getProjectBaseName("SafeHaven – Disguised Domestic Violence Safety Platform")
      ).toBe("SafeHaven");
      expect(
        getProjectBaseName("Embergency – Wildfire Response Assistant")
      ).toBe("Embergency");
      expect(getProjectBaseName("Mailpilot")).toBe("Mailpilot");
    });

    it("draftToPdfInput produces clean, protocol-free project links when provided and preserves null without synthetic backfills", () => {
      const profileWithPool: MasterProfileInput = {
        ...baseProfile,
        projects: [
          {
            id: "repo-1",
            name: "SafeHaven",
            description: "Safety app",
            technologies: ["Next.js"],
            link: "https://github.com/Marqlo-C/SafeHaven.git",
            bullets: [],
          },
        ],
      };

      const draft = digestTailoredResume({
        opportunityId: "opp-wysiwyg",
        profile: profileWithPool,
        tailored: {
          ...sampleTailorResult,
          selectedProjects: [
            {
              id: "p1",
              name: "SafeHaven – Disguised Domestic Violence Safety Platform",
              description: "Covert platform",
              technologies: ["Next.js"],
              link: null, // extracted from resume text without explicit link
              bullets: ["Built real-time crisis chat"],
            },
            {
              id: "p2",
              name: "Mailpilot",
              description: "Dashboard",
              technologies: ["Next.js", "TypeScript"],
              link: "https://github.com/Marqlo-C/mailpilot.git",
              bullets: ["Built dashboard"],
            },
          ],
        },
        includeSummary: true,
      });

      const compiled = draftToPdfInput(draft, profileWithPool);
      expect(compiled.projects.length).toBe(2);
      expect(compiled.projects[0]!.name).toBe(
        "SafeHaven – Disguised Domestic Violence Safety Platform"
      );
      // Link should NOT be synthetically backfilled when null on the project
      expect(compiled.projects[0]!.link).toBeNull();
      // When explicitly provided, link is cleaned
      expect(compiled.projects[1]!.link).toBe("github.com/Marqlo-C/mailpilot");
    });

    it("compileResumeDocx sanitizes contact headers and renders clean project headings without repo clutter", async () => {
      const draft = digestTailoredResume({
        opportunityId: "opp-docx",
        profile: {
          ...baseProfile,
          links: [
            { label: "LinkedIn", url: "https://linkedin.com/in/marq-lott" },
            { label: "Website", url: "https://Socket.io" }, // Rogue tech domain
          ],
        },
        tailored: {
          ...sampleTailorResult,
          selectedProjects: [
            {
              id: "p1",
              name: "Mailpilot",
              description: "Dashboard",
              technologies: ["Next.js", "TypeScript"],
              link: "https://github.com/Marqlo-C/mailpilot",
              bullets: ["Developed Next.js dashboard"],
            },
          ],
        },
        includeSummary: false,
      });

      const docxBuffer = await compileResumeDocx(draft);
      expect(docxBuffer).toBeInstanceOf(Buffer);
      expect(docxBuffer.length).toBeGreaterThan(100);

      // Read XML from docx archive using JSZip
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(docxBuffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      expect(docXml).toBeDefined();

      // Verify Socket.io is NOT in docx
      expect(docXml).not.toContain("Socket.io");

      // Verify project heading renders title and technologies cleanly without repo link clutter
      expect(docXml).toContain("Mailpilot");
      expect(docXml).toContain("Next.js, TypeScript");
      expect(docXml).not.toContain("github.com/Marqlo-C/mailpilot");
    });

    it("preserves 100% of candidate experiences and projects when contentInclusionMode is MANUAL", async () => {
      const richProfile: MasterProfileInput = {
        ...baseProfile,
        experiences: [
          {
            id: "exp-1",
            company: "Company Alpha",
            role: "Software Engineer",
            location: "San Francisco, CA",
            category: "Work",
            startDate: "2020-01",
            bullets: [
              { id: "b1", rawText: "Bullet 1 of Alpha", technologies: [], hasMetric: false },
              { id: "b2", rawText: "Bullet 2 of Alpha", technologies: [], hasMetric: false },
              { id: "b3", rawText: "Bullet 3 of Alpha", technologies: [], hasMetric: false },
              { id: "b4", rawText: "Bullet 4 of Alpha", technologies: [], hasMetric: false },
              { id: "b5", rawText: "Bullet 5 of Alpha", technologies: [], hasMetric: false },
              { id: "b6", rawText: "Bullet 6 of Alpha", technologies: [], hasMetric: false },
            ],
            displayOrder: 0,
          },
          {
            id: "exp-2",
            company: "Company Beta",
            role: "Systems Developer",
            location: "Remote",
            category: "Work",
            startDate: "2018-01",
            bullets: [
              { id: "b7", rawText: "Bullet 1 of Beta", technologies: [], hasMetric: false },
              { id: "b8", rawText: "Bullet 2 of Beta", technologies: [], hasMetric: false },
              { id: "b9", rawText: "Bullet 3 of Beta", technologies: [], hasMetric: false },
              { id: "b10", rawText: "Bullet 4 of Beta", technologies: [], hasMetric: false },
            ],
            displayOrder: 1,
          },
        ],
        projects: [
          {
            id: "p1",
            name: "Project 1",
            description: "Desc 1",
            technologies: ["TypeScript"],
            link: "https://github.com/test/p1",
            bullets: ["Project 1 Bullet A", "Project 1 Bullet B"],
          },
          {
            id: "p2",
            name: "Project 2",
            description: "Desc 2",
            technologies: ["Python"],
            link: "https://github.com/test/p2",
            bullets: ["Project 2 Bullet A"],
          },
          {
            id: "p3",
            name: "Project 3",
            description: "Desc 3",
            technologies: ["Rust"],
            link: null,
            bullets: ["Project 3 Bullet A"],
          },
          {
            id: "p4",
            name: "Project 4",
            description: "Desc 4",
            technologies: ["Go"],
            link: null,
            bullets: ["Project 4 Bullet A"],
          },
        ],
      };

      // Model B with 1-page budget (Auto tenure < 7 yrs resolves to 1 page)
      const tailored1Page = await tailorResumeForJob(
        ["TypeScript", "Backend"],
        richProfile,
        {
          contentInclusionMode: "MANUAL",
          targetPages: 1,
          accountRules: {
            contentInclusionMode: "MANUAL",
            targetPageBudget: "1",
            enableAiTailoringDefaults: false,
          },
        }
      );

      // Model B guarantees 100% of experiences and projects are represented
      expect(tailored1Page.selectedExperience.length).toBe(2);
      expect(tailored1Page.selectedProjects.length).toBe(4);

      // Bullets are budgeted by AI to fit a strict 1-page budget
      const totalExpBullets1Page = tailored1Page.selectedExperience.reduce(
        (sum, e) => sum + e.bullets.length,
        0
      );
      expect(tailored1Page.selectedExperience[0].bullets.length).toBeGreaterThanOrEqual(1);
      expect(tailored1Page.selectedExperience[1].bullets.length).toBeGreaterThanOrEqual(1);
      expect(totalExpBullets1Page).toBeLessThanOrEqual(12);

      // Model B with 2-page budget
      const tailored2Page = await tailorResumeForJob(
        ["TypeScript", "Backend"],
        richProfile,
        {
          contentInclusionMode: "MANUAL",
          targetPages: 2,
          accountRules: {
            contentInclusionMode: "MANUAL",
            targetPageBudget: "2",
            enableAiTailoringDefaults: false,
          },
        }
      );

      // 100% of experiences and projects preserved on 2 pages with expanded bullet budget
      expect(tailored2Page.selectedExperience.length).toBe(2);
      expect(tailored2Page.selectedProjects.length).toBe(4);
      const totalExpBullets2Page = tailored2Page.selectedExperience.reduce(
        (sum, e) => sum + e.bullets.length,
        0
      );
      expect(totalExpBullets2Page).toBeGreaterThan(totalExpBullets1Page);

      // digestTailoredResume digests tailored draft with all experiences represented
      const draft = digestTailoredResume({
        opportunityId: "opp-manual",
        profile: richProfile,
        tailored: tailored1Page,
        includeSummary: false,
        rules: { contentInclusionMode: "MANUAL", enableAiTailoringDefaults: false },
      });

      const expHeaderNodes = draft.nodes.filter(
        (n) => n.type === "experience_header" && n.selected
      );
      expect(expHeaderNodes.length).toBe(2);

      const projHeaderNodes = draft.nodes.filter(
        (n) => n.type === "project_header" && n.selected
      );
      expect(projHeaderNodes.length).toBe(4);
    });
  });
});


