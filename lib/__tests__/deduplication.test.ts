import { describe, it, expect } from "vitest";
import {
  classifyBulletTypologies,
  calculateTitleWeight,
  resolveBestProjectTitle,
  calculateProjectSimilarity,
  computeBulletDensity,
  reconcileProjectBullets,
  reconcileProjectPair,
  deduplicateProjectCollection,
  isWorkExperienceMatch,
  reconcileWorkExperiencePair,
  deduplicateWorkExperienceCollection,
  hasThematicOverlap,
  stripLegalSuffixes,
  MAX_PRIMARY_PROJECT_BULLETS,
} from "@/lib/profile/deduplication";
import { consolidateProfiles } from "@/lib/profile/profile-consolidation";
import { getEmptyMasterProfileData } from "@/lib/validations/profile";

describe("Universal Deduplication & Typology Engine", () => {
  describe("1. 8-Dimension Universal Typology Classifier (100% Career Agnostic)", () => {
    it("classifies pure quantitative metric impact", () => {
      const types = classifyBulletTypologies("Achieved a 45% reduction in latency and $120K in cost savings.");
      expect(types).toContain("METRIC_QUANTITATIVE");
    });

    it("classifies leadership and coordination verbs", () => {
      const types = classifyBulletTypologies("Spearheaded a cross-functional team of 8 analysts and mentored 3 junior associates.");
      expect(types).toContain("LEADERSHIP_COORDINATION");
    });

    it("classifies process optimization and bottleneck elimination", () => {
      const types = classifyBulletTypologies("Streamlined inventory processing workflows, automating intake to eliminate operational bottlenecks.");
      expect(types).toContain("PROCESS_OPTIMIZATION");
    });

    it("classifies research, evaluation, and benchmarking", () => {
      const types = classifyBulletTypologies("Benchmarked alternative neural architectures and audited clinical trial variance.");
      expect(types).toContain("RESEARCH_ANALYSIS");
    });

    it("classifies governance, security, and quality compliance across disciplines", () => {
      const types = classifyBulletTypologies("Enforced strict HIPAA compliance protocols and hardened cryptographic storage across database partitions.");
      expect(types).toContain("GOVERNANCE_COMPLIANCE_QUALITY");
    });

    it("classifies client and stakeholder relationship management", () => {
      const types = classifyBulletTypologies("Negotiated strategic partnerships with key hospital stakeholders and advised patient advocacy boards.");
      expect(types).toContain("CLIENT_STAKEHOLDER");
    });

    it("classifies 0-to-1 innovation and product ownership", () => {
      const types = classifyBulletTypologies("Pioneered and architected a novel autonomous navigation system from initial prototype to deployment.");
      expect(types).toContain("INNOVATION_PRODUCT_OWNERSHIP");
    });

    it("multi-labels high-dimensional CAR bullets with up to 3 typologies", () => {
      const types = classifyBulletTypologies(
        "Orchestrated cross-functional migration of 5 services, streamlining CI/CD pipelines to cut deployment time by 60%."
      );
      expect(types).toContain("LEADERSHIP_COORDINATION");
      expect(types).toContain("PROCESS_OPTIMIZATION");
      expect(types).toContain("METRIC_QUANTITATIVE");
      expect(types.length).toBeLessThanOrEqual(3);
    });

    it("falls back safely to EXECUTION_DELIVERY when no specialized keywords match", () => {
      const types = classifyBulletTypologies("Updated team notes and handled daily documentation intake.");
      expect(types).toContain("EXECUTION_DELIVERY");
      expect(types.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("2. Title Weight & Polish Scorer", () => {
    it("awards high weight to descriptive titles with subtitles", () => {
      const { score } = calculateTitleWeight("SafeHaven – Disguised Domestic Violence Platform");
      expect(score).toBeGreaterThanOrEqual(4.0);
    });

    it("penalizes repository slug bloat and file extensions", () => {
      const slugWeight = calculateTitleWeight("user/connect-4-solver.py");
      const cleanWeight = calculateTitleWeight("Connect 4 Player Agent");
      expect(cleanWeight.score).toBeGreaterThan(slugWeight.score);
    });

    it("penalizes submission and temporary noise words", () => {
      const noiseWeight = calculateTitleWeight("Final HW2 Project Submission");
      const cleanWeight = calculateTitleWeight("Distributed Message Queue");
      expect(cleanWeight.score).toBeGreaterThan(noiseWeight.score);
    });

    it("resolves the best title between a short name and a descriptive subtitle", () => {
      const resolved = resolveBestProjectTitle(
        "SafeHaven",
        "SafeHaven – Disguised Domestic Violence Platform",
        { origin: "HUMAN_VERIFIED" },
        { origin: "GITHUB_INFERRED", description: "Emergency assistance platform for survivors" }
      );
      expect(resolved).toBe("SafeHaven – Disguised Domestic Violence Platform");
    });
  });

  describe("3. 4-Signal Project Similarity Engine", () => {
    it("detects exact URL match with high confidence", () => {
      const sim = calculateProjectSimilarity(
        { name: "My App", bullets: [], link: "https://github.com/org/app" },
        { name: "App v2", bullets: [], link: "https://github.com/org/app" }
      );
      expect(sim.isMatch).toBe(true);
      expect(sim.score).toBeGreaterThanOrEqual(0.65);
    });

    it("detects base name match across delimiter subtitles", () => {
      const sim = calculateProjectSimilarity(
        { name: "SafeHaven", bullets: [], link: null },
        { name: "SafeHaven – Disguised Safety Platform", bullets: [], link: null }
      );
      expect(sim.isMatch).toBe(true);
      expect(sim.reason).toContain("Base name match");
    });

    it("applies contradiction penalty when technology stacks are completely disjoint", () => {
      const sim = calculateProjectSimilarity(
        { name: "Portfolio", technologies: ["Swift", "iOS", "Xcode"], bullets: [] },
        { name: "Portfolio", technologies: ["Python", "PyTorch", "CUDA"], bullets: [] }
      );
      expect(sim.reason).toContain("Disjoint stack contradiction penalty");
    });

    it("activates subsystem bullet probe for borderline matches", () => {
      const sim = calculateProjectSimilarity(
        {
          name: "Telemetry Engine",
          bullets: ["Implemented real-time ASCII telemetry pipeline via WebSocket."],
          technologies: ["Node.js"],
        },
        {
          name: "Dashboard Telemetry",
          bullets: ["Instrumented ASCII telemetry pipeline streaming metrics to UI."],
          technologies: ["TypeScript"],
        }
      );
      expect(sim.isMatch).toBe(true);
      expect(sim.reason).toContain("Subsystem bullet probe confirmed match");
    });

    it("matches multi-word projects across diverse career disciplines via Szymkiewicz-Simpson containment and prefix roots", () => {
      // 1. Environmental Science / Emergency Response
      const wildfireMatch = calculateProjectSimilarity(
        { name: "Embergency – Wildfire Response Assistant", bullets: [] },
        { name: "Embergency Wildfire Response Tool", bullets: [] }
      );
      expect(wildfireMatch.isMatch).toBe(true);
      expect(wildfireMatch.score).toBeGreaterThanOrEqual(0.5);

      // 2. Healthcare / Clinical Operations
      const clinicalMatch = calculateProjectSimilarity(
        { name: "HealthPortal – Clinical Record System", bullets: [] },
        { name: "HealthPortal Patient Manager", bullets: [] }
      );
      expect(clinicalMatch.isMatch).toBe(true);

      // 3. Finance / Quantitative Settlement
      const financeMatch = calculateProjectSimilarity(
        { name: "AlphaLedger – Real-Time Settlement Engine", bullets: [] },
        { name: "AlphaLedger Clearing Gateway", bullets: [] }
      );
      expect(financeMatch.isMatch).toBe(true);

      // 4. Education / Adaptive Learning
      const educationMatch = calculateProjectSimilarity(
        { name: "LexiLearn – Adaptive Reading Comprehension", bullets: [] },
        { name: "LexiLearn Platform", bullets: [] }
      );
      expect(educationMatch.isMatch).toBe(true);
    });
  });

  describe("4. Sibling Variants & Bullet Reconciliation", () => {
    it("adds non-overlapping inferred bullet as an additive externally-sourced primary bullet", () => {
      const result = reconcileProjectBullets(
        ["Architected distributed ledger attaining 99.999% consistency."],
        ["Engineered generic Dockerfile setup for local testing."],
        [],
        [],
        "HUMAN_VERIFIED",
        "GITHUB_INFERRED"
      );

      // Primary bullets contain human bullet + additive distinct inferred bullet
      expect(result.bullets).toHaveLength(2);
      expect(result.bullets[0]).toBe("Architected distributed ledger attaining 99.999% consistency.");
      expect(result.bullets[1]).toBe("Engineered generic Dockerfile setup for local testing.");
      expect(result.bulletOrigins[result.bullets[0]!]).toBe("HUMAN_VERIFIED");
      expect(result.bulletOrigins[result.bullets[1]!]).toBe("GITHUB_INFERRED");
    });

    it("guarantees human-verified bullet is preserved as primary and inferred bullet becomes companion variant when overlapping", () => {
      const humanBullet =
        "Integrated the Anthropic Claude SDK with trauma-informed prompt engineering to deliver 24/7 AI-driven safety-planning guidance, bypassing auditable phone hotlines as a covert support channel.";
      const inferredBullet =
        "Provided survivors with safety planning and emotional support through a trauma-informed assistant.";

      const result = reconcileProjectBullets(
        [humanBullet],
        [inferredBullet],
        [],
        [],
        "HUMAN_VERIFIED",
        "GITHUB_INFERRED",
        { [humanBullet]: "HUMAN_VERIFIED" },
        { [inferredBullet]: "GITHUB_INFERRED" }
      );

      // Human bullet MUST remain primary
      expect(result.bullets).toHaveLength(1);
      expect(result.bullets[0]).toBe(humanBullet);
      expect(result.bulletOrigins[humanBullet]).toBe("HUMAN_VERIFIED");

      // Inferred bullet MUST become companion variant
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0]!.text).toBe(inferredBullet);
      expect(result.variants[0]!.origin).toBe("GITHUB_INFERRED");
      expect(result.variants[0]!.shadowOf).toBe(humanBullet);
    });

    it("refreshes GITHUB_INFERRED project bullets on resync to avoid infinite bullet accumulation", () => {
      const result = reconcileProjectBullets(
        ["Old inferred bullet 1", "Old inferred bullet 2"],
        ["New refreshed bullet 1", "New refreshed bullet 2", "New refreshed bullet 3"],
        [],
        [],
        "GITHUB_INFERRED",
        "GITHUB_INFERRED"
      );

      expect(result.bullets).toHaveLength(3);
      expect(result.bullets).toEqual([
        "New refreshed bullet 1",
        "New refreshed bullet 2",
        "New refreshed bullet 3",
      ]);
    });

    it("reconciles conflicting HUMAN_VERIFIED bullets via recency promotion and archival revision", () => {
      const result = reconcileProjectBullets(
        ["Led team of 5 engineers delivering payment gateway, increasing checkout conversion by 20%."],
        ["Led team of 8 engineers scaling payment gateway, increasing checkout conversion by 35%."],
        [],
        [],
        "HUMAN_VERIFIED",
        "HUMAN_VERIFIED"
      );

      // Incoming newer human bullet becomes active primary
      expect(result.bullets).toHaveLength(1);
      expect(result.bullets[0]).toContain("35%");

      // Older human bullet is preserved as an archived revision (zero data loss)
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0]!.status).toBe("ARCHIVED_REVISION");
      expect(result.variants[0]!.text).toContain("20%");
      expect(result.variants[0]!.supersededAt).toBeDefined();
    });

    it("caps primary bullets at 15 and overflows additional bullets into variants without data loss", () => {
      const existingBullets = Array.from({ length: 14 }, (_, i) => `Human verified capability achievement #${i + 1}`);
      const incomingBullets = [
        "Extra accomplishment item A",
        "Extra accomplishment item B",
        "Extra accomplishment item C",
      ];

      const result = reconcileProjectBullets(
        existingBullets,
        incomingBullets,
        [],
        [],
        "HUMAN_VERIFIED",
        "HUMAN_VERIFIED"
      );

      expect(result.bullets.length).toBe(MAX_PRIMARY_PROJECT_BULLETS);
      // Overflow items moved to variants
      expect(result.variants.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("5. Universal Intra-Collection Deduplication & overwriteAll Bug Fix", () => {
    it("deduplicates resume project and github project in a single collection", () => {
      const mixed = [
        {
          name: "SafeHaven – Disguised Domestic Violence Platform",
          description: "Emergency shelter assistance platform",
          technologies: ["React", "Node.js"],
          bullets: ["Engineered disguised calculator UI for survivor safety."],
          origin: "HUMAN_VERIFIED" as const,
        },
        {
          name: "SafeHaven",
          description: "Domestic violence web platform",
          technologies: ["React", "TypeScript", "WebSocket"],
          bullets: ["Implemented serverless WebSocket streaming for instant panic wipe."],
          origin: "GITHUB_INFERRED" as const,
        },
      ];

      const deduplicated = deduplicateProjectCollection(mixed);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]!.origin).toBe("HUMAN_VERIFIED");
      expect(deduplicated[0]!.name).toBe("SafeHaven – Disguised Domestic Violence Platform");
      expect(deduplicated[0]!.technologies).toContain("WebSocket");
      // Contains human bullet and additive distinct inferred capability
      expect(deduplicated[0]!.bullets).toHaveLength(2);
      expect(deduplicated[0]!.bulletOrigins?.[deduplicated[0]!.bullets[0]!]).toBe("HUMAN_VERIFIED");
      expect(deduplicated[0]!.bulletOrigins?.[deduplicated[0]!.bullets[1]!]).toBe("GITHUB_INFERRED");
    });

    it("deduplicates multi-word project pairs like Embergency into a single unified project", () => {
      const projects = [
        {
          name: "Embergency – Wildfire Response Assistant",
          description: "Civic response platform for emergency evacuation routing",
          technologies: ["Next.js", "Python", "Tailwind CSS"],
          bullets: [
            "Formulated a 3-tier fallback hierarchy to gracefully degrade inference performance.",
            "Architected a zero-clone Ollama quick-connect bridge leveraging Cloudflare Quick Tunnel.",
            "Designed a real-time ASCII telemetry pipeline to monitor model invocations.",
          ],
          origin: "HUMAN_VERIFIED" as const,
        },
        {
          name: "Embergency Wildfire Response Tool",
          description: "Wildfire situational awareness dashboard and routing tool",
          technologies: ["TypeScript", "Python", "FastAPI"],
          bullets: [
            "Detected and mitigated automated noise in inbound emails, and extracted relevant job links.",
            "Developed a multi-stage scraping pipeline to process job links.",
          ],
          origin: "GITHUB_INFERRED" as const,
        },
      ];

      const deduplicated = deduplicateProjectCollection(projects);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]!.origin).toBe("HUMAN_VERIFIED");
      // The descriptive subtitle from the human project is preserved
      expect(deduplicated[0]!.name).toBe("Embergency – Wildfire Response Assistant");
      // Primary bullets are the 3 human verified bullets + 2 additive externally-sourced bullets
      expect(deduplicated[0]!.bullets).toHaveLength(5);
      expect(deduplicated[0]!.bullets[0]).toContain("Formulated a 3-tier fallback hierarchy");
      expect(deduplicated[0]!.bulletOrigins?.[deduplicated[0]!.bullets[0]!]).toBe("HUMAN_VERIFIED");
      expect(deduplicated[0]!.bulletOrigins?.[deduplicated[0]!.bullets[3]!]).toBe("GITHUB_INFERRED");
    });

    it("tracks bulletOrigins so non-companion bullets can be cleanly partitioned into Resume Highlights and Technical Insights", () => {
      const project = {
        name: "SafeHaven – Disguised Platform",
        description: "Emergency shelter assistance platform",
        technologies: ["React", "TypeScript"],
        bullets: [
          "Authored disguised calculator interface ensuring discreet operation.",
          "Implemented automated encrypted journal purging upon panic gesture.",
        ],
        bulletOrigins: {
          "Authored disguised calculator interface ensuring discreet operation.": "HUMAN_VERIFIED",
          "Implemented automated encrypted journal purging upon panic gesture.": "GITHUB_INFERRED",
        },
        origin: "HUMAN_VERIFIED" as const,
      };

      const deduplicated = deduplicateProjectCollection([project]);
      expect(deduplicated[0]!.bulletOrigins).toBeDefined();
      expect(
        deduplicated[0]!.bulletOrigins![
          "Authored disguised calculator interface ensuring discreet operation."
        ]
      ).toBe("HUMAN_VERIFIED");
      expect(
        deduplicated[0]!.bulletOrigins![
          "Implemented automated encrypted journal purging upon panic gesture."
        ]
      ).toBe("GITHUB_INFERRED");
    });

    it("deduplicates correctly during overwriteAll: true (eliminating the staging leak)", () => {
      const existing = {
        ...getEmptyMasterProfileData(),
        projects: [
          {
            name: "SafeHaven – Disguised Domestic Violence Platform",
            description: "Shelter platform",
            technologies: ["React"],
            bullets: ["Verified bullet A."],
            origin: "HUMAN_VERIFIED" as const,
          },
        ],
      };

      const incomingWithDraftDuplicates = {
        ...getEmptyMasterProfileData(),
        projects: [
          {
            name: "SafeHaven – Disguised Domestic Violence Platform",
            description: "Shelter platform",
            technologies: ["React"],
            bullets: ["Verified bullet A."],
            origin: "HUMAN_VERIFIED" as const,
          },
          {
            name: "SafeHaven",
            description: "Shelter platform repo",
            technologies: ["React", "TypeScript"],
            bullets: ["Inferred bullet B."],
            origin: "GITHUB_INFERRED" as const,
          },
        ],
      };

      const consolidated = consolidateProfiles(existing, incomingWithDraftDuplicates, {
        overwriteAll: true,
      });

      // Crucial fix: even in overwriteAll, duplicates inside incoming are reconciled into 1 project!
      expect(consolidated.projects).toHaveLength(1);
      expect(consolidated.projects[0]!.name).toBe("SafeHaven – Disguised Domestic Violence Platform");
    });
  });

  describe("6. Work Experience Multi-Role Promotion Handling", () => {
    it("distinguishes sequential promotions at the same employer from duplicate entries", () => {
      const juniorRole = {
        company: "Acme Corp, Inc.",
        role: "Associate Software Engineer",
        location: null,
        category: "Work",
        startDate: "2020-01",
        endDate: "2022-01",
        bullets: [{ id: "b1", rawText: "Built internal frontend tools.", technologies: [], hasMetric: false }],
        displayOrder: 0,
      };

      const seniorRole = {
        company: "Acme Corp",
        role: "Senior Staff Architect",
        location: null,
        category: "Work",
        startDate: "2022-02",
        endDate: "2024-05",
        bullets: [{ id: "b2", rawText: "Spearheaded core cloud architecture.", technologies: [], hasMetric: false }],
        displayOrder: 1,
      };

      // Distinct dates + distinct titles must NOT match as duplicates
      const isMatch = isWorkExperienceMatch(juniorRole, seniorRole);
      expect(isMatch).toBe(false);

      const consolidated = deduplicateWorkExperienceCollection([juniorRole, seniorRole]);
      expect(consolidated).toHaveLength(2);
    });

    it("merges identical roles at the same company additively with revision preservation", () => {
      const role1 = {
        company: "Stripe LLC",
        role: "Backend Engineer",
        location: null,
        category: "Work",
        startDate: "2021-01",
        endDate: "2023-01",
        bullets: [{ id: "b1", rawText: "Maintained payment processing pipeline.", technologies: [], hasMetric: false }],
        displayOrder: 0,
      };

      const role2 = {
        company: "Stripe",
        role: "Backend Engineer",
        location: null,
        category: "Work",
        startDate: "2021-01",
        endDate: "2023-01",
        bullets: [{ id: "b2", rawText: "Architected real-time fraud mitigation filter.", technologies: [], hasMetric: false }],
        displayOrder: 1,
      };

      const isMatch = isWorkExperienceMatch(role1, role2);
      expect(isMatch).toBe(true);

      const consolidated = deduplicateWorkExperienceCollection([role1, role2]);
      expect(consolidated).toHaveLength(1);
      expect(consolidated[0]!.bullets).toHaveLength(2);
    });
  });
});
