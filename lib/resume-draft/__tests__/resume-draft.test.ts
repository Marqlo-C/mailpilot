import { describe, it, expect } from "vitest";
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
} from "../index";
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
});

