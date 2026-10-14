import { describe, it, expect } from "vitest";
import {
  normalizeClassification,
  isValidEmployerName,
  isValidRoleTitle,
  sanitizeRoleTitle,
} from "../classification";

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

  it("universally de-biases hiring company matching sender domain stem or display name", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "StaffingPortal",
      role_title: "Head Nurse",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "StaffingPortal",
          companyDomain: null,
          title: "Head Nurse with Johns Hopkins Medicine",
          location: "Baltimore, MD",
          salary: "$120k - $145k",
          salaryMax: 145000,
          postedAt: "1 day ago",
          description: "Oversee acute care units across inpatient departments.",
          applyUrl: "https://staffingportal.org/jobs/456",
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 90,
          matchReason: "Strong fit",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Healthcare Openings Near You",
      emailBody: "Here are roles matching your preferences.",
      fromEmail: "StaffingPortal Alerts <notifications@staffingportal.org>",
    });

    expect(normalized.jobs[0].company).toBe("Johns Hopkins Medicine");
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

    expect(normalized.jobs[0].salary).toBe("$150K-$190K");
    expect(normalized.jobs[0].salaryMax).toBe(190000);
    expect(normalized.jobs[1].salary).toBe("$38/Hr");
  });

  it("preserves hiring company on DIRECT_RECRUITER emails even if sender domain stem matches", () => {
    const raw = {
      is_job_related: true,
      email_category: "DIRECT_RECRUITER" as const,
      classificationMethod: "AI" as const,
      company_name: "Acme Corp",
      role_title: "Lead Architect",
      status: "LEAD" as const,
      action_required: true,
      action_summary: "Reply to schedule interview",
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "Acme",
          companyDomain: null,
          title: "Lead Architect",
          location: "Remote",
          salary: "$180k - $210k",
          salaryMax: 210000,
          postedAt: "Just now",
          description: "We at Acme are hiring a Lead Architect for our platform team.",
          applyUrl: null,
          applicationType: "DIRECT_EMAIL" as const,
          recipientEmail: "talent@acme.com",
          recipientName: "Acme Talent Team",
          isAlreadyApplied: false,
          matchScore: 92,
          matchReason: "Direct outreach",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Opportunity at Acme",
      emailBody: "Hi, I am reaching out from Acme regarding a Lead Architect position.",
      fromEmail: "talent@acme.com",
      fromName: "Acme Recruiting",
    });

    expect(normalized.jobs[0].company).toBe("Acme");
  });

  it("retains company as-is for internal hiring digest when no third-party client exists in card block", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "TechCorp",
      role_title: "Systems Engineer",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "TechCorp",
          companyDomain: null,
          title: "Systems Engineer",
          location: "Austin, TX",
          salary: "$140k - $160k",
          salaryMax: 160000,
          postedAt: "Today",
          description: "Join our core systems infrastructure team building next-gen tooling.",
          applyUrl: null,
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 85,
          matchReason: "Internal listing",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "TechCorp Internal Openings",
      emailBody: "Here are current open roles inside TechCorp.\n\nSystems Engineer\nAustin, TX\nJoin our core systems infrastructure team building next-gen tooling.\n[View Role](https://careers.techcorp.com/jobs/101)",
      fromEmail: "careers@techcorp.com",
      fromName: "TechCorp Careers",
    });

    expect(normalized.jobs[0].company).toBe("TechCorp");
  });

  it("anchors apply URLs strictly to each job's containing card block in multi-card digests", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "Aggregator Hub",
      role_title: "Senior Reliability Specialist",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "Alpha Innovations",
          companyDomain: null,
          title: "Senior Reliability Specialist",
          location: "New York, NY",
          salary: null,
          salaryMax: null,
          postedAt: null,
          description: "Support core operations at Alpha Innovations.",
          applyUrl: null,
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 80,
          matchReason: "Match",
        },
        {
          company: "Beta Systems",
          companyDomain: null,
          title: "Platform Coordinator",
          location: "Chicago, IL",
          salary: null,
          salaryMax: null,
          postedAt: null,
          description: "Coordinate enterprise workflows at Beta Systems.",
          applyUrl: null,
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 78,
          matchReason: "Match",
        },
      ],
    };

    const digestEmailBody = `
### Senior Reliability Specialist
Alpha Innovations - New York, NY
Support core operations at Alpha Innovations.
[Apply Now](https://aggregator.test/track?dest=https%3A%2F%2Falpha.test%2Fapply%2F1)

---

### Platform Coordinator
Beta Systems - Chicago, IL
Coordinate enterprise workflows at Beta Systems.
[Apply Now](https://aggregator.test/track?dest=https%3A%2F%2Fbeta.test%2Fapply%2F2)

---
[Opt-out of job alerts](https://aggregator.test/opt-out)
`;

    const normalized = normalizeClassification(raw, {
      subject: "Curated Openings for You",
      emailBody: digestEmailBody,
      fromEmail: "alerts@aggregator.test",
    });

    expect(normalized.jobs[0].applyUrl).toBe("https://aggregator.test/track?dest=https%3A%2F%2Falpha.test%2Fapply%2F1");
    expect(normalized.jobs[1].applyUrl).toBe("https://aggregator.test/track?dest=https%3A%2F%2Fbeta.test%2Fapply%2F2");
  });

  describe("isValidEmployerName", () => {
    it("rejects date headers, timestamps, and alert prefixes", () => {
      expect(isValidEmployerName("October 13Based on your sa")).toBe(false);
      expect(isValidEmployerName("Based on your saved search")).toBe(false);
      expect(isValidEmployerName("Jobs matching your preferences")).toBe(false);
      expect(isValidEmployerName("New jobs in Engineering")).toBe(false);
      expect(isValidEmployerName("Job alert: 5 new roles")).toBe(false);
      expect(isValidEmployerName("Top picks for you")).toBe(false);
      expect(isValidEmployerName("Today")).toBe(false);
      expect(isValidEmployerName("Yesterday")).toBe(false);
      expect(isValidEmployerName("Just posted")).toBe(false);
      expect(isValidEmployerName("2d ago")).toBe(false);
      expect(isValidEmployerName("10/13/2026")).toBe(false);
      expect(isValidEmployerName("A")).toBe(false);
      expect(isValidEmployerName("")).toBe(false);
    });

    it("accepts authentic organization and employer names across disciplines", () => {
      expect(isValidEmployerName("Datadog")).toBe(true);
      expect(isValidEmployerName("Johns Hopkins Medicine")).toBe(true);
      expect(isValidEmployerName("Acme Corp")).toBe(true);
      expect(isValidEmployerName("Department of Transportation")).toBe(true);
      expect(isValidEmployerName("St. Jude Children's Research Hospital")).toBe(true);
    });
  });

  it("prevents date headers and email alert metadata from bleeding into company names during de-biasing", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "JobLeads",
      role_title: "Operations Director",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "JobLeads",
          companyDomain: null,
          title: "Operations Director",
          location: "Dallas, TX",
          salary: null,
          salaryMax: null,
          postedAt: "Just now",
          description: "October 13Based on your saved search, here are roles.",
          applyUrl: "https://jobleads.com/apply/789",
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 82,
          matchReason: "Match",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Job Recommendations from JobLeads",
      emailBody: `
        Operations Director
        October 13Based on your sa
        Dallas, TX
        [Apply Now](https://jobleads.com/apply/789)
      `,
      fromEmail: "alerts@jobleads.com",
    });

    // "October 13Based on your sa" must NOT be assigned as company name
    expect(normalized.jobs[0].company).not.toContain("October");
    expect(normalized.jobs[0].company).not.toContain("Based on");
    expect(normalized.jobs[0].company).toBe("JobLeads");
  });

  it("de-biases StudySmarter (Vaia) alerts and extracts company from parenthetical title", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "StudySmarter GmbH",
      role_title: "Junior Consultant (Siemens)",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "StudySmarter GmbH",
          companyDomain: null,
          title: "Junior Consultant (Siemens)",
          location: "Munich, Germany",
          salary: null,
          salaryMax: null,
          postedAt: "1d ago",
          description: "Support digital transformation consulting at Siemens.",
          applyUrl: "https://studysmarter.de/jobs/123",
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 88,
          matchReason: "Match",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Neue Jobs für Dich auf StudySmarter",
      emailBody: "Junior Consultant (Siemens) in Munich.",
      fromEmail: "notifications@studysmarter.de",
      fromName: "StudySmarter Team",
    });

    expect(normalized.jobs[0].company).toBe("Siemens");
  });

  it("discards OCTOBER 13BASED ON YOUR SAVED SEARCH headers when assigned as company name", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "OCTOBER 13BASED ON YOUR SAVED SEARCHMOST",
      role_title: "Senior Cloud Engineer",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "OCTOBER 13BASED ON YOUR SAVED SEARCHMOST",
          companyDomain: null,
          title: "Senior Cloud Engineer",
          location: "Remote",
          salary: null,
          salaryMax: null,
          postedAt: "Today",
          description: "Lead cloud infrastructure.",
          applyUrl: "https://jobleads.com/job/456",
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 80,
          matchReason: "Match",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "JobLeads Recommendations",
      emailBody: "Senior Cloud Engineer at IBM in Armonk, NY.",
      fromEmail: "alerts@jobleads.com",
    });

    expect(normalized.jobs[0].company).not.toContain("OCTOBER");
    expect(normalized.jobs[0].company).not.toContain("SAVED SEARCH");
    expect(normalized.jobs[0].company).toBe("IBM");
  });

  it("validates role titles and discards aggregator saved-search headers", () => {
    expect(isValidRoleTitle("Software Engineer")).toBe(true);
    expect(isValidRoleTitle("Senior Cloud Architect")).toBe(true);
    expect(isValidRoleTitle("OCTOBER 13BASED ON YOUR SAVED SEARCHMOST")).toBe(false);
    expect(isValidRoleTitle("October 13 Based on your saved search")).toBe(false);
    expect(isValidRoleTitle("Based on your saved search")).toBe(false);
    expect(isValidRoleTitle("Job alert: Senior Analyst")).toBe(false);

    expect(sanitizeRoleTitle("Job alert: Software Engineer")).toBe("Software Engineer");
    expect(sanitizeRoleTitle("October 13 - Staff Accountant")).toBe("Staff Accountant");
    expect(sanitizeRoleTitle("OCTOBER 13BASED ON YOUR SAVED SEARCHMOST")).toBe("Role");
  });

  it("discards OCTOBER 13BASED ON YOUR SAVED SEARCH when assigned as title and recovers real title from card", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "Enexus Global Inc.",
      role_title: "OCTOBER 13BASED ON YOUR SAVED SEARCHMOST",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "Enexus Global Inc.",
          companyDomain: null,
          title: "OCTOBER 13BASED ON YOUR SAVED SEARCHMOST",
          location: "Sacramento, CA",
          salary: "$140k - $160k",
          salaryMax: 160000,
          postedAt: "1 day ago",
          description: "Develop scalable applications.",
          applyUrl: "https://www.jobleads.com/job/123",
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 85,
          matchReason: "Match",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Job Recommendations from JobLeads",
      emailBody: `OCTOBER 13BASED ON YOUR SAVED SEARCHMOST RELEVANT JOBS FOR YOU\n\n[Full Stack Engineer](https://www.jobleads.com/job/123)\nEnexus Global Inc.\nSacramento, CA\n$140k - $160k\n[Apply now](https://www.jobleads.com/job/123)`,
      fromEmail: "alerts@jobleads.com",
    });

    expect(normalized.jobs[0].title).not.toContain("OCTOBER");
    expect(normalized.jobs[0].title).not.toContain("SAVED SEARCH");
    expect(normalized.jobs[0].title).toBe("Full Stack Engineer");
  });

  it("rejects broken relative and plain-text apply URLs", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "Acme Corp",
      role_title: "Technology Specialist",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "Acme Corp",
          companyDomain: null,
          title: "Technology Specialist",
          location: "Longview, TX",
          salary: null,
          salaryMax: null,
          postedAt: "Just posted",
          description: "Role overview",
          applyUrl: "Confidential Technology Specialist Longview, TX Easy Apply Just posted",
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 75,
          matchReason: "Match",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Jobs",
      emailBody: "Jobs text without valid url",
    });

    expect(normalized.jobs[0].applyUrl).toBeNull();
  });

  it("synthesizes clean overview fallback when description is a Job alert banner", () => {
    const raw = {
      is_job_related: true,
      email_category: "JOB_BOARD_DIGEST" as const,
      classificationMethod: "AI" as const,
      company_name: "Glassdoor",
      role_title: "Software Engineer",
      status: "LEAD" as const,
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      jobs: [
        {
          company: "Glassdoor",
          companyDomain: null,
          title: "Software Engineer",
          location: "San Francisco, CA",
          salary: "$140K - $180K",
          salaryMax: 180000,
          postedAt: "Today",
          description: "Job alert: Software Engineer",
          applyUrl: "https://glassdoor.com/job/123",
          applicationType: "EXTERNAL_LINK" as const,
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: false,
          matchScore: 85,
          matchReason: "Match",
        },
      ],
    };

    const normalized = normalizeClassification(raw, {
      subject: "Glassdoor Job Alert",
      emailBody: "Job alert: Software Engineer",
      fromEmail: "noreply@glassdoor.com",
    });

    expect(normalized.jobs[0].description).toBe(
      "Opportunity for Software Engineer at Glassdoor. Located in San Francisco, CA. Compensated at $140K-$180K."
    );
  });
});
