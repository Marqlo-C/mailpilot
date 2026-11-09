import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { isJobLeadsEmail, parseJobLeadsDigest } from "../jobleads";
import { getCompanyLogoUrl, getCompanyLogoFallbackUrl } from "@/lib/utils/company-logo";

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function extractHtmlFromEml(emlContent: string, boundary: string): string {
  const parts = emlContent.split(boundary);
  // Part index 2 contains text/html in both JobLeads test files
  const htmlPart = parts.find((p) => /Content-Type:\s*text\/html/i.test(p)) ?? parts[2];
  return decodeQuotedPrintable(htmlPart);
}

describe("JobLeads Digest Parser & Ingestion Isolation", () => {
  describe("isJobLeadsEmail", () => {
    it("identifies JobLeads emails from domain or display name", () => {
      expect(isJobLeadsEmail("alerts@jobleads.com")).toBe(true);
      expect(isJobLeadsEmail("mailer@jobleads.com", "JobLeads")).toBe(true);
      expect(isJobLeadsEmail(null, "JobLeads Notifications")).toBe(true);
      expect(isJobLeadsEmail(null, null, "JobLeads <mailer@jobleads.com>")).toBe(true);

      // Other job boards & recruiters must return false
      expect(isJobLeadsEmail("jobs-noreply@linkedin.com", "LinkedIn")).toBe(false);
      expect(isJobLeadsEmail("alert@indeed.com", "Indeed")).toBe(false);
      expect(isJobLeadsEmail("recruiter@google.com", "Google Staffing")).toBe(false);
    });
  });

  describe("parseJobLeadsDigest with JobLeads 1.eml", () => {
    const emlPath = path.resolve(
      process.cwd(),
      "Test HTML/Test Gmail Html/JobLeads 1.eml"
    );
    const emlRaw = fs.readFileSync(emlPath, "utf-8");
    const html = extractHtmlFromEml(emlRaw, "--jSsimxcQ");

    it("extracts all 5 job cards with accurate employer names, locations, and salaries", () => {
      const result = parseJobLeadsDigest(html, {
        subject: "There are 5 new jobs matching your saved search",
      });

      expect(result).not.toBeNull();
      expect(result!.is_job_related).toBe(true);
      expect(result!.email_category).toBe("JOB_BOARD_DIGEST");
      expect(result!.jobs).toHaveLength(5);

      // Verifies none of the jobs have "JobLeads" as the company
      for (const job of result!.jobs) {
        expect(job.company.toLowerCase()).not.toContain("jobleads");
        expect(job.company.toLowerCase()).not.toContain("savedsearch");
        expect(job.company.toLowerCase()).not.toContain("basedonyour");
        expect(job.title).toBeTruthy();
        expect(job.applyUrl).toContain("jobleads.com");
        // Tracking params should be stripped
        expect(job.applyUrl).not.toContain("utm_source");
        expect(job.applyUrl).not.toContain("saved_search_email_id");
        expect(job.applyUrl).not.toContain("kuuid");
      }

      // Job 1
      expect(result!.jobs[0].title).toBe("Software Engineer (Backend / Full Stack)");
      expect(result!.jobs[0].company).toBe("Amoha Recruitment Services LLC");
      expect(result!.jobs[0].location).toBe("Austin, TX");
      expect(result!.jobs[0].salary).toBe("$75K-$120K");
      expect(result!.jobs[0].salaryMax).toBe(120000);

      // Job 2
      expect(result!.jobs[1].title).toBe("Junior Backend & Full-Stack Engineer - Launch Your Career");
      expect(result!.jobs[1].company).toBe("Amoha Recruitment Services LLC");
      expect(result!.jobs[1].location).toBe("Austin, TX");

      // Job 3
      expect(result!.jobs[2].title).toBe("Backend Engineer");
      expect(result!.jobs[2].company).toBe("Evlo AI");
      expect(result!.jobs[2].location).toBe("New York, NY");
      expect(result!.jobs[2].salary).toBe("$120K-$170K");
      expect(result!.jobs[2].salaryMax).toBe(170000);

      // Job 4
      expect(result!.jobs[3].title).toBe("Backend Engineer");
      expect(result!.jobs[3].company).toBe("Evlo AI");
      expect(result!.jobs[3].location).toBe("San Francisco, CA");

      // Job 5
      expect(result!.jobs[4].title).toContain("Backend Python Developer");
      expect(result!.jobs[4].company).toBe("Emonics LLC");
      expect(result!.jobs[4].location).toBe("Los Angeles, CA");
    });
  });

  describe("parseJobLeadsDigest with JobLeads 2.eml", () => {
    const emlPath = path.resolve(
      process.cwd(),
      "Test HTML/Test Gmail Html/JobLeads 2.eml"
    );
    const emlRaw = fs.readFileSync(emlPath, "utf-8");
    const html = extractHtmlFromEml(emlRaw, "--b9SzzCA5");

    it("extracts all 5 job cards from JobLeads 2 with correct employer names", () => {
      const result = parseJobLeadsDigest(html, {
        subject: "There are 5 new jobs matching your saved search",
      });

      expect(result).not.toBeNull();
      expect(result!.jobs).toHaveLength(5);

      expect(result!.jobs[0].title).toBe("Backend Engineer - onsite");
      expect(result!.jobs[0].company).toBe("EliteGen Enterprise LLC");
      expect(result!.jobs[0].location).toBe("San Francisco, CA");

      expect(result!.jobs[1].title).toBe("Backend Engineer");
      expect(result!.jobs[1].company).toBe("Evlo AI");
      expect(result!.jobs[1].location).toBe("Austin, TX");

      expect(result!.jobs[2].title).toBe("Backend Developer");
      expect(result!.jobs[2].company).toBe("Nimbus North");
      expect(result!.jobs[2].location).toBe("San Diego, CA");

      expect(result!.jobs[3].title).toBe("Junior Full-Stack Engineer: Build Internal Tools (Hybrid)");
      expect(result!.jobs[3].company).toBe("DeWinter Group");
      expect(result!.jobs[3].location).toBe("San Francisco, CA");

      expect(result!.jobs[4].title).toBe("Backend Engineer (Python/Java) - REST & Microservices");
      expect(result!.jobs[4].company).toBe("Robotics Technologies LLC");
      expect(result!.jobs[4].location).toBe("Sunnyvale, CA");
    });
  });

  describe("Aggregator Logo Guard", () => {
    it("strictly prevents JobLeads logo from being generated for job cards", () => {
      expect(getCompanyLogoUrl("JobLeads")).toBeNull();
      expect(getCompanyLogoUrl("JobLeads GmbH")).toBeNull();
      expect(getCompanyLogoUrl("JobLeads", "jobleads.com")).toBeNull();
      expect(getCompanyLogoFallbackUrl("JobLeads")).toBeNull();
      expect(getCompanyLogoFallbackUrl("JobLeads GmbH")).toBeNull();

      // Also protects other aggregator boards
      expect(getCompanyLogoUrl("LinkedIn")).toBeNull();
      expect(getCompanyLogoUrl("Indeed")).toBeNull();
      expect(getCompanyLogoUrl("Glassdoor")).toBeNull();

      // Real companies must still get a valid logo URL and never inherit a jobleads aggregator domain/applyUrl
      const ficosoLogoWithJobLeadsUrl = getCompanyLogoUrl(
        "Ficoso - First Corporate Solutions, Inc.",
        "jobleads.com",
        "https://www.jobleads.com/us/job/senior-software-engineer--sacramento--e85f4b84"
      );
      expect(ficosoLogoWithJobLeadsUrl).toBeTruthy();
      expect(ficosoLogoWithJobLeadsUrl).toContain("favicons?domain=");
      expect(ficosoLogoWithJobLeadsUrl).not.toContain("jobleads.com");

      const amohaLogo = getCompanyLogoUrl("Amoha Recruitment Services LLC");
      expect(amohaLogo).toBeTruthy();
      expect(amohaLogo).not.toContain("jobleads.com");

      const evloLogo = getCompanyLogoUrl("Evlo AI");
      expect(evloLogo).toBeTruthy();
      expect(evloLogo).not.toContain("jobleads.com");
    });
  });
});
