import type { ExtractedJobContext } from "../lib/types";

function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

function findJsonLdJobPosting(doc: Document): Partial<ExtractedJobContext> | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of Array.from(scripts)) {
    try {
      const raw = script.textContent?.trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        let jobObj: Record<string, unknown> | null = null;
        if (item["@type"] === "JobPosting") {
          jobObj = item;
        } else if (Array.isArray(item["@graph"])) {
          const match = item["@graph"].find(
            (g: Record<string, unknown>) =>
              g["@type"] === "JobPosting" ||
              (Array.isArray(g["@type"]) && g["@type"].includes("JobPosting"))
          );
          if (match) jobObj = match;
        }

        if (jobObj) {
          const title = typeof jobObj.title === "string" ? cleanText(jobObj.title) : "";
          let company = "";
          if (typeof jobObj.hiringOrganization === "object" && jobObj.hiringOrganization !== null) {
            const org = jobObj.hiringOrganization as Record<string, unknown>;
            if (typeof org.name === "string") company = cleanText(org.name);
          }
          const description =
            typeof jobObj.description === "string" ? cleanText(jobObj.description) : "";

          let location: string | undefined;
          if (typeof jobObj.jobLocation === "object" && jobObj.jobLocation !== null) {
            const loc = jobObj.jobLocation as Record<string, unknown>;
            if (typeof loc.address === "object" && loc.address !== null) {
              const addr = loc.address as Record<string, unknown>;
              location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
                .filter(Boolean)
                .join(", ");
            }
          }

          let salary: string | undefined;
          if (typeof jobObj.baseSalary === "object" && jobObj.baseSalary !== null) {
            const sal = jobObj.baseSalary as Record<string, unknown>;
            if (typeof sal.value === "object" && sal.value !== null) {
              const val = sal.value as Record<string, unknown>;
              const min = val.minValue ?? val.value;
              const max = val.maxValue;
              const unit = sal.value && typeof (val.unitText) === "string" ? `/${val.unitText.toLowerCase()}` : "";
              if (min && max) salary = `$${min} - $${max}${unit}`;
              else if (min) salary = `$${min}${unit}`;
            }
          }

          if (title && (description || company)) {
            return {
              title,
              company,
              description,
              location,
              salary,
              source: "JSON-LD",
            };
          }
        }
      }
    } catch {
      // Ignore JSON parse errors in malformed script tags
    }
  }
  return null;
}

type SiteSelectorMap = {
  source: string;
  match: (url: string) => boolean;
  title: string[];
  company: string[];
  location: string[];
  salary: string[];
  description: string[];
};

const SITE_SELECTORS: SiteSelectorMap[] = [
  {
    source: "LinkedIn",
    match: (url) => /linkedin\.com/i.test(url),
    title: [
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      "h1.top-card-layout__title",
      ".job-details h1",
    ],
    company: [
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".topcard__flavor--black-link",
      ".topcard__flavor",
    ],
    location: [
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
    ],
    salary: [
      ".job-details-jobs-unified-top-card__job-insight",
      ".compensation__salary",
    ],
    description: [
      "#job-details",
      ".jobs-description__content",
      ".jobs-box__html-content",
      ".show-more-less-html__markup",
    ],
  },
  {
    source: "Indeed",
    match: (url) => /indeed\.com/i.test(url),
    title: [
      ".jobsearch-JobInfoHeader-title",
      "h1[data-testid='jobsearch-JobInfoHeader-title']",
      "h2.jobTitle",
    ],
    company: [
      "[data-testid='inlineHeader-companyName']",
      ".jobsearch-CompanyInfoContainer a",
      ".companyName",
    ],
    location: [
      "[data-testid='jobsearch-JobInfoHeader-companyLocation']",
      "[data-testid='inlineHeader-companyLocation']",
      ".companyLocation",
    ],
    salary: [
      "#salaryInfoAndJobType",
      "[data-testid='jobsearch-JobInfoHeader-salary']",
      ".salary-snippet-container",
    ],
    description: [
      "#jobDescriptionText",
      ".jobsearch-jobDescriptionText",
      ".jobDescriptionText",
    ],
  },
  {
    source: "Glassdoor",
    match: (url) => /glassdoor\.com/i.test(url),
    title: [
      "[data-test='job-title']",
      ".JobDetails_jobTitle__",
      "h1[data-test='employer-name'] + h2",
    ],
    company: [
      "[data-test='employer-name']",
      ".JobDetails_companyName__",
      ".EmployerProfile_employerName__",
    ],
    location: [
      "[data-test='job-location']",
      ".JobDetails_location__",
      "[data-test='location']",
    ],
    salary: [
      "[data-test='detailSalary']",
      ".JobDetails_salary__",
      "[data-test='salaries-range']",
    ],
    description: [
      ".jobDescriptionContent",
      "[data-test='jobDescription']",
      "#JobDescriptionContainer",
    ],
  },
  {
    source: "JobLeads",
    match: (url) => /jobleads\.com/i.test(url),
    title: [
      "[data-qa='job-title']",
      ".job-title",
      "h1.title",
    ],
    company: [
      "[data-qa='company-name']",
      ".company-name",
      ".employer",
    ],
    location: [
      "[data-qa='location']",
      ".location",
      ".job-location",
    ],
    salary: [
      "[data-qa='salary']",
      ".salary",
    ],
    description: [
      "[data-qa='job-description']",
      ".job-description",
      ".description-content",
    ],
  },
  {
    source: "Greenhouse",
    match: (url) => /greenhouse\.io|boards\.greenhouse\.io/i.test(url),
    title: [
      ".app-title",
      "#header .app-title",
      "h1.app-title",
      "h1",
    ],
    company: [
      ".company-name",
      "#header .company-name",
      "span.company-name",
    ],
    location: [
      ".location",
      "#header .location",
    ],
    salary: [],
    description: [
      "#content",
      "#main",
      ".content-wrapper",
    ],
  },
  {
    source: "Lever",
    match: (url) => /lever\.co|jobs\.lever\.co/i.test(url),
    title: [
      ".posting-headline h2",
      ".posting-header h2",
      "h2",
    ],
    company: [
      ".posting-headline .employer",
      ".main-header .header-link",
      ".main-header-logo img",
    ],
    location: [
      ".posting-categories .location",
      ".workplaceTypes",
    ],
    salary: [
      ".posting-categories .salary",
    ],
    description: [
      ".section-wrapper.page-full-width",
      ".content",
      "[data-qa='job-description']",
    ],
  },
  {
    source: "Ashby",
    match: (url) => /ashbyhq\.com|jobs\.ashbyhq\.com/i.test(url),
    title: [
      "[data-test='job-title']",
      "h1",
    ],
    company: [
      "[data-test='company-name']",
      "header a",
      "nav a",
    ],
    location: [
      "[data-test='job-location']",
      ".ashby-job-posting-location",
    ],
    salary: [
      "[data-test='job-compensation']",
      ".ashby-job-posting-compensation",
    ],
    description: [
      "[data-test='job-description']",
      ".ashby-job-posting-description",
      "#job-description",
    ],
  },
  {
    source: "Workday",
    match: (url) => /myworkdayjobs\.com/i.test(url),
    title: [
      "[data-automation-id='jobPostingHeader']",
      "h1[data-automation-id='jobPostingHeader']",
      "h1",
    ],
    company: [
      "[data-automation-id='companyName']",
      "header",
    ],
    location: [
      "[data-automation-id='locations']",
      "[data-automation-id='location']",
    ],
    salary: [],
    description: [
      "[data-automation-id='jobPostingDescription']",
      "#job-description",
    ],
  },
];

function queryFirstText(doc: Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel);
      if (el && el.textContent) {
        const text = cleanText(el.textContent);
        if (text) return text;
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

function extractMeta(doc: Document, property: string): string {
  const meta =
    doc.querySelector(`meta[property='${property}']`) ||
    doc.querySelector(`meta[name='${property}']`);
  return cleanText(meta?.getAttribute("content"));
}

export function extractJobContextFromDocument(
  doc: Document = document,
  url: string = window.location.href
): ExtractedJobContext {
  // 1. Try JSON-LD first (highest fidelity)
  const jsonLd = findJsonLdJobPosting(doc);

  // 2. Check site-specific selectors
  const matchedSite = SITE_SELECTORS.find((s) => s.match(url));
  let domTitle = "";
  let domCompany = "";
  let domLocation = "";
  let domSalary = "";
  let domDescription = "";

  if (matchedSite) {
    domTitle = queryFirstText(doc, matchedSite.title);
    domCompany = queryFirstText(doc, matchedSite.company);
    domLocation = queryFirstText(doc, matchedSite.location);
    domSalary = queryFirstText(doc, matchedSite.salary);
    domDescription = queryFirstText(doc, matchedSite.description);
  }

  // 3. Metadata fallback
  const metaTitle =
    extractMeta(doc, "og:title") ||
    extractMeta(doc, "twitter:title") ||
    cleanText(doc.title);
  const metaDescription =
    extractMeta(doc, "og:description") ||
    extractMeta(doc, "description");
  const metaSiteName = extractMeta(doc, "og:site_name");

  // Synthesize resolved values prioritizing high-confidence sources
  let title = jsonLd?.title || domTitle || metaTitle;
  // Clean generic suffixes like " - Job in New York, NY" or " | LinkedIn"
  title = title
    .replace(/\s*[-–|•]\s*(LinkedIn|Indeed|Glassdoor|JobLeads|Greenhouse|Lever|Ashby|Workday).*$/i, "")
    .trim();

  let company = jsonLd?.company || domCompany || metaSiteName;
  if (!company && title.includes(" at ")) {
    const parts = title.split(" at ");
    title = parts[0]?.trim() ?? title;
    company = parts[1]?.trim() ?? "";
  }

  const description =
    jsonLd?.description ||
    domDescription ||
    metaDescription ||
    cleanText(doc.body?.innerText?.slice(0, 3000));

  const location = jsonLd?.location || domLocation || undefined;
  const salary = jsonLd?.salary || domSalary || undefined;
  const source = matchedSite?.source || jsonLd?.source || "Generic Web";

  return {
    title: title || "Job Opportunity",
    company: company || "Company",
    description: description || "",
    url,
    location,
    salary,
    source,
    extractedAt: new Date().toISOString(),
  };
}

// Global script listener for Chrome extension messaging
if (typeof window !== "undefined") {
  chrome?.runtime?.onMessage?.addListener((request, _sender, sendResponse) => {
    if (request?.type === "EXTRACT_JOB_CONTEXT") {
      const result = extractJobContextFromDocument(document, window.location.href);
      sendResponse({ ok: true, data: result });
    }
    return true;
  });
}
