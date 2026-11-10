import { describe, it, expect } from "vitest";
import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import {
  buildHierarchicalProfileTree,
  hydrateSelectedFromTree,
} from "../tree";
import {
  distillJobContext,
  extractCompetencyTokens,
  detectSeniorityExpectation,
} from "../distiller";
import {
  assembleWithinPageBudget,
  dedupeAndCapProjectBullets,
  dedupeExperienceBullets,
} from "../assembler";
import { reconcileWorkExperiencePair } from "@/lib/profile/deduplication";
import {
  heuristicRankProfile,
} from "../ranker";
import {
  sanitizeReframedBulletText,
} from "../reframe";
import {
  reorderSkillsForTarget,
  sanitizeTailoredSummary,
  generateAgnosticExecutiveSummary,
} from "../auxiliary";
import {
  estimateBulletHeightPoints,
  clampPdfContentToPhysicalCeiling,
  calculateContentPointHeight,
} from "@/lib/resume-draft/physics";
import { calculateElasticPageBudget } from "@/lib/resume-draft/budget";

describe("Decoupled Resume Tailor Architecture", () => {
  const sampleProfile: MasterProfileInput = {
    fullName: "Morgan Harper",
    email: "morgan@example.com",
    phone: "555-0199",
    location: "Seattle, WA",
    summary: "Senior Operations and Systems Specialist with background in workflow automation.",
    links: [
      { label: "GitHub", url: "https://github.com/morganharper" },
      { label: "Portfolio", url: "https://morganharper.github.io" },
    ],
    skills: [
      {
        label: "Systems & Cloud",
        parentCategory: null,
        items: [
          { name: "Docker", proficiency: null },
          { name: "Kubernetes", proficiency: null },
          { name: "PostgreSQL", proficiency: null },
        ],
      },
    ],
    experiences: [
      {
        id: "exp-current",
        company: "Nexus Logistics",
        role: "Lead Systems Coordinator",
        location: "Seattle, WA",
        category: "Work",
        startDate: "2022-01",
        endDate: "Present",
        displayOrder: 0,
        bullets: [
          {
            id: "b-current-1",
            rawText: "Automated warehouse dispatch routing across 14 regional nodes reducing turnaround by 24%.",
            hasMetric: true,
            technologies: ["PostgreSQL", "Docker"],
          },
          {
            id: "b-current-2",
            rawText: "Standardized SLA monitoring workflows across 6 operations teams.",
            hasMetric: false,
            technologies: [],
          },
        ],
      },
      {
        id: "exp-past",
        company: "Apex Fleet",
        role: "Operations Analyst",
        location: "Portland, OR",
        category: "Work",
        startDate: "2019-03",
        endDate: "2021-12",
        displayOrder: 1,
        bullets: [
          {
            id: "b-past-1",
            rawText: "Managed telematics tracking for 85 vehicles maintaining 99.9% uptime compliance.",
            hasMetric: true,
            technologies: ["GPS"],
          },
        ],
      },
    ],
    projects: [
      {
        id: "proj-1",
        name: "RouteOptimizer",
        description: "Heuristic dispatch solver for localized delivery networks.",
        technologies: ["TypeScript", "Docker"],
        bullets: [
          "Formulated simulated annealing engine to minimize route distances by 18%.",
        ],
      },
      {
        id: "proj-gh",
        name: "morganharper.github.io",
        description: "Personal website",
        technologies: ["HTML"],
        bullets: ["Personal site"],
      },
    ],
    education: [
      {
        id: "edu-1",
        institution: "University of Washington",
        degree: "BS",
        fieldOfStudy: "Industrial Engineering",
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

  describe("Hierarchical Profile Tree & Zero Stranding", () => {
    it("assigns deterministic parent-child IDs and filters out GitHub meta repositories", () => {
      const tree = buildHierarchicalProfileTree(sampleProfile);

      expect(tree.experiences.length).toBe(2);
      expect(tree.experiences[0].id).toBe("exp_0");
      expect(tree.experiences[0].bullets[0].id).toBe("exp_0_b0");
      expect(tree.experiences[0].bullets[1].id).toBe("exp_0_b1");
      expect(tree.experiences[1].id).toBe("exp_1");
      expect(tree.experiences[1].bullets[0].id).toBe("exp_1_b0");

      // Filtered out morganharper.github.io
      expect(tree.projects.length).toBe(1);
      expect(tree.projects[0].name).toBe("RouteOptimizer");
      expect(tree.projects[0].id).toBe("proj_0");
      expect(tree.projects[0].bullets[0].id).toBe("proj_0_b0");
    });

    it("hydrates selected bullets back into original experiences without stranding", () => {
      const tree = buildHierarchicalProfileTree(sampleProfile);
      const selectedBulletIds = new Set(["exp_0_b0", "proj_0_b0"]);

      const { selectedExperience, selectedProjects } = hydrateSelectedFromTree({
        tree,
        originalProfile: sampleProfile,
        selectedBulletIds,
      });

      expect(selectedExperience.length).toBe(1);
      expect(selectedExperience[0].company).toBe("Nexus Logistics");
      expect(selectedExperience[0].bullets.length).toBe(1);
      expect(selectedExperience[0].bullets[0].id).toBe("b-current-1");

      expect(selectedProjects.length).toBe(1);
      expect(selectedProjects[0].name).toBe("RouteOptimizer");
      expect(selectedProjects[0].bullets.length).toBe(1);
    });
  });

  describe("Job Context Distiller", () => {
    it("extracts competency tokens and strips stopwords", () => {
      const text = "We are seeking an experienced Systems Engineer to optimize PostgreSQL and Docker workflows.";
      const tokens = extractCompetencyTokens(text);

      expect(tokens).toContain("systems");
      expect(tokens).toContain("engineer");
      expect(tokens).toContain("optimize");
      expect(tokens).toContain("postgresql");
      expect(tokens).toContain("docker");
      expect(tokens).not.toContain("are");
      expect(tokens).not.toContain("seeking");
      expect(tokens).not.toContain("and");
    });

    it("detects seniority expectations from role title", () => {
      expect(detectSeniorityExpectation("Staff Infrastructure Architect")).toBe("Staff / Principal");
      expect(detectSeniorityExpectation("Lead Systems Engineer")).toBe("Lead / Manager");
      expect(detectSeniorityExpectation("Senior Operations Analyst")).toBe("Senior");
      expect(detectSeniorityExpectation("Operations Intern")).toBe("Early Career / Entry");
      expect(detectSeniorityExpectation("Operations Specialist")).toBe("Mid-Level Professional");
    });

    it("distills full JobTargetContext cleanly", () => {
      const context = distillJobContext({
        roleTitle: "Lead Logistics Coordinator",
        companyName: "FreightCo",
        jobRequirements: ["PostgreSQL database tuning", "Route optimization", "Fleet telemetry"],
      });

      expect(context.roleTitle).toBe("Lead Logistics Coordinator");
      expect(context.companyName).toBe("FreightCo");
      expect(context.coreCompetencies.length).toBeGreaterThan(0);
      expect(context.seniorityExpectation).toBe("Lead / Manager");
    });
  });

  describe("Deterministic Budget Assembler", () => {
    it("guarantees every experience receives at least 1 bullet in MANUAL mode", () => {
      const tree = buildHierarchicalProfileTree(sampleProfile);
      const job = distillJobContext({ roleTitle: "Systems Lead" });
      const rankings = heuristicRankProfile(tree, job);

      const budget = calculateElasticPageBudget({
        targetPages: 1,
        careerYears: 5,
        roleCount: 2,
        projectCount: 1,
        hasSummary: false,
        totalSourceBullets: 3,
        matchedRequirementsCount: 2,
      });

      const assembled = assembleWithinPageBudget(tree, rankings, budget, {
        contentInclusionMode: "MANUAL",
      });

      // Both experiences must have at least 1 bullet
      const exp0Bullets = Array.from(assembled.selectedBulletIds).filter((id) => id.startsWith("exp_0_"));
      const exp1Bullets = Array.from(assembled.selectedBulletIds).filter((id) => id.startsWith("exp_1_"));

      expect(exp0Bullets.length).toBeGreaterThanOrEqual(1);
      expect(exp1Bullets.length).toBeGreaterThanOrEqual(1);
    });

    it("strictly respects bulletBudgetMax without overflowing", () => {
      const tree = buildHierarchicalProfileTree(sampleProfile);
      const job = distillJobContext({ roleTitle: "Systems Lead" });
      const rankings = heuristicRankProfile(tree, job);

      const budget = calculateElasticPageBudget({
        targetPages: 1,
        careerYears: 5,
        roleCount: 2,
        projectCount: 1,
        hasSummary: true,
        totalSourceBullets: 3,
        matchedRequirementsCount: 2,
      });

      const assembled = assembleWithinPageBudget(tree, rankings, budget, {
        contentInclusionMode: "AI_OPTIMAL",
      });

      expect(assembled.selectedBulletIds.size).toBeLessThanOrEqual(budget.bulletBudgetMax);
    });

    it("deduplicates and caps project bullets", () => {
      const bullets = [
        "Architected real-time WebSocket telemetry pipeline across 10 nodes.",
        "Architected real-time WebSocket telemetry pipeline across 10 nodes.", // duplicate
        "Integrated PostgreSQL persistence layer.",
        "Formulated heuristic evaluation script.",
        "Deployed benchmark suite.",
        "Extra bullet beyond cap",
      ];

      const capped = dedupeAndCapProjectBullets(bullets, 3);
      expect(capped.length).toBe(3);
      expect(capped[0]).toBe("Architected real-time WebSocket telemetry pipeline across 10 nodes.");
      expect(capped[1]).toBe("Integrated PostgreSQL persistence layer.");
    });

    it("deduplicates identical experience bullets within the same role", () => {
      const raw = [
        { rawText: "Engineered an asynchronous telematics pipeline across 15 fleet units." },
        { rawText: "Hardened API security posture by migrating credentials." },
        { rawText: "Engineered an asynchronous telematics pipeline across 15 fleet units." }, // duplicate!
      ];

      const deduped = dedupeExperienceBullets(raw);
      expect(deduped.length).toBe(2);
      expect(deduped[0].rawText).toBe("Engineered an asynchronous telematics pipeline across 15 fleet units.");
      expect(deduped[1].rawText).toBe("Hardened API security posture by migrating credentials.");
    });
  });

  describe("Experience Reconciliation & ID Collision Defense", () => {
    it("guarantees unique IDs when two matching work experiences are reconciled additively", () => {
      const targetExp = {
        company: "EcoCAR",
        role: "Backend Engineer",
        location: "Davis, CA",
        category: "Work",
        startDate: "2025-09",
        endDate: "2026-05",
        displayOrder: 0,
        bullets: [
          { id: "exp-0-b-0", rawText: "Instrumented ShareCar telematics pipeline.", hasMetric: false, technologies: ["FastAPI"] },
          { id: "exp-0-b-1", rawText: "Hardened production API security.", hasMetric: false, technologies: ["FastAPI"] },
        ],
      };

      const incomingExp = {
        company: "EcoCAR",
        role: "Backend Engineer",
        location: "Davis, CA",
        category: "Work",
        startDate: "2025-09",
        endDate: "2026-05",
        displayOrder: 0,
        bullets: [
          // Same bullet IDs from another parsed resume!
          { id: "exp-0-b-0", rawText: "Engineered asynchronous telematics pipeline across 15 units.", hasMetric: true, technologies: ["FastAPI"] },
          { id: "exp-0-b-1", rawText: "Hardened production API security.", hasMetric: false, technologies: ["FastAPI"] },
        ],
      };

      const reconciled = reconcileWorkExperiencePair(targetExp, incomingExp);

      // Check all bullet IDs in reconciled experience are strictly unique
      const ids = reconciled.bullets.map((b) => b.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("Auxiliary Content & Sanitization", () => {
    it("reorders skills by matched keywords while preserving original categories", () => {
      const reordered = reorderSkillsForTarget(sampleProfile.skills, ["PostgreSQL"]);

      expect(reordered[0].label).toBe("Systems & Cloud");
      expect(reordered[0].items[0].name).toBe("PostgreSQL");
    });

    it("sanitizes persona diagnostic terms from candidate summaries", () => {
      const rawSummary = "A dedicated professional with deep background in operations. Seamlessly navigating a career transition from an earlier field.";
      const cleaned = sanitizeTailoredSummary(rawSummary);

      expect(cleaned).toBe("A dedicated professional with deep background in operations.");
      expect(cleaned).not.toContain("career transition");
      expect(cleaned).not.toContain("earlier field");
    });
  });

  describe("Prompt Artifact Sanitization", () => {
    it("strips conversational prefixes and wrapping quotes from small-model outputs", () => {
      expect(
        sanitizeReframedBulletText('Reframed as: "Engineered high-throughput event processor across 4 clusters."')
      ).toBe("Engineered high-throughput event processor across 4 clusters.");

      expect(
        sanitizeReframedBulletText('Reframed: "Optimized distributed queries saving 35% memory footprint."')
      ).toBe("Optimized distributed queries saving 35% memory footprint.");

      expect(
        sanitizeReframedBulletText('XYZ: "Spearheaded vendor integration shortening onboarding from 12 to 2 days."')
      ).toBe("Spearheaded vendor integration shortening onboarding from 12 to 2 days.");

      expect(
        sanitizeReframedBulletText('Bullet 1: "Automated test fixtures cutting regression duration by 40%."')
      ).toBe("Automated test fixtures cutting regression duration by 40%.");
    });
  });

  describe("Single-Page Physics & De-prioritization", () => {
    it("strictly caps featured projects to 2 and total bullets to single-page budget", () => {
      const tree = buildHierarchicalProfileTree({
        ...sampleProfile,
        projects: [
          { id: "p1", name: "P1", description: "", technologies: [], bullets: ["B1", "B2", "B3", "B4"] },
          { id: "p2", name: "P2", description: "", technologies: [], bullets: ["B1", "B2", "B3"] },
          { id: "p3", name: "P3", description: "", technologies: [], bullets: ["B1", "B2"] },
        ],
      });

      const budget = calculateElasticPageBudget({
        targetPages: 1,
        careerYears: 2,
        roleCount: 2,
        projectCount: 3,
        hasSummary: true,
        totalSourceBullets: 12,
        isCareerSwitcher: true,
      });

      const rankings = heuristicRankProfile(tree, distillJobContext({
        roleTitle: "Systems Lead",
        jobRequirements: ["Docker", "PostgreSQL"],
      }));

      const selection = assembleWithinPageBudget(tree, rankings, budget, {
        contentInclusionMode: "AI_OPTIMAL",
        includeSummary: true,
      });

      // Projects strictly capped at 2 on 1-page budget
      expect(selection.selectedProjectIds.length).toBeLessThanOrEqual(2);
      // Project bullets capped at 3 per project
      selection.selectedProjectIds.forEach((pid) => {
        expect(selection.projectBulletMap.get(pid)!.length).toBeLessThanOrEqual(3);
      });
      // Combined total bullets fit physical single-page geometry
      const totalBullets = selection.experienceBulletCount + selection.projectBulletCount;
      expect(totalBullets).toBeLessThanOrEqual(budget.bulletBudgetMax);
    });

    it("de-prioritizes volunteer and activity experiences so primary work roles yield budget first", () => {
      const tree = buildHierarchicalProfileTree({
        ...sampleProfile,
        experiences: [
          {
            id: "vol-1",
            company: "Local Meetup",
            role: "Volunteer Organizer",
            category: "Volunteer",
            location: null,
            displayOrder: 0,
            startDate: "2023-01",
            endDate: "Present",
            bullets: [{ id: "vb-1", rawText: "Organized monthly technical meetups with Docker topics.", hasMetric: false, technologies: [] }],
          },
          {
            id: "work-1",
            company: "Primary Tech Corp",
            role: "Software Developer",
            category: "Work",
            location: null,
            displayOrder: 1,
            startDate: "2021-01",
            endDate: "2022-12",
            bullets: [{ id: "wb-1", rawText: "Developed Dockerized web services.", hasMetric: true, technologies: [] }],
          },
        ],
      });

      const budget = calculateElasticPageBudget({
        targetPages: 1,
        careerYears: 3,
        roleCount: 2,
        projectCount: 0,
        hasSummary: true,
        totalSourceBullets: 2,
      });

      const rankings = heuristicRankProfile(tree, distillJobContext({
        roleTitle: "Developer",
        jobRequirements: ["Docker"],
      }));

      const selection = assembleWithinPageBudget(tree, rankings, budget, {
        contentInclusionMode: "AI_OPTIMAL",
        includeSummary: true,
      });

      // Primary work experience bullet must be selected
      expect(selection.selectedBulletIds.has("exp_1_b0")).toBe(true);
    });

    it("allows a zero-job candidate to expand projects across available 1-page space", () => {
      const tree = buildHierarchicalProfileTree({
        ...sampleProfile,
        experiences: [],
        projects: [
          { id: "p1", name: "P1", description: "", technologies: [], bullets: ["B1", "B2", "B3"] },
          { id: "p2", name: "P2", description: "", technologies: [], bullets: ["B1", "B2"] },
          { id: "p3", name: "P3", description: "", technologies: [], bullets: ["B1", "B2"] },
          { id: "p4", name: "P4", description: "", technologies: [], bullets: ["B1", "B2"] },
        ],
      });

      const budget = calculateElasticPageBudget({
        targetPages: 1,
        careerYears: 0,
        roleCount: 0,
        projectCount: 4,
        hasSummary: false,
        totalSourceBullets: 9,
        disabledSections: ["experience"],
      });

      const rankings = heuristicRankProfile(tree, distillJobContext({
        roleTitle: "Software Engineer",
        jobRequirements: ["TypeScript"],
      }));

      const selection = assembleWithinPageBudget(tree, rankings, budget, {
        contentInclusionMode: "AI_OPTIMAL",
        experiencesDisabled: true,
      });

      // Projects expand beyond the 2-project cap when candidate has no jobs
      expect(selection.selectedProjectIds.length).toBeGreaterThanOrEqual(3);
    });

    it("ranks skill categories by target relevance so categories with matching tools appear first", () => {
      const skills = [
        {
          label: "Design & UX",
          parentCategory: null,
          items: [{ name: "Figma", proficiency: null }],
        },
        {
          label: "Databases & Backend",
          parentCategory: null,
          items: [{ name: "PostgreSQL", proficiency: null }, { name: "Redis", proficiency: null }],
        },
      ];

      const ranked = reorderSkillsForTarget(skills, ["PostgreSQL", "Backend"]);

      // Databases & Backend should be ranked first because it matches the target job
      expect(ranked[0].label).toBe("Databases & Backend");
      expect(ranked[0].items[0].name).toBe("PostgreSQL");
    });

    it("proportionally curates skills on 1-page budget while preserving 100% of target matches and small lists", () => {
      // Small profile (e.g. 8 skills for an educator): 100% preserved
      const educatorSkills = [
        {
          label: "Pedagogy",
          parentCategory: null,
          items: [
            { name: "Curriculum Design", proficiency: null },
            { name: "Classroom Management", proficiency: null },
          ],
        },
      ];
      const preserved = reorderSkillsForTarget(educatorSkills, ["Curriculum Design"], { targetPages: 1 });
      expect(preserved[0].items.length).toBe(2);

      // Oversized profile (35 skills): curated to <= 24 total items, but target matches are NEVER dropped
      const manySkills = [
        {
          label: "Category A",
          parentCategory: null,
          items: Array.from({ length: 20 }, (_, i) => ({ name: `Skill A${i}`, proficiency: null })),
        },
        {
          label: "Category B",
          parentCategory: null,
          items: Array.from({ length: 15 }, (_, i) => ({ name: `Skill B${i}`, proficiency: null })),
        },
      ];
      const curated = reorderSkillsForTarget(manySkills, ["Skill A19", "Skill B14"], { targetPages: 1 });
      const totalItems = curated.reduce((acc, g) => acc + g.items.length, 0);
      expect(totalItems).toBeLessThanOrEqual(24);
      // Critical target matches must be preserved
      const allNames = curated.flatMap((g) => g.items.map((i) => i.name));
      expect(allNames).toContain("Skill A19");
      expect(allNames).toContain("Skill B14");
    });

    it("generates a career-agnostic executive summary when profile has no pre-written summary", () => {
      const summary = generateAgnosticExecutiveSummary({
        roleTitle: "Staff Clinical Coordinator",
        experiences: [{ role: "Registered Nurse", company: "Metro Hospital" }],
        skills: [{ label: "Clinical", parentCategory: null, items: [{ name: "Patient Triage", proficiency: null }] }],
        targetCompetencies: ["Patient Triage", "Compliance"],
      });

      expect(summary).toBeDefined();
      expect(summary).toContain("Registered Nurse");
      expect(summary).toContain("Patient Triage");
      expect(summary).not.toContain("career switch");
      expect(summary).not.toContain("earlier field");
    });

    it("safely clamps an overloaded 22-bullet draft to physical 1-page ceiling", () => {
      const heavyProjects = [
        { id: "p1", name: "P1", description: "", technologies: [], bullets: ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4"] },
        { id: "p2", name: "P2", description: "", technologies: [], bullets: ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4"] },
        { id: "p3", name: "P3", description: "", technologies: [], bullets: ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4"] },
        { id: "p4", name: "P4", description: "", technologies: [], bullets: ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4"] },
      ];

      const heavyExperiences = [
        {
          id: "exp-1",
          company: "C1",
          role: "R1",
          location: null,
          category: "Work",
          displayOrder: 0,
          startDate: "2024",
          endDate: "Present",
          bullets: [
            { id: "b1", rawText: "Engineered scalable telemetry endpoints across 15+ nodes.", technologies: [], hasMetric: true },
            { id: "b2", rawText: "Hardened security infrastructure and credentials.", technologies: [], hasMetric: false },
            { id: "b3", rawText: "Standardized microservice boundaries and API specifications.", technologies: [], hasMetric: false },
            { id: "b4", rawText: "Integrated continuous integration and testing workflows.", technologies: [], hasMetric: true },
          ],
        },
        {
          id: "exp-2",
          company: "C2",
          role: "R2",
          location: null,
          category: "Work",
          displayOrder: 1,
          startDate: "2022",
          endDate: "2024",
          bullets: [{ id: "b5", rawText: "Coordinated deployments across regional data centers.", technologies: [], hasMetric: true }],
        },
        {
          id: "exp-3",
          company: "C3",
          role: "R3",
          location: null,
          category: "Work",
          displayOrder: 2,
          startDate: "2020",
          endDate: "2022",
          bullets: [{ id: "b6", rawText: "Monitored mission-critical defense networks.", technologies: [], hasMetric: true }],
        },
      ];

      const clamped = clampPdfContentToPhysicalCeiling({
        targetPages: 1,
        fixedSectionsHeight: 250,
        experiences: heavyExperiences,
        projects: heavyProjects,
      });

      expect(clamped.didClamp).toBe(true);
      // Projects clamped down to top 2 to preserve experience
      expect(clamped.projects.length).toBeLessThanOrEqual(2);
      const height = calculateContentPointHeight(clamped.experiences, clamped.projects);
      // Total content height fits comfortably within single page (720 - 250 = 470pt)
      expect(height.totalContentHeight).toBeLessThanOrEqual(470);
    });

    it("strictly resolves to 1 page in auto mode for career switchers despite large calendar span", () => {
      const budget = calculateElasticPageBudget({
        targetPages: "auto",
        careerYears: 13, // 13 calendar years from earlier field
        roleCount: 6,
        isCareerSwitcher: true,
        projectCount: 4,
        hasSummary: true,
        totalSourceBullets: 25,
        educationCount: 2,
        credentialCount: 0,
        disabledSections: [],
      });

      expect(budget.targetPages).toBe(1);
      expect(budget.bulletBudgetMax).toBeLessThanOrEqual(10);
    });

    it("dynamically selects the best verified title from work history that aligns with target role", () => {
      const experiences = [
        { role: "Mobility Team Backend Engineer", company: "EcoCAR" },
        { role: "Cryptologic Technician (Networking)", company: "US Navy" },
      ];

      // Target 1: Distributed Backend Systems -> picks Backend Engineer
      const summary1 = generateAgnosticExecutiveSummary({
        roleTitle: "Senior Distributed Systems & Backend Engineer III",
        experiences,
        skills: [{ label: "Languages", parentCategory: null, items: [{ name: "Python", proficiency: null }, { name: "TypeScript", proficiency: null }] }],
        targetCompetencies: ["backend", "distributed", "systems"],
        isCareerSwitcherOrEarlyTenure: true,
      });

      expect(summary1).toContain("Backend Engineer");
      expect(summary1).not.toMatch(/\bSenior\b/);
      expect(summary1).not.toMatch(/\bIII\b/);

      // Target 2: Defense Network Security -> dynamically picks Cryptologic Technician (Networking)
      const summary2 = generateAgnosticExecutiveSummary({
        roleTitle: "Network Defense & Vulnerability Analyst",
        experiences,
        skills: [{ label: "Languages", parentCategory: null, items: [{ name: "Python", proficiency: null }] }],
        targetCompetencies: ["network", "defense", "vulnerability"],
        isCareerSwitcherOrEarlyTenure: true,
      });

      expect(summary2).toContain("Cryptologic Technician (Networking)");

      // Target 3: Senior AI Engineer III when candidate only has Backend Engineer -> uses verified Backend Engineer, NEVER fake AI Engineer
      const summary3 = generateAgnosticExecutiveSummary({
        roleTitle: "Senior AI Engineer III",
        experiences,
        skills: [{ label: "Languages", parentCategory: null, items: [{ name: "Python", proficiency: null }, { name: "TypeScript", proficiency: null }] }],
        targetCompetencies: ["python", "typescript"],
        isCareerSwitcherOrEarlyTenure: true,
      });

      expect(summary3).toContain("Backend Engineer");
      expect(summary3).not.toContain("AI Engineer");
    });
  });
});
