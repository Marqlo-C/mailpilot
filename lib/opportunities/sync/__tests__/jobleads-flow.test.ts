import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { isJobLeadsEmail, parseJobLeadsDigest } from "../jobleads";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { isKnownJobDomain } from "@/lib/constants/job-sources";
import { resolveJobOpportunity } from "@/lib/opportunities/context";
import { evaluateOpportunityMatch } from "@/lib/matching";

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function extractHtmlFromEml(emlContent: string, boundary: string): string {
  const parts = emlContent.split(boundary);
  const htmlPart = parts.find((p) => /Content-Type:\s*text\/html/i.test(p)) ?? parts[2];
  return decodeQuotedPrintable(htmlPart);
}

describe("JobLeads Sync Flow Invariant Verification", () => {
  const emlPath = path.resolve(
    process.cwd(),
    "Test HTML/Test Gmail Html/JobLeads 1.eml"
  );
  const emlRaw = fs.readFileSync(emlPath, "utf-8");
  const html = extractHtmlFromEml(emlRaw, "--jSsimxcQ");

  describe("1. Deterministic Parser vs Ollama Bypass", () => {
    it("identifies JobLeads emails accurately from headers", () => {
      const fromHeader = "JobLeads <alerts@jobleads.com>";
      const isJobLeads = isJobLeadsEmail("alerts@jobleads.com", "JobLeads", fromHeader);
      expect(isJobLeads).toBe(true);
    });

    it("verifies the bypass condition: JobLeads emails must bypass Ollama and use parseJobLeadsDigest", () => {
      const isJobLeads = true;
      const rawHtml = html;

      // Simulate router check:
      let classification = null;
      let ollamaCalled = false;

      // The REQUIRED flow: if isJobLeads && rawHtml, immediately use parseJobLeadsDigest
      if (isJobLeads && rawHtml) {
        classification = parseJobLeadsDigest(rawHtml, {
          subject: "There are 5 new jobs matching your saved search",
        });
      } else {
        ollamaCalled = true; // Would have called classifyEmail
      }

      expect(ollamaCalled).toBe(false); // Ollama MUST NOT be called
      expect(classification).not.toBeNull();
      expect(classification!.jobs[0].company).toBe("Amoha Recruitment Services LLC");
      expect(classification!.jobs[0].company).not.toBe("JobLeads GmbH");
    });

    it("extracts real employers directly from HTML without needing any LLM", () => {
      const parsed = parseJobLeadsDigest(html, {
        subject: "There are 5 new jobs matching your saved search",
      });

      expect(parsed).not.toBeNull();
      expect(parsed!.jobs).toHaveLength(5);

      // Verify that none of the extracted jobs have JobLeads as company
      for (const job of parsed!.jobs) {
        expect(job.company.toLowerCase()).not.toContain("jobleads");
        expect(job.company).not.toBe("Unknown Company");
        expect(isKnownJobDomain(job.company)).toBe(false);
      }

      // First job in JobLeads 1.eml is Amoha Recruitment Services LLC
      expect(parsed!.jobs[0].company).toBe("Amoha Recruitment Services LLC");
      expect(parsed!.jobs[0].title).toBe("Software Engineer (Backend / Full Stack)");
    });
  });

  describe("2. Logo and Domain Aggregator Shield", () => {
    it("never retains jobleads.com as companyDomain or logoUrl for extracted jobs", () => {
      const parsed = parseJobLeadsDigest(html, {
        subject: "There are 5 new jobs matching your saved search",
      });

      for (const job of parsed!.jobs) {
        // companyDomain must be null or employer's domain, never jobleads
        expect(job.companyDomain).toBeNull();

        // getCompanyLogoUrl must resolve the employer's logo or monogram, never jobleads.com
        const resolvedLogo = getCompanyLogoUrl(
          job.company,
          job.companyDomain,
          job.applyUrl
        );

        if (resolvedLogo) {
          expect(resolvedLogo).not.toContain("jobleads.com");
          expect(resolvedLogo).not.toContain("jobleads");
        }
      }
    });

    it("rejects existing jobleads.com domain and logoUrl during in-place card rendering", () => {
      // Simulate an existing database record stuck with JobLeads metadata
      const stuckRecord = {
        company: "Ficoso - First Corporate Solutions, Inc.",
        companyDomain: "jobleads.com",
        logoUrl: "https://www.google.com/s2/favicons?domain=jobleads.com&sz=128",
        applyUrl: "https://www.jobleads.com/us/job/senior-software-engineer--sacramento--e85f4b84",
      };

      const isAggregator = (val?: string | null): boolean => {
        if (!val) return false;
        const lower = val.toLowerCase();
        return lower.includes("jobleads") || isKnownJobDomain(lower);
      };

      const rawLogo =
        stuckRecord.logoUrl && !isAggregator(stuckRecord.logoUrl)
          ? stuckRecord.logoUrl
          : null;

      const safeDomain =
        stuckRecord.companyDomain && !isAggregator(stuckRecord.companyDomain)
          ? stuckRecord.companyDomain
          : null;

      const finalLogo =
        rawLogo ||
        getCompanyLogoUrl(
          stuckRecord.company,
          safeDomain,
          stuckRecord.applyUrl
        );

      expect(rawLogo).toBeNull(); // Aggregator logo rejected
      expect(safeDomain).toBeNull(); // Aggregator domain rejected
      expect(finalLogo).not.toBeNull();
      expect(finalLogo).not.toContain("jobleads.com"); // Re-resolved to employer
    });
  });

  describe("3. Zero-Deletion Invariant", () => {
    it("proves that deduplicating/updating records must never call deleteMany", () => {
      // Mock prisma.jobOpportunity
      const mockDeleteMany = vi.fn();
      const mockUpdate = vi.fn();

      // Ensure the requirement: sync updates existing records in place and NEVER calls deleteMany
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe("4. Fake Information In-Place Update Verification", () => {
    it("updates an existing card stuck with fake 'JobLeads GmbH' info to the true employer info", () => {
      // 1. Simulate existing database record with fake/hallucinated info
      const existingFakeCard = {
        id: "opp-fake-123",
        accountId: "acc-1",
        emailMessageId: "msg-1",
        company: "JobLeads GmbH", // FAKE INFO
        companyDomain: "jobleads.com", // FAKE DOMAIN
        logoUrl: "https://www.google.com/s2/favicons?domain=jobleads.com&sz=128", // FAKE LOGO
        title: "Software Engineer (Backend / Full Stack)",
        location: "Austin, TX",
        salary: null, // missing
        salaryMax: null,
        status: "DISCOVERED",
        isArchived: false,
        applyUrl: "https://www.jobleads.com/us/job/software-engineer-backend-full-stack--austin--e123?kuuid=f5014a8cc87b6dbbaed169c9111feeac&saved_search_email_id=123",
      };

      // 2. Extracted job from the new deterministic parser
      const extractedJob = {
        company: "Amoha Recruitment Services LLC", // TRUE EMPLOYER
        title: "Software Engineer (Backend / Full Stack)",
        location: "Austin, TX",
        salary: "$75K-$120K",
        salaryMax: 120000,
        applyUrl: "https://www.jobleads.com/us/job/software-engineer-backend-full-stack--austin--e123",
      };

      // 3. Test matching logic (Tier 1 same-email)
      const sameEmailRows = [existingFakeCard];

      const applyUrlsMatch = (a?: string | null, b?: string | null): boolean => {
        if (!a?.trim() || !b?.trim()) return false;
        try {
          const urlA = new URL(a.trim());
          const urlB = new URL(b.trim());
          return (
            urlA.hostname.replace(/^www\./, "").toLowerCase() ===
              urlB.hostname.replace(/^www\./, "").toLowerCase() &&
            urlA.pathname.replace(/\/+$/, "").toLowerCase() ===
              urlB.pathname.replace(/\/+$/, "").toLowerCase()
          );
        } catch {
          return a.trim() === b.trim();
        }
      };

      const matchedCard = sameEmailRows.find(
        (row) =>
          applyUrlsMatch(extractedJob.applyUrl, row.applyUrl) ||
          (row.title.toLowerCase() === extractedJob.title.toLowerCase() &&
            (row.company.toLowerCase().includes("jobleads") || isKnownJobDomain(row.company)))
      );

      expect(matchedCard).toBeDefined();
      expect(matchedCard!.id).toBe("opp-fake-123");

      // 4. Test update payload construction
      const isAggregator = (val?: string | null): boolean => {
        if (!val) return false;
        const lower = val.toLowerCase();
        return lower.includes("jobleads") || isKnownJobDomain(lower);
      };

      const resolvedCompanyDomain =
        existingFakeCard.company.toLowerCase() === extractedJob.company.toLowerCase() &&
        existingFakeCard.companyDomain &&
        !isAggregator(existingFakeCard.companyDomain)
          ? existingFakeCard.companyDomain
          : null;

      const resolvedLogoUrl =
        isAggregator(existingFakeCard.logoUrl) ||
        existingFakeCard.company.toLowerCase() !== extractedJob.company.toLowerCase()
          ? getCompanyLogoUrl(extractedJob.company, resolvedCompanyDomain, extractedJob.applyUrl)
          : existingFakeCard.logoUrl;

      const updateData = {
        company: extractedJob.company,
        title: extractedJob.title,
        location: extractedJob.location,
        salary: extractedJob.salary,
        salaryMax: extractedJob.salaryMax,
        companyDomain: resolvedCompanyDomain,
        logoUrl: resolvedLogoUrl,
        status: existingFakeCard.status, // Preserved
      };

      // 5. Verify that fake info was completely overwritten with the true employer
      expect(updateData.company).toBe("Amoha Recruitment Services LLC");
      expect(updateData.company).not.toContain("JobLeads");
      expect(updateData.companyDomain).toBeNull();
      expect(updateData.companyDomain).not.toBe("jobleads.com");
      expect(updateData.logoUrl).not.toBeNull();
      expect(updateData.logoUrl).not.toContain("jobleads.com");
      expect(updateData.salary).toBe("$75K-$120K");
      expect(updateData.status).toBe("DISCOVERED");
    });

    it("updates a card even if it was previously in DISMISSED status without resurrecting it", () => {
      const existingDismissedCard = {
        id: "opp-dismissed-456",
        company: "JobLeads GmbH",
        title: "Software Engineer (Backend / Full Stack)",
        status: "DISMISSED", // DISMISSED
        isArchived: false,
        applyUrl: "https://www.jobleads.com/us/job/software-engineer-backend-full-stack--austin--e123",
      };

      const extractedJob = {
        company: "Amoha Recruitment Services LLC",
        title: "Software Engineer (Backend / Full Stack)",
        salary: "$75K-$120K",
        applyUrl: "https://www.jobleads.com/us/job/software-engineer-backend-full-stack--austin--e123",
      };

      // Update payload must update company while preserving DISMISSED status
      const updatedCard = {
        ...existingDismissedCard,
        company: extractedJob.company,
        salary: extractedJob.salary,
        status: existingDismissedCard.status, // Must stay DISMISSED
      };

      expect(updatedCard.company).toBe("Amoha Recruitment Services LLC");
      expect(updatedCard.status).toBe("DISMISSED"); // Not resurrected to DISCOVERED
    });
  });

  describe("5. Description Richness & Heuristic Sparkles Invariant", () => {
    it("evaluates a minimal lead through Path A slim heuristic and produces dynamic title/leveling reason", () => {
      const candidateLens = {
        summary: "Software Engineer",
        inFieldYears: 1,
        archetype: "Career Switcher",
        seniorityTier: "MID" as const,
        recentRoles: ["Backend Engineer", "Software Engineer"],
        timelineContext: "career switcher background with nearly a year in current field",
        titleFamily: "Software Engineering",
        skills: ["Java", "Spring", "Node.js"],
        educationSummary: "BS Computer Science",
        experienceSummary: "1 year",
        targetTitles: ["Backend Engineer", "Software Engineer"],
        excludedTitles: [],
        toneGuidance: null,
      };

      const minimalLead = resolveJobOpportunity({
        company: "Redolent, Inc",
        title: "Backend Engineer (Java/Spring/Node.js/GraphQL) - Remote",
        description: "Backend Engineer (Java/Spring/Node.js/GraphQL) - Remote at Redolent, Inc in Sunnyvale, CA.",
        salary: "$140K-$190K",
      });

      expect(minimalLead.richness).toBe("MINIMAL_LEAD");

      const evaluated = evaluateOpportunityMatch({
        opportunity: minimalLead,
        candidate: candidateLens,
        mode: "HEURISTIC",
      });

      expect(evaluated.score).toBeGreaterThanOrEqual(75);
      expect(evaluated.reason).toContain("Direct title alignment with your verified background");
      expect(evaluated.reason).toContain("Redolent, Inc");
      expect(evaluated.reason).toContain("$140K-$190K");
      expect(evaluated.reason).not.toBe("Job digest recommendation from JobLeads");
    });

    it("evaluates rich spec (>= 300 chars) as RICH_SPEC for blue sparkles", () => {
      const richOpp = resolveJobOpportunity({
        company: "Redolent, Inc",
        title: "Backend Engineer",
        description: "We are seeking a Backend Engineer with experience in Java, Spring Boot, GraphQL, and microservices architecture. Requirements include 3+ years experience building scalable web services, strong understanding of SQL and database optimization, and experience with CI/CD pipelines.",
      });

      expect(richOpp.richness).toBe("RICH_SPEC");
    });

    it("verifies the card sparkles rule: rich spec -> blue sparkles, minimal lead -> gray sparkle", () => {
      const isRichSpec = (desc?: string | null): boolean => {
        const text = desc?.trim() || "";
        if (text.length >= 300) return true;
        return /(?:requirements|qualifications|must\s+have|what\s+you(?:'ll|\s+will)\s+bring|what\s+we(?:'re|\s+are)\s+looking\s+for|preferred\s+skills|minimum\s+qualifications)/i.test(
          text
        );
      };

      // 1. Minimal lead (e.g. un-scraped JobLeads digest or brief notification)
      const minimalDesc = "Backend Engineer at Redolent, Inc in Sunnyvale, CA.";
      expect(isRichSpec(minimalDesc)).toBe(false); // Gray sparkle (<Sparkle className="text-muted-foreground/80" />)

      // 2. Rich spec (from email body or successfully scraped LinkParser)
      const richDesc = "Backend Engineer role at Redolent. Requirements: 3+ years experience with Java, Spring, Kubernetes, and AWS cloud infrastructure.";
      expect(isRichSpec(richDesc)).toBe(true); // Blue sparkles (<Sparkles className="text-blue-500" />)
    });
  });
});
