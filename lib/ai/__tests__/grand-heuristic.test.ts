import { describe, it, expect } from "vitest";
import {
  classifyWithGrandHeuristic,
  extractApplyUrl,
  extractBlockApplyUrl,
  extractSalary,
  extractLocation,
  extractJsonLdJobPosting,
  parseDigestJobs,
} from "../grand-heuristic";

describe("Grand Heuristic Engine", () => {
  it("extracts apply URLs matching ATS domains", () => {
    const text = "To apply, please visit https://boards.greenhouse.io/acme/jobs/1234567 directly.";
    const url = extractApplyUrl(text);
    expect(url).toBe("https://boards.greenhouse.io/acme/jobs/1234567");
  });

  it("extracts salary ranges and annualizes max values", () => {
    const text = "Compensation: $140,000 - $175,000 per year plus equity and benefits.";
    const res = extractSalary(text);
    expect(res.salary).toContain("$140,000");
    expect(res.salaryMax).toBe(175000);
  });

  it("extracts work locations accurately", () => {
    expect(extractLocation("This role is 100% remote across the US.")).toBe("Remote");
    expect(extractLocation("Located in our San Francisco, CA headquarters.")).toBe("San Francisco, CA");
    expect(extractLocation("We operate on a hybrid schedule in office 3 days a week.")).toBe("Hybrid");
  });

  it("extracts structured JobPosting metadata from JSON-LD HTML scripts", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "JobPosting",
            "title": "Operations Director",
            "description": "Leading regional operations team and logistics.",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "Global Logistics Corp"
            },
            "jobLocation": {
              "@type": "Place",
              "address": {
                "addressLocality": "Austin",
                "addressRegion": "TX"
              }
            },
            "baseSalary": {
              "@type": "MonetaryAmount",
              "value": {
                "minValue": 120000,
                "maxValue": 160000
              }
            }
          }
          </script>
        </head>
      </html>
    `;

    const parsed = extractJsonLdJobPosting(html);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("Operations Director");
    expect(parsed?.company).toBe("Global Logistics Corp");
    expect(parsed?.location).toBe("Austin, TX");
    expect(parsed?.salary).toBe("$120000 - $160000");
  });

  it("classifies interview invitations with action required", () => {
    const result = classifyWithGrandHeuristic({
      subject: "Invitation to interview for Operations Manager at Horizon Corp",
      body: "We would love to schedule a 30-minute phone screen with our team next week.",
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("INTERVIEW");
    expect(result?.email_category).toBe("APPLICATION_STATUS");
    expect(result?.action_required).toBe(true);
    expect(result?.company_name).toBe("Horizon Corp");
  });

  it("classifies application receipts deterministically", () => {
    const result = classifyWithGrandHeuristic({
      subject: "Thank you for applying to Apex Systems",
      body: "We have received your application for the Role: Logistics Coordinator. Our team will review it.",
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("APPLIED");
    expect(result?.email_category).toBe("APPLICATION_STATUS");
    expect(result?.company_name).toBe("Apex Systems");
  });

  it("classifies rejection updates correctly", () => {
    const result = classifyWithGrandHeuristic({
      subject: "Update regarding your application at Nexus Media",
      body: "Thank you for taking the time to speak with us. Unfortunately, we have decided to pursue other candidates whose experience more closely matches our needs.",
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("REJECTION");
    expect(result?.email_category).toBe("APPLICATION_STATUS");
    expect(result?.action_required).toBe(false);
  });

  it("strips multi-job aggregator bleed and extracts hiring companies", () => {
    const result = classifyWithGrandHeuristic({
      subject: "Amazon and 9 more are hiring for Software Engineer",
      body: "Check out these new openings across tech companies. Apply today.",
    });

    expect(result).not.toBeNull();
    expect(result?.company_name).toBe("Amazon");
  });

  it("scrubs job alert boilerplate from extracted titles", () => {
    const result = classifyWithGrandHeuristic({
      subject: "Top picks for Senior Backend Engineer at Stripe",
      body: "We found new roles matching your preferences at Stripe.",
    });

    expect(result).not.toBeNull();
    expect(result?.role_title).toBe("Senior Backend Engineer");
    expect(result?.company_name).toBe("Stripe");
  });

  it("normalizes word-collapsed locations before city capitalization", () => {
    const loc1 = extractLocation("Open position for Software EngineerBurlington, VT with hybrid schedule.");
    expect(loc1).toBe("Burlington, VT");

    const loc2 = extractLocation("Frontend DeveloperMadison, WI located downtown.");
    expect(loc2).toBe("Madison, WI");
  });

  it("formats hourly wages with /hr and annualizes max salary for sorting", () => {
    const res = extractSalary("Pay rate is $45 - $65/hr based on experience.");
    expect(res.salary).toBe("$45 - $65/hr");
    // 65 * 2080 = 135200
    expect(res.salaryMax).toBe(135200);
  });

  it("generates dynamic multi-layered matching rationale rather than static string", () => {
    const result = classifyWithGrandHeuristic({
      subject: "Senior Product Designer opening at Linear",
      body: "Linear is seeking a Senior Product Designer with Figma and Design Systems experience. Apply at https://linear.app/jobs/123",
      candidateProfile: {
        educationSummary: "BS Design",
        skills: ["Figma", "Design Systems", "Prototyping"],
        experienceSummary: "Senior Product Designer for 6 years",
        targetTitles: ["Senior Product Designer"],
      },
    });

    expect(result).not.toBeNull();
    const job = result?.jobs[0];
    expect(job).toBeDefined();
    expect(job?.matchReason).not.toBe("Classified via deterministic Grand Heuristic engine.");
    expect(job?.matchReason).toContain("Linear");
    expect(job?.matchScore).toBeGreaterThanOrEqual(70);
  });

  it("normalizes shorthand salary ranges with K suffix on both sides", () => {
    const res1 = extractSalary("Base salary: $120K - 160 plus equity.");
    expect(res1.salary).toBe("$120K - $160K");
    expect(res1.salaryMax).toBe(160000);

    const res2 = extractSalary("Expected compensation: 112K - 187 annually.");
    expect(res2.salary).toBe("$112K - $187K");
    expect(res2.salaryMax).toBe(187000);

    const res3 = extractSalary("Offering $120 - $160k per year.");
    expect(res3.salary).toBe("$120K - $160K");
    expect(res3.salaryMax).toBe(160000);
  });

  it("extracts block-scoped apply URLs without leaking other URLs", () => {
    const block1 = `
      [Senior Backend Engineer](https://www.linkedin.com/comm/jobs/view/998877)
      Stripe · San Francisco, CA
    `;
    const block2 = `
      To apply, visit https://boards.greenhouse.io/acme/jobs/554433 directly.
    `;
    expect(extractBlockApplyUrl(block1)).toBe("https://www.linkedin.com/comm/jobs/view/998877");
    expect(extractBlockApplyUrl(block2)).toBe("https://boards.greenhouse.io/acme/jobs/554433");
  });

  it("splits multi-job digests and binds apply URLs to their own blocks without bleed", () => {
    const digestBody = `
      [Senior Backend Engineer](https://www.linkedin.com/comm/jobs/view/1001)
      Stripe · San Francisco, CA
      Salary: $160K - 200
      Building payment infrastructure and APIs.

      [Product Designer](https://www.linkedin.com/comm/jobs/view/1002)
      Figma · San Francisco, CA
      Salary: $140K - $180K
      Designing collaborative canvas tools.
    `;

    const result = classifyWithGrandHeuristic({
      subject: "Stripe and 5 more are hiring",
      body: digestBody,
    });

    expect(result).not.toBeNull();
    expect(result?.jobs.length).toBe(2);

    const job1 = result?.jobs[0];
    const job2 = result?.jobs[1];

    expect(job1?.title).toBe("Senior Backend Engineer");
    expect(job1?.company).toBe("Stripe");
    expect(job1?.applyUrl).toBe("https://www.linkedin.com/comm/jobs/view/1001");
    expect(job1?.salary).toBe("$160K - $200K");
    expect(job1?.salaryMax).toBe(200000);

    expect(job2?.title).toBe("Product Designer");
    expect(job2?.company).toBe("Figma");
    expect(job2?.applyUrl).toBe("https://www.linkedin.com/comm/jobs/view/1002");
    expect(job2?.salary).toBe("$140K - $180K");
    expect(job2?.salaryMax).toBe(180000);
  });

  it("rejects CI failures, product promos, and social notifications as IRRELEVANT", () => {
    const subjects = [
      "Run failed: CI & Deployment",
      "Build failed: backend-prod (v1.2.3)",
      "Workflow run #882 finished with failures",
      "ASUS x ROG Gaming: Special offer on RTX 4080",
      "Coupon code inside: Save up to 50%",
      "Join the Fight today",
      "7 people viewed your profile on LinkedIn",
    ];

    for (const subject of subjects) {
      const res = classifyWithGrandHeuristic({
        subject,
        body: "Check details here at https://github.com/org/repo/actions",
      });
      expect(res).not.toBeNull();
      expect(res?.is_job_related).toBe(false);
      expect(res?.email_category).toBe("IRRELEVANT");
      expect(res?.jobs.length).toBe(0);
      expect(res?.routingLines?.[0]).toContain("Filtered as Non-Job");
    }
  });

  it("prevents raw URLs from becoming job titles and falls back to generic title", () => {
    const res = classifyWithGrandHeuristic({
      subject: "New opening: https://jobs.lever.co/stripe/engineer at Stripe",
      body: "We have an opening: https://jobs.lever.co/stripe/engineer",
    });
    expect(res).not.toBeNull();
    expect(res?.role_title).not.toMatch(/^https?:\/\//);
    expect(res?.role_title).toBe("Role at Stripe");
    expect(res?.jobs[0].title).toBe("Role at Stripe");
  });
});
