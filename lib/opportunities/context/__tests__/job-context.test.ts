import { describe, it, expect } from "vitest";
import {
  extractCleanSnippet,
  sanitizeJobDescription,
  stripPortalPreambles,
} from "../scrubber";
import {
  isUnspecifiedPostedAt,
  normalizePostedAt,
  resolveJobOpportunity,
} from "../lens";

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

    it("filters synthesized placeholder sentences and consecutive duplicate strings", () => {
      const text = `
        About the role: We are looking for an experienced product designer to join our multidisciplinary team.
        Synthesized from single-job classification fields.
        In this role, you will lead design thinking workshops and craft responsive user journeys.
        In this role, you will lead design thinking workshops and craft responsive user journeys.
        Responsibilities include design systems maintenance and user research.
      `;

      const snippet = extractCleanSnippet(text, 150, 500);
      expect(snippet).not.toContain("Synthesized from single-job classification fields.");
      expect(snippet).toContain("We are looking for an experienced product designer");
      const count = (snippet.match(/lead design thinking workshops/g) || []).length;
      expect(count).toBe(1);
    });

    it("falls back to synthesized role opportunity string when snippet is solely alert or marketing noise", () => {
      const noiseOnly = "Job alert: Software Engineer in Austin. #1 Job Platform in North America.";
      const snippet = extractCleanSnippet(noiseOnly, 100, 300, {
        roleTitle: "Staff Software Engineer",
        company: "Acme Cloud",
      });
      expect(snippet).toBe("Opportunity for Staff Software Engineer at Acme Cloud.");
    });

    it("falls back to synthesized role string when company is missing or unknown", () => {
      const noiseOnly = "Jobs recommended for you based on your activity.";
      const snippet = extractCleanSnippet(noiseOnly, 100, 300, {
        roleTitle: "Director of Product",
        company: null,
      });
      expect(snippet).toBe("Opportunity for Director of Product.");
    });

    it("cleans leading Job alert: prefix while preserving legitimate description body", () => {
      const text = "Job alert: We are seeking an experienced Clinical Research Coordinator to manage ongoing trials.";
      const snippet = extractCleanSnippet(text, 50, 300);
      expect(snippet).not.toContain("Job alert:");
      expect(snippet).toContain("We are seeking an experienced Clinical Research Coordinator");
    });

    it("returns empty string when text begins with Job alert: and remaining text is < 30 chars without fallbackContext", () => {
      const text = "Job alert: Short notice";
      const snippet = extractCleanSnippet(text, 100, 300);
      expect(snippet).toBe("");
    });

    it("falls back to synthesized role string when text begins with Job alert: and remaining text is < 30 chars with fallbackContext", () => {
      const text = "Job alert: New jobs";
      const snippet = extractCleanSnippet(text, 100, 300, {
        roleTitle: "Bioinformatics Specialist",
        company: "Genomics Labs",
      });
      expect(snippet).toBe("Opportunity for Bioinformatics Specialist at Genomics Labs.");
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

    it("cleans arbitrary metadata preambles and key-value headers", () => {
      const rawWithPreamble = `
        Job Details
        Job ID: 492019
        Location: Chicago, IL
        Reports To: VP Operations
        Category: Supply Chain & Logistics
        Job Type: Full-time
        Employment Status: Regular
        
        About the Role:
        We are seeking a Supply Chain Manager to optimize regional inventory distribution.
        
        Responsibilities:
        - Lead end-to-end warehouse logistics
        - Coordinate freight and supplier contracts
        
        Qualifications:
        - 5+ years experience in inventory or supply chain management
        - Bachelor degree in Business, Logistics, or related discipline
      `;

      const cleaned = sanitizeJobDescription(rawWithPreamble, 4000);
      expect(cleaned).not.toContain("Job ID: 492019");
      expect(cleaned).not.toContain("Reports To: VP Operations");
      expect(cleaned).not.toContain("Job Details");
      expect(cleaned).toContain("About the Role:");
      expect(cleaned).toContain("Supply Chain Manager");
      expect(cleaned).toContain("Responsibilities:");
    });

    it("drops leading corporate marketing boilerplates while preserving core role sections", () => {
      const text = `
        About the Company:
        Founded in 2012, Acme Global Technologies is a worldwide leader in enterprise operations with offices across 20 countries. We are driven by a commitment to innovation and customer success.

        About the Role:
        We are seeking a Clinical Operations Lead to oversee hospital trials and ensure adherence to safety standards.

        Responsibilities:
        - Monitor active protocol execution
        - Coordinate cross-functional research teams

        Qualifications:
        - 5+ years experience in clinical research operations
        - Bachelor degree in life sciences or related discipline
      `;

      const cleaned = sanitizeJobDescription(text, 4000);
      expect(cleaned).not.toContain("Founded in 2012, Acme Global Technologies");
      expect(cleaned).toContain("About the Role:");
      expect(cleaned).toContain("Clinical Operations Lead");
      expect(cleaned).toContain("Responsibilities:");
      expect(cleaned).toContain("Qualifications:");
    });

    it("drops trailing benefit itemizations (+17 benefits, Company Discounts)", () => {
      const text = `
        Role Overview:
        Design and scale customer engagement platforms for modern organizations.

        Responsibilities:
        - Build resilient backend APIs
        - Partner with cross-functional product stakeholders

        Qualifications:
        - 4+ years software engineering experience

        Benefits:
        - Comprehensive medical, dental, and vision coverage
        - 401(k) matching up to 5%
        - Company Discounts on partner services
        +17 benefits
      `;

      const cleaned = sanitizeJobDescription(text, 4000);
      expect(cleaned).toContain("Role Overview:");
      expect(cleaned).toContain("Responsibilities:");
      expect(cleaned).toContain("Qualifications:");
      expect(cleaned).not.toContain("+17 benefits");
      expect(cleaned).not.toContain("Company Discounts on partner services");
      expect(cleaned).not.toContain("401(k) matching");
    });

    it("drops trailing benefit chips like 401(K) Match and Company Discounts", () => {
      const text = `
        About the Role:
        Oversee digital inventory and operations strategy.
        
        Responsibilities:
        - Direct cross-functional team execution
        - Manage logistics milestones
        
        Qualifications:
        - 6+ years operations experience
        
        401(K) Match | Stock Purchase Plan | +10
        Company Discounts
      `;

      const cleaned = sanitizeJobDescription(text, 4000);
      expect(cleaned).toContain("About the Role:");
      expect(cleaned).toContain("Qualifications:");
      expect(cleaned).not.toContain("401(K) Match");
      expect(cleaned).not.toContain("Stock Purchase Plan");
      expect(cleaned).not.toContain("Company Discounts");
    });

    it("respects length limits", () => {
      const long = "Detailed role requirement and specification. ".repeat(200);
      const cleaned = sanitizeJobDescription(long, 4000);
      expect(cleaned.length).toBeLessThanOrEqual(4000);
    });
  });

  describe("stripPortalPreambles", () => {
    it("strips leading aggregator alert headers and recommendation banners", () => {
      const raw = `
        Job alert: Senior Systems Analyst in Seattle, WA
        Jobs recommended for you based on your activity
        #1 Job Platform in North America
        Why it matches: Fits your target location and role preference
        
        About the Role:
        We are seeking a Senior Systems Analyst to modernize our data warehousing pipelines.
        
        Responsibilities:
        - Maintain enterprise ETL workflows
        - Collaborate with domain stakeholders
      `;

      const cleaned = stripPortalPreambles(raw);
      expect(cleaned).not.toContain("Job alert: Senior Systems Analyst");
      expect(cleaned).not.toContain("Jobs recommended for you");
      expect(cleaned).not.toContain("#1 Job Platform");
      expect(cleaned).not.toContain("Why it matches:");
      expect(cleaned).toContain("About the Role:");
      expect(cleaned).toContain("Senior Systems Analyst");
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

    it("converts ISO date strings in postedAt to relative distance and preserves non-ISO strings", () => {
      const pastDateIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const withIso = resolveJobOpportunity({
        company: "Acme",
        postedAt: pastDateIso,
      });
      expect(withIso.postedAt).toMatch(/\d+[dhmsmoy]\s+ago/);

      const withRelative = resolveJobOpportunity({
        company: "Acme",
        postedAt: "Just posted",
      });
      expect(withRelative.postedAt).toBe("Just posted");

      const withNull = resolveJobOpportunity({
        company: "Acme",
        postedAt: null,
      });
      expect(withNull.postedAt).toBeNull();
    });

    it("rejects non-http apply URLs and normalizes them to null", () => {
      const normalized = resolveJobOpportunity({
        company: "Acme Corp",
        title: "Systems Engineer",
        applyUrl: "Confidential Technology Specialist Longview, TX Easy Apply Just posted",
      });
      expect(normalized.applyUrl).toBeNull();
    });

    it("synthesizes job description fallback when description is only a Job alert banner", () => {
      const normalized = resolveJobOpportunity({
        company: "Glassdoor",
        title: "Software Engineer",
        location: "Austin, TX",
        salary: "$120K - $150K",
        description: "Job alert: Software Engineer",
      });
      expect(normalized.jobDescription).toBe(
        "Opportunity for Software Engineer at Glassdoor. Located in Austin, TX. Compensated at $120K-$150K."
      );
    });

    it("normalizes placeholder postedAt values (like 'Posted: Not specified') to null", () => {
      const unspecifiedOpportunity = resolveJobOpportunity({
        company: "Acme Corp",
        title: "Platform Engineer",
        postedAt: "Posted: Not specified",
      });
      expect(unspecifiedOpportunity.postedAt).toBeNull();

      const notSpecifiedOpportunity = resolveJobOpportunity({
        company: "Acme Corp",
        title: "Platform Engineer",
        postedAt: "Not specified",
      });
      expect(notSpecifiedOpportunity.postedAt).toBeNull();
    });
  });

  describe("isUnspecifiedPostedAt", () => {
    it("returns true for undefined, null, empty strings, and placeholders", () => {
      expect(isUnspecifiedPostedAt(undefined)).toBe(true);
      expect(isUnspecifiedPostedAt(null)).toBe(true);
      expect(isUnspecifiedPostedAt("")).toBe(true);
      expect(isUnspecifiedPostedAt("   ")).toBe(true);
      expect(isUnspecifiedPostedAt("Not specified")).toBe(true);
      expect(isUnspecifiedPostedAt("posted: not specified")).toBe(true);
      expect(isUnspecifiedPostedAt("Posted: Unspecified")).toBe(true);
      expect(isUnspecifiedPostedAt("unknown")).toBe(true);
      expect(isUnspecifiedPostedAt("n/a")).toBe(true);
      expect(isUnspecifiedPostedAt("none")).toBe(true);
      expect(isUnspecifiedPostedAt("tbd")).toBe(true);
    });

    it("returns false for valid dates and relative times", () => {
      expect(isUnspecifiedPostedAt("Just posted")).toBe(false);
      expect(isUnspecifiedPostedAt("1 day ago")).toBe(false);
      expect(isUnspecifiedPostedAt("2026-10-14")).toBe(false);
      expect(isUnspecifiedPostedAt("Reposted 3 days ago")).toBe(false);
    });
  });

  describe("normalizePostedAt", () => {
    it("converts ISO date strings into relative distance", () => {
      const pastDateIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const normalized = normalizePostedAt(pastDateIso);
      expect(normalized).toMatch(/\d+[dhmsmoy]\s+ago/);
    });

    it("strips leading 'Posted: ' and 'Posted ' prefixes", () => {
      expect(normalizePostedAt("Posted: 3 days ago")).toBe("3 days ago");
      expect(normalizePostedAt("Posted 2 weeks ago")).toBe("2 weeks ago");
      expect(normalizePostedAt("Posted: Today")).toBe("Today");
    });

    it("normalizes and formats 'Reposted: ' prefixes", () => {
      expect(normalizePostedAt("Reposted: 4 days ago")).toBe("Reposted 4 days ago");
      expect(normalizePostedAt("reposted 2 days ago")).toBe("Reposted 2 days ago");
    });

    it("extracts clean posted/reposted relative dates from fallback spec text", () => {
      const fallbackSpecWithRepost =
        "Acme Corp • San Francisco, CA\nReposted 3 days ago\nWe are looking for a staff engineer.";
      expect(normalizePostedAt(null, fallbackSpecWithRepost)).toBe("Reposted 3 days ago");

      const fallbackSpecWithPosted =
        "Engineering Department\nPosted 5 days ago\nMinimum qualifications include...";
      expect(normalizePostedAt("Posted: Not specified", fallbackSpecWithPosted)).toBe("5 days ago");

      const fallbackSpecWithToday =
        "Job Description\nPosted today\nCompetitive benefits and perks.";
      expect(normalizePostedAt(undefined, fallbackSpecWithToday)).toBe("Today");
    });

    it("returns null when no valid date or fallback pattern is found", () => {
      expect(normalizePostedAt(null, null)).toBeNull();
      expect(normalizePostedAt("Not specified", "No dates mentioned here")).toBeNull();
      expect(normalizePostedAt(undefined, "Company was founded 10 years ago in Austin")).toBeNull();
    });
  });
});
