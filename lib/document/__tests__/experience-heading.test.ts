import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { formatExperienceHeading, getExperienceHeadingParts } from "@/lib/utils/format";
import { compileResumeDocx } from "@/lib/document/resume-docx";
import type { TailoredResumeDraft } from "@/lib/resume-draft";

describe("Experience Heading Separator & Hierarchy Formatting", () => {
  it("formats headings with pipe delimiters and handles deduplication", () => {
    const parts = getExperienceHeadingParts(
      "Senior Software Engineer",
      "Stripe Stripe",
      "San Francisco, CA"
    );
    expect(parts).toEqual({
      role: "Senior Software Engineer",
      company: "Stripe",
      location: "San Francisco, CA",
    });

    const heading = formatExperienceHeading(
      "Senior Software Engineer",
      "Stripe",
      "San Francisco, CA"
    );
    expect(heading).toBe("Senior Software Engineer | Stripe | San Francisco, CA");
  });

  it("omits company if identical to role", () => {
    const heading = formatExperienceHeading("Contractor", "Contractor", "Remote");
    expect(heading).toBe("Contractor | Remote");
  });

  it("renders DOCX role paragraph with bold title and muted slate company/location separated by pipes", async () => {
    const draft: TailoredResumeDraft = {
      opportunityId: "opp-1",
      nodes: [
        {
          id: "hdr-1",
          section: "contact",
          type: "header",
          content: "Alex Morgan",
          selected: true,
          metadata: { contactLine: "alex@example.com | San Francisco, CA" },
        },
        {
          id: "exp-1",
          section: "experience",
          type: "experience_header",
          content: "Staff Engineer | Acme Corp | New York, NY",
          selected: true,
          metadata: { startDate: "2022", endDate: "Present" },
        },
        {
          id: "b-1",
          section: "experience",
          type: "experience_bullet",
          parentId: "exp-1",
          content: "Scaled distributed systems for core platform.",
          selected: true,
        },
      ],
      exportConfig: { pageBudget: "auto", includeSummary: true },
      updatedAt: new Date().toISOString(),
    };

    const docxBuffer = await compileResumeDocx(draft);
    const zip = await JSZip.loadAsync(docxBuffer);
    const documentXml = await zip.file("word/document.xml")!.async("string");

    // Must contain bold Staff Engineer
    expect(documentXml).toContain("<w:b/>");
    expect(documentXml).toContain("Staff Engineer");
    // Must contain muted color 4B5563 for Acme Corp and New York, NY
    expect(documentXml).toContain('w:color w:val="4B5563"');
    expect(documentXml).toContain("Acme Corp");
    expect(documentXml).toContain("New York, NY");
    // Must contain pipe separator in 9CA3AF
    expect(documentXml).toContain('w:color w:val="9CA3AF"');
    expect(documentXml).toContain(" | ");
  });

  it("extracts role, company, and location correctly from draftToPdfInput for both pipe and dot separators", async () => {
    const { draftToPdfInput } = await import("@/lib/resume-draft");
    const draft: TailoredResumeDraft = {
      opportunityId: "opp-2",
      nodes: [
        {
          id: "hdr-1",
          section: "contact",
          type: "header",
          content: "Alex Morgan",
          selected: true,
        },
        {
          id: "exp-1",
          section: "experience",
          type: "experience_header",
          content: "Principal Architect · TechCorp · Seattle, WA",
          selected: true,
        },
        {
          id: "exp-2",
          section: "experience",
          type: "experience_header",
          content: "Senior Engineer | CloudCorp | Austin, TX",
          selected: true,
        },
      ],
      exportConfig: { pageBudget: "auto", includeSummary: true },
      updatedAt: new Date().toISOString(),
    };

    const compiled = draftToPdfInput(draft);
    expect(compiled.experiences).toHaveLength(2);
    expect(compiled.experiences[0]).toMatchObject({
      role: "Principal Architect",
      company: "TechCorp",
      location: "Seattle, WA",
    });
    expect(compiled.experiences[1]).toMatchObject({
      role: "Senior Engineer",
      company: "CloudCorp",
      location: "Austin, TX",
    });
  });
});
