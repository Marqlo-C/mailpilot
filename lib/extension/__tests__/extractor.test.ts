import { describe, expect, it } from "vitest";
import { extractJobContextFromDocument } from "@/extension/src/content/extractor";

function createMockDocument(options: {
  jsonLd?: string;
  elements?: Record<string, string>;
  title?: string;
  metas?: Record<string, string>;
  attributes?: Record<string, Record<string, string>>;
}) {
  const getEl = (selector: string) => {
    if (!options.elements) return null;
    for (const [key, text] of Object.entries(options.elements)) {
      if (selector === key) {
        return {
          textContent: text,
          innerHTML: text,
          innerText: text,
          id: options.attributes?.[key]?.id || (key.startsWith("#") ? key.slice(1) : ""),
          getAttribute: (attr: string) => options.attributes?.[key]?.[attr] || null,
          closest: () => null,
          querySelectorAll: () => [],
          querySelector: () => null,
        };
      }
    }
    return null;
  };

  return {
    title: options.title || "",
    querySelectorAll(selector: string) {
      if (selector === 'script[type="application/ld+json"]') {
        if (!options.jsonLd) return [];
        return [{ textContent: options.jsonLd }];
      }
      if (selector.includes(",")) {
        const parts = selector.split(",").map((s) => s.trim());
        for (const p of parts) {
          const el = getEl(p);
          if (el) return [el];
        }
        return [];
      }
      const el = getEl(selector);
      return el ? [el] : [];
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
      if (selector.includes(",")) {
        const parts = selector.split(",").map((s) => s.trim());
        for (const p of parts) {
          const el = getEl(p);
          if (el) return el;
        }
        return null;
      }
      return getEl(selector);
    },
    body: {
      innerText: options.elements?.["body"] || "",
      innerHTML: options.elements?.["body"] || "",
      querySelectorAll: (sel: string) => {
        const el = getEl(sel);
        return el ? [el] : [];
      },
      querySelector: (sel: string) => getEl(sel),
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
    expect(result.location).toBe("Austin, TX");
    expect(result.salary).toContain("195");
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
    expect(result.salary).toBe("$140K-$175K");
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

    expect(result.description).toContain("Ensure global edge network availability and zero downtime.");
  });

  it("extracts JobLeads job parameters accurately without confusing location with company", () => {
    const doc = createMockDocument({
      title: "Software Engineer (Backend / Full Stack) - Austin | JobLeads",
      elements: {
        "[data-testid='job-preview-title']": "Software Engineer (Backend / Full Stack)",
        "[data-testid='job-preview-company-name']": "Amoha Recruitment Services LLC",
        "[data-testid='job-card-chip-location']": "Austin (TX)",
        "[data-testid='job-card-chip-salary']": "USD 75,000 - 120,000",
        "[data-testid='job-preview-description']": "Amoha Recruitment Services LLC is hiring a Software Engineer.",
      },
    });
    const result = extractJobContextFromDocument(doc, "https://www.jobleads.com/us/job/software-engineer-backend-full-stack--austin--123");

    expect(result.title).toBe("Software Engineer (Backend / Full Stack)");
    expect(result.company).toBe("Amoha Recruitment Services LLC");
    expect(result.location).toBe("Austin, TX");
    expect(result.salary).toBe("$75K-$120K");
    expect(result.source).toBe("JobLeads");
  });

  it("elevates location to city and state when JSON-LD only provides locality without region", () => {
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": "LPN Med Care Manager",
      "description": "<p>At Sunrise Senior Living in Simi Valley, CA we champion quality of life for seniors.</p>",
      "hiringOrganization": {
        "@type": "Organization",
        "name": "Sunrise Senior Living",
      },
      "jobLocation": {
        "@type": "Place",
        "address": {
          "addressLocality": "Varenita of Simi Valley",
        },
      },
    });

    const doc = createMockDocument({
      jsonLd,
      elements: {
        "[data-automation-id='jobPostingHeader']": "LPN Med Care Manager",
        "[data-automation-id='locations']": "Simi Valley, CA - Varenita of Simi Valley",
      },
    });
    const result = extractJobContextFromDocument(doc, "https://sunriseseniorliving.myworkdayjobs.com/en-US/Sunrise/job/LPN-Med-Care-Manager_JR123");

    expect(result.title).toBe("LPN Med Care Manager");
    expect(result.company).toBe("Sunrise Senior Living");
    expect(result.location).toBe("Simi Valley, CA");
    expect(result.source).toBe("Workday");
  });

  it("extracts Glassdoor split-pane job parameters correctly", () => {
    const doc = createMockDocument({
      title: "565 painter Jobs in United States, November 2026 | Glassdoor",
      elements: {
        "[id^='jd-job-title-']": "SR PAINTER/COATINGS TECH",
        "[data-test='job-details-header'] h4": "Northrop Grumman",
        "[data-test='job-details-header'] [data-test='location']": "Annapolis, MD",
        "[id^='jd-salary-']": "$54K - $130K (Employer provided)",
        "[class*='JobDetails_jobDescription']": "RELOCATION ASSISTANCE: No relocation assistance available\nCLEARANCE REQUIRED: No\nDescription\nAt Northrop Grumman, our employees have incredible opportunities.",
      },
      attributes: {
        "[id^='jd-job-title-']": {
          id: "jd-job-title-1010312943309",
        },
      },
    });
    const result = extractJobContextFromDocument(
      doc,
      "https://www.glassdoor.com/Job/us-painter-jobs-SRCH_IL.0,2_IN1_KO3,10.htm?jl=1010312943309"
    );

    expect(result.title).toBe("SR PAINTER/COATINGS TECH");
    expect(result.company).toBe("Northrop Grumman");
    expect(result.location).toBe("Annapolis, MD");
    expect(result.salary).toBe("$54K-$130K");
    expect(result.source).toBe("Glassdoor");
    expect(result.description).toContain("RELOCATION ASSISTANCE");
    expect(result.url).toBe("https://www.glassdoor.com/job-listing/?jl=1010312943309");
  });

  it("extracts Monster dual-pane job parameters correctly", () => {
    const doc = createMockDocument({
      title: "Monster Jobs - Job Search, Career Advice & Hiring Resources | Monster.com | jobs near me",
      elements: {
        "[data-testid='jobTitle']": "Imaging Support Specialist - NBHP (Per Diem, Day)",
        "[data-testid='company']": "Northbay",
        "[data-testid='jobDetailLocation']": "Fairfield, CA",
        "[data-testid='jobDetailSalary']": "$30.18 to $36.70 per hours",
        "[data-testid='svx-description-container-inner']": "Summary: Performs imaging support functions and records administration.",
        "#BigJobCardId a[href*='/job-openings/']": "Apply",
      },
      attributes: {
        "#BigJobCardId a[href*='/job-openings/']": {
          href: "https://www.monster.com/job-openings/imaging-support-specialist-fairfield-ca--123",
        },
      },
    });
    const result = extractJobContextFromDocument(
      doc,
      "https://www.monster.com/jobs/search?q=jobs+near+me&where=Sacramento%2C+CA"
    );

    expect(result.title).toBe("Imaging Support Specialist - NBHP (Per Diem, Day)");
    expect(result.company).toBe("Northbay");
    expect(result.location).toBe("Fairfield, CA");
    expect(result.salary).toBe("$30.18-$36.7/Hr");
    expect(result.source).toBe("Monster");
    expect(result.url).toBe("https://www.monster.com/job-openings/imaging-support-specialist-fairfield-ca--123");
  });

  it("extracts JobLeads dual-pane job heading and direct listing url from active card link", () => {
    const doc = createMockDocument({
      title: "Enhance Your Job Search Now | JobLeads Job Search",
      elements: {
        "[data-testid='job-preview-card'] .job-preview__heading": "Senior Backend Architect",
        "[data-testid='job-preview-company-name']": "CloudTech Solutions",
        "[data-testid='job-card-chip-location']": "New York, NY",
        "[data-testid='job-card-chip-salary']": "$180,000 - $220,000",
        "[data-testid='job-preview-description']": "Lead our platform architecture team.",
        "[data-active='true'] a[href*='/job/']": "Apply",
      },
      attributes: {
        "[data-active='true'] a[href*='/job/']": {
          href: "/us/job/senior-backend-architect-new-york-abc123",
        },
      },
    });
    const result = extractJobContextFromDocument(
      doc,
      "https://www.jobleads.com/us/search/jobs?q=Backend"
    );

    expect(result.title).toBe("Senior Backend Architect");
    expect(result.company).toBe("CloudTech Solutions");
    expect(result.location).toBe("New York, NY");
    expect(result.salary).toBe("$180K-$220K");
    expect(result.source).toBe("JobLeads");
    expect(result.url).toBe("https://www.jobleads.com/us/job/senior-backend-architect-new-york-abc123");
  });

  it("filters out user profile photo on LinkedIn and selects company logo", () => {
    const doc = createMockDocument({
      title: "Software Engineer | Intuit | LinkedIn",
      elements: {
        "[data-testid='job-title']": "Software Engineer 1",
        "[data-testid='company-name']": "Intuit",
        "[data-testid='job-location']": "Mountain View, CA",
        ".job-details-jobs-unified-top-card__company-logo img": "",
        "[data-testid='job-details']": "Join Intuit as a Software Engineer developing TurboTax.",
      },
      attributes: {
        ".job-details-jobs-unified-top-card__company-logo img": {
          src: "https://media.licdn.com/dms/image/company-logo_200_200/intuit.jpg",
        },
      },
    });
    const result = extractJobContextFromDocument(
      doc,
      "https://www.linkedin.com/jobs/view/123456789"
    );

    expect(result.title).toBe("Software Engineer 1");
    expect(result.company).toBe("Intuit");
    expect(result.logoUrl).toBe("https://media.licdn.com/dms/image/company-logo_200_200/intuit.jpg");
  });

  it("rounds Schema.org float salary precision and reads canonical Glassdoor URL", () => {
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Painter - 2nd Shift",
      hiringOrganization: {
        "@type": "Organization",
        name: "ITW",
      },
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          minValue: 22.660095,
          maxValue: 24.820192,
          unitText: "HOUR",
        },
      },
      description: "Perform prep and painting duties.",
    });

    const doc = createMockDocument({
      title: "ITW hiring Painter - 2nd Shift Job in Fairmont, MN | Glassdoor",
      jsonLd,
      elements: {
        "link[rel='canonical']": "",
      },
      attributes: {
        "link[rel='canonical']": {
          href: "https://www.glassdoor.com/job-listing/painter-2nd-shift-itw-JV_IC123.htm?jl=1010313350279",
        },
      },
    });

    const result = extractJobContextFromDocument(
      doc,
      "https://www.glassdoor.com/job-listing/painter-2nd-shift-itw-JV_IC123.htm?jl=1010313350279"
    );

    expect(result.title).toBe("Painter - 2nd Shift");
    expect(result.company).toBe("ITW");
    expect(result.salary).toBe("$22.66-$24.82/Hr");
    expect(result.url).toBe("https://www.glassdoor.com/job-listing/painter-2nd-shift-itw-JV_IC123.htm?jl=1010313350279");
  });

  it("extracts Indeed single-pane metadata via company-info-metadata and css-146c3p1", () => {
    const doc = createMockDocument({
      title: "Outside Sales Consultant- SAC - Elk Grove, CA 95624 - Indeed.com",
      elements: {
        "[data-testid='vj-job-title']": "Outside Sales Consultant- SAC",
        "[data-testid='company-info-metadata'] a": "System Pavers",
        "div.css-146c3p1": "Elk Grove, CA 95624",
        "#jobDescriptionText": "Meet with homeowners to design outdoor living spaces. $100,000 - $125,000 a year.",
      },
    });

    const result = extractJobContextFromDocument(
      doc,
      "https://www.indeed.com/viewjob?jk=83f001740edeaaa2"
    );

    expect(result.title).toBe("Outside Sales Consultant- SAC");
    expect(result.company).toBe("System Pavers");
    expect(result.location).toBe("Elk Grove, CA");
    expect(result.salary).toBe("$100K-$125K");
  });

  it("extracts LinkedIn hyphenated title and company correctly with symmetric pipe delimiters", () => {
    const doc = createMockDocument({
      title: "Software Engineer - New Grad, 2027 | Domino Data Lab | LinkedIn",
      elements: {
        "[data-sdui-screen*='JobDetails'] [aria-label^='Company, ' i]": "",
        "[aria-label^='Company, ' i]": "",
        "[data-testid='expandable-text-box']": "At Domino, we build solutions that help the largest enterprises. New Grad Pay Range $150,000—$165,000 USD",
      },
      attributes: {
        "[data-sdui-screen*='JobDetails'] [aria-label^='Company, ' i]": {
          "aria-label": "Company, Domino Data Lab.",
        },
        "[aria-label^='Company, ' i]": {
          "aria-label": "Company, Domino Data Lab.",
        },
      },
    });

    const result = extractJobContextFromDocument(
      doc,
      "https://www.linkedin.com/jobs/search/?currentJobId=4464138190"
    );

    expect(result.title).toBe("Software Engineer - New Grad, 2027");
    expect(result.company).toBe("Domino Data Lab");
  });

  it("extracts JobLeads single-pane canonical URL without grabbing similar jobs referral link", () => {
    const doc = createMockDocument({
      title: "Software Engineer (Backend / Full Stack) - Austin | JobLeads",
      elements: {
        "link[rel='canonical']": "",
        "a[href*='/job/']": "Similar Job",
        "[data-testid='job-preview-description']": "<div>Software Engineer (Backend / Full Stack)</div><p>$75,000-$120,000/year</p>",
      },
      attributes: {
        "link[rel='canonical']": {
          href: "https://www.jobleads.com/us/job/software-engineer-backend-full-stack--austin--e60853f44cd50c0a9d0154d99e0ca9e51",
        },
        "a[href*='/job/']": {
          href: "https://www.jobleads.com/us/job/junior-backend-full-stack-engineer-launch-your-career--austin--e7c3e188aaf79fa4d084dcbcc8613195b?from=%2Fus%2Fjob%2Fsoftware-engineer-backend-full-stack--austin--e60853f44cd50c0a9d0154d99e0ca9e51",
        },
      },
    });

    const result = extractJobContextFromDocument(
      doc,
      "https://www.jobleads.com/us/job/software-engineer-backend-full-stack--austin--e60853f44cd50c0a9d0154d99e0ca9e51"
    );

    expect(result.url).toBe("https://www.jobleads.com/us/job/software-engineer-backend-full-stack--austin--e60853f44cd50c0a9d0154d99e0ca9e51");
    expect(result.url).not.toContain("?from=");
    expect(result.url).not.toContain("junior-backend-full-stack-engineer");
  });

  it("extracts Indeed CMP layout metadata and logo for Wells", () => {
    const doc = createMockDocument({
      title: "WELLS Jobs in Texas | Indeed.com",
      elements: {
        "[data-testid='jobDetailTitle'] h3": "FIBER, PAINT, & REPAIR TECHNICIAN",
        "[data-testid='jobDetailSubtitle']": "Wells - Hillsboro, TX",
        "[data-testid='jobDetailSubtitle'] span": "Wells - Hillsboro, TX",
        "[data-testid='jobDetailSubtitle'] ~ span": "From $19 an hour",
        "[data-testid='jobDetailDescription']": "ABOUT THE ROLE: This position is responsible for preparing, finishing, and inspecting components.",
      },
      jsonLd: JSON.stringify({
        "@context": "http://schema.org",
        "@type": "LocalBusiness",
        name: "WELLS",
        image: "https://d2q79iu7y748jz.cloudfront.net/s/_squarelogo/96x96/ff583a04b6d9ad5530792a3199e38ebe",
      }),
    });

    const result = extractJobContextFromDocument(
      doc,
      "https://www.indeed.com/cmp/Wells-3/jobs?jk=123"
    );

    expect(result.title).toBe("FIBER, PAINT, & REPAIR TECHNICIAN");
    expect(result.company).toBe("Wells");
    expect(result.location).toBe("Hillsboro, TX");
    expect(result.salary).toBe("$19/Hr");
    expect(result.logoUrl).toBe("https://d2q79iu7y748jz.cloudfront.net/s/_squarelogo/96x96/ff583a04b6d9ad5530792a3199e38ebe");
  });
});
