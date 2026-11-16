import { describe, expect, it } from "vitest";
import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import {
  extractCandidateAccomplishments,
  extractVerbatimAnchorText,
  isDisjointDomain,
  mapTransferableSkills,
  validateVerbatimAnchor,
} from "../transferable-skills";

describe("Grounded Transferable Skills Engine", () => {
  describe("extractCandidateAccomplishments", () => {
    it("extracts bullets from work experiences with exact text preservation", () => {
      const profile: MasterProfileInput = {
        fullName: "Alex Taylor",
        email: "alex@example.com",
        phone: null,
        location: "Sacramento, CA",
        summary: "Versatile professional with crisis management background.",
        links: [],
        skills: [],
        experiences: [
          {
            id: "exp-nurse-1",
            company: "Mercy General Hospital",
            role: "Emergency Department Charge Nurse",
            location: null,
            category: "Clinical",
            startDate: "2019-01",
            endDate: "2023-08",
            displayOrder: 0,
            bullets: [
              {
                id: "b-nurse-1",
                rawText:
                  "Triaged over 40 critical patients daily under high-pressure conditions while coordinating multidisciplinary staff.",
                hasMetric: true,
                technologies: [],
              },
              {
                id: "b-nurse-2",
                rawText:
                  "Standardized emergency room inventory replenishment protocol, eliminating critical supply shortages by 35%.",
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

      const accomplishments = extractCandidateAccomplishments(profile);

      expect(accomplishments).toHaveLength(2);
      expect(accomplishments[0]).toMatchObject({
        id: "b-nurse-1",
        sourceExperienceId: "exp-nurse-1",
        company: "Mercy General Hospital",
        role: "Emergency Department Charge Nurse",
        category: "Clinical",
        text: "Triaged over 40 critical patients daily under high-pressure conditions while coordinating multidisciplinary staff.",
        rawBullet:
          "Triaged over 40 critical patients daily under high-pressure conditions while coordinating multidisciplinary staff.",
      });
    });

    it("extracts bullets from projects when present", () => {
      const profile: MasterProfileInput = {
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        phone: null,
        location: null,
        summary: null,
        links: [],
        skills: [],
        experiences: [],
        projects: [
          {
            id: "proj-logistics",
            name: "Community Aid Logistics Portal",
            description: "Coordinated volunteer logistics and resource allocation.",
            technologies: [],
            bullets: [
              "Designed route optimization spreadsheet saving 12 hours per week of driver transit time.",
            ],
          },
        ],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      };

      const accomplishments = extractCandidateAccomplishments(profile);
      expect(accomplishments).toHaveLength(1);
      expect(accomplishments[0].sourceExperienceId).toBe("proj-logistics");
      expect(accomplishments[0].category).toBe("Project");
      expect(accomplishments[0].text).toContain("route optimization");
    });

    it("falls back to summary when experiences and projects are empty", () => {
      const profile: MasterProfileInput = {
        fullName: "Morgan Diaz",
        email: "morgan@example.com",
        phone: null,
        location: null,
        summary:
          "Experienced operations coordinator skilled in cross-functional dispatch and workflow monitoring.",
        links: [],
        skills: [],
        experiences: [],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      };

      const accomplishments = extractCandidateAccomplishments(profile);
      expect(accomplishments).toHaveLength(1);
      expect(accomplishments[0].sourceExperienceId).toBe("summary");
      expect(accomplishments[0].category).toBe("Summary");
    });
  });

  describe("isDisjointDomain", () => {
    it("identifies non-work categories (Clinical, Military, Athletics) as disjoint domains", () => {
      expect(
        isDisjointDomain("Operations Coordinator", "Registered Nurse", "Clinical")
      ).toBe(true);
      expect(
        isDisjointDomain("Project Manager", "Logistics Specialist", "Military")
      ).toBe(true);
      expect(
        isDisjointDomain("Account Executive", "Team Captain", "Athletics")
      ).toBe(true);
    });

    it("identifies disjoint domains when title token stems do not overlap", () => {
      // Nursing vs Operations
      expect(
        isDisjointDomain(
          "Operations Coordinator",
          "Emergency Room Nurse",
          "Work"
        )
      ).toBe(true);

      // Aviation Mechanic vs Quality Assurance
      expect(
        isDisjointDomain(
          "Quality Assurance Analyst",
          "Aviation Maintenance Technician",
          "Work"
        )
      ).toBe(true);

      // Teaching vs Technical Curriculum Designer
      expect(
        isDisjointDomain(
          "Financial Underwriter",
          "High School Chemistry Teacher",
          "Work"
        )
      ).toBe(true);
    });

    it("identifies matching / same-domain roles when title stems overlap", () => {
      // Senior Software Engineer vs Software Developer
      expect(
        isDisjointDomain(
          "Senior Software Engineer",
          "Software Developer",
          "Work"
        )
      ).toBe(false);

      // Product Manager vs Associate Product Manager
      expect(
        isDisjointDomain(
          "Director of Product Management",
          "Product Manager",
          "Work"
        )
      ).toBe(false);
    });
  });

  describe("extractVerbatimAnchorText & validateVerbatimAnchor", () => {
    const sampleProfile: MasterProfileInput = {
      fullName: "Casey Rivera",
      email: "casey@example.com",
      phone: null,
      location: null,
      summary: null,
      links: [],
      skills: [],
      experiences: [
        {
          id: "exp-paramedic",
          company: "City Emergency Medical Services",
          role: "Lead Flight Paramedic",
          location: null,
          category: "Clinical",
          startDate: "2018-05",
          endDate: "2024-01",
          displayOrder: 0,
          bullets: [
            {
              id: "b-para-1",
              rawText:
                "Coordinated critical care incident triage across multiple agency helicopters, ensuring zero protocol deviations during high-stress operations.",
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

    it("extracts a verbatim anchor text that is guaranteed to be a literal substring", () => {
      const sourceBullet =
        "Coordinated critical care incident triage across multiple agency helicopters, ensuring zero protocol deviations during high-stress operations.";
      const anchor = extractVerbatimAnchorText(
        sourceBullet,
        "Rapid crisis triage and incident escalation"
      );

      expect(sourceBullet).toContain(anchor);
      expect(anchor.length).toBeGreaterThan(15);
    });

    it("validates exact verbatim substring matches against the source profile", () => {
      const validMapping = {
        targetRequirement: "Incident response management under pressure",
        sourceExperienceId: "exp-paramedic",
        verbatimAnchorText:
          "Coordinated critical care incident triage across multiple agency helicopters",
        similarity: 0.78,
        transferRationale: "Direct functional alignment.",
      };

      expect(validateVerbatimAnchor(validMapping, sampleProfile)).toBe(true);
    });

    it("strictly rejects hallucinated or modified anchor text", () => {
      const hallucinatedMapping = {
        targetRequirement: "Incident response management under pressure",
        sourceExperienceId: "exp-paramedic",
        // Modified: "multiple agency" changed to "diverse medical"
        verbatimAnchorText:
          "Coordinated critical care incident triage across diverse medical helicopters",
        similarity: 0.78,
        transferRationale: "Fabricated claim.",
      };

      expect(validateVerbatimAnchor(hallucinatedMapping, sampleProfile)).toBe(
        false
      );
    });

    it("rejects mapping with non-existent source experience ID", () => {
      const invalidExpMapping = {
        targetRequirement: "Incident response",
        sourceExperienceId: "exp-nonexistent",
        verbatimAnchorText: "Coordinated critical care incident triage",
        similarity: 0.75,
        transferRationale: "Invalid id.",
      };

      expect(validateVerbatimAnchor(invalidExpMapping, sampleProfile)).toBe(
        false
      );
    });
  });

  describe("mapTransferableSkills across diverse career-switcher fixtures", () => {
    it("maps transferable skills for a healthcare worker transitioning to operations", () => {
      const requirements = [
        "Coordinate cross-functional emergency escalation and incident response protocols",
        "Manage supply chain inventory reconciliation and vendor discrepancy disputes",
        "Track regulatory compliance documentation and safety audit adherence",
      ];

      const accomplishments = [
        {
          id: "acc-1",
          sourceExperienceId: "exp-nurse",
          company: "Metropolitan Trauma Center",
          role: "Emergency Room Charge Nurse",
          category: "Clinical",
          text: "Triaged patient emergency arrivals and led acute crisis incident response teams with zero safety violations.",
          rawBullet:
            "Triaged patient emergency arrivals and led acute crisis incident response teams with zero safety violations.",
        },
        {
          id: "acc-2",
          sourceExperienceId: "exp-nurse",
          company: "Metropolitan Trauma Center",
          role: "Emergency Room Charge Nurse",
          category: "Clinical",
          text: "Conducted weekly narcotics inventory audits ensuring 100% compliance with federal DEA protocols.",
          rawBullet:
            "Conducted weekly narcotics inventory audits ensuring 100% compliance with federal DEA protocols.",
        },
      ];

      // Simulated similarity matrix:
      // req 0 (incident response) -> acc 0 (crisis incident response): 0.82
      // req 1 (inventory) -> acc 1 (inventory audits): 0.76
      // req 2 (compliance) -> acc 1 (DEA compliance): 0.71
      const similarityMatrix = [
        [0.82, 0.35],
        [0.2, 0.76],
        [0.25, 0.71],
      ];

      const mappings = mapTransferableSkills({
        requirements,
        accomplishments,
        similarityMatrix,
        targetRoleTitle: "Incident Operations Coordinator",
        threshold: 0.6,
      });

      expect(mappings.length).toBeGreaterThanOrEqual(2);
      expect(mappings[0].targetRequirement).toBe(requirements[0]);
      expect(mappings[0].sourceExperienceId).toBe("exp-nurse");
      expect(mappings[0].similarity).toBeCloseTo(0.82, 2);
      expect(mappings[0].transferRationale).toContain("Emergency Room Charge Nurse");
      expect(mappings[0].transferRationale).toContain("Metropolitan Trauma Center");
      expect(accomplishments[0].rawBullet).toContain(
        mappings[0].verbatimAnchorText
      );
    });

    it("prioritizes cross-disciplinary / disjoint accomplishments over same-domain ones when both match", () => {
      const requirements = ["Manage crisis resource dispatch under severe time constraints"];

      const accomplishments = [
        {
          id: "acc-same",
          sourceExperienceId: "exp-ops",
          company: "Acme Logistics",
          role: "Dispatcher",
          category: "Work",
          text: "Dispatched ground vehicles during standard delivery windows.",
          rawBullet:
            "Dispatched ground vehicles during standard delivery windows.",
        },
        {
          id: "acc-disjoint",
          sourceExperienceId: "exp-military",
          company: "US Coast Guard",
          role: "Search and Rescue Tactical Coxswain",
          category: "Military",
          text: "Directed multi-vessel search and rescue resource dispatch under severe maritime storm conditions.",
          rawBullet:
            "Directed multi-vessel search and rescue resource dispatch under severe maritime storm conditions.",
        },
      ];

      // Both pass threshold (0.65 vs 0.70)
      const similarityMatrix = [[0.65, 0.7]];

      const mappings = mapTransferableSkills({
        requirements,
        accomplishments,
        similarityMatrix,
        targetRoleTitle: "Emergency Dispatch Manager",
        threshold: 0.6,
      });

      expect(mappings).toHaveLength(1);
      // Disjoint military experience is recognized and mapped
      expect(mappings[0].sourceExperienceId).toBe("exp-military");
      expect(mappings[0].verbatimAnchorText).toContain("search and rescue resource dispatch");
    });
  });
});
