import fs from "fs";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { encryptToken } from "@/lib/crypto";
import {
  extractJsonLdJobPosting,
  extractNuxtData,
  fetchLinkedInGuestPosting,
  fetchViaScrapingAnt,
  isLegitimateJobContent,
  recordScraperFailure,
  scrapeJobPostingJsonLd,
  transformToLinkedInGuestUrl,
  unwrapTrackingUrl,
} from "../json-ld";

vi.mock("@/lib/ssrf", () => ({
  assertSafeHttpsUrl: vi.fn(async (url: string) => new URL(url)),
}));

describe("JSON-LD Link Parser", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });
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

  describe("extractNuxtData", () => {
    it("extracts and cleans job descriptions from Nuxt 3 SSR state payload", () => {
      const nuxtHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Senior Software Engineer - San Francisco | TechCorp</title>
          </head>
          <body>
            <script id="__NUXT_DATA__" type="application/json">
              [
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotIncludeThisToken",
                "/us/job/software-engineer",
                "/_nucf/bundle.js",
                "{\\"serialized\\":\\"json\\"}",
                "TechCorp Technologies Inc",
                "Design, build, and scale backend services, REST APIs, and automated data pipelines that improve infrastructure reliability.",
                "The role requires a bachelor degree in a relevant field plus four years of relevant software engineering experience, along with strong distributed systems skills.",
                "Engineeringjobs seeks a team to design. All rights reserved by job board."
              ]
            </script>
          </body>
        </html>
      `;

      const result = extractNuxtData(nuxtHtml);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Senior Software Engineer");
      expect(result?.location).toBe("San Francisco");
      expect(result?.company).toBe("TechCorp Technologies Inc");
      expect(result?.description).toContain("Design, build, and scale backend services");
      expect(result?.description).toContain("The role requires a bachelor degree");
      expect(result?.description).not.toContain("eyJ");
      expect(result?.description).not.toContain("/us/job");
      expect(result?.description).not.toContain("All rights reserved");
    });

    it("returns null when __NUXT_DATA__ script is missing or invalid", () => {
      expect(extractNuxtData("<html><body>No Nuxt Here</body></html>")).toBeNull();
      expect(extractNuxtData('<script id="__NUXT_DATA__">invalid json</script>')).toBeNull();
      expect(extractNuxtData('<script id="__NUXT_DATA__">[]</script>')).toBeNull();
    });
  });

  describe("fetchViaScrapingAnt", () => {
    it("fetches HTML via ScrapingAnt with browser=false and extracts JSON-LD", async () => {
      const sampleHtml = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Principal Architect",
          "description": "About the role: Lead multi-region enterprise architecture and cloud migration strategy. Responsibilities include distributed system design, cross-team alignment, and technical governance. Qualifications: 10+ years experience, bachelor degree in computer science or related field, and strong automation background."
        }
        </script>
      `;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(sampleHtml),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await fetchViaScrapingAnt(
        "https://example.com/job/123",
        "test_ant_key_123"
      );

      expect(result.data).not.toBeNull();
      expect(result.data?.title).toBe("Principal Architect");
      expect(result.data?.description).toContain("Lead multi-region enterprise architecture");
      expect(result.status).toBe(200);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.scrapingant.com/v2/general"),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("browser=false"),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("x-api-key=test_ant_key_123"),
        expect.anything()
      );

      vi.unstubAllGlobals();
    });

    it("returns null data and status code when ScrapingAnt returns non-200 or challenge", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await fetchViaScrapingAnt(
        "https://example.com/job/fail",
        "test_ant_key_123"
      );
      expect(result.data).toBeNull();
      expect(result.status).toBe(403);

      vi.unstubAllGlobals();
    });

    it("returns status 409 and null data when ScrapingAnt concurrency limit is reached", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await fetchViaScrapingAnt(
        "https://example.com/job/concurrent",
        "test_ant_key_123"
      );
      expect(result.data).toBeNull();
      expect(result.status).toBe(409);

      vi.unstubAllGlobals();
    });
  });

  describe("scrapeJobPostingJsonLd with Direct HTML, Nuxt & ScrapingAnt Fallback", () => {
    it("fast-fails Glassdoor and Indeed links immediately to 0ms with on-demand hydration telemetry", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const glassdoorResult = await scrapeJobPostingJsonLd(
        "https://www.glassdoor.com/job-listing/?jl=1010287174784"
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(glassdoorResult.data).toBeNull();
      expect(glassdoorResult.telemetry).toBe("Deferred (Glassdoor - On-Demand Hydration)");

      const indeedResult = await scrapeJobPostingJsonLd(
        "https://www.indeed.com/viewjob?jk=1010287174784"
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(indeedResult.data).toBeNull();
      expect(indeedResult.telemetry).toBe("Deferred (Indeed - On-Demand Hydration)");

      vi.unstubAllGlobals();
    });

    it("hydrates via Direct HTML when 200 OK lacks JSON-LD", async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Amazon Software Development Engineer</title></head>
          <body>
            <header><nav><a href="/">Home</a></nav></header>
            <main>
              <h1>Software Development Engineer Apprentice</h1>
              <p>About the role: We are seeking an apprentice to join our distributed infrastructure team across high-scale cloud platforms.</p>
              <p>Responsibilities: Build robust services and monitor telemetry. Design scalable event-driven systems and maintain high availability.</p>
              <p>Qualifications: Experience with modern programming languages and strong problem-solving skills. Bachelor degree or equivalent industry experience in systems design.</p>
              <p>Benefits and Perks: Comprehensive health insurance, retirement contribution matching, and ongoing professional development mentorship.</p>
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

    it("rejects thin portal splash banners under 500 characters even if HTTP 200 OK", async () => {
      const splashHtml = `
        <!DOCTYPE html>
        <html>
          <body>
            <main>
              <h1>#1 Job Platform in North America</h1>
              <p>Discover thousands of roles matching your preferences. Sign up today.</p>
            </main>
          </body>
        </html>
      `;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(splashHtml),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd("https://portal.test/jobs/splash");
      expect(result.data).toBeNull();
      expect(result.telemetry).toBe("Skipped (No JSON-LD / HTML too thin)");

      vi.unstubAllGlobals();
    });

    it("hydrates via Nuxt SSR State when 200 OK contains __NUXT_DATA__", async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Software Engineer III - Sunnyvale | JobLeads</title></head>
          <body>
            <script id="__NUXT_DATA__" type="application/json">
              [
                "Walmart Global Tech",
                "Design, build, and scale backend services, REST APIs, and automated pipelines that improve engineering productivity.",
                "Qualifications: Bachelor degree in a relevant field plus two years of experience. Strong skills in distributed systems and backend engineering."
              ]
            </script>
          </body>
        </html>
      `;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(html),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd("https://www.jobleads.com/us/job/software-engineer-iii");
      expect(result.data).not.toBeNull();
      expect(result.data?.title).toBe("Software Engineer III");
      expect(result.data?.description).toContain("Design, build, and scale backend services");
      expect(result.telemetry).toContain("via Nuxt SSR State");

      vi.unstubAllGlobals();
    });

    it("skips and advises configuring ScrapingAnt key when direct fetch hits 403 Bot Wall without key", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://example.com/job/aggregator-403",
        null
      );

      expect(result.data).toBeNull();
      expect(result.telemetry).toBe(
        "Skipped (HTTP 403 Bot Wall - Configure ScrapingAnt Key in Settings)"
      );

      vi.unstubAllGlobals();
    });

    it("fast-exits Indeed links without fetching, returning Deferred on-demand telemetry", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://www.indeed.com/rc/clk/dl?jk=12345",
        {
          encryptedScrapingAntApiKey: encryptToken("my_ant_key"),
        } as any
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.data).toBeNull();
      expect(result.telemetry).toBe("Deferred (Indeed - On-Demand Hydration)");

      vi.unstubAllGlobals();
    });

    it("falls back to ScrapingAnt with BYOK Key when direct fetch hits 403 Bot Wall", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const antHtml = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Lead Infrastructure Engineer",
          "description": "About the role: Lead our cloud infrastructure modernization and platform reliability. Responsibilities include scaling distributed Kubernetes clusters, mentoring team members, and designing high-throughput data processing workflows. Qualifications: Bachelor degree and 5+ years experience."
        }
        </script>
      `;

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.scrapingant.com")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(antHtml),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 403,
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://example.com/job/protected-403",
        {
          encryptedScrapingAntApiKey: encryptToken("my_scrapingant_key"),
        } as any
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "  ├─ LinkParser: Fallback via ScrapingAnt (BYOK Key) [HTTP 403 Bot Wall]"
      );
      expect(result.data).not.toBeNull();
      expect(result.data?.title).toBe("Lead Infrastructure Engineer");
      expect(result.telemetry).toContain("via ScrapingAnt (BYOK Key)");

      consoleLogSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it("reports Skipped (ScrapingAnt timeout or bot wall) when ScrapingAnt fails with BYOK key", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.scrapingant.com")) {
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
        {
          encryptedScrapingAntApiKey: encryptToken("my_scrapingant_key"),
        } as any
      );

      expect(result.data).toBeNull();
      expect(result.telemetry).toBe("Skipped (ScrapingAnt timeout or bot wall)");

      consoleLogSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it("reports Skipped (ScrapingAnt: HTTP 409) when ScrapingAnt returns 409 concurrency limit", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.scrapingant.com")) {
          return Promise.resolve({
            ok: false,
            status: 409,
          });
        }
        return Promise.resolve({
          ok: false,
          status: 403,
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://example.com/job/bot-walled-409",
        {
          encryptedScrapingAntApiKey: encryptToken("my_scrapingant_key"),
        } as any
      );

      expect(result.data).toBeNull();
      expect(result.telemetry).toBe("Skipped (ScrapingAnt: HTTP 409)");

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

    it("falls back to Tier 2 Googlebot JSON-LD when LinkedIn guest API fails", async () => {
      const googlebotJsonLdHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "Principal Architect",
              "hiringOrganization": {
                "name": "LinkedIn Engineering"
              },
              "description": "About the position: We are seeking a Principal Architect to lead distributed systems design across global services. Responsibilities: Architect high-throughput event streaming pipelines and monitor telemetry. Qualifications: Bachelor or Master degree in Computer Science or equivalent experience, plus 10+ years experience designing resilient distributed systems at scale."
            }
            </script>
          </head>
          <body>Public Listing</body>
        </html>
      `;

      const mockFetch = vi
        .fn()
        // Tier 1 fails (403 or auth wall)
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: () => Promise.resolve(""),
        })
        // Tier 2 (Googlebot) succeeds
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(googlebotJsonLdHtml),
        });

      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeJobPostingJsonLd(
        "https://www.linkedin.com/jobs/view/4123456789"
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).not.toBeNull();
      expect(result.data?.title).toBe("Principal Architect");
      expect(result.data?.description).toContain(
        "Architect high-throughput event streaming pipelines"
      );
      expect(result.telemetry).toContain("via LinkedIn Guest API");

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
  });

  describe("recordScraperFailure", () => {
    it("writes failure to file when in dev mode", () => {
      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

      recordScraperFailure({
        url: "https://example.com/job/fail",
        status: 403,
        reason: "Bot Wall",
        timestamp: "2026-10-13T00:00:00.000Z",
      });

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const writtenPayload = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(writtenPayload).toEqual([
        {
          url: "https://example.com/job/fail",
          status: 403,
          reason: "Bot Wall",
          timestamp: "2026-10-13T00:00:00.000Z",
        },
      ]);

      existsSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it("updates existing failure if URL already exists", () => {
      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const readSpy = vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify([
          {
            url: "https://example.com/job/existing",
            status: 403,
            reason: "Bot Wall",
            timestamp: "2026-10-13T00:00:00.000Z",
          },
        ])
      );
      const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

      recordScraperFailure({
        url: "https://example.com/job/existing",
        status: 429,
        reason: "Rate Limited",
        timestamp: "2026-10-13T01:00:00.000Z",
      });

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const writtenPayload = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(writtenPayload).toHaveLength(1);
      expect(writtenPayload[0].status).toBe(429);
      expect(writtenPayload[0].reason).toBe("Rate Limited");

      existsSpy.mockRestore();
      readSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it("skips recording in production environment", () => {
      vi.stubEnv("NODE_ENV", "production");

      const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

      recordScraperFailure({
        url: "https://example.com/job/fail",
        status: 403,
        reason: "Bot Wall",
        timestamp: "2026-10-13T00:00:00.000Z",
      });

      expect(writeSpy).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      writeSpy.mockRestore();
    });
  });
});
