import type { ExtractedJobContext } from "../lib/types";
import {
  decodeHtmlEntities,
  htmlToStructuredMarkdown,
} from "@/lib/opportunities/context/html-markdown";
import {
  parseStructuredJobSections,
  cleanTitleAndCompany,
  isValidCompanyName,
} from "@/lib/opportunities/context/section-classifier";
import { normalizeSalaryDisplay, extractSalaryFromText } from "@/lib/ai/classifier";
import {
  standardizeLocation,
  parseLocation,
  extractLocationFromText,
} from "@/lib/utils/location";
import { relativeTimeToIso } from "@/lib/opportunities/context/lens";



function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return decodeHtmlEntities(
    text
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .trim()
  );
}

function cleanDescription(rawHtmlOrText: string | null | undefined): string {
  if (!rawHtmlOrText) return "";
  const structured = parseStructuredJobSections(rawHtmlOrText);
  return structured.fullReconstructedMarkdown || rawHtmlOrText.trim();
}

/**
 * Extracts high-fidelity Schema.org JobPosting metadata from JSON-LD scripts.
 */
function findJsonLdJobPosting(doc: Document | Element): Partial<ExtractedJobContext> | null {
  const root = doc && typeof (doc as Element).querySelectorAll === "function"
    ? doc
    : (typeof document !== "undefined" ? document : null);
  if (!root) return null;
  const explicitScripts = Array.from(
    root.querySelectorAll('script[type="application/ld+json"]') || []
  );
  const scripts =
    explicitScripts.length > 0
      ? explicitScripts
      : Array.from(root.querySelectorAll("script") || []).filter((s) =>
          /application\/ld\+json/i.test(s.getAttribute?.("type") || "")
        );

  for (const script of scripts) {
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
          let logoUrl: string | undefined;

          if (typeof jobObj.hiringOrganization === "object" && jobObj.hiringOrganization !== null) {
            const org = jobObj.hiringOrganization as Record<string, unknown>;
            if (typeof org.name === "string") company = cleanText(org.name);

            // Direct CDN logo from Schema.org
            const rawLogo = org.logo;
            if (typeof rawLogo === "string" && /^https?:\/\//i.test(rawLogo.trim())) {
              logoUrl = rawLogo.trim();
            } else if (
              typeof rawLogo === "object" &&
              rawLogo !== null &&
              typeof (rawLogo as Record<string, unknown>).url === "string"
            ) {
              const urlStr = (rawLogo as Record<string, unknown>).url as string;
              if (/^https?:\/\//i.test(urlStr.trim())) logoUrl = urlStr.trim();
            }
          } else if (typeof jobObj.hiringOrganization === "string") {
            company = cleanText(jobObj.hiringOrganization);
          }

          const description =
            typeof jobObj.description === "string" ? cleanDescription(jobObj.description) : "";

          let location: string | undefined;
          if (Array.isArray(jobObj.jobLocation)) {
            // Multi-location support (e.g. Smoothstack Arlington, VA and Washington, DC)
            const locs = jobObj.jobLocation
              .map((locItem: Record<string, unknown>) => {
                const addr = locItem?.address as Record<string, unknown> | undefined;
                if (!addr) return null;
                const locStr = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ");
                return standardizeLocation(locStr);
              })
              .filter(Boolean);
            if (locs.length > 0) location = locs.join(" / ");
          } else if (typeof jobObj.jobLocation === "object" && jobObj.jobLocation !== null) {
            const loc = jobObj.jobLocation as Record<string, unknown>;
            if (typeof loc.address === "object" && loc.address !== null) {
              const addr = loc.address as Record<string, unknown>;
              const locStr = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ");
              location = standardizeLocation(locStr);
            }
          }

          let salary: string | undefined;
          const formatRate = (n: unknown) => {
            const num = Number(n);
            if (isNaN(num)) return String(n);
            return Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100);
          };
          const salObj = (jobObj.baseSalary || jobObj.estimatedSalary) as Record<string, unknown> | undefined;
          if (typeof salObj === "string" && salObj) {
            salary = normalizeSalaryDisplay(salObj) ?? cleanText(salObj);
          } else if (typeof salObj === "object" && salObj !== null) {
            const val = (salObj.value || salObj) as Record<string, unknown>;
            if (typeof val === "object" && val !== null) {
              const min = val.minValue ?? val.value;
              const max = val.maxValue;
              const unit = typeof val.unitText === "string" ? `/${val.unitText.toLowerCase()}` : "";
              if (min != null && max != null) {
                salary = normalizeSalaryDisplay(`$${formatRate(min)} - $${formatRate(max)}${unit}`) ?? `$${formatRate(min)} - $${formatRate(max)}${unit}`;
              } else if (min != null) {
                salary = normalizeSalaryDisplay(`$${formatRate(min)}${unit}`) ?? `$${formatRate(min)}${unit}`;
              }
            } else if (typeof val === "number" || typeof val === "string") {
              salary = normalizeSalaryDisplay(`$${formatRate(val)}`) ?? `$${formatRate(val)}`;
            }
          }

          let datePosted: string | undefined;
          if (typeof jobObj.datePosted === "string" && jobObj.datePosted.trim()) {
            datePosted = jobObj.datePosted.trim();
          }

          let applyUrl: string | undefined;
          if (typeof jobObj.url === "string" && /^https?:\/\//i.test(jobObj.url.trim())) {
            applyUrl = jobObj.url.trim();
          }

          if (title && (description || company)) {
            return {
              title,
              company,
              description,
              location,
              salary,
              datePosted,
              logoUrl,
              url: applyUrl,
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
  datePosted?: string[];
  logoUrl?: string[];
  jobLink?: string[];
};

const SITE_SELECTORS: SiteSelectorMap[] = [
  {
    source: "LinkedIn",
    match: (url) => /linkedin\.com/i.test(url),
    title: [
      "[data-testid='job-title']",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      "h1.top-card-layout__title",
      ".job-details h1",
      "h1",
    ],
    company: [
      "[data-sdui-screen*='JobDetails'] [aria-label^='Company, ' i]",
      "[data-sdui-screen*='JobDetails'] a[href*='/company/']",
      "[aria-label^='Company, ' i]",
      "[data-testid='company-name']",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      "a[href*='/company/']",
      "a.topcard__org-name-link",
      ".topcard__flavor--black-link",
      ".topcard__flavor",
    ],
    location: [
      "[data-testid='job-location']",
      "span.f49gpp",
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
      ".job-details-jobs-unified-top-card__primary-description-container span",
      ".jobs-unified-top-card__primary-description-container span",
    ],
    salary: [
      ".job-details-jobs-unified-top-card__job-insight--highlight",
      ".job-details-jobs-unified-top-card__job-insight",
      ".compensation__salary",
    ],
    description: [
      "[data-testid='expandable-text-box']",
      "[data-testid='job-details']",
      "#job-details",
      ".jobs-description__content",
      ".jobs-box__html-content",
      ".show-more-less-html__markup",
    ],
    datePosted: [
      "span.f49gpp",
      ".job-details-jobs-unified-top-card__primary-description-container span",
      ".jobs-unified-top-card__posted-date",
      ".topcard__flavor--metadata",
    ],
    logoUrl: [
      "[data-sdui-screen*='JobDetails'] img[src*='company-logo']",
      "[data-sdui-screen*='JobDetails'] figure img",
      "[data-sdui-screen*='JobDetails'] img",
      "[aria-label^='Company, ' i] img",
      ".jobs-details__topcard-company-url img",
      ".job-details-jobs-unified-top-card__company-logo img",
      ".jobs-unified-top-card__company-logo img",
      ".topcard__logo-container img",
      "[class*='jobs-search__job-details'] img[alt*='logo' i]",
      "img[data-testid='company-logo']",
      "img[src*='media.licdn.com/dms/image/'][src*='company-logo']",
      "img[data-delayed-url*='company-logo']",
      "img[alt*='Company logo' i]",
    ],
  },
  {
    source: "Indeed",
    match: (url) => /indeed\.com/i.test(url),
    title: [
      "[data-testid='vj-job-title']",
      ".jobsearch-JobInfoHeader-title",
      "h1[data-testid='jobsearch-JobInfoHeader-title']",
      "h2.jobTitle",
      ".jcs-JobTitle",
      "h1",
    ],
    company: [
      "[data-testid='inlineHeader-companyName']",
      "[data-testid='company-info-metadata'] a",
      ".jobsearch-CompanyInfoContainer a",
      "[data-testid='jobsearch-CompanyAvatar-button']",
      "div[data-company-name='true']",
      ".companyName",
    ],
    location: [
      "[data-testid='jobsearch-JobInfoHeader-companyLocation']",
      "[data-testid='inlineHeader-companyLocation']",
      "div.css-146c3p1",
      "[data-testid='text-location']",
      ".companyLocation",
    ],
    salary: [
      "#salaryInfoAndJobType",
      "[data-testid='jobsearch-JobInfoHeader-salary']",
      "div.css-146c3p1",
      "[data-testid='attribute_snippets_section']",
      ".salary-snippet-container",
    ],
    description: [
      "#jobDescriptionText",
      ".simple-job-description-html",
      ".react-native-html-content",
      ".jobsearch-jobDescriptionText",
      ".jobDescriptionText",
      "[data-testid='viewjob-job-content']",
    ],
    datePosted: [
      "[data-testid='myJobsStateDate']",
      ".date",
    ],
    logoUrl: [
      ".jobsearch-CompanyAvatar-image",
      "[data-testid='company-logo'] img",
      "[data-testid='jobsearch-CompanyAvatar-button'] img",
      ".jobsearch-CompanyReview--heading img",
      "img[src*='images.indeed.com']",
      "img[src*='cloudfront.net']",
      "img[alt*='logo' i]",
    ],
    jobLink: [
      ".jcs-JobTitle[href]",
      "a[id^='sj_'][href]",
      "a[data-jk][href]",
    ],
  },
  {
    source: "ZipRecruiter",
    match: (url) => /ziprecruiter\.com/i.test(url),
    title: [
      "[data-testid='serp-job-details-title']",
      "[data-testid='right-pane'] h2",
      "[data-testid='right-pane'] h3",
      ".job_title",
      "h1.job_title",
      ".job-description-html h1",
      ".job-description-html b strong",
      "h1",
    ],
    company: [
      "[data-testid='right-pane'] a[href*='/co/'] span",
      "[data-testid='right-pane'] a[href*='/co/']",
      "a[href*='/co/'] span",
      "a[href*='/co/']",
      "[data-testid='right-pane'] [data-testid*='company']",
      ".hiring_company_text",
      "a.hiring_company",
    ],
    location: [
      "[data-testid='right-pane'] span.html-span",
      "[data-testid='right-pane'] [data-testid*='location']",
      ".location",
      "span.location",
    ],
    salary: [
      "[data-testid='salary-row']",
      "[data-testid*='salary']",
      "[data-testid='right-pane'] span.html-span",
      ".salary",
    ],
    description: [
      ".job-description-html",
      ".jobDescriptionSection",
      "#job_desc",
    ],
    datePosted: [
      "[data-testid='right-pane'] [data-testid*='posted']",
      "[data-testid='right-pane'] span.html-span",
      ".posted-date",
    ],
    logoUrl: [
      "[data-testid='company-widget-logo']",
      "img[data-testid='company-widget-logo']",
      "[data-testid='right-pane'] [data-testid*='logo']",
      "[data-testid='right-pane'] img[src*='logo']",
      "[data-testid='right-pane'] img[alt*='logo' i]",
      ".company_logo img",
      ".hiring_company_logo img",
      "img[alt*='logo' i]",
    ],
    jobLink: [
      "a.job_link[href]",
      "a[data-job-id][href]",
    ],
  },
  {
    source: "Glassdoor",
    match: (url) => /glassdoor\.com/i.test(url),
    title: [
      "[id^='jd-job-title-']",
      "[data-test='job-details-header'] h1",
      "[class*='JobDetails_jobDetailsHeader'] h1",
      "[data-test='job-title']",
      ".JobDetails_jobTitle__",
      "h1[data-test='employer-name'] + h2",
      "h1",
    ],
    company: [
      "[data-test='job-details-header'] h4",
      "[class*='JobDetails_jobDetailsHeader'] h4",
      "[class*='EmployerProfile_employerNameHeading'] h4",
      "[class*='EmployerProfile_profileContainer'] h4",
      "[data-test='employer-name']",
      ".JobDetails_companyName__",
      ".EmployerProfile_employerName__",
    ],
    location: [
      "[data-test='job-details-header'] [data-test='location']",
      "[class*='JobDetails_locationAndPay'] [data-test='location']",
      "[data-test='job-location']",
      ".JobDetails_location__",
      "[data-test='location']",
    ],
    salary: [
      "[id^='jd-salary-']",
      "[data-test='job-details-header'] [data-test='detailSalary']",
      "[class*='JobDetails_locationAndPay'] [data-test='detailSalary']",
      "[data-test='detailSalary']",
      ".JobDetails_salary__",
      "[data-test='salaries-range']",
    ],
    description: [
      "[class*='JobDetails_jobDescription']",
      "[data-test='jobDescription']",
      ".jobDescriptionContent",
      "#JobDescriptionContainer",
      ".JobDetails_jobDescription__",
    ],
    logoUrl: [
      "[data-test='job-details-header'] img",
      "[class*='EmployerProfile_profileContainer'] img",
      "[class*='JobDetails_jobDetailsHeader'] img",
      ".EmployerProfile_employerLogo__ img",
      "[data-test='employer-logo'] img",
      ".JobDetails_employerLogo__ img",
      ".avatar-base_Image__Vjz_P",
      "img[src*='media.glassdoor.com']",
      "img[alt*='Logo' i]",
    ],
    jobLink: [
      "[class*='JobsList_selected'] a[href*='job-listing']",
      "[class*='JobsList_selected'] a[data-test='job-link']",
      "a[id^='job-title-'][href*='job-listing']",
      "a[data-test='job-link'][href]",
      "a[href*='/job-listing/']",
    ],
  },
  {
    source: "Greenhouse",
    match: (url) => /greenhouse\.io|boards\.greenhouse\.io/i.test(url),
    title: [
      ".application-form-header--title",
      "[data-slot='dialog-content'] h2",
      ".app-title",
      "#header .app-title",
      "h1.app-title",
      "h2",
      "h1",
    ],
    company: [
      ".application-form-header--company-name",
      "[data-slot='dialog-content'] .application-form-header--company-name",
      ".company-logo__logo[alt]",
      ".company-logo img[alt]",
      ".company-name",
      "#header .company-name",
      "span.company-name",
    ],
    location: [
      "[data-slot='dialog-content'] .tag-text",
      ".tag-text",
      ".location",
      "#header .location",
      ".tag-container",
    ],
    salary: [
      "[data-slot='dialog-content'] [data-testid*='salary']",
      ".application-description [data-testid*='salary']",
    ],
    description: [
      ".application-description .rich-text",
      ".application-description",
      "[data-slot='dialog-content'] .rich-text",
      "#content",
      "#main",
      ".content-wrapper",
      "[data-slot='dialog-content']",
    ],
    datePosted: [
      "[data-slot='dialog-content'] p.body__secondary",
      "p.body__secondary",
    ],
    logoUrl: [
      ".company-logo img",
      "#logo img",
    ],
    jobLink: [
      "a[href*='job-boards.greenhouse.io']",
      "a[href*='/jobs/']",
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
    logoUrl: [
      ".main-header-logo img",
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
    logoUrl: [
      "header img",
      "nav img",
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
      "[data-automation-id='locations'] dd",
      "[data-automation-id='location'] dd",
      "[data-automation-id='locations']",
      "[data-automation-id='location']",
    ],
    salary: [],
    description: [
      "[data-automation-id='jobPostingDescription']",
      "#job-description",
    ],
    logoUrl: [
      "img[data-automation-id='image']",
      "[data-automation-id='logoLink'] img",
      "a[data-automation-id='logoLink'] img",
      "[data-automation-id='header'] img",
      "[data-automation-id='logo'] img",
      "[data-automation-id='banner'] img",
      "header img",
      "img[src*='myworkdayjobs.com']",
      "img[src*='workday']",
      "img[alt*='logo' i]",
    ],
  },
  {
    source: "JobLeads",
    match: (url) => /jobleads\.com/i.test(url),
    title: [
      "[data-testid='job-preview-card'] .job-preview__heading",
      "h5.job-preview__heading",
      "h1.job-preview__heading",
      "[data-testid='job-preview-title']",
      "[data-active='true'] [data-testid='search-job-card-link']",
      "h1",
    ],
    company: [
      "[data-testid='job-preview-company-name']",
      "[data-testid='job-preview-company'] span",
      ".job-preview-company-name",
      "[data-testid='company-name']",
    ],
    location: [
      "[data-testid='job-card-chip-location']",
      "[data-testid*='location']",
      ".job-preview__location",
    ],
    salary: [
      "[data-testid='job-card-chip-salary']",
      "[data-testid*='salary']",
      ".job-preview__salary",
    ],
    description: [
      "[data-testid='job-preview-description']",
      ".job-content-scrollable",
      ".job-preview2024",
      "#job-description",
    ],
    datePosted: [
      "[data-testid='job-card-chip-date']",
      "[data-testid*='date']",
    ],
    logoUrl: [
      "img[src*='jobleads']",
      "img[src*='company-logo']",
      "img[alt*='logo' i]",
      "[data-testid='company-logo'] img",
    ],
    jobLink: [
      "[data-active='true'] a[href*='/job/']",
      "[data-active='true'] [data-testid='search-job-card-link']",
      "[data-testid='job-preview-card'] a[href*='/job/']",
    ],
  },
  {
    source: "Monster",
    match: (url) => /monster\.com/i.test(url),
    title: [
      "[data-testid='jobTitle']",
      "#job-view-header h2",
      "#BigJobCardId h1",
      "h1[data-testid='jobTitle']",
      "h2[data-testid='jobTitle']",
      "h1",
    ],
    company: [
      "[data-testid='company']",
      "[data-testid='jobHeaderCompanyLogo'][title]",
      "#BigJobCardId [data-testid='company']",
      ".job-header-company",
    ],
    location: [
      "[data-testid='jobDetailLocation']",
      "#BigJobCardId [data-testid='jobDetailLocation']",
      ".job-header-location",
    ],
    salary: [
      "[data-testid='jobDetailSalary']",
      "[data-testid='svx-job-salary']",
      "#BigJobCardId [data-testid='svx-job-salary']",
    ],
    description: [
      "[data-testid='svx-description-container-inner']",
      "#BigJobCardId [data-testid='svx-description-container-inner']",
      "#job-description",
      ".job-description",
    ],
    datePosted: [
      "[data-testid='jobDetailDateRecency']",
      "[data-testid='svx-posted-time']",
    ],
    logoUrl: [
      "[data-testid='jobHeaderCompanyLogo'] img",
      "[data-testid='company-logo'] img",
      "img[data-testid='jobHeaderCompanyLogo']",
      "img[src*='monster.com']",
      "img[alt*='logo' i]",
    ],
    jobLink: [
      "#BigJobCardId a[href*='/job-openings/']",
      "a[href*='/job-openings/']",
    ],
  },
  {
    source: "Careers",
    match: (url) => /careers\./i.test(url) || /stellantis/i.test(url),
    title: [
      "h2.job-title",
      ".job-title",
      "h1.job-title",
      "h1",
    ],
    company: [
      ".field-name-field-header-job-company",
      ".company-name",
      ".header-company",
    ],
    location: [
      ".field-name-field-header-job-location",
      ".header-job-location",
      ".job-location",
    ],
    salary: [
      ".field-name-field-job-salary",
      ".job-salary",
    ],
    description: [
      ".field-name-body",
      ".job-body",
      ".job-description",
    ],
    logoUrl: [
      ".site-logo img",
      ".header-logo img",
      "img[alt*='logo' i]",
    ],
  },
];

/**
 * Finds the active modal, drawer, or split-pane root element.
 * Prioritizes open dialogs/modals over background page clutter.
 */
function getActiveContentRoot(doc: Document): Element {
  // 1. Accessible open modal / dialog
  const activeDialog = doc.querySelector(
    '[role="dialog"][data-state="open"], ' +
    'dialog[open], ' +
    '[role="dialog"]:not([aria-hidden="true"]), ' +
    '.modal.show, ' +
    '[data-slot="dialog-content"]'
  );
  if (activeDialog && activeDialog.textContent && activeDialog.textContent.trim().length > 100) {
    return activeDialog;
  }

  // 2. Active aggregator split-pane (LinkedIn details container, Indeed ViewjobPaneWrapper, ZipRecruiter right-pane, Glassdoor TwoColumnLayout, Monster BigJobCardId, JobLeads preview, etc.)
  const activeSplitPane = doc.querySelector(
    '[data-sdui-screen*="JobDetails"], ' +
    '[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"], ' +
    '.new-job-preview-description, ' +
    '[data-testid="job-preview-description"], ' +
    '.jobs-search__job-details--container, ' +
    '.scaffold-layout__detail, ' +
    '[class*="jobs-search__job-details"], ' +
    '.jobs-details__main-content, ' +
    '.job-view-layout, ' +
    '[class*="jobs-search-two-pane__details"], ' +
    '#BigJobCardId, ' +
    '[data-test-id="svx-split-view-job-panel"], ' +
    '#jobsearch-ViewjobPaneWrapper, ' +
    '[data-testid="job-preview-card"], ' +
    '[class*="job-preview2024"], ' +
    '[data-testid="right-pane"], ' +
    '[data-testid*="right-pane"], ' +
    '[data-testid="job-details-pane"], ' +
    '[class*="TwoColumnLayout_columnRight"], ' +
    '[class*="TwoColumnLayout_jobDetailsContainer"], ' +
    '[class*="JobDetails_jobDetailsContainer"], ' +
    '[data-test="job-details-header"], ' +
    '.field-name-body, ' +
    '.job-description-html'
  );
  if (activeSplitPane && activeSplitPane.textContent && activeSplitPane.textContent.trim().length > 100) {
    return activeSplitPane;
  }

  return doc.body || doc.documentElement;
}

function queryFirstText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) {
        let text = el.textContent ? cleanText(el.textContent) : "";
        if (!text) {
          text = cleanText(
            el.getAttribute("alt") ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title")
          );
        }
        if (text) {
          text = text.replace(/^Company,\s*/i, "").replace(/\.\s*$/, "").trim();
        }
        if (text && text.length >= 2) return text;
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

function queryLocationText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];
      const list = elements.length > 0 ? elements : (root.querySelector ? [root.querySelector(sel)].filter(Boolean) : []);
      for (const el of list) {
        if (!el) continue;
        const text = cleanText(el.textContent || el.getAttribute?.("aria-label") || "");
        if (!text || text.length > 80) continue;
        if (text.includes("$") || /^(apply|sign in|full[- ]time|part[- ]time|contract|temporary|internship)$/i.test(text)) continue;

        const parsed = parseLocation(text);
        if (parsed.state !== null || parsed.isRemote || /\b(remote|hybrid|on-site|onsite)\b/i.test(text) || /,\s*[A-Z]{2}\b/.test(text)) {
          const std = standardizeLocation(text);
          if (std) return std;
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

function queryDatePostedText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];
      const list = elements.length > 0 ? elements : (root.querySelector ? [root.querySelector(sel)].filter(Boolean) : []);
      for (const el of list) {
        if (!el) continue;
        const text = cleanText(el.textContent || "");
        if (
          text &&
          /\b(?:reposted\s+)?(?:\d+\+?\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago|yesterday|today|just\s+now|just\s+posted)\b/i.test(
            text
          )
        ) {
          return text;
        }
      }
    } catch {}
  }
  return "";
}

function querySalaryText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];
      const list = elements.length > 0 ? elements : (root.querySelector ? [root.querySelector(sel)].filter(Boolean) : []);
      for (const el of list) {
        if (!el) continue;
        const text = cleanText(el.textContent || "");
        if (
          text &&
          (text.includes("$") || text.includes("€") || text.includes("£") || /\bUSD\b/i.test(text)) &&
          (/\b\d/.test(text) || /\b(?:per hour|\/hr|\/wk|\/yr|salary|base pay)\b/i.test(text))
        ) {
          return text;
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

function matchSite(site: SiteSelectorMap, url: string, doc: Document): boolean {
  if (site.match(url)) return true;
  const canonical = doc.querySelector("link[rel='canonical']")?.getAttribute("href") || "";
  if (canonical && site.match(canonical)) return true;
  const ogUrl = doc.querySelector("meta[property='og:url']")?.getAttribute("content") || "";
  if (ogUrl && site.match(ogUrl)) return true;

  // DOM signature fallbacks for local HTML files (file:///...)
  if (site.source === "ZipRecruiter" && (doc.querySelector("[data-testid='right-pane'], .job-description-html") || /ziprecruiter/i.test(doc.title))) {
    return true;
  }
  if (site.source === "Greenhouse" && (doc.querySelector(".application-form-header--title, .company-logo__logo, [data-slot='dialog-content']") || /greenhouse/i.test(doc.title))) {
    return true;
  }
  if (site.source === "Indeed" && (doc.querySelector("#jobsearch-ViewjobPaneWrapper, [data-testid='vj-job-title']") || /indeed\.com/i.test(doc.title))) {
    return true;
  }
  if (site.source === "Glassdoor" && (doc.querySelector("[data-test='employer-name'], [data-test='detailSalary'], [data-test='job-details-header'], [class*='TwoColumnLayout_columnRight']") || /glassdoor/i.test(doc.title))) {
    return true;
  }
  if (site.source === "LinkedIn" && (doc.querySelector(".jobs-unified-top-card, .job-details-jobs-unified-top-card") || /linkedin/i.test(doc.title))) {
    return true;
  }
  if (site.source === "JobLeads" && (doc.querySelector("[data-testid='job-preview-company-name'], .job-preview2024, [data-testid='job-preview-title']") || /jobleads/i.test(doc.title))) {
    return true;
  }
  if (site.source === "Workday" && (doc.querySelector("[data-automation-id='jobPostingHeader'], [data-automation-id='jobPostingDescription']") || /myworkdayjobs/i.test(doc.title))) {
    return true;
  }
  if (site.source === "Monster" && (doc.querySelector("#BigJobCardId, [data-testid='jobTitle'], [data-testid='svx-description-container-inner']") || /monster\.com/i.test(doc.title))) {
    return true;
  }
  if (site.source === "Careers" && (doc.querySelector("h2.job-title, .field-name-field-header-job-location, .field-name-body") || /stellantis/i.test(doc.title))) {
    return true;
  }
  return false;
}

function extractImageSrc(el: Element): string | undefined {
  // Reject nav icons, user avatars, profile photos, and full-width banners
  if (
    typeof el.closest === "function" &&
    el.closest(".global-nav, .nav, header nav, [data-testid='global-nav'], [class*='profile-picture'], [class*='avatar']") &&
    !el.closest("[data-testid='jobsearch-CompanyAvatar-button'], [data-testid='company-logo'], .jobsearch-CompanyAvatar-image, .job-details-jobs-unified-top-card__company-logo")
  ) {
    return undefined;
  }

  const elClass = (el.className && typeof el.className === "string" ? el.className : "");
  const elTestId = el.getAttribute("data-testid") || "";
  const elAlt = el.getAttribute("alt") || "";
  const elAria = el.getAttribute("aria-label") || "";
  if (/banner/i.test(elClass + " " + elTestId)) {
    return undefined;
  }
  if (/profile|avatar|user photo|member photo|my photo|creator/i.test(elAlt + " " + elAria)) {
    return undefined;
  }

  const rawCandidates: (string | null)[] = [
    el.getAttribute("src"),
    el.getAttribute("srcset")?.split(/\s*,\s*|\s+/)[0] || null,
    el.getAttribute("data-src"),
    el.getAttribute("data-delayed-url"),
    el.getAttribute("data-ghost-url"),
  ];

  for (const raw of rawCandidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.includes("svg+xml")) continue;
    if (trimmed.startsWith("data:") && trimmed.length < 200) continue;
    if (/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(trimmed)) continue;
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image/")) {
      return trimmed;
    }
  }
  return undefined;
}

function queryFirstImageSrc(root: Element | Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    try {
      const elements = root.querySelectorAll(sel);
      for (const el of Array.from(elements)) {
        const src = extractImageSrc(el);
        if (src) return src;
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return undefined;
}

function queryFirstHref(root: Element | Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) {
        const href = el.getAttribute("href");
        if (
          href &&
          (/^https?:\/\//i.test(href.trim()) || href.trim().startsWith("/")) &&
          !/[?&]from=/i.test(href) &&
          !/\/(?:similar|recommended|search)\b/i.test(href)
        ) {
          return href.trim();
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return undefined;
}

function queryFirstDescription(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) {
        const rawContent = el.innerHTML || el.textContent;
        if (rawContent) {
          const desc = cleanDescription(rawContent);
          if (desc && desc.length > 30) return desc;
        }
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

/**
 * Universal job context extractor executed in the browser context.
 */
export function extractJobContextFromDocument(
  doc?: Document,
  url?: string
): ExtractedJobContext {
  const targetDoc = doc || (typeof document !== "undefined" ? document : null);
  if (!targetDoc) {
    return {
      title: "Job Opportunity",
      company: "Company",
      description: "",
      url: url || "",
      source: "Unknown",
      extractedAt: new Date().toISOString(),
    };
  }

  const currentUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  // 1. Identify active content container (modal / split-pane / main document)
  const activeRoot = getActiveContentRoot(targetDoc);
  const isIsolatedRoot = activeRoot !== targetDoc.body && activeRoot !== targetDoc.documentElement;

  // 2. Try JSON-LD first (highest fidelity on ATS platforms)
  const jsonLd = findJsonLdJobPosting(activeRoot) || findJsonLdJobPosting(targetDoc);

  // 3. Check site-specific selectors inside the active root container
  const matchedSite = SITE_SELECTORS.find((s) => matchSite(s, currentUrl, targetDoc));
  let domTitle = "";
  let domCompany = "";
  let domLocation = "";
  let domSalary = "";
  let domDescription = "";
  let domDatePosted = "";
  let domLogoUrl: string | undefined;
  let domJobLink: string | undefined;

  if (matchedSite) {
    domTitle = queryFirstText(activeRoot, matchedSite.title) || (isIsolatedRoot ? "" : queryFirstText(targetDoc, matchedSite.title));
    domCompany = queryFirstText(activeRoot, matchedSite.company) || (isIsolatedRoot ? "" : queryFirstText(targetDoc, matchedSite.company));
    if (!isValidCompanyName(domCompany)) domCompany = "";

    domLocation = queryLocationText(activeRoot, matchedSite.location) || (isIsolatedRoot ? "" : queryLocationText(targetDoc, matchedSite.location));
    domSalary = querySalaryText(activeRoot, matchedSite.salary) || (isIsolatedRoot ? "" : querySalaryText(targetDoc, matchedSite.salary));
    domDescription = queryFirstDescription(activeRoot, matchedSite.description) || (isIsolatedRoot ? "" : queryFirstDescription(targetDoc, matchedSite.description));
    if (matchedSite.datePosted) {
      domDatePosted = queryDatePostedText(activeRoot, matchedSite.datePosted) || (isIsolatedRoot ? "" : queryDatePostedText(targetDoc, matchedSite.datePosted));
    }
    if (matchedSite.logoUrl) {
      domLogoUrl = queryFirstImageSrc(activeRoot, matchedSite.logoUrl) || (isIsolatedRoot ? undefined : queryFirstImageSrc(targetDoc, matchedSite.logoUrl));
    }
    if (matchedSite.jobLink) {
      domJobLink = queryFirstHref(activeRoot, matchedSite.jobLink) || (isIsolatedRoot ? undefined : queryFirstHref(targetDoc, matchedSite.jobLink));
    }
  }

  if (!domLogoUrl) {
    const ogImage = targetDoc.querySelector("meta[property='og:image'], meta[name='twitter:image']")?.getAttribute("content");
    if (ogImage && /^https?:\/\//i.test(ogImage) && !/default|share-logo|glassdoor|indeed|linkedin/i.test(ogImage)) {
      domLogoUrl = ogImage;
    }
  }

  // 3a. Glassdoor split-pane direct listing URL resolution
  if (matchedSite?.source === "Glassdoor" && (!domJobLink || !domJobLink.includes("/job-listing/"))) {
    const jlid =
      activeRoot.querySelector("[data-brandviews*='jlid=']")?.getAttribute("data-brandviews")?.match(/jlid=(\d+)/)?.[1] ||
      activeRoot.querySelector("[id^='jd-job-title-']")?.id?.match(/jd-job-title-(\d+)/)?.[1] ||
      activeRoot.innerHTML?.match(/\bjlid=(\d+)/)?.[1] ||
      currentUrl.match(/[?&]jl=(\d+)/)?.[1];
    if (jlid) {
      const directAnchor = (targetDoc.querySelector(`[class*='selected'] a[href*='job-listing'], a[href*='${jlid}']`) || targetDoc.querySelector(`a[href*='${jlid}']`)) as HTMLAnchorElement | null;
      const directHref = directAnchor?.getAttribute("href");
      if (directHref && /^https?:\/\//i.test(directHref)) {
        domJobLink = directHref;
      } else {
        domJobLink = `https://www.glassdoor.com/job-listing/?jl=${jlid}`;
      }
    }
  }

  // 3a1. JobLeads direct listing URL resolution
  if (matchedSite?.source === "JobLeads") {
    const canonical = targetDoc.querySelector("link[rel='canonical']")?.getAttribute("href");
    if (canonical && /jobleads\.com\/[a-z]{2}\/job\//i.test(canonical)) {
      domJobLink = canonical;
    } else if (currentUrl && /jobleads\.com\/[a-z]{2}\/job\//i.test(currentUrl) && !currentUrl.includes("?from=")) {
      domJobLink = currentUrl;
    } else if (!domJobLink || !domJobLink.includes("/job/")) {
      const activeCardLink = targetDoc.querySelector("[data-active='true'] a[href*='/job/'], [data-active='true'] [data-testid='search-job-card-link'], [data-testid='job-preview-card'] a[href*='/job/']") as HTMLAnchorElement | null;
      const href = activeCardLink?.getAttribute("href");
      if (href && !href.includes("from=")) {
        domJobLink = href.startsWith("http") ? href : `https://www.jobleads.com${href}`;
      }
    }
  }

  // 3a2. Monster split-pane direct listing URL resolution
  if (matchedSite?.source === "Monster" && (!domJobLink || !domJobLink.includes("/job-openings/"))) {
    const directAnchor = (activeRoot.querySelector("a[href*='/job-openings/']") || targetDoc.querySelector("#BigJobCardId a[href*='/job-openings/']")) as HTMLAnchorElement | null;
    const href = directAnchor?.getAttribute("href");
    if (href) {
      domJobLink = href.startsWith("http") ? href : `https://www.monster.com${href}`;
    }
  }

  // 3b. ZipRecruiter right-pane employer link or slug fallback
  if (matchedSite?.source === "ZipRecruiter" && (!domCompany || !isValidCompanyName(domCompany))) {
    const zrCoLink = (activeRoot.querySelector("a[href*='/co/']") || targetDoc.querySelector("[data-testid='right-pane'] a[href*='/co/']") || targetDoc.querySelector("a[href*='/co/']")) as HTMLAnchorElement | null;
    if (zrCoLink) {
      const linkText = cleanText(zrCoLink.textContent);
      if (isValidCompanyName(linkText)) {
        domCompany = linkText;
      } else {
        const href = zrCoLink.getAttribute("href") || "";
        const m = href.match(/\/co\/([^\/?#\s]+)/i);
        if (m) {
          const slug = m[1].replace(/[-_]+/g, " ").trim();
          if (isValidCompanyName(slug)) domCompany = slug;
        }
      }
    }
  }

  // 3b. JobLeads meta description fallback if company missing
  if ((!domCompany || !isValidCompanyName(domCompany)) && /jobleads\.com/i.test(currentUrl + targetDoc.title)) {
    const metaDesc = extractMeta(targetDoc, "description") || extractMeta(targetDoc, "og:description");
    const hiringMatch = metaDesc.match(/^([A-Za-z0-9&.,' -]+?)\s+is hiring\b/i);
    if (hiringMatch && isValidCompanyName(hiringMatch[1])) {
      domCompany = cleanText(hiringMatch[1]);
    }
  }

  // 3b. Universal inline fallbacks for platform job postings that format metadata in text/HTML:
  // e.g. "Company: Isabella Marketing Solutions", "Location: West Hollywood, CA", "Compensation: Base Pay..."
  if (!domCompany || !isValidCompanyName(domCompany)) {
    const inlineComp =
      activeRoot.innerHTML?.match(/<b>\s*<strong>\s*Company:\s*<\/strong>\s*<\/b>\s*([A-Za-z0-9&.,' -]+?)(?:<p|<br|<\/div|<\/p)/i) ||
      activeRoot.textContent?.match(/\bCompany:\s*([A-Za-z0-9&.,' -]{2,60})/i);
    if (inlineComp && isValidCompanyName(inlineComp[1])) {
      domCompany = cleanText(inlineComp[1]);
    }
  }

  if (!domLocation) {
    const inlineLoc =
      activeRoot.innerHTML?.match(/<b>\s*<strong>\s*Location:\s*<\/strong>\s*<\/b>\s*([A-Za-z0-9&.,' -]+?)(?:<p|<br|<\/div|<\/p)/i) ||
      activeRoot.textContent?.match(/\bLocation:\s*([A-Za-z0-9&.,' -]{2,60})/i);
    if (inlineLoc) {
      domLocation = cleanText(inlineLoc[1]);
    }
  }

  if (!domSalary) {
    const inlineSal =
      activeRoot.innerHTML?.match(/<b>\s*<strong>\s*(?:Compensation|Base Pay|Salary|Pay):\s*<\/strong>\s*<\/b>\s*([^\n<]+)/i) ||
      activeRoot.textContent?.match(/\b(?:Compensation|Base Pay|Salary Range|Pay Range):\s*([^\n]+)/i);
    if (inlineSal) {
      domSalary = cleanText(inlineSal[1]);
    }
  }

  // 4. Safe metadata fallbacks (never fall back to aggregator og:site_name as employer)
  const metaTitle =
    extractMeta(targetDoc, "og:title") ||
    extractMeta(targetDoc, "twitter:title") ||
    cleanText(targetDoc.title);
  const metaDescription =
    extractMeta(targetDoc, "og:description") ||
    extractMeta(targetDoc, "description");
  const metaSiteName = extractMeta(targetDoc, "og:site_name");
  const isAggregatorSite = /linkedin|indeed|glassdoor|ziprecruiter/i.test(currentUrl);
  const safeMetaCompany = isAggregatorSite ? "" : metaSiteName;

  // 5. Synthesize candidate values
  const candidateTitle = jsonLd?.title || domTitle || metaTitle;
  const candidateCompany = (isValidCompanyName(jsonLd?.company) ? jsonLd?.company : "") || (isValidCompanyName(domCompany) ? domCompany : "") || (isValidCompanyName(safeMetaCompany) ? safeMetaCompany : "");

  const cleanedMeta = cleanTitleAndCompany(candidateTitle, candidateCompany);
  let title = cleanedMeta.title;
  let company = isValidCompanyName(cleanedMeta.company) ? cleanedMeta.company : "";

  if (!company && title.includes(" at ")) {
    const parts = title.split(" at ");
    title = parts[0]?.trim() ?? title;
    const atComp = parts[1]?.trim() ?? "";
    if (isValidCompanyName(atComp)) company = atComp;
  }

  // 6. Resolve Description
  const rawDescriptionCandidate =
    jsonLd?.description ||
    domDescription ||
    (activeRoot !== targetDoc.body && activeRoot.textContent ? cleanDescription(activeRoot.innerHTML || activeRoot.textContent) : "") ||
    (metaDescription ? cleanDescription(metaDescription) : "") ||
    (targetDoc.body?.innerText ? cleanDescription(targetDoc.body.innerText.slice(0, 4000)) : "");

  const description = cleanDescription(rawDescriptionCandidate);

  // 7. Standardize Location
  // State Elevation Policy:
  // Prefer the location candidate that resolves with both a city AND state.
  // If jsonLd.location lacks a state (e.g. "Varenita of Simi Valley" -> "Simi Valley")
  // but domLocation has a state (e.g. "Simi Valley, CA - Varenita of Simi Valley" -> "Simi Valley, CA"),
  // domLocation must take precedence over jsonLd.location!
  let resolvedLocationRaw: string | undefined;
  const jsonLdLoc = jsonLd?.location;
  const jsonLdParsed = jsonLdLoc ? parseLocation(jsonLdLoc) : null;
  const domLocParsed = domLocation ? parseLocation(domLocation) : null;

  if (jsonLdParsed?.state) {
    resolvedLocationRaw = jsonLdLoc;
  } else if (domLocParsed?.state) {
    resolvedLocationRaw = domLocation;
  } else if (jsonLdLoc) {
    resolvedLocationRaw = jsonLdLoc;
  } else if (domLocation) {
    resolvedLocationRaw = domLocation;
  }

  let location = standardizeLocation(resolvedLocationRaw);

  // If location still lacks state, check description for state enhancement
  if (location) {
    const currentParsed = parseLocation(location);
    if (!currentParsed.state && currentParsed.city && description) {
      const descLoc = extractLocationFromText(description);
      if (descLoc.state && descLoc.city.toLowerCase() === currentParsed.city.toLowerCase()) {
        location = standardizeLocation(`${currentParsed.city}, ${descLoc.state}`);
      }
    }
  } else if (description) {
    const descLoc = extractLocationFromText(description);
    if (descLoc.city && descLoc.state) {
      location = standardizeLocation(`${descLoc.city}, ${descLoc.state}`);
    } else if (descLoc.isRemote) {
      location = "Remote";
    }
  }

  // 8. Standardize Salary (with description fallback)
  const rawSalary = jsonLd?.salary || domSalary || undefined;
  let salary = rawSalary ? (normalizeSalaryDisplay(rawSalary) ?? rawSalary) : undefined;
  if (!salary && description) {
    const extracted = extractSalaryFromText(description);
    if (extracted) salary = extracted;
  }

  // 9. Date Posted (anchoring relative time to ISO)
  const rawDate = jsonLd?.datePosted || (domDatePosted ? domDatePosted : undefined);
  const datePosted = rawDate ? (relativeTimeToIso(rawDate) || rawDate) : undefined;

  // 10. Direct Logo URL (prioritize direct CDN over Google fallback)
  const logoUrl = jsonLd?.logoUrl || domLogoUrl || undefined;

  // 11. Canonical Job URL
  let resolvedUrl = domJobLink || jsonLd?.url || currentUrl;
  const canonical = targetDoc.querySelector("link[rel='canonical']")?.getAttribute("href") || "";
  if (/glassdoor\.com/i.test(currentUrl)) {
    const activeJlid = (activeRoot.querySelector("[id^='jd-job-title-'], [id^='jd-salary-']")?.id || "").match(/\d{10,}/)?.[0];
    if (activeJlid) {
      const activeAnchor = targetDoc.querySelector(`a[href*='${activeJlid}']`) as HTMLAnchorElement | null;
      if (activeAnchor?.href) resolvedUrl = activeAnchor.href;
      else resolvedUrl = `https://www.glassdoor.com/job-listing/?jl=${activeJlid}`;
    } else if (canonical && /glassdoor\.com\/job-listing\//i.test(canonical)) {
      resolvedUrl = canonical;
    }
  } else if (/monster\.com/i.test(currentUrl)) {
    if (canonical && /monster\.com\/job-openings\//i.test(canonical)) {
      resolvedUrl = canonical;
    }
  } else if (/jobleads\.com/i.test(currentUrl)) {
    if (canonical && /jobleads\.com\/[a-z]{2}\/job\//i.test(canonical)) {
      resolvedUrl = canonical;
    } else if (resolvedUrl.includes("?from=") && currentUrl && !currentUrl.includes("?from=")) {
      resolvedUrl = currentUrl;
    }
  }

  if (resolvedUrl.startsWith("//")) {
    resolvedUrl = `https:${resolvedUrl}`;
  } else if (resolvedUrl.startsWith("/")) {
    try {
      const origin = currentUrl ? new URL(currentUrl).origin : "";
      if (origin) resolvedUrl = `${origin}${resolvedUrl}`;
    } catch {}
  }
  const source = matchedSite?.source || jsonLd?.source || "Generic Web";

  return {
    title: title || "Job Opportunity",
    company: company || "Company",
    description: description || "",
    url: resolvedUrl,
    location,
    salary,
    datePosted,
    logoUrl,
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
