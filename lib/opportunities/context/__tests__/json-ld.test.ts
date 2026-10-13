import { describe, it, expect, vi } from "vitest";
import {
  extractJsonLdJobPosting,
  fetchViaJinaReader,
  isLegitimateJobContent,
  sanitizeJinaMarkdown,
  scrapeJobPostingJsonLd,
  transformToLinkedInGuestUrl,
  unwrapTrackingUrl,
} from "../json-ld";

vi.mock("@/lib/ssrf", () => ({
  assertSafeHttpsUrl: vi.fn(async (url: string) => new URL(url)),
}));

describe("JSON-LD Link Parser", () => {
  it("extracts structured JobPosting from valid application/ld+json script", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Staff Cloud Architect",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "Stripe"
            },
            "jobLocation": {
              "@type": "Place",
              "address": {
                "addressLocality": "San Francisco",
                "addressRegion": "CA"
              }
            },
            "baseSalary": {
              "@type": "MonetaryAmount",
              "value": {
                "minValue": 190000,
                "maxValue": 240000
              }
            },
            "description": "<p>Lead technical infrastructure modernization across core ledger systems.</p>",
            "url": "https://stripe.com/jobs/123"
          }
          </script>
        </head>
        <body>Job Posting Page</body>
      </html>
    `;

    const result = extractJsonLdJobPosting(html);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Staff Cloud Architect");
    expect(result?.company).toBe("Stripe");
    expect(result?.location).toBe("San Francisco, CA");
    expect(result?.salary).toBe("$190000 - $240000");
    expect(result?.description).toBe(
      "Lead technical infrastructure modernization across core ledger systems."
    );
    expect(result?.applyUrl).toBe("https://stripe.com/jobs/123");
  });

  it("handles @graph schema collections", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "name": "Careers at GitHub"
          },
          {
            "@type": "JobPosting",
            "title": "Platform Engineer",
            "hiringOrganization": {
              "name": "GitHub"
            },
            "jobLocationType": "TELECOMMUTE",
            "description": "Design and maintain high-scale developer platform tooling."
          }
        ]
      }
      </script>
    `;

    const result = extractJsonLdJobPosting(html);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Platform Engineer");
    expect(result?.company).toBe("GitHub");
    expect(result?.location).toBe("Remote");
    expect(result?.description).toBe(
      "Design and maintain high-scale developer platform tooling."
    );
  });

  it("returns null when no JobPosting is present", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@type": "Article",
        "headline": "10 Tips for Writing Better Code"
      }
      </script>
    `;

    const result = extractJsonLdJobPosting(html);
    expect(result).toBeNull();
  });

  describe("unwrapTrackingUrl", () => {
    it("extracts destination URL from tracking query parameters", () => {
      const tracking =
        "https://track.jobboard.com/click?dest=https%3A%2F%2Fboards.greenhouse.io%2Fstripe%2Fjobs%2F123&utm_source=alert";
      const unpacked = unwrapTrackingUrl(tracking);
      expect(unpacked).toBe("https://boards.greenhouse.io/stripe/jobs/123");
    });

    it("unpacks nested / chained redirects", () => {
      const chained =
        "https://mail-tracker.com/r?url=https%3A%2F%2Faggregator.com%2Fclick%3Ftarget%3Dhttps%253A%252F%252Fjobs.lever.co%252Facme%252F456";
      const unpacked = unwrapTrackingUrl(chained);
      expect(unpacked).toBe("https://jobs.lever.co/acme/456");
    });

    it("unpacks multi-level encoded tgt query params (e.g. JobLeads)", () => {
      const tracking =
        "https://www.jobleads.com/redirect?tgt=https%253A%252F%252Fcareers.smartrecruiters.com%252Fcompany%252F123&utm_source=email";
      const unpacked = unwrapTrackingUrl(tracking);
      expect(unpacked).toBe("https://careers.smartrecruiters.com/company/123");
    });

    it("upgrades http:// URLs to https://", () => {
      const httpTracking =
        "http://track.example.com/click?dest=http%3A%2F%2Fboards.greenhouse.io%2Facme%2Fjobs%2F789";
      const unpacked = unwrapTrackingUrl(httpTracking);
      expect(unpacked).toBe("https://boards.greenhouse.io/acme/jobs/789");
    });

    it("maps Glassdoor partner redirects with jobListingId directly to canonical job-listing URL", () => {
      const partnerUrl =
        "https://www.glassdoor.com/partner/jobListing.htm?pos=101&ao=1110586&s=58&guid=000001927&jobListingId=1009581234567";
      const unpacked = unwrapTrackingUrl(partnerUrl);
      expect(unpacked).toBe("https://www.glassdoor.com/job-listing/?jl=1009581234567");
    });

    it("normalizes LinkedIn view and tracking links to canonical job view URLs", () => {
      const tracking =
        "https://www.linkedin.com/comm/jobs/view/4123456789?trackingId=dHVh&refId=abc";
      expect(unwrapTrackingUrl(tracking)).toBe(
        "https://www.linkedin.com/jobs/view/4123456789"
      );

      const searchWithJobId =
        "https://www.linkedin.com/jobs/search/?currentJobId=4123456789&geoId=103644278";
      expect(unwrapTrackingUrl(searchWithJobId)).toBe(
        "https://www.linkedin.com/jobs/view/4123456789"
      );

      const redirect =
        "https://track.email.com/r?dest=https%3A%2F%2Fwww.linkedin.com%2Fcomm%2Fjobs%2Fview%2F987654321%3Ftrk%3Ddigest";
      expect(unwrapTrackingUrl(redirect)).toBe(
        "https://www.linkedin.com/jobs/view/987654321"
      );
    });

    it("leaves clean URLs unchanged", () => {
      const direct = "https://careers.google.com/jobs/results/12345";
      expect(unwrapTrackingUrl(direct)).toBe(direct);
    });
  });

  describe("transformToLinkedInGuestUrl", () => {
    it("transforms standard LinkedIn view URLs to jobs-guest API URLs", () => {
      const url = "https://www.linkedin.com/jobs/view/4123456789";
      expect(transformToLinkedInGuestUrl(url)).toBe(
        "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4123456789"
      );
    });

    it("transforms comm/jobs/view URLs to jobs-guest API URLs", () => {
      const url = "https://www.linkedin.com/comm/jobs/view/4123456789?trackingId=xyz";
      expect(transformToLinkedInGuestUrl(url)).toBe(
        "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4123456789"
      );
    });

    it("transforms search URLs with currentJobId to jobs-guest API URLs", () => {
      const url = "https://www.linkedin.com/jobs/search/?currentJobId=987654321&geoId=123";
      expect(transformToLinkedInGuestUrl(url)).toBe(
        "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/987654321"
      );
    });

    it("returns null for non-LinkedIn job URLs", () => {
      expect(transformToLinkedInGuestUrl("https://amazon.jobs/jobs/12345")).toBeNull();
      expect(transformToLinkedInGuestUrl("https://boards.greenhouse.io/stripe/jobs/123")).toBeNull();
    });
  });

  describe("isLegitimateJobContent", () => {
    it("validates legitimate job posting text with structural markers", () => {
      const jobText = `
        About the role:
        We are seeking a candidate to manage enterprise projects.
        Responsibilities:
        - Lead cross-functional operations
        - Coordinate project deliverables
        Qualifications:
        - 4+ years of relevant experience
        - Bachelor degree in related field
        We offer competitive salary and full medical benefits.
      `.trim();
      expect(isLegitimateJobContent(jobText)).toBe(true);
    });

    it("accepts legitimate job text containing sign in buttons if job structure is present", () => {
      const jobWithAuthButton = `
        About the role:
        Our company is hiring an Operations Specialist.
        Responsibilities:
        - Oversee daily operational cadence and quality standards.
        Qualifications:
        - 3+ years of experience in project coordination.
        - Bachelor degree required.
        Sign in to apply with your existing account.
      `.trim();
      expect(isLegitimateJobContent(jobWithAuthButton)).toBe(true);
    });

    it("rejects text that is too short (< 250 characters)", () => {
      expect(isLegitimateJobContent("Short job description. Responsibilities: Code.")).toBe(false);
      expect(isLegitimateJobContent("")).toBe(false);
    });

    it("rejects pages without job structural markers", () => {
      const genericText = "This is a random article discussing various technology topics in general. ".repeat(6);
      expect(isLegitimateJobContent(genericText)).toBe(false);
    });

    it("rejects auth-wall and login redirect pages", () => {
      const authWall = `
        Sign in to your account.
        Welcome back! Please enter your email and password to continue.
        Forgot password? Keep me logged in on this browser.
        Continue with Apple or sign in with your corporate SSO passkey.
        Don't have an account yet? Create one now.
      `.repeat(2);
      expect(isLegitimateJobContent(authWall)).toBe(false);
    });

    it("rejects Cloudflare bot challenge and CAPTCHA pages", () => {
      const challengePage = `
        Attention Required! | Cloudflare
        Please verify you are human to access this site.
        Security check in progress. Enable cookies and JavaScript to continue.
        Cloudflare Ray ID: 8e84712019ab921c.
      `.repeat(3);
      expect(isLegitimateJobContent(challengePage)).toBe(false);
    });
  });

  describe("sanitizeJinaMarkdown", () => {
    it("strips Jina metadata prefixes and navigational boilerplate", () => {
      const raw = `
Title: Senior Systems Engineer - Acme Corp
URL Source: https://jobs.example.com/posting/123
Markdown Content:
About the Role:
We are seeking an engineer to scale our distributed database layer.

[Apply on Company Site](https://example.com/apply)
[View Original](https://example.com/orig)
[Sign In](https://example.com/login)
[Cookie Policy](https://example.com/cookies)

Responsibilities:
- Build high-availability replicated state machines
- Diagnose network partitions
      `.trim();

      const sanitized = sanitizeJinaMarkdown(raw);
      expect(sanitized).not.toContain("Title:");
      expect(sanitized).not.toContain("URL Source:");
      expect(sanitized).not.toContain("Markdown Content:");
      expect(sanitized).not.toContain("[Apply on Company Site]");
      expect(sanitized).not.toContain("[Cookie Policy]");
      expect(sanitized).toContain("About the Role:");
      expect(sanitized).toContain("Build high-availability replicated state machines");
    });

    it("strips Cloudflare challenge signatures and discards challenge-only responses", () => {
      const cfChallenge = `
Title: Just a moment...
URL Source: https://example.com/job/glassdoor
Markdown Content:
Just a moment...
Enable JavaScript and cookies to continue
Cloudflare Ray ID: 8e84712019ab921c
      `.trim();

      const sanitized = sanitizeJinaMarkdown(cfChallenge);
      expect(sanitized).toBe("");
    });

    it("clamps output to 4,000 characters", () => {
      const longText = "A".repeat(5000);
      const sanitized = sanitizeJinaMarkdown(longText);
      expect(sanitized.length).toBe(4000);
    });

    it("handles empty or falsy text gracefully", () => {
      expect(sanitizeJinaMarkdown("")).toBe("");
    });
  });

  describe("fetchViaJinaReader", () => {
    it("fetches unauthenticated with Public Free Tier headers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("# Job Description\nSenior Engineer"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await fetchViaJinaReader("https://example.com/job/123", null);
      expect(result.text).toBe("# Job Description\nSenior Engineer");
      expect(result.error).toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://r.jina.ai/https://example.com/job/123",
        expect.objectContaining({
          headers: {
            Accept: "text/plain",
            "X-No-Cache": "true",
          },
        })
      );
      vi.unstubAllGlobals();
    });

    it("attaches Authorization header when BYOK key is provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("# Job Description with BYOK"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await fetchViaJinaReader(
        "https://example.com/job/123",
        "jina_custom_secret_key"
      );
      expect(result.text).toBe("# Job Description with BYOK");
      expect(result.error).toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://r.jina.ai/https://example.com/job/123",
        expect.objectContaining({
          headers: {
            Accept: "text/plain",
            "X-No-Cache": "true",
            Authorization: "Bearer jina_custom_secret_key",
          },
        })
      );
      vi.unstubAllGlobals();
    });

    it("returns null text and error when Jina Reader returns non-200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await fetchViaJinaReader("https://example.com/job/123", null);
      expect(result.text).toBeNull();
      expect(result.error).toBe("HTTP 500");
      vi.unstubAllGlobals();
    });
  });

  describe("scrapeJobPostingJsonLd with Direct HTML & Jina Fallback", () => {
    it("hydrates via Direct HTML when 200 OK lacks JSON-LD", async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Amazon Software Development Engineer</title></head>
          <body>
            <header><nav><a href="/">Home</a></nav></header>
            <main>
              <h1>Software Development Engineer Apprentice</h1>
              <p>About the role: We are seeking an apprentice to join our distributed infrastructure team.</p>
              <p>Responsibilities: Build robust services and monitor telemetry. Qualifications: Experience with modern programming languages and strong problem-solving skills.</p>
            </main>
            <footer><p>&copy; 2026 Amazon</p></footer>
          </body>
        </html>
      `;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(html),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd("https://amazon.jobs/en/jobs/12345");
      expect(result.data).not.toBeNull();
      expect(result.data?.description).toContain("Software Development Engineer Apprentice");
      expect(result.telemetry).toContain("via Direct HTML");

      vi.unstubAllGlobals();
    });

    it("skips and advises configuring Jina key when direct fetch hits 403 Bot Wall without key", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://example.com/job/glassdoor-403",
        2500,
        null
      );

      expect(result.data).toBeNull();
      expect(result.telemetry).toBe(
        "Skipped (HTTP 403 Bot Wall - Configure Jina Key in Settings)"
      );

      vi.unstubAllGlobals();
    });

    it("falls back to Jina Reader with BYOK Key when direct fetch hits 403 Bot Wall", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const jinaContent = "About The Position: Responsibilities and qualifications for this role. ".repeat(10); // > 150 chars

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("https://r.jina.ai/")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(jinaContent),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 403,
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://example.com/job/glassdoor-403",
        2500,
        "jina_my_personal_key"
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "  ├─ LinkParser: Fallback via Jina (BYOK Key) [HTTP 403 Bot Wall]"
      );
      expect(result.data).not.toBeNull();
      expect(result.data?.description).toContain("About The Position:");
      expect(result.telemetry).toContain("via Jina (BYOK Key)");

      consoleLogSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it("falls back to Jina Reader with BYOK Key when direct fetch hits 429", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const jinaContent = "About the role: Responsibilities include building scalable solutions. Required skills and experience: ".repeat(5);

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("https://r.jina.ai/")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(jinaContent),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 429,
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://example.com/job/aggregator-429",
        2500,
        "jina_my_personal_key"
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "  ├─ LinkParser: Fallback via Jina (BYOK Key) [HTTP 429 Bot Wall]"
      );
      expect(result.data).not.toBeNull();
      expect(result.telemetry).toContain("via Jina (BYOK Key)");

      consoleLogSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it("reports Skipped (Jina timeout or bot wall) when Jina Reader fails with BYOK key", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("https://r.jina.ai/")) {
          return Promise.resolve({
            ok: false,
            status: 500,
          });
        }
        return Promise.resolve({
          ok: false,
          status: 403,
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://example.com/job/bot-walled-both",
        2500,
        "jina_my_personal_key"
      );

      expect(result.data).toBeNull();
      expect(result.telemetry).toBe("Skipped (Jina timeout or bot wall)");

      consoleLogSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it("hydrates LinkedIn job postings via the public jobs-guest endpoint and preserves canonical applyUrl", async () => {
      const linkedInHtml = `
        <!DOCTYPE html>
        <html>
          <body>
            <div class="show-more-less-html__markup">
              <p>About the role: We are looking for an experienced Senior Product Manager to lead our growth initiatives.</p>
              <p>Responsibilities include roadmap strategy, cross-team alignment, feature execution, and tracking core KPIs.</p>
              <p>Qualifications: 5+ years of relevant experience. Bachelor degree required. Competitive salary and benefits.</p>
            </div>
          </body>
        </html>
      `;

      let fetchedUrl = "";
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        fetchedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(linkedInHtml),
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://www.linkedin.com/comm/jobs/view/4123456789?trackingId=xyz"
      );

      expect(fetchedUrl).toBe(
        "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4123456789"
      );
      expect(result.data).not.toBeNull();
      expect(result.data?.applyUrl).toBe("https://www.linkedin.com/jobs/view/4123456789");
      expect(result.data?.description).toContain("About the role: We are looking for an experienced Senior Product Manager");
      expect(result.telemetry).toContain("via LinkedIn Guest API");

      vi.unstubAllGlobals();
    });

    it("rejects LinkedIn jobs-guest response if it contains an auth wall or login prompt", async () => {
      const authWallHtml = `
        <!DOCTYPE html>
        <html>
          <body>
            <div class="show-more-less-html__markup">
              <h2>Sign in to LinkedIn</h2>
              <p>Please enter your email and password to view this content. Continue with Apple.</p>
            </div>
          </body>
        </html>
      `;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(authWallHtml),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://www.linkedin.com/jobs/view/4123456789"
      );

      expect(result.data).toBeNull();
      expect(result.telemetry).toBe("Skipped (Auth wall or non-job content detected)");

      vi.unstubAllGlobals();
    });

    it("rejects Direct HTML when content is an auth wall without job structure", async () => {
      const blockedHtml = `
        <!DOCTYPE html>
        <html>
          <body>
            <main>
              <h1>Sign in to continue</h1>
              <p>Please enter your email and password to log in. Don't have an account? Sign up now. Continue with Apple or passkey.</p>
              <p>Verify you are human. Security check by Cloudflare. Enable cookies to continue. Access requires account authorization.</p>
            </main>
          </body>
        </html>
      `;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(blockedHtml),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd("https://example.com/job/walled");
      expect(result.data).toBeNull();
      expect(result.telemetry).toBe("Skipped (Auth wall or non-job content detected)");

      vi.unstubAllGlobals();
    });

    it("rejects Jina Reader fallback when markdown content is an auth wall or challenge", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const jinaAuthWall = `
        Sign in to your account.
        Please enter your email address and password to continue.
        Continue with Apple or sign in with passkey.
        Verify you are human. Security check in progress.
      `.repeat(3);

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("https://r.jina.ai/")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(jinaAuthWall),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 403,
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://example.com/job/cf-block",
        2500,
        "jina_byok_key"
      );

      expect(result.data).toBeNull();
      expect(result.telemetry).toBe("Skipped (Auth wall or non-job content detected)");

      consoleLogSpy.mockRestore();
      vi.unstubAllGlobals();
    });
  });
});
