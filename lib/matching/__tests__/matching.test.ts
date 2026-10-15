import { describe, it, expect } from "vitest";
import { extractMatchCandidateLens } from "../lens";
import {
  evaluateOpportunityMatch,
  formatUserFacingTrajectory,
} from "../evaluator";
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
    expect(result.reason).toContain("$160K-$200K");
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

  it("adjusts scores properly based on mandatory vs. preferred requirement segmentation and tenure floors", async () => {
    const candidate = extractMatchCandidateLens(mockProfile, mockPersona);

    // Case A: Candidate fulfills all mandatory qualifications and has preferred skills
    const strongOpportunity = resolveJobOpportunity({
      company: "Apex Global",
      title: "Senior Product Manager",
      description: `
        Minimum Qualifications:
        - 5+ years of experience in product management
        - Demonstrated experience in Product Roadmap execution
        - Proven track record of Cross-Functional Leadership
        
        Preferred Qualifications:
        - Proficient in Data Analysis and metric modeling
      `,
      salary: "$190K - $230K",
    });

    const strongResult = await evaluateOpportunityMatch({
      opportunity: strongOpportunity,
      candidate,
      mode: "HEURISTIC",
    });

    expect(strongResult.seniorityFit).toBe("ALIGNED");
    expect(strongResult.score).toBeGreaterThanOrEqual(80);
    expect(strongResult.matchedSkills).toContain("Product Roadmap");
    expect(strongResult.matchedSkills).toContain("Data Analysis");
    expect(strongResult.missingRequirements.length).toBe(0);

    // Case B: Candidate inFieldYears (8) is below mandatory tenure floor (12+ years)
    const stretchOpportunity = resolveJobOpportunity({
      company: "Apex Global",
      title: "Senior Product Manager",
      description: `
        Minimum Qualifications:
        - 12+ years of experience in product leadership
        - Demonstrated experience in Product Roadmap execution
        
        Preferred Qualifications:
        - Proficient in Data Analysis
      `,
      salary: "$230K - $280K",
    });

    const stretchResult = await evaluateOpportunityMatch({
      opportunity: stretchOpportunity,
      candidate,
      mode: "HEURISTIC",
    });

    expect(stretchResult.seniorityFit).toBe("REACH");
    expect(stretchResult.score).toBeLessThan(strongResult.score);
    expect(stretchResult.reason).toContain("career stretch");

    // Case C: Missing mandatory requirements with depth modifiers penalize score
    const gapOpportunity = resolveJobOpportunity({
      company: "Apex Global",
      title: "Senior Product Manager",
      description: `
        Minimum Qualifications:
        - 5+ years of experience
        - Expert in Regulatory Compliance and Audit Standards
        - Licensed Professional Practitioner with deep understanding of Capital Budgeting
      `,
      salary: "$180K - $220K",
    });

    const gapResult = await evaluateOpportunityMatch({
      opportunity: gapOpportunity,
      candidate,
      mode: "HEURISTIC",
    });

    expect(gapResult.missingRequirements.length).toBeGreaterThan(0);
    expect(gapResult.score).toBeLessThan(strongResult.score);
  });

  it("prevents scoring inversion for career switchers: 5+ year role scores below Jr role", async () => {
    const careerSwitcherProfile: MasterProfileInput = {
      ...getEmptyMasterProfileData(),
      fullName: "Jordan Lee",
      email: "jordan@example.com",
      experiences: [
        {
          role: "Operations Analyst",
          company: "Retail Inc",
          location: null,
          category: "Work",
          startDate: "2021-01",
          endDate: "2024-01",
          bullets: [],
          displayOrder: 0,
        },
      ],
      skills: [
        {
          label: "Core",
          parentCategory: null,
          items: [
            { name: "Python", proficiency: null },
            { name: "SQL", proficiency: null },
            { name: "Git", proficiency: null },
          ],
        },
      ],
      summary: "Career switcher transition to software engineering with 1 year Python experience.",
    };

    const careerSwitcherPersona: CandidatePersona = {
      archetype: "Career Switcher",
      seniorityTier: "Career Switcher",
      leadershipScope: "Individual Contributor / Practitioner",
      distinctionAnchor: "None / Production Tenure",
      inFieldYears: 1,
      calendarYears: 3,
      titleFamily: "Software Engineering",
      timelineContext: "1 year in Software Engineering",
      toneGuidance: "Pragmatic, growth-oriented",
    };

    const switcherCandidate = extractMatchCandidateLens(
      careerSwitcherProfile,
      careerSwitcherPersona
    );

    // 1. Role A: 5+ year role with generic "Requirements:" heading
    const seniorOpportunity = resolveJobOpportunity({
      company: "Extron",
      title: "Embedded Linux Firmware Engineer",
      description: `
        Requirements:
        - 5+ years of experience in embedded systems and Linux firmware
        - Proficient in C, C++, and Linux kernel drivers
        - Hands-on experience with hardware bringup
      `,
      salary: "$140K - $170K",
    });

    const seniorResult = await evaluateOpportunityMatch({
      opportunity: seniorOpportunity,
      candidate: switcherCandidate,
      mode: "HEURISTIC",
    });

    // 2. Role B: Jr. role matching candidate's 1-year inField profile
    const juniorOpportunity = resolveJobOpportunity({
      company: "Revenued",
      title: "Junior Python Developer",
      description: `
        Requirements:
        - 1+ years of experience with Python development
        - Familiarity with SQL and Git version control
        - Strong written and verbal communication skills
      `,
      salary: "$75K - $90K",
    });

    const juniorResult = await evaluateOpportunityMatch({
      opportunity: juniorOpportunity,
      candidate: switcherCandidate,
      mode: "HEURISTIC",
    });

    // Verify 5+ year role is marked as REACH and heavily penalized
    expect(seniorResult.seniorityFit).toBe("REACH");
    expect(seniorResult.reason).toContain("5+ years of experience");
    expect(seniorResult.score).toBeLessThanOrEqual(45);

    // Verify Jr role is ALIGNED and outscores the 5+ year role (no inversion)
    expect(juniorResult.seniorityFit).toBe("ALIGNED");
    expect(juniorResult.matchedSkills).toContain("Python");
    expect(juniorResult.score).toBeGreaterThanOrEqual(75);
    expect(juniorResult.score).toBeGreaterThan(seniorResult.score);
  });

  it("maintains company neutrality: employer name does not degrade match score or claim domain mismatch", async () => {
    const candidate = extractMatchCandidateLens(mockProfile, mockPersona);

    const techOpportunity = resolveJobOpportunity({
      company: "TechSoftware Corp",
      title: "Senior Product Manager",
      description: `
        Requirements:
        - 5+ years experience in product management
        - Deep expertise in Product Roadmap and Data Analysis
      `,
    });

    const nonTechOpportunity = resolveJobOpportunity({
      company: "Mercury Insurance",
      title: "Senior Product Manager",
      description: `
        Requirements:
        - 5+ years experience in product management
        - Deep expertise in Product Roadmap and Data Analysis
      `,
    });

    const techResult = await evaluateOpportunityMatch({
      opportunity: techOpportunity,
      candidate,
      mode: "HEURISTIC",
    });

    const nonTechResult = await evaluateOpportunityMatch({
      opportunity: nonTechOpportunity,
      candidate,
      mode: "HEURISTIC",
    });

    // The match scores must be identical regardless of company name
    expect(nonTechResult.score).toBe(techResult.score);
    expect(nonTechResult.reason).not.toContain("company are not directly related");
  });

  describe("formatUserFacingTrajectory & Persona Prompt Leak Sanitization", () => {
    it("strips LLM system prompt directives, role span dumps, and graduation dates from match reason", async () => {
      const switcherLens = extractMatchCandidateLens(mockProfile, {
        ...mockPersona,
        archetype: "Career Switcher",
        seniorityTier: "Career Switcher",
        inFieldYears: 1,
        calendarYears: 9,
        timelineContext:
          "Career switcher: over 8 years of professional experience in an earlier field, then nearly a year in the current field. Do NOT treat the combined about 9 years of calendar time as in-field seniority. Roles span 2013–2026 (latest: Mobility Team Backend Engineer at EcoCAR| MioCar, UC Davis). Most recent graduation around 2026 (less than a year ago).",
      });

      const opportunity = resolveJobOpportunity({
        company: "General Matter",
        title: "Product Manager",
        description: `
          Requirements:
          - Product Roadmap execution
          - Data Analysis and Cross-Functional Leadership
        `,
        salary: "$120K - $150K",
      });

      const result = await evaluateOpportunityMatch({
        opportunity,
        candidate: switcherLens,
        mode: "HEURISTIC",
      });

      // Verify that internal LLM directives and candidate history dumps are stripped
      expect(result.reason).not.toMatch(/Do NOT treat/i);
      expect(result.reason).not.toMatch(/Roles span/i);
      expect(result.reason).not.toMatch(/EcoCAR/i);
      expect(result.reason).not.toMatch(/Most recent graduation/i);

      // Verify clean, human-readable career switcher trajectory is present
      expect(result.reason).toContain(
        "Leveling and scope align with your verified trajectory (career switcher background with nearly a year in current field)."
      );
    });

    it("formats clean trajectory phrases across different candidate profiles", () => {
      // 1. Career switcher with raw LLM instructions
      const dirtySwitcher = formatUserFacingTrajectory({
        timelineContext:
          "Career switcher: over 8 years of professional experience in an earlier field, then nearly a year in the current field. Do NOT treat the combined about 9 years of calendar time as in-field seniority. Roles span 2013–2026 (latest: Engineer at X). Most recent graduation around 2026.",
        seniorityTier: "Career Switcher",
        inFieldYears: 1,
      });
      expect(dirtySwitcher).toBe(
        "career switcher background with nearly a year in current field"
      );

      // 2. Concise custom timeline context (e.g., manually configured or clean)
      const cleanCustom = formatUserFacingTrajectory({
        timelineContext: "8 years in Product",
        seniorityTier: "Senior",
        inFieldYears: 8,
      });
      expect(cleanCustom).toBe("8 years in Product");

      // 3. Fallback to in-field tenure when timelineContext is absent
      const tenureFallback = formatUserFacingTrajectory({
        timelineContext: null,
        seniorityTier: "Mid-Level Professional",
        inFieldYears: 4,
      });
      expect(tenureFallback).toBe("4 yrs in-field tenure");

      // 4. Student / intern trajectory
      const studentClean = formatUserFacingTrajectory({
        timelineContext:
          "Student / intern: about 1 year of practical experience. Roles span 2023–Present (latest: Intern at ABC). Most recent graduation around 2025.",
        seniorityTier: "Student / Intern",
        inFieldYears: 1,
      });
      expect(studentClean).toBe("about 1 year of practical experience");
    });
  });
});
