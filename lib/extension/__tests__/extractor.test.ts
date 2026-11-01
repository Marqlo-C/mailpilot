import { describe, expect, it } from "vitest";
import { extractJobContextFromDocument } from "@/extension/src/content/extractor";

function createMockDocument(options: {
  jsonLd?: string;
  elements?: Record<string, string>;
  title?: string;
  metas?: Record<string, string>;
}) {
  return {
    title: options.title || "",
    querySelectorAll(selector: string) {
      if (selector === 'script[type="application/ld+json"]') {
        if (!options.jsonLd) return [];
        return [{ textContent: options.jsonLd }];
      }
      return [];
    },
    querySelector(selector: string) {
      if (selector.startsWith("meta")) {
        for (const [key, val] of Object.entries(options.metas || {})) {
          if (selector.includes(`'${key}'`) || selector.includes(`"${key}"`)) {
            return { getAttribute: () => val };
          }
        }
        return null;
      }
      if (options.elements && options.elements[selector]) {
        return { textContent: options.elements[selector] };
      }
      return null;
    },
    body: {
      innerText: options.elements?.["body"] || "",
    },
  } as unknown as Document;
}

describe("Extension Client-Side Extractor (DOM & JSON-LD)", () => {
  it("extracts structured JobPosting schema from JSON-LD script tags", () => {
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": "Principal Distributed Systems Engineer",
      "description": "<p>Lead our high-throughput distributed message bus.</p>",
      "hiringOrganization": {
        "@type": "Organization",
        "name": "CloudFleet Systems",
      },
      "jobLocation": {
        "@type": "Place",
        "address": {
          "addressLocality": "Austin",
          "addressRegion": "TX",
          "addressCountry": "US",
        },
      },
      "baseSalary": {
        "@type": "MonetaryAmount",
        "currency": "USD",
        "value": {
          "@type": "QuantitativeValue",
          "minValue": 195000,
          "maxValue": 240000,
          "unitText": "YEAR",
        },
      },
    });

    const doc = createMockDocument({ jsonLd });
    const result = extractJobContextFromDocument(doc, "https://example.com/careers/lead-eng");

    expect(result.title).toBe("Principal Distributed Systems Engineer");
    expect(result.company).toBe("CloudFleet Systems");
    expect(result.description).toContain("Lead our high-throughput distributed message bus.");
    expect(result.location).toContain("Austin, TX, US");
    expect(result.salary).toBe("$195000 - $240000/year");
    expect(result.source).toBe("JSON-LD");
  });

  it("extracts LinkedIn job parameters from DOM elements", () => {
    const doc = createMockDocument({
      title: "Staff Infrastructure Engineer | LinkedIn",
      elements: {
        ".job-details-jobs-unified-top-card__job-title": "Staff Infrastructure Engineer",
        ".job-details-jobs-unified-top-card__company-name": "Stripe",
        ".job-details-jobs-unified-top-card__bullet": "San Francisco, CA (Hybrid)",
        "#job-details": "We are looking for an engineer to architect core payment gateways.",
      },
    });
    const result = extractJobContextFromDocument(doc, "https://www.linkedin.com/jobs/view/12345678");

    expect(result.title).toBe("Staff Infrastructure Engineer");
    expect(result.company).toBe("Stripe");
    expect(result.location).toContain("San Francisco, CA");
    expect(result.description).toContain("We are looking for an engineer");
    expect(result.source).toBe("LinkedIn");
  });

  it("extracts Indeed job parameters from DOM elements", () => {
    const doc = createMockDocument({
      title: "Full Stack Developer - Austin, TX - Indeed.com",
      elements: {
        ".jobsearch-JobInfoHeader-title": "Full Stack Developer",
        "[data-testid='inlineHeader-companyName']": "Atlassian",
        "[data-testid='jobsearch-JobInfoHeader-companyLocation']": "Austin, TX",
        "#salaryInfoAndJobType": "$140,000 - $175,000 a year",
        "#jobDescriptionText": "Build customer-facing collaboration tools.",
      },
    });
    const result = extractJobContextFromDocument(doc, "https://www.indeed.com/viewjob?jk=abcdef");

    expect(result.title).toBe("Full Stack Developer");
    expect(result.company).toBe("Atlassian");
    expect(result.location).toBe("Austin, TX");
    expect(result.salary).toContain("$140,000 - $175,000");
    expect(result.description).toContain("Build customer-facing collaboration tools.");
    expect(result.source).toBe("Indeed");
  });

  it("extracts Greenhouse job parameters from DOM elements", () => {
    const doc = createMockDocument({
      title: "Backend Engineer at Figma",
      elements: {
        ".app-title": "Backend Engineer",
        ".company-name": "Figma",
        ".location": "Remote - US",
        "#content": "Design resilient multiplayer syncing engines.",
      },
    });
    const result = extractJobContextFromDocument(doc, "https://boards.greenhouse.io/figma/jobs/998877");

    expect(result.title).toBe("Backend Engineer");
    expect(result.company).toBe("Figma");
    expect(result.location).toBe("Remote - US");
    expect(result.description).toContain("Design resilient multiplayer syncing engines.");
    expect(result.source).toBe("Greenhouse");
  });

  it("extracts Lever job parameters from DOM elements", () => {
    const doc = createMockDocument({
      title: "Data Platform Architect",
      elements: {
        ".posting-headline h2": "Data Platform Architect",
        ".posting-headline .employer": "Databricks",
        ".posting-categories .location": "San Francisco, CA",
        ".section-wrapper.page-full-width": "Scale lakehouse streaming pipelines.",
      },
    });
    const result = extractJobContextFromDocument(doc, "https://jobs.lever.co/databricks/112233");

    expect(result.title).toBe("Data Platform Architect");
    expect(result.company).toBe("Databricks");
    expect(result.location).toBe("San Francisco, CA");
    expect(result.description).toContain("Scale lakehouse streaming pipelines.");
    expect(result.source).toBe("Lever");
  });

  it("extracts Ashby job parameters from DOM elements", () => {
    const doc = createMockDocument({
      title: "Frontend Tech Lead - Linear",
      elements: {
        "[data-test='job-title']": "Frontend Tech Lead",
        "[data-test='company-name']": "Linear",
        "[data-test='job-location']": "Remote, Worldwide",
        "[data-test='job-description']": "Craft exceptional productivity software.",
      },
    });
    const result = extractJobContextFromDocument(doc, "https://jobs.ashbyhq.com/linear/445566");

    expect(result.title).toBe("Frontend Tech Lead");
    expect(result.company).toBe("Linear");
    expect(result.location).toBe("Remote, Worldwide");
    expect(result.description).toContain("Craft exceptional productivity software.");
    expect(result.source).toBe("Ashby");
  });

  it("falls back gracefully to semantic OpenGraph and title metadata when selectors are missing", () => {
    const doc = createMockDocument({
      title: "Senior Site Reliability Engineer at Vercel",
      metas: {
        "og:title": "Senior Site Reliability Engineer",
        "og:site_name": "Vercel",
        "og:description": "Ensure global edge network availability and zero downtime.",
      },
      elements: {
        body: "Unstyled raw career description text.",
      },
    });
    const result = extractJobContextFromDocument(doc, "https://vercel.com/careers/sre");

    expect(result.title).toBe("Senior Site Reliability Engineer");
    expect(result.company).toBe("Vercel");
    expect(result.description).toContain("Ensure global edge network availability and zero downtime.");
  });
});
