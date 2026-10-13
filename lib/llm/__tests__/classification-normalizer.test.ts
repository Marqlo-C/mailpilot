import { describe, it, expect } from "vitest";
import { normalizeClassification } from "../classification";

describe("Classification Normalizer De-biasing & Location Fallback", () => {
  it("resolves the real hiring employer when the model assigned an aggregator company", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "JobLeads",
      role_title: "Staff Engineer",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "JobLeads",
          companyDomain: null,
          title: "Staff Engineer at Datadog",
          location: "Remote",
          salary: "$180k - $220k",
          salaryMax: 220000,
          postedAt: "Just posted",
          description: "Help scale real-time monitoring infrastructure.",
          applyUrl: "https://jobleads.com/apply/123",
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 85,
          matchReason: "Strong fit",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "New Job Recommendations from JobLeads",
      emailBody: "Here are jobs for you.",
      fromEmail: "alerts@jobleads.com",
    });

    expect(normalized.jobs[0].company).toBe("Datadog");
  });

  it("extracts physical location from description when location is unspecified", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "Acme",
      role_title: "Frontend Developer",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "Acme Corp",
          companyDomain: null,
          title: "Frontend Developer",
          location: "Unspecified",
          salary: null,
          salaryMax: null,
          postedAt: null,
          description: "Join our team in Sacramento, CA building modern web apps.",
          applyUrl: null,
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 70,
          matchReason: "Good fit",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Job Opportunity",
      emailBody: "Join our team in Sacramento, CA building modern web apps.",
      fromEmail: "hr@acme.com",
    });

    expect(normalized.jobs[0].location).toBe("Sacramento, CA");
  });

  it("normalizes thousand-separated and hourly salaries to consistent formats", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "Acme",
      role_title: "Developer",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "Acme Corp",
          companyDomain: null,
          title: "Developer",
          location: "Remote",
          salary: "$150,000 - $190,000",
          salaryMax: null,
          postedAt: null,
          description: "Great role",
          applyUrl: null,
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 80,
          matchReason: "Fit",
        },
        {
          company: "Beta Corp",
          companyDomain: null,
          title: "Contractor",
          location: "Remote",
          salary: "From $38 an hour",
          salaryMax: null,
          postedAt: null,
          description: "Contract role",
          applyUrl: null,
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 70,
          matchReason: "Fit",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Jobs",
      emailBody: "Jobs",
    });

    expect(normalized.jobs[0].salary).toBe("$150K - $190K");
    expect(normalized.jobs[0].salaryMax).toBe(190000);
    expect(normalized.jobs[1].salary).toBe("$38/hr");
  });
});
