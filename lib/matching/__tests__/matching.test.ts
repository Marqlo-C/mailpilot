import { describe, it, expect } from "vitest";
import { extractMatchCandidateLens } from "../lens";
import { evaluateOpportunityMatch } from "../evaluator";
import { resolveJobOpportunity } from "@/lib/opportunities/context";
import {
  getEmptyMasterProfileData,
  type MasterProfileInput,
} from "@/lib/validations/profile";
import type { CandidatePersona } from "@/lib/persona";

describe("Matching Domain", () => {
  const mockProfile: MasterProfileInput = {
    ...getEmptyMasterProfileData(),
    fullName: "Alex Rivera",
    email: "alex@example.com",
    experiences: [
      {
        role: "Senior Product Manager",
        company: "Stripe",
        location: null,
        category: "Work",
        startDate: "2020-01",
        endDate: null,
        bullets: [],
        displayOrder: 0,
      },
    ],
    skills: [
      {
        label: "Product",
        parentCategory: null,
        items: [
          { name: "Product Roadmap", proficiency: null },
          { name: "Data Analysis", proficiency: null },
          { name: "Cross-Functional Leadership", proficiency: null },
        ],
      },
    ],
    summary: "Senior product leader with 8+ years experience scaling SaaS platforms.",
  };

  const mockPersona: CandidatePersona = {
    archetype: "Deep Specialist",
    seniorityTier: "Senior / Lead Professional",
    leadershipScope: "Individual Contributor / Practitioner",
    distinctionAnchor: "None / Production Tenure",
    inFieldYears: 8,
    calendarYears: 8,
    titleFamily: "Product Management",
    timelineContext: "8 years in Product",
    toneGuidance: "Direct and metric-focused",
  };

  it("extracts clean MatchCandidateLens via anti-corruption adapter", () => {
    const lens = extractMatchCandidateLens(mockProfile, mockPersona);

    expect(lens.recentRoles).toEqual(["Senior Product Manager"]);
    expect(lens.skills).toContain("Product Roadmap");
    expect(lens.seniorityTier).toBe("Senior / Lead Professional");
    expect(lens.inFieldYears).toBe(8);
    expect(lens.timelineContext).toBe("8 years in Product");
    expect(lens.titleFamily).toBe("Product Management");
  });

  it("scores minimal leads gracefully with title overlap", async () => {
    const candidate = extractMatchCandidateLens(mockProfile, mockPersona);
    const opportunity = resolveJobOpportunity({
      company: "Innovate Inc",
      title: "Senior Product Manager",
      description: "Short outreach note without full spec.",
      salary: "$160K - $200K",
    });

    const result = await evaluateOpportunityMatch({
      opportunity,
      candidate,
      mode: "HEURISTIC",
    });

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.tier).toBe("HIGH");
    expect(result.seniorityFit).toBe("ALIGNED");
    expect(result.reason).toContain("Product Management");
    expect(result.reason).toContain("Innovate Inc");
    expect(result.reason).toContain("8 years in Product");
    expect(result.reason).toContain("$160K - $200K");
  });

  it("evaluates rich specifications against candidate skills", async () => {
    const candidate = extractMatchCandidateLens(mockProfile, mockPersona);
    const opportunity = resolveJobOpportunity({
      company: "Scale Co",
      title: "Director of Product Management",
      description: `
        Requirements:
        - 10+ years product management experience
        - Deep expertise in Product Roadmap and Data Analysis
        - Proven record of Cross-Functional Leadership
      `,
      salary: "$210K - $260K",
    });

    const result = await evaluateOpportunityMatch({
      opportunity,
      candidate,
      mode: "HEURISTIC",
    });

    expect(result.matchedSkills.length).toBeGreaterThan(0);
    expect(result.matchedSkills).toContain("Product Roadmap");
    expect(result.reason).toContain("Scale Co");
    expect(result.reason).toContain("Product Roadmap");
  });
});
