import { describe, it, expect } from "vitest";
import {
  classifySectionHeading,
  parseStructuredJobSections,
} from "../section-classifier";

describe("Section Classifier", () => {
  describe("classifySectionHeading", () => {
    it("classifies company overview headings neutrally", () => {
      expect(classifySectionHeading("About Us")).toBe("about_company");
      expect(classifySectionHeading("Who We Are")).toBe("about_company");
      expect(classifySectionHeading("About Acme Corp")).toBe("about_company");
      expect(classifySectionHeading("Company Overview")).toBe("about_company");
    });

    it("classifies qualification headings", () => {
      expect(classifySectionHeading("Minimum Qualifications")).toBe("qualifications_required");
      expect(classifySectionHeading("Preferred Qualifications")).toBe("qualifications_preferred");
      expect(classifySectionHeading("What You Need")).toBe("qualifications_required");
      expect(classifySectionHeading("Desired Skills")).toBe("qualifications_preferred");
    });

    it("classifies responsibilities and duties", () => {
      expect(classifySectionHeading("Responsibilities")).toBe("responsibilities");
      expect(classifySectionHeading("What You'll Do")).toBe("responsibilities");
      expect(classifySectionHeading("Core Duties")).toBe("responsibilities");
    });

    it("classifies compensation and legal compliance", () => {
      expect(classifySectionHeading("Benefits & Perks")).toBe("compensation_benefits");
      expect(classifySectionHeading("Equal Opportunity Employer")).toBe("legal_eeo");
      expect(classifySectionHeading("Diversity, Equity & Inclusion")).toBe("legal_eeo");
    });
  });

  describe("parseStructuredJobSections Dual Payloads", () => {
    it("assembles fullReconstructedMarkdown preserving about_company while coreMarkdown excludes it", () => {
      const sampleText = `
### Who We Are
Acme is a pioneer in sustainable operations, driven by integrity and innovation across global hubs.

### The Role
We are seeking an Analyst to support strategic planning and process governance.

### Key Responsibilities
- Monitor performance telemetry and operational indicators
- Prepare quarterly reviews for executive stakeholders

### Minimum Qualifications
- 3+ years experience in analytical problem solving
- Demonstrated ability to synthesize complex quantitative data

### Equal Opportunity Employer
Acme provides equal employment opportunities to all applicants regardless of background.
      `.trim();

      const result = parseStructuredJobSections(sampleText);

      // fullReconstructedMarkdown MUST retain company PR and EEO disclosures for the card modal
      expect(result.fullReconstructedMarkdown).toContain("### Who We Are");
      expect(result.fullReconstructedMarkdown).toContain("Acme is a pioneer");
      expect(result.fullReconstructedMarkdown).toContain("### Equal Opportunity Employer");
      expect(result.fullReconstructedMarkdown).toContain("Acme provides equal employment");

      // coreMarkdown MUST EXCLUDE about_company and legal_eeo to prevent downstream AI hallucination/anchor bleed
      expect(result.coreMarkdown).not.toContain("### Who We Are");
      expect(result.coreMarkdown).not.toContain("Acme is a pioneer");
      expect(result.coreMarkdown).not.toContain("### Equal Opportunity Employer");
      expect(result.coreMarkdown).not.toContain("Acme provides equal employment");

      // coreMarkdown MUST retain role duties and qualifications
      expect(result.coreMarkdown).toContain("The Role");
      expect(result.coreMarkdown).toContain("Key Responsibilities");
      expect(result.coreMarkdown).toContain("Minimum Qualifications");

      // overviewSnippet should capture the role description for the card face
      expect(result.overviewSnippet).toContain("We are seeking an Analyst");
    });
  });
});
