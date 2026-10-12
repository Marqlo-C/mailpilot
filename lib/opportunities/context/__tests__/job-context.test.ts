import { describe, it, expect } from "vitest";
import {
  extractCleanSnippet,
  sanitizeJobDescription,
} from "../scrubber";
import { resolveJobOpportunity } from "../lens";

describe("Job Context Domain", () => {
  describe("extractCleanSnippet", () => {
    it("returns short text if below minChars but preserves sentence boundaries on longer text", () => {
      const shortText = "We are seeking a senior product designer to join our team.";
      const snippet = extractCleanSnippet(shortText, 500, 1500);
      expect(snippet).toBe(shortText);
    });

    it("ramps up to natural sentence boundaries without abrupt cuts", () => {
      const sentences = [
        "Welcome to our organization where we build high-scale solutions.",
        "Our team values collaboration, continuous learning, and craftsmanship.",
        "You will lead key initiatives across our core products and infrastructure.",
        "We are looking for someone with deep domain experience in system architecture.",
        "Competitive benefits include flexible time off and comprehensive wellness plans.",
        "Join our distributed workforce today and help shape the future.",
        "Applications are reviewed on a rolling basis until all positions are filled.",
        "Please submit your profile along with relevant case studies or portfolio work.",
      ];
      const longText = sentences.join(" ");
      const snippet = extractCleanSnippet(longText, 100, 300);

      expect(snippet.length).toBeLessThanOrEqual(300);
      expect(snippet.endsWith(".")).toBe(true);
    });

    it("respects maxChars hard cap", () => {
      const text = "A".repeat(2000);
      const snippet = extractCleanSnippet(text, 500, 1500);
      expect(snippet.length).toBeLessThanOrEqual(1500);
    });
  });

  describe("sanitizeJobDescription", () => {
    it("strips EEO disclaimers and boilerplate", () => {
      const raw = `
        Role Overview:
        Lead technical program delivery across cross-functional teams.
        
        Requirements:
        - 5+ years experience
        - Strong communication skills
        
        Equal Opportunity Employer:
        We are an equal opportunity employer and value diversity at our company. We do not discriminate on the basis of race, religion, color, national origin, gender, sexual orientation, age, marital status, or disability status.
      `;

      const cleaned = sanitizeJobDescription(raw, 4000);
      expect(cleaned).toContain("Role Overview");
      expect(cleaned).toContain("Requirements");
      expect(cleaned).not.toContain("We do not discriminate on the basis of race");
    });

    it("respects length limits", () => {
      const long = "Detailed role requirement and specification. ".repeat(200);
      const cleaned = sanitizeJobDescription(long, 4000);
      expect(cleaned.length).toBeLessThanOrEqual(4000);
    });
  });

  describe("resolveJobOpportunity Lens", () => {
    it("maps partial database rows into the canonical NormalizedJobOpportunity", () => {
      const normalized = resolveJobOpportunity(
        {
          id: "opp-123",
          company: "Acme Corp",
          title: "Principal Engineer",
          location: "Remote",
          salary: "$180k - $210k",
          salaryMax: 210000,
          status: "DISCOVERED",
          description: "Full job spec detailing requirements and qualifications.",
          classificationMethod: "HEURISTIC",
        },
        "Inbound raw email text snippet."
      );

      expect(normalized.id).toBe("opp-123");
      expect(normalized.company).toBe("Acme Corp");
      expect(normalized.roleTitle).toBe("Principal Engineer");
      expect(normalized.location).toBe("Remote");
      expect(normalized.classificationMethod).toBe("HEURISTIC");
      expect(normalized.salaryMax).toBe(210000);
      expect(normalized.inboundSnippet).toBe("Inbound raw email text snippet.");
    });
  });
});
