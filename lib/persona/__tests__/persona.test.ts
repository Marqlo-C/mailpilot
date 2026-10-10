import { describe, it, expect } from "vitest";
import { synthesizeCandidatePersona } from "../index";
import { formatHumanYears } from "../tone-composer";
import type { MasterProfileInput } from "@/lib/validations/profile";

describe("Persona Engine Deterministic Heuristics", () => {
  it("formats humanized tenure without robotic decimals", () => {
    expect(formatHumanYears(0.3)).toBe("less than a year");
    expect(formatHumanYears(1.0)).toBe("about 1 year");
    expect(formatHumanYears(2.2)).toBe("over 2 years");
    expect(formatHumanYears(2.8)).toBe("nearly 3 years");
  });

  it("never includes decimal readouts in synthesized timelineContext or toneGuidance", () => {
    const mockProfile: MasterProfileInput = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: null,
      location: null,
      summary: "Experienced software engineer.",
      links: [],
      skills: [{ label: "Skills", parentCategory: null, items: [{ name: "TypeScript", proficiency: null }] }],
      experiences: [
        {
          id: "exp1",
          company: "Tech Corp",
          role: "Frontend Developer",
          location: null,
          category: "Work",
          startDate: "2022-01-01",
          endDate: "2024-05-01",
          bullets: [{ id: "b1", rawText: "Built scalable web apps", technologies: [], hasMetric: false }],
          displayOrder: 0,
        },
      ],
      projects: [],
      education: [],
      certifications: [],
      awards: [],
      interests: [],
    };

    const persona = synthesizeCandidatePersona(mockProfile);

    // Assert no decimal numbers followed by 'years' or 'y' exist
    expect(persona.timelineContext).not.toMatch(/\d+\.\d+\s*(?:years?|y)\b/i);
    expect(persona.toneGuidance).not.toMatch(/\d+\.\d+\s*(?:years?|y)\b/i);
    expect(persona.seniorityTier).toBe("Mid-Level Professional");
  });

  it("correctly identifies a Career Switcher and prevents tenure inflation", () => {
    const switcherProfile: MasterProfileInput = {
      fullName: "John Switcher",
      email: "john@example.com",
      phone: null,
      location: null,
      summary: "Former educator turned developer.",
      links: [],
      skills: [],
      experiences: [
        {
          id: "exp1",
          company: "High School",
          role: "High School Teacher",
          location: null,
          category: "Work",
          startDate: "2018-01-01",
          endDate: "2022-01-01", // 4 years
          bullets: [],
          displayOrder: 0,
        },
        {
          id: "exp2",
          company: "Software Co",
          role: "Junior Web Developer",
          location: null,
          category: "Work",
          startDate: "2023-01-01",
          endDate: "2024-01-01", // 1 year
          bullets: [],
          displayOrder: 1,
        },
      ],
      projects: [],
      education: [],
      certifications: [],
      awards: [],
      interests: [],
    };

    const persona = synthesizeCandidatePersona(switcherProfile);
    expect(persona.seniorityTier).toBe("Career Switcher");
    expect(persona.toneGuidance).toMatch(/career switcher/i);;
  });
});
