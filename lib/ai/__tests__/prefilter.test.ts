import { describe, expect, it } from "vitest";
import {
  isPromotionalOrMarketingEmail,
  shouldClassifyEmail,
} from "../prefilter";

describe("Promotional & Marketing Email Pre-filter", () => {
  it("correctly identifies shopping, retail, and marketing emails as promotional", () => {
    const promoSubjects = [
      "50% off pizza this Friday!",
      "Limited time offer: Save $50 on all flights",
      "Cyber Monday sale: Up to 70% off hardware",
      "Flash sale: Buy now and get free shipping",
      "Exclusive deal: Pre-order the new laptop today",
      "Hardware sale: Save 20% on accessories",
      "Special offer: Promo code for 15% off",
      "Shop now for Black Friday discounts",
    ];

    for (const subject of promoSubjects) {
      expect(
        isPromotionalOrMarketingEmail(subject),
        `Expected "${subject}" to be flagged as promotional`
      ).toBe(true);
      expect(
        shouldClassifyEmail({ subject }),
        `Expected "${subject}" to be skipped by shouldClassifyEmail`
      ).toBe(false);
    }
  });

  it("identifies marketing emails when promotional markers are in the body with a shopping subject", () => {
    expect(
      isPromotionalOrMarketingEmail(
        "Weekly store rewards and savings",
        "Save up to 40% on your next order with promo code SAVE40. Buy now before clearance sale ends."
      )
    ).toBe(true);
    expect(
      shouldClassifyEmail({
        subject: "Weekly store rewards and savings",
        body: "Save up to 40% on your next order with promo code SAVE40. Buy now before clearance sale ends.",
      })
    ).toBe(false);
  });

  it("does not flag authentic job emails or recruiter outreach as promotional", () => {
    const jobSubjects = [
      "Founding Engineer at Warp",
      "Senior Frontend Developer - Acme Corp",
      "Interview Invitation: Product Designer",
      "Your application to Stripe has been received",
      "New job matches for 'Staff Software Engineer'",
      "Opportunity: Lead Architect at Horizon",
    ];

    for (const subject of jobSubjects) {
      expect(
        isPromotionalOrMarketingEmail(subject),
        `Expected "${subject}" to NOT be flagged as promotional`
      ).toBe(false);
    }
  });

  it("preserves application confirmation emails even when terms like 'offer' appear", () => {
    const confirmation = {
      subject: "Thank you for applying to Stripe",
      body: "We received your application for the Software Engineer role and will review your qualifications shortly.",
    };
    expect(shouldClassifyEmail(confirmation)).toBe(true);
  });

  it("filters out GitHub Action failures, product promos, and generic social notifications", () => {
    const nonJobSubjects = [
      "Run failed: CI & Deployment (abc1234)",
      "Build failed: main branch #412",
      "Workflow run completed with errors",
      "CI & Deployment: Failed step in production pipeline",
      "ASUS x ROG Gaming: Power up your setup",
      "Join the Fight with special deals",
      "Exclusive coupon codes for members",
      "7 people viewed your profile this week",
      "See who viewed your profile on LinkedIn",
      "Security notice: Unauthorized sign-in attempt",
    ];

    for (const subject of nonJobSubjects) {
      expect(
        isPromotionalOrMarketingEmail(subject),
        `Expected "${subject}" to be flagged as promotional / non-job`
      ).toBe(true);
      expect(
        shouldClassifyEmail({ subject }),
        `Expected shouldClassifyEmail to return false for "${subject}"`
      ).toBe(false);
    }
  });
});

describe("cleanEmailPayload Anchor Pre-filtering", () => {
  it("preserves authentic apply links while discarding non-job navigational anchor targets", async () => {
    const { cleanEmailPayload } = await import("../email-cleaner");

    const html = `
      <div>
        <h1>Senior Data Scientist</h1>
        <p>Apply for this role here: <a href="https://careers.example.com/apply/12345">Apply Now</a></p>
        <p>To view our statement: <a href="https://example.com/privacy-policy">Privacy Policy</a></p>
        <p>To stop receiving alerts: <a href="https://example.com/unsubscribe?token=abc">Unsubscribe</a></p>
        <p>Manage account: <a href="https://example.com/settings/manage-preferences">Preferences</a></p>
        <p>Opt out: <a href="https://example.com/opt-out">Opt Out of Communications</a></p>
      </div>
    `;

    const cleaned = cleanEmailPayload(html);
    expect(cleaned).toContain("[Apply Now](https://careers.example.com/apply/12345)");
    expect(cleaned).not.toContain("https://example.com/privacy-policy");
    expect(cleaned).not.toContain("https://example.com/unsubscribe");
    expect(cleaned).not.toContain("https://example.com/settings/manage-preferences");
    expect(cleaned).not.toContain("https://example.com/opt-out");
    expect(cleaned).toContain("Privacy Policy");
    expect(cleaned).toContain("Unsubscribe");
    expect(cleaned).toContain("Preferences");
    expect(cleaned).toContain("Opt Out of Communications");
  });

  it("pre-segments multi-job digest action blocks and extracts anchored URLs", async () => {
    const { segmentDigestBlocks, extractCardApplyUrl } = await import(
      "../email-cleaner"
    );

    const digestText = `
      Software Engineer
      Stripe
      San Francisco, CA
      [View this role](https://jobs.lever.co/stripe/111)

      Product Manager
      Datadog
      New York, NY
      [Apply now](https://boards.greenhouse.io/datadog/222)
    `;

    const blocks = segmentDigestBlocks(digestText);
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toContain("Software Engineer");
    expect(extractCardApplyUrl(blocks[0])).toBe("https://jobs.lever.co/stripe/111");

    expect(blocks[1]).toContain("Product Manager");
    expect(extractCardApplyUrl(blocks[1])).toBe("https://boards.greenhouse.io/datadog/222");
  });

  describe("cleanOpportunityDescription HTML & Artifact Stripping", () => {
    it("strips raw nested HTML tags and line breaks without hardcoding specific content", async () => {
      const { cleanOpportunityDescription } = await import("../classifier");

      const dirty = "<strong><strong>Our Journey<br><br></strong></strong>We are looking for an engineer.";
      const cleaned = cleanOpportunityDescription(dirty);

      expect(cleaned).not.toContain("<strong>");
      expect(cleaned).not.toContain("</strong>");
      expect(cleaned).not.toContain("<br>");
      expect(cleaned).toBe("Our Journey We are looking for an engineer.");
    });

    it("strips entity-encoded HTML tags and normalizes entities", async () => {
      const { cleanOpportunityDescription } = await import("../classifier");

      const encoded = "&lt;strong&gt;&lt;strong&gt;Company Mission&lt;br&gt;&lt;br&gt;&lt;/strong&gt;&lt;/strong&gt;Building next-gen tools &amp; infrastructure.";
      const cleaned = cleanOpportunityDescription(encoded);

      expect(cleaned).not.toContain("&lt;");
      expect(cleaned).not.toContain("&gt;");
      expect(cleaned).not.toContain("<strong>");
      expect(cleaned).not.toContain("</strong>");
      expect(cleaned).not.toContain("<br>");
      expect(cleaned).toBe("Company Mission Building next-gen tools & infrastructure.");
    });

    it("strips mixed block elements and handles empty tag-only strings", async () => {
      const { cleanOpportunityDescription } = await import("../classifier");

      const mixed = "<div><p>Key Responsibilities:</p><ul><li>Lead project roadmap</li><li>Collaborate with stakeholders</li></ul></div>";
      const cleaned = cleanOpportunityDescription(mixed);

      expect(cleaned).not.toMatch(/<[^>]+>/);
      expect(cleaned).toContain("Key Responsibilities: Lead project roadmap Collaborate with stakeholders");

      // Returns null when input is empty or only tags
      expect(cleanOpportunityDescription("   <strong><br><br></strong>   ")).toBeNull();
      expect(cleanOpportunityDescription(null)).toBeNull();
      expect(cleanOpportunityDescription("")).toBeNull();
    });
  });

  describe("Real-World Spam EML File Ingestion & Filtering", () => {
    const fs = require("fs");
    const path = require("path");

    function decodeMimeHeader(val: string): string {
      return val.replace(
        /=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi,
        (_: string, _charset: string, encoding: string, text: string) => {
          if (encoding.toUpperCase() === "B") {
            try {
              return Buffer.from(text, "base64").toString("utf-8");
            } catch {
              return text;
            }
          } else if (encoding.toUpperCase() === "Q") {
            try {
              const raw = text
                .replace(/_/g, " ")
                .replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) =>
                  String.fromCharCode(parseInt(hex, 16))
                );
              return decodeURIComponent(escape(raw));
            } catch {
              return text;
            }
          }
          return text;
        }
      );
    }

    function parseSimpleEml(filePath: string) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const headerEnd = raw.search(/\r?\n\r?\n/);
      const headerSection = headerEnd !== -1 ? raw.slice(0, headerEnd) : raw;
      const bodySection = headerEnd !== -1 ? raw.slice(headerEnd) : "";

      const subjectMatch = headerSection.match(/^Subject:\s*([^\r\n]+)/im);
      const rawSubject = subjectMatch ? subjectMatch[1].trim() : "";
      const subject = decodeMimeHeader(rawSubject);

      const fromMatch = headerSection.match(/^From:\s*([^\r\n]+)/im);
      const rawFrom = fromMatch ? fromMatch[1].trim() : "";
      const decodedFrom = decodeMimeHeader(rawFrom);
      const fromEmail =
        decodedFrom.match(/<([^>]+)>/)?.[1] ?? decodedFrom.trim();

      return { subject, fromEmail, body: bodySection };
    }

    const spamDir = path.resolve(process.cwd(), "Test HTML/Spam Html");
    const spamFiles: string[] = fs.existsSync(spamDir)
      ? fs.readdirSync(spamDir).filter((f: string) => f.endsWith(".eml"))
      : [];

    it.each(spamFiles.map((f: string) => [f]))(
      "correctly drops non-job spam email: %s",
      (fileName: string) => {
        const fullPath = path.join(spamDir, fileName);
        const { subject, fromEmail, body } = parseSimpleEml(fullPath);

        const isPromo = isPromotionalOrMarketingEmail(subject, body, fromEmail);
        const shouldClassify = shouldClassifyEmail({
          subject,
          body,
          fromEmail,
        });

        expect(
          isPromo,
          `Expected ${fileName} to be recognized as promotional/noise`
        ).toBe(true);
        expect(
          shouldClassify,
          `Expected ${fileName} to be rejected by shouldClassifyEmail`
        ).toBe(false);
      }
    );

    const jobDir = path.resolve(process.cwd(), "Test HTML/Test Gmail Html");
    const jobFiles: string[] = fs.existsSync(jobDir)
      ? fs.readdirSync(jobDir).filter((f: string) => f.endsWith(".eml"))
      : [];

    it.each(jobFiles.map((f: string) => [f]))(
      "guarantees 100% recall for authentic job emails: %s",
      (fileName: string) => {
        const fullPath = path.join(jobDir, fileName);
        const { subject, fromEmail, body } = parseSimpleEml(fullPath);

        const shouldClassify = shouldClassifyEmail({
          subject,
          body,
          fromEmail,
        });

        expect(
          shouldClassify,
          `Expected authentic job email ${fileName} to pass pre-filter`
        ).toBe(true);
      }
    );

    it("preserves cold recruiter outreach across diverse non-tech disciplines (Career Agnostic)", () => {
      const disciplines = [
        {
          discipline: "Healthcare / Nursing",
          subject: "Clinical Nurse Specialist Opportunity at St. Jude",
          fromEmail: "sarah.connor@talent-stjude.org",
          body: "Hello, I came across your healthcare profile and was impressed by your ICU experience. We have an opening for a Clinical Nurse Specialist.",
        },
        {
          discipline: "Accounting / Audit",
          subject: "Senior Auditor Role - Ernst & Young",
          fromEmail: "m.adams@ey-careers.com",
          body: "Saw your profile and thought your forensic auditing background would be a great fit for our Risk Advisory team.",
        },
        {
          discipline: "Architecture / Construction",
          subject: "Project Architect - Commercial Developments",
          fromEmail: "recruiting@foster-partners-hiring.com",
          body: "We have an open position for a licensed architect to lead large-scale civic projects. Would love to schedule a quick intro chat.",
        },
        {
          discipline: "Legal",
          subject: "Associate Corporate Counsel Opening",
          fromEmail: "talent@baker-mckenzie-law.com",
          body: "I am a legal recruiter reaching out regarding an in-house counsel opportunity with one of our major clients.",
        },
      ];

      for (const d of disciplines) {
        expect(
          shouldClassifyEmail(d),
          `Expected ${d.discipline} outreach to pass through to LLM`
        ).toBe(true);
      }
    });
  });
});
