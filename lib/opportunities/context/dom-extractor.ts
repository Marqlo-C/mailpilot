/**
 * ============================================================================
 * SEMANTIC DOM & METADATA JOB EXTRACTOR
 * 
 * Zero-token heuristic fallback for rendered single-page applications and
 * aggregator job boards (Indeed, Glassdoor, LinkedIn, Greenhouse, ZipRecruiter)
 * when direct Schema.org JSON-LD is absent or stripped.
 * ============================================================================
 */

import type { ScrapedJobPosting } from "./schema.ssot";
import {
  parseStructuredJobSections,
  cleanTitleAndCompany,
  isValidCompanyName,
} from "./section-classifier";
import { isLegitimateJobContent } from "./json-ld-parser";
import { normalizeSalaryDisplay, extractSalaryFromText } from "@/lib/ai/classifier";
import { standardizeLocation, extractLocationFromText } from "@/lib/utils/location";

import {
  findMatchingPlatformExtractor,
  extractIndeedSemanticDom,
} from "./extractors";

export { extractIndeedSemanticDom };

/**
 * Extracts job opportunity attributes directly from HTML DOM structures,
 * meta tags, and semantic containers without external browser dependencies.
 */
export function extractJobFromSemanticDom(
  html: string,
  url: string = ""
): ScrapedJobPosting | null {
  if (!html || html.length < 250) return null;

  // Check specialized platform extractors first (Indeed, Glassdoor, Greenhouse, Lever, Monster, JobLeads)
  const platformExtractor = findMatchingPlatformExtractor(html, url);
  if (platformExtractor) {
    const extracted = platformExtractor.extract(html, url);
    if (extracted) return extracted;
  }

  // 1. Extract Page Title, Canonical, & OpenGraph tags
  const canonicalMatch =
    html.match(/<link\s+[^>]*rel=["']?canonical["']?[^>]*href=["']?([^"'\s>]+)/i) ||
    html.match(/<link\s+[^>]*href=["']?([^"'\s>]+)["']?[^>]*rel=["']?canonical["']?/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1].trim() : "";

  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleTag = titleTagMatch ? titleTagMatch[1].trim() : "";

  const getMeta = (prop: string) => {
    const rx1 = new RegExp(
      `<meta\\s+[^>]*(?:name|property|itemprop)=["']?${prop}["']?[^>]*content=["']([^"']*)["']`,
      "i"
    );
    const rx2 = new RegExp(
      `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:name|property|itemprop)=["']?${prop}["']?`,
      "i"
    );
    const m = html.match(rx1) || html.match(rx2);
    return m ? m[1].trim() : "";
  };

  const ogTitle = getMeta("og:title") || getMeta("twitter:title");
  const ogSiteName = getMeta("og:site_name");
  const ogImage = getMeta("og:image") || getMeta("twitter:image");

  // 2. Resolve Job Title
  let title = "";

  // 2a. Active split-pane listing on Indeed (#jobsearch-ViewjobPaneWrapper, active jobTitle, or CMP header)
  const indPaneMatch = html.match(/id=["']?jobsearch-ViewjobPaneWrapper["']?[\s\S]*?data-testid=["']?vj-job-title["']?[^>]*>([^<]+)<\/h2>/i) ||
                       html.match(/data-testid=["']?vj-job-title["']?[^>]*>([^<]+)</i) ||
                       html.match(/data-testid=["']?jobDetailTitle["']?[^>]*><h\d[^>]*>([^<]+)<\/h\d>/i) ||
                       html.match(/data-testid=["']?jobDetailTitle["']?[^>]*>([^<]+)</i);
  if (indPaneMatch) {
    title = indPaneMatch[1].replace(/&amp;/g, "&").trim();
  }

  if (!title) {
    const indActiveTitle =
      html.match(/aria-pressed=true[^>]*>[\s\S]*?<span[^>]*title=["']([^"']+)["']/i) ||
      html.match(/id=["']?jobTitle-[^"'>\s]+["']?[^>]*>([^<]+)<\/span>/i);
    if (indActiveTitle) {
      title = (indActiveTitle[1] || indActiveTitle[2] || "").trim();
    }
  }

  // 2b. ZipRecruiter selected job container heading
  if (!title) {
    const zrMatch = html.match(
      /class=["']?job-description-html["']?><div><p><b><strong>([^<]+)<\/strong><\/b>/i
    );
    if (zrMatch) title = zrMatch[1].trim();
  }

  // 2c. Glassdoor selected job details header
  if (!title) {
    const gdPaneTitle = html.match(/id=["']?jd-job-title-[^"'\s>]+["']?[^>]*>([^<]+)<\/h1>/i) ||
                        html.match(/data-test=["']?job-details-header["']?[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i);
    if (gdPaneTitle) title = gdPaneTitle[1].trim();
  }

  // 2d. Monster active job title
  if (!title && (html.includes("BigJobCardId") || html.includes("monster.com"))) {
    const mTitle = html.match(/data-testid=["']?jobTitle["']?[^>]*>([^<]+)<\/h\d>/i) ||
                   html.match(/id=["']?job-view-header["']?[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/i);
    if (mTitle) title = mTitle[1].trim();
  }

  // 2e. JobLeads active preview title
  if (!title && /jobleads/i.test(url + html)) {
    const jlTitle = html.match(/class=["'][^"']*job-preview__heading[^"']*["'][^>]*>([^<]+)<\/h\d>/i) ||
                    html.match(/data-testid=["']?job-preview-title["']?[^>]*>([^<]+)<\/h\d>/i) ||
                    html.match(/data-active=["']?true["']?[\s\S]*?data-testid=["']?search-job-card-link["']?[^>]*>([^<]+)<\/a>/i);
    if (jlTitle) title = jlTitle[1].trim();
  }

  // 2f. Careers / job-title class or Workday jobPostingHeader
  if (!title) {
    const wdTitle = html.match(/data-automation-id=["']?jobPostingHeader["']?[^>]*>([^<]+)</i);
    if (wdTitle) {
      title = wdTitle[1].trim();
    } else {
      const jtMatch = html.match(/<h[1-3][^>]*class=["'][^"']*\bjob-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h[1-3]>/i);
      if (jtMatch) title = jtMatch[1].replace(/<[^>]+>/g, "").trim();
    }
  }

  // 2c. Title Tag Patterns across platforms
  if (!title && titleTag) {
    const gdMatch = titleTag.match(/^(.+?)\s+hiring\s+(.+?)\s+Job\s+in/i);
    const liMatch = titleTag.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*LinkedIn/i);
    const indMatch = titleTag.match(/^(.+?)\s*-\s*(.+?)\s*-\s*Indeed\.com/i);

    if (gdMatch) title = gdMatch[2].trim();
    else if (liMatch) title = liMatch[1].trim();
    else if (indMatch) title = indMatch[1].trim();
    else if (titleTag.includes("@")) title = titleTag.split("@")[0].trim();
    else if (titleTag.includes("|")) {
      const candidate = titleTag.split("|")[0].trim();
      if (!/hiring|jobs in/i.test(candidate)) title = candidate;
    }
  }

  // 2d. DOM Headings (h1 / h2)
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match && h1Match[1].length < 80 && !/jobs in|sign in|welcome/i.test(h1Match[1])) {
      title = h1Match[1].trim();
    }
  }

  if (!title && ogTitle) {
    title = ogTitle
      .replace(/\s*[-–|•]\s*(?:LinkedIn|Indeed|Glassdoor|JobLeads|Greenhouse|ZipRecruiter).*$/i, "")
      .trim();
  }

  // 3. Resolve Company Name
  let company = "";

  // 3a. Glassdoor active pane employer
  const gdPaneComp =
    html.match(/data-test=["']?job-details-header["']?[\s\S]*?<h4[^>]*>([^<]+)<\/h4>/i) ||
    html.match(/class=["'][^"']*EmployerProfile_employerNameHeading[^"']*["'][^>]*>([^<]+)<\/h4>/i);
  if (gdPaneComp && !/Glassdoor|Job/i.test(gdPaneComp[1])) {
    company = gdPaneComp[1].trim();
  }

  // 3a1. Monster active pane employer
  if (!company && (html.includes("svx-split-view-job-panel") || html.includes("monster.com"))) {
    const mCardIdx = html.indexOf("svx-split-view-job-panel") !== -1
      ? html.indexOf("svx-split-view-job-panel")
      : html.indexOf("id=job-view-header") !== -1
      ? html.indexOf("id=job-view-header")
      : html.indexOf("id=\"job-view-header\"");
    const mSlice = mCardIdx !== -1 ? html.slice(mCardIdx) : html;
    const mComp =
      mSlice.match(/data-testid=["']?company["']?[^>]*>([^<]+)<\/span>/i) ||
      mSlice.match(/data-testid=["']?jobHeaderCompanyLogo["']?[^>]*title=["']?([^"'>]+)["']?/i) ||
      mSlice.match(/title=["']?([^"'>]+)["']?[^>]*data-testid=["']?jobHeaderCompanyLogo["']?/i);
    if (mComp && isValidCompanyName(mComp[1])) {
      company = mComp[1].trim();
    }
  }

  // 3b. Indeed active pane or CMP employer
  if (!company) {
    const indPaneComp =
      html.match(/id=["']?jobsearch-ViewjobPaneWrapper["']?[\s\S]*?aria-label=["']([A-Za-z0-9&.,' -]+?)\s*\(/i) ||
      html.match(/data-testid=["']?company-info-metadata["']?[\s\S]*?aria-label=["']([A-Za-z0-9&.,' -]+?)\s*\(/i) ||
      html.match(/data-testid=["']?company-info-metadata["']?[\s\S]*?<a[^>]+>([^<]+)<\/a>/i) ||
      html.match(/data-testid=["']?jobDetailSubtitle["']?[\s\S]*?<span[^>]*>([A-Za-z0-9&.,' -]+?)\s*-\s*[A-Za-z\s.-]+,\s*[A-Z]{2}/i) ||
      html.match(/<script\b[^>]*type=["']?application\/ld\+json["']?[^>]*>[\s\S]*?"@type"\s*:\s*"LocalBusiness"[\s\S]*?"name"\s*:\s*"([^"]+)"/i);
    if (indPaneComp && isValidCompanyName(indPaneComp[1])) {
      company = indPaneComp[1].trim();
    }
  }

  // 3b. ZipRecruiter active pane Company line or right-pane employer link:
  if (!company) {
    const zrPaneComp =
      html.match(/data-testid=["']?right-pane["']?[\s\S]*?<a[^>]+href=["']?https:\/\/www\.ziprecruiter\.com\/co\/([^\/\s"'>]+)[^>]*>([\s\S]*?)<\/a>/i) ||
      html.match(/<a[^>]+href=["']?https:\/\/www\.ziprecruiter\.com\/co\/([^\/\s"'>]+)[^>]*>([\s\S]*?)<\/a>/i);
    if (zrPaneComp) {
      const text = zrPaneComp[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (isValidCompanyName(text)) {
        company = text;
      } else {
        const slug = zrPaneComp[1].replace(/[-_]+/g, " ").trim();
        if (isValidCompanyName(slug)) company = slug;
      }
    }
  }

  if (!company) {
    const zrCompMatch = html.match(
      /<b><strong>Company:\s*<\/strong><\/b>\s*([A-Za-z0-9&.,' -]+?)(?:<p|<br|<\/div|<\/p)/i
    );
    if (zrCompMatch && isValidCompanyName(zrCompMatch[1])) company = zrCompMatch[1].trim();
  }

  // 3c. Greenhouse modal / header company name:
  if (!company) {
    const ghComp = html.match(/class=["']?application-form-header--company-name["']?[^>]*>([^<]+)<\/h3>/i) ||
                   html.match(/class=["']?company-logo__logo["']?[^>]*alt=["']([^"']+)["']/i) ||
                   html.match(/alt=["']([^"']+)["'][^>]*class=["']?company-logo__logo["']/i);
    if (ghComp && !/Greenhouse/i.test(ghComp[1])) {
      company = ghComp[1].trim();
    }
  }

  // 3d. Indeed unquoted data-testid=company-name
  if (!company) {
    const indCompMatch = html.match(
      /\bdata-testid\s*=\s*["']?company-name["']?[^>]*>([^<]+)<\/span>/i
    );
    if (indCompMatch) company = indCompMatch[1].trim();
  }

  // 3d. Title Tag Patterns
  if (!company && titleTag) {
    const gdComp = titleTag.match(/^(.+?)\s+hiring\s+/i);
    const liComp = titleTag.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*LinkedIn/i);
    if (gdComp) company = gdComp[1].trim();
    else if (liComp) company = liComp[2].trim();
    else if (titleTag.includes("@")) company = titleTag.split("@")[1].trim();
    else if (titleTag.includes("|")) {
      const parts = titleTag.split("|");
      if (parts.length >= 2 && !/LinkedIn|Glassdoor|Indeed|Jobs|Search/i.test(parts[1])) {
        company = parts[1]
          .replace(/\s*[-–]\s*\d{3,}\s*$/, "")
          .replace(/^(?:Stellantis\s*[-–]\s*)/i, "")
          .replace(/Careers/i, "")
          .trim();
      }
    }
  }

  // 3e. Alt text on logo images: alt="Company logo for, [Company]." or alt="[Company] logo"
  if (!company) {
    const altLogoMatch = html.match(
      /alt=["'](?:Company logo for,\s*|)([A-Za-z0-9&.,' -]+?)(?:\s+logo|\.)?["']/i
    );
    if (
      altLogoMatch &&
      altLogoMatch[1] &&
      !/Greenhouse|Indeed|LinkedIn|Glassdoor|ZipRecruiter|Careers/i.test(altLogoMatch[1])
    ) {
      company = altLogoMatch[1].trim();
    }
  }

  // 3f. Semantic metadata fallback (excluding aggregator host platform names)
  if (!company && ogSiteName && !/LinkedIn|Indeed|Glassdoor|ZipRecruiter/i.test(ogSiteName)) {
    company = ogSiteName.trim();
  }

  // 3g. Greenhouse Who We Are / h3 fallback
  if (!company && /greenhouse/i.test(url)) {
    const h3Comp = html.match(/<h3[^>]*>([A-Za-z0-9&.,' -]+?)<\/h3>/i);
    if (h3Comp) company = h3Comp[1].trim();
  }

  // 3h. JobLeads company
  if (!company && /jobleads\.com/i.test(url + html)) {
    const jlCompMatch = html.match(/data-testid=["']?job-preview-company-name["']?[^>]*>([^<]+)<\/span>/i) ||
                        html.match(/<meta[^>]+name=["']?description["']?[^>]+content=["']([^"']+?)\s+(?:is\s+hiring|hiring)/i);
    if (jlCompMatch && isValidCompanyName(jlCompMatch[1])) {
      company = jlCompMatch[1].trim();
    }
  }

  // 4. Resolve Location
  let rawLoc: string | undefined;

  // 4a. Glassdoor active pane location
  const gdPaneLoc =
    html.match(/data-test=["']?job-details-header["']?[\s\S]*?data-test=["']?location["']?[^>]*>([^<]+)<\/div>/i) ||
    html.match(/id=["']?jd-job-title-[^"']*["'][\s\S]*?data-test=["']?location["']?[^>]*>([^<]+)<\/div>/i);
  if (gdPaneLoc) rawLoc = gdPaneLoc[1].trim();

  // 4a1. Monster active pane location
  if (!rawLoc && (html.includes("svx-split-view-job-panel") || html.includes("monster.com"))) {
    const mCardIdx = html.indexOf("svx-split-view-job-panel") !== -1
      ? html.indexOf("svx-split-view-job-panel")
      : html.indexOf("id=job-view-header") !== -1
      ? html.indexOf("id=job-view-header")
      : html.indexOf("id=\"job-view-header\"");
    const mSlice = mCardIdx !== -1 ? html.slice(mCardIdx) : html;
    const mLoc = mSlice.match(/data-testid=["']?jobDetailLocation["']?[^>]*>([^<]+)/i);
    if (mLoc) rawLoc = mLoc[1].trim();
  }

  // 4a2. Careers / Drupal location
  if (!rawLoc) {
    const carLoc = html.match(/class=["'][^"']*field-name-field-header-job-location[^"']*["'][^>]*>([^<]+)<\/div>/i);
    if (carLoc) rawLoc = carLoc[1].trim();
  }

  // 4b. ZipRecruiter active pane Location line or right-pane span:
  if (!rawLoc) {
    const zrPaneLoc = html.match(/data-testid=["']?right-pane["']?[\s\S]*?<span[^>]*class=["'][^"']*html-span[^"']*["'][^>]*>([A-Za-z\s.-]+,\s*[A-Z]{2})\s*•\s*On-site<\/span>/i);
    if (zrPaneLoc) rawLoc = zrPaneLoc[1].trim();
  }

  if (!rawLoc) {
    const zrLocMatch = html.match(
      /Location:\s*<\/strong><\/b>\s*([A-Za-z0-9&.,' -]+?)(?:<li|<p|<br|<\/div|<\/p)/i
    );
    if (zrLocMatch) rawLoc = zrLocMatch[1].trim();
  }

  // 4b. Greenhouse modal tag location:
  if (!rawLoc && /greenhouse/i.test(url + html)) {
    const ghLoc = html.match(/(?:data-slot=["']?dialog-content["']?|role=["']?dialog["']?)[\s\S]*?<span[^>]*class=["'][^"']*tag-text[^"']*["'][^>]*>([A-Za-z\s.-]+,\s*[A-Z]{2})<\/span>/i);
    if (ghLoc) rawLoc = ghLoc[1].trim();
  }

  // 4c. Indeed active pane location (strictly inside right-pane wrapper to avoid left SERP card feed)
  if (!rawLoc && html.includes("jobsearch-ViewjobPaneWrapper")) {
    const paneStart = html.indexOf("jobsearch-ViewjobPaneWrapper");
    const paneHtml = html.slice(paneStart, paneStart + 35000);
    const indPaneLoc =
      paneHtml.match(/class=["'][^"']*css-146c3p1[^"']*["'][^>]*>([A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?)</i) ||
      paneHtml.match(/class=["'][^"']*css-146c3p1[^"']*["'][^>]*>(Remote\s*(?:in\s+[A-Za-z\s]+)?)</i) ||
      paneHtml.match(/data-testid=["']?jobsearch-JobInfoHeader-companyLocation["']?[^>]*>([^<]+)<\/div>/i) ||
      paneHtml.match(/data-testid=["']?inlineHeader-companyLocation["']?[^>]*>([^<]+)<\/div>/i);
    if (indPaneLoc) rawLoc = indPaneLoc[1].trim();
  }

  // 4d. JobLeads location
  if (!rawLoc && /jobleads\.com/i.test(url + html)) {
    const jlLocMatch = html.match(/data-testid=["']?job-card-chip-location["']?[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
                       html.match(/<meta[^>]+name=["']description["'][^>]+content=["'][^"']*\sin\s+([A-Za-z\s.-]+(?:\s*\([A-Z]{2}\))?)\./i);
    if (jlLocMatch) rawLoc = jlLocMatch[1].replace(/<[^>]+>/g, " ").trim();
  }

  // 4e. Indeed location (split-pane, company page, or single-pane)
  if (!rawLoc && /indeed\.com/i.test(url + html)) {
    const indCmpLoc = html.match(/data-testid=["']?jobDetailSubtitle["']?[\s\S]*?<span[^>]*>[A-Za-z0-9&.,' -]+?\s*-\s*([A-Za-z\s.-]+,\s*[A-Z]{2})/i);
    if (indCmpLoc) {
      rawLoc = indCmpLoc[1].trim();
    }
  }

  if (!rawLoc && /indeed\.com/i.test(url + html)) {
    const indLocMatch =
      html.match(/data-testid=["']?company-info-metadata["']?[\s\S]*?<div[^>]*class=["'][^"']*css-146c3p1[^"']*["'][^>]*>(?:[0-9A-Za-z\s.,#-]+,\s*)?([A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?)<\/div>/i) ||
      html.match(/<div[^>]*class=["'][^"']*css-146c3p1[^"']*["'][^>]*>(?:[0-9A-Za-z\s.,#-]+,\s*)?([A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?)<\/div>/i) ||
      html.match(/<div[^>]*class=["'][^"']*css-146c3p1[^"']*["'][^>]*>(Remote\s*(?:in\s+[A-Za-z\s]+)?)<\/div>/i) ||
      html.match(/\bdata-testid\s*=\s*["']?text-location["']?[^>]*>([^<]+)<\/div>/i);
    if (indLocMatch) rawLoc = indLocMatch[1].trim();
  }

  if (!rawLoc && /indeed\.com/i.test(url + html) && titleTag) {
    const indTitleLoc = titleTag.match(/^.+?\s*-\s*([A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?)\s*-\s*Indeed\.com/i);
    if (indTitleLoc) rawLoc = indTitleLoc[1].trim();
  }

  // 4d. Glassdoor / Title tag location: "Job in Oklahoma City, OK"
  if (!rawLoc && titleTag) {
    const gdLoc = titleTag.match(/Job in\s+([^|]+?)(?:\s*\||$)/i);
    if (gdLoc) rawLoc = gdLoc[1].trim();
  }

  // 4e. General City, State span patterns
  if (!rawLoc) {
    const domLoc = html.match(
      /(?:<span[^>]*>|<p[^>]*>|<div[^>]*>)([A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?)(?:<\/span>|<\/p>|<\/div>|\s*·)/i
    );
    if (domLoc && !/Monday|Friday|Full-Time|Schedule|Location/i.test(domLoc[1])) {
      rawLoc = domLoc[1].trim();
    }
  }

  // 4f. LinkedIn hashed classes & modern top card format
  if (!rawLoc) {
    const liLoc =
      html.match(/class=["'][^"']*\bf49gpp\b[^"']*["'][^>]*>([A-Za-z\s.-]+,\s*[A-Z]{2})<\/span>/i) ||
      html.match(/<span>[A-Za-z0-9&.,' -]+?\s*•\s*([A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?)/i);
    if (liLoc) rawLoc = liLoc[1].trim();
  }

  let location = standardizeLocation(rawLoc);

  // 5. Resolve Salary & Salary Max
  let salary: string | undefined;
  let salaryMax: number | undefined;

  // 5a. Glassdoor visible detailSalary badge: prioritize active pane id="jd-salary-..."
  let gdSalaryMatch: RegExpMatchArray | null = null;
  if (html.includes("jd-salary-")) {
    gdSalaryMatch = html.match(/\bid=["']?jd-salary-[^>\s"']*[^>]*>([\s\S]*?)<\/div>/i);
  }
  if (!gdSalaryMatch && html.includes("JobDetails_locationAndPay")) {
    const gdPayStart = html.lastIndexOf("JobDetails_locationAndPay");
    const gdPayHtml = html.slice(gdPayStart, gdPayStart + 1000);
    gdSalaryMatch = gdPayHtml.match(/data-test=["']?detailSalary["']?[^>]*>([\s\S]*?)<\/div>/i);
  }
  if (!gdSalaryMatch && !html.includes("TwoColumnLayout")) {
    gdSalaryMatch = html.match(/data-test=["']?detailSalary["'][^>]*>([\s\S]*?)<\/div>/i);
  }
  if (gdSalaryMatch) {
    const cleanedText = gdSalaryMatch[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
    const normalized = normalizeSalaryDisplay(cleanedText);
    if (normalized) salary = normalized;
  }

  // 5a1. Monster active pane salary
  if (!salary && (html.includes("svx-split-view-job-panel") || html.includes("monster.com"))) {
    const mCardIdx = html.indexOf("svx-split-view-job-panel") !== -1
      ? html.indexOf("svx-split-view-job-panel")
      : html.indexOf("id=job-view-header") !== -1
      ? html.indexOf("id=job-view-header")
      : html.indexOf("id=\"job-view-header\"");
    const mSlice = mCardIdx !== -1 ? html.slice(mCardIdx) : html;
    const mCompSal =
      mSlice.match(/data-testid=["']?(?:jobDetailSalary|svx-job-salary)["']?[^>]*>([\s\S]*?)<\/(?:li|div|span)>/i) ||
      mSlice.match(/Compensation:[^$]*(\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:-|–|to)\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:\/|\s*per\s*|\s*an\s*|\s*a\s*)(?:hr|hours?|yr|years?|month|week))?)/i);
    if (mCompSal) {
      const cleanSal = (mCompSal[1] || mCompSal[0]).replace(/<[^>]+>/g, " ").trim();
      const normalized = normalizeSalaryDisplay(cleanSal);
      if (normalized) salary = normalized;
    }
  }

  // 5b. Indeed Active Split Pane Salary (prioritize active right pane over left SERP feed)
  if (!salary && html.includes("jobsearch-ViewjobPaneWrapper")) {
    const paneStart = html.indexOf("jobsearch-ViewjobPaneWrapper");
    const paneHtml = html.slice(paneStart, paneStart + 25000);
    const paneSalMatch = paneHtml.match(
      /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}K?)\s*(?:-|–|to)\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}K?)(?:\s*(?:\/|\s*per\s*|\s*an\s*|\s*a\s*)(?:hr|hour|yr|year|month|week|annually))?/i
    );
    if (paneSalMatch) {
      salary = normalizeSalaryDisplay(paneSalMatch[0].trim()) ?? paneSalMatch[0].trim();
      const numOnly = paneSalMatch[2].replace(/[^\d.]/g, "");
      const rawMax = parseFloat(numOnly);
      if (!isNaN(rawMax) && rawMax > 0) {
        salaryMax = /k$/i.test(paneSalMatch[2]) ? rawMax * 1000 : rawMax;
      }
    }
  }

  // 5b1. Indeed Single-Pane or CMP Subtitle Salary
  if (!salary && /indeed\.com/i.test(url + html)) {
    const indSalMatch =
      html.match(
        /<div[^>]*class=["'][^"']*css-146c3p1[^"']*["'][^>]*>(\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:-|–|to)\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:\/|\s*per\s*|\s*an\s*|\s*a\s*)(?:hr|hours?|yr|years?|month|week|annually))?)<\/div>/i
      ) ||
      html.match(/data-testid=["']?job-detail-salary["']?[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/data-testid=["']?jobDetailSubtitle["']?[\s\S]*?<span[^>]*class=["'][^"']*e1wnkr790[^"']*["'][^>]*>\s*((?:From\s+)?\$[^<]+)<\/span>/i);
    if (indSalMatch) {
      const cleanSal = indSalMatch[1].replace(/<[^>]+>/g, " ").trim();
      const normalized = normalizeSalaryDisplay(cleanSal);
      if (normalized) salary = normalized;
    }
  }

  // 5c. ZipRecruiter right-pane salary row / badge / compensation line:
  if (!salary && (html.includes("data-testid=right-pane") || html.includes("data-testid=\"right-pane\""))) {
    const paneStart = html.search(/data-testid=["']?right-pane/i);
    const paneHtml = html.slice(paneStart, paneStart + 35000);
    const zrPaneSal = paneHtml.match(/data-testid=["']?salary-row["']?[\s\S]*?<span[^>]*class=["'][^"']*html-span[^"']*["'][^>]*>([^<]+)<\/span>/i) ||
                      paneHtml.match(/<span[^>]*class=["'][^"']*html-span[^"']*["'][^>]*>(\$[0-9.]+[Kk]?\s*(?:-\s*\$[0-9.]+[Kk]?)?\/[a-z]+[^<]*)<\/span>/i) ||
                      paneHtml.match(/<b><strong>(?:Compensation|Base Pay|Salary|Pay):\s*<\/strong><\/b>\s*([^<]+)/i);
    if (zrPaneSal) {
      salary = normalizeSalaryDisplay(zrPaneSal[1].trim()) ?? zrPaneSal[1].trim();
    }
  }

  // 5c. JobLeads chip salary
  if (!salary && /jobleads\.com/i.test(url + html)) {
    const jlSalMatch = html.match(/data-testid=["']?job-card-chip-salary["']?[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    if (jlSalMatch) {
      salary = normalizeSalaryDisplay(jlSalMatch[1].replace(/<[^>]+>/g, " ").trim()) ?? jlSalMatch[1].replace(/<[^>]+>/g, " ").trim();
    }
  }

  // 5d. Regex currency range pattern across whole page
  if (!salary) {
    const salMatch = html.match(
      /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}K?)\s*(?:-|–|to)\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}K?)(?:\s*(?:\/|\s*per\s*|\s*an\s*|\s*a\s*)(?:hr|hour|yr|year|month|week|annually))?/i
    );
    if (salMatch) {
      salary = normalizeSalaryDisplay(salMatch[0].trim()) ?? salMatch[0].trim();
      const numOnly = salMatch[2].replace(/[^\d.]/g, "");
      const rawMax = parseFloat(numOnly);
      if (!isNaN(rawMax) && rawMax > 0) {
        salaryMax = /k$/i.test(salMatch[2]) ? rawMax * 1000 : rawMax;
      }
    }
  }

  // 6. Resolve Date Posted
  let datePosted: string | undefined;
  const timeTagMatch = html.match(/<time[^>]+(?:datetime|content)=["']([^"']+)["'][^>]*>/i);
  if (timeTagMatch && timeTagMatch[1] && /\d/.test(timeTagMatch[1])) {
    datePosted = timeTagMatch[1].trim();
  }
  if (!datePosted) {
    const domDate = html.match(
      /(?:posted|reposted|re-posted|published|active|date\s*posted)\s*[:\s-]*\s*(today|yesterday|\d+\s*(?:days?|hours?|weeks?|months?)\s*ago|(?:january|february|march|april|may|june|july|august|september|october|november|december|[a-z]{3})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i
    );
    if (domDate) {
      datePosted = domDate[1].trim();
    }
  }

  // 7. Resolve Direct Company Logo
  let logoUrl: string | undefined;

  // 7a0. If company is known, prioritize matching company logo with alt containing company name
  if (company) {
    const escCo = company.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const coLogoMatch =
      html.match(new RegExp(`<img[^>]*alt=["'][^"']*${escCo}[^"']*["'][^>]*src=["'](https?:\\/\\/[^"']+)["']`, "i")) ||
      html.match(new RegExp(`<img[^>]*src=["'](https?:\\/\\/[^"']+)["'][^>]*alt=["'][^"']*${escCo}[^"']*["']`, "i"));
    if (coLogoMatch && !/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(coLogoMatch[1])) {
      logoUrl = coLogoMatch[1];
    }

    // Modern LinkedIn SDUI embedded JSON stream logo
    if (!logoUrl && /linkedin\.com/i.test(url + html)) {
      const a11yIdx = html.search(new RegExp(`Company logo for,\\s*${escCo}`, "i"));
      if (a11yIdx !== -1) {
        const slice = html.slice(a11yIdx, a11yIdx + 800);
        const rootMatch = slice.match(/rootUrl[\\"\s:]+(https?:\/\/[^\\"\s]+)/i);
        const suffixMatch = slice.match(/suffixUrl[\\"\s:]+([^\\"\s]+)/i);
        if (rootMatch && suffixMatch) {
          logoUrl = (rootMatch[1] + suffixMatch[1]).replace(/\\u0026/g, "&");
        }
      }
    }
  }

  // 7a0. Prefer direct CDN logos or structured LocalBusiness images (Indeed CMP, Glassdoor, LinkedIn)
  if (!logoUrl && /indeed\.com/i.test(url + html)) {
    const lbMatch = html.match(/<script\b[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
    if (lbMatch) {
      for (const s of lbMatch) {
        const imgM = s.match(/"(?:image|logo)"\s*:\s*"([^"]+)"/i);
        if (imgM && !imgM[1].includes("svg+xml") && /^https?:\/\//i.test(imgM[1])) {
          logoUrl = imgM[1];
          break;
        }
      }
    }
  }

  // 7a0.1 Indeed company-logo style background-image (DataAnnotation, Partnership HealthPlan)
  if (!logoUrl) {
    const bgLogoMatch =
      html.match(/data-testid=["']?company-logo["']?[\s\S]*?style=["'][^"']*background-image:\s*url\(([^)]+)\)/i) ||
      html.match(/data-testid=["']?company-logo-shadow["']?[\s\S]*?style=["'][^"']*background-image:\s*url\(([^)]+)\)/i);
    if (bgLogoMatch) {
      const rawUrl = bgLogoMatch[1].replace(/['"]/g, "").trim();
      if (rawUrl && !/profile-displayphoto|ghost-person|company-banner/i.test(rawUrl)) {
        logoUrl = rawUrl;
      }
    }
  }

  // 7a. Prefer high-fidelity direct CDN logos (LinkedIn company logo, Glassdoor, Indeed, Workday)
  // Must avoid user profile pictures (profile-displayphoto) and cover banners
  if (!logoUrl) {
    const cdnLogoMatch =
      html.match(
        /<img[^>]*(?:src|data-delayed-url|data-ghost-url)=["'](https:\/\/media\.licdn\.com\/dms\/image\/[^"']+)["']/i
      ) ||
      html.match(
        /<img[^>]*(?:src|data-delayed-url|data-ghost-url)=["'](https:\/\/(?:media\.glassdoor\.com|images\.indeed\.com)\/[^"']+)["']/i
      ) ||
      html.match(
        /<img[^>]*(?:src|data-delayed-url|data-ghost-url)=["'](https:\/\/[^"']*(?:workdaycdn\.com|myworkdayjobs\.com)[^"']+)["']/i
      );
    if (
      cdnLogoMatch &&
      !/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(cdnLogoMatch[1])
    ) {
      logoUrl = cdnLogoMatch[1].replace(/&amp;/g, "&");
    }
  }

  // 7a1. LinkedIn topcard company logo / artdeco entity image (supports lazy-loaded data-delayed-url)
  if (!logoUrl && /linkedin\.com/i.test(url + html)) {
    const liLogoMatch =
      html.match(
        /<img[^>]*(?:class|data-test-id|data-test)=["'][^"']*(?:artdeco-entity-image|topcard__logo|company-logo)[^"']*["'][^>]*(?:src|data-delayed-url)=["']([^"']+)["']/i
      ) ||
      html.match(
        /<img[^>]*(?:src|data-delayed-url)=["']([^"']+)["'][^>]*(?:class|data-test-id|data-test)=["'][^"']*(?:artdeco-entity-image|topcard__logo|company-logo)[^"']*["']/i
      );
    if (
      liLogoMatch &&
      /^https?:\/\//i.test(liLogoMatch[1]) &&
      !/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(liLogoMatch[1])
    ) {
      logoUrl = liLogoMatch[1].replace(/&amp;/g, "&");
    }
  }

  if (!logoUrl) {
    const logoImgMatch = html.match(
      /<img[^>]*(?:class|data-testid|data-automation-id|alt)=["']?[^"'>\s]*(?:company-widget-logo|brandingLogo|avatar-base_Image|brand-logo|company-logo|logoLink|jobHeaderCompanyLogo|logo)[^"'>\s]*["']?[^>]*src=["']([^"']+)["']/i
    ) || html.match(
      /<img[^>]*src=["']([^"']+)["'][^>]*(?:class|data-testid|data-automation-id|alt)=["']?[^"'>\s]*(?:company-widget-logo|brandingLogo|avatar-base_Image|brand-logo|company-logo|logoLink|jobHeaderCompanyLogo|logo)/i
    );
    if (
      logoImgMatch &&
      !logoImgMatch[1].includes("svg+xml") &&
      !logoImgMatch[1].startsWith("data:") &&
      !/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(logoImgMatch[1]) &&
      /^https?:\/\//i.test(logoImgMatch[1])
    ) {
      logoUrl = logoImgMatch[1];
    }
  }

  if (!logoUrl && ogImage && /^https?:\/\//i.test(ogImage) && !/default|share-logo|glassdoor|indeed|linkedin/i.test(ogImage)) {
    logoUrl = ogImage;
  }

  // 8. Resolve Description Container
  let rawDescHtml = "";

  // 8a. Monster description container
  if (!rawDescHtml && (html.includes("svx-description-container-inner") || html.includes("BigJobCardId") || html.includes("monster.com"))) {
    const mDesc = html.match(/data-testid=["']?svx-description-container-inner["']?[^>]*>([\s\S]*?)<\/div>/i) ||
                  html.match(/id=["']?job-description["']?[^>]*>([\s\S]*?)<\/div>/i);
    if (mDesc) rawDescHtml = mDesc[1];
  }

  // 8b. JobLeads description container
  if (!rawDescHtml && /jobleads\.com/i.test(url + html)) {
    const jlDescStart =
      html.search(/data-testid=["']?job-preview-description["']?/i) !== -1
        ? html.search(/data-testid=["']?job-preview-description["']?/i)
        : html.indexOf("new-job-preview-description-content");
    if (jlDescStart !== -1) {
      const ratingWidgetIdx = html.indexOf("job-content-rating-widget", jlDescStart);
      if (ratingWidgetIdx !== -1 && ratingWidgetIdx - jlDescStart > 100) {
        rawDescHtml = html.slice(jlDescStart, ratingWidgetIdx);
      } else {
        rawDescHtml = html.slice(jlDescStart, jlDescStart + 25000);
      }
    } else {
      const jlDesc = html.match(/class=["'][^"']*job-content-scrollable[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                     html.match(/class=["'][^"']*job-preview2024[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (jlDesc) rawDescHtml = jlDesc[1];
    }
  }

  // 8c. Careers / Drupal body container
  if (!rawDescHtml) {
    const carDesc = html.match(/class=["'][^"']*field-name-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (carDesc) rawDescHtml = carDesc[1];
  }

  // 8d. LinkedIn Guest API Markup or Single Job Container
  if (!rawDescHtml) {
    const linkedInMarkup = html.match(
      /<div[^>]*class=["'][^"']*show-more-less-html__markup[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    if (linkedInMarkup) {
      rawDescHtml = linkedInMarkup[1];
    }
  }

  // 8e. LinkedIn Logged-in Container: Between "About the job" and next section / ID / expandable box
  if (!rawDescHtml && html.includes("About the job")) {
    const atjIdx = html.indexOf("About the job");
    const atcIdx = html.indexOf("About the company", atjIdx);
    const jobDetailsEnd = html.search(/(?:id=["']?JobDetails_PremiumApplicantInsights|componentkey=["']?JobDetails_|id=["']?JobDetails_apply)/i);
    if (atjIdx !== -1 && atcIdx !== -1) {
      rawDescHtml = html.slice(atjIdx, atcIdx);
    } else if (atjIdx !== -1 && jobDetailsEnd !== -1 && jobDetailsEnd > atjIdx) {
      rawDescHtml = html.slice(atjIdx, jobDetailsEnd);
    } else if (atjIdx !== -1) {
      rawDescHtml = html.slice(atjIdx, atjIdx + 20000);
    } else {
      const expBox = html.match(/data-testid=["']?expandable-text-box["']?[^>]*>([\s\S]*?)<\/span>/i);
      if (expBox) rawDescHtml = expBox[1];
    }
  }

  // 8f. Indeed Container (CMP, Modern react-native div, or Legacy)
  if (!rawDescHtml && (html.includes("jobDetailDescription") || html.includes("simple-job-description-html") || html.includes("jobsearch-jobDescriptionText") || /indeed\.com/i.test(url + html))) {
    // 1. jobDetailDescription (CMP layout)
    if (html.includes("jobDetailDescription")) {
      const start = html.indexOf("jobDetailDescription");
      const end = html.indexOf("job details loaded", start);
      if (start !== -1 && end !== -1 && end > start) {
        rawDescHtml = html.slice(start, end);
      }
    }

    // 2. simple-job-description-html (modern Indeed div container)
    if (!rawDescHtml) {
      const divIdx = html.search(/<div[^>]*simple-job-description-html/i);
      if (divIdx !== -1) {
        const endIdx = html.indexOf("jobDescriptionSeen", divIdx) !== -1
          ? html.indexOf("jobDescriptionSeen", divIdx)
          : html.indexOf("Explore other jobs", divIdx) !== -1
          ? html.indexOf("Explore other jobs", divIdx)
          : html.indexOf("vj-report-job", divIdx);
        if (endIdx !== -1 && endIdx > divIdx) {
          rawDescHtml = html.slice(divIdx, endIdx);
        } else {
          rawDescHtml = html.slice(divIdx, divIdx + 30000);
        }
      }
    }

    // 3. jobsearch-jobDescriptionText (legacy Indeed)
    if (!rawDescHtml) {
      const indDesc = html.match(
        /id=["']?jobDescriptionText["']?[^>]*>([\s\S]*?)<\/div>/i
      ) || html.match(
        /class=["']?[^"'>]*\b(?:jobsearch-jobDescriptionText)\b[^"'>]*["']?[^>]*>([\s\S]*?)<\/div>/i
      );
      if (indDesc) rawDescHtml = indDesc[1];
    }
  }

  // 8g. Glassdoor Container
  if (!rawDescHtml && html.includes("JobDetails_jobDescription")) {
    const gdStart = html.lastIndexOf("JobDetails_jobDescription");
    if (gdStart !== -1) {
      const showMorePos = html.indexOf("Show more", gdStart);
      if (showMorePos !== -1 && showMorePos - gdStart > 250) {
        rawDescHtml = html.slice(gdStart, showMorePos);
      } else {
        const gdDesc = html.match(
          /class=["']?[^"'>]*JobDetails_jobDescription[^"'>]*["']?[^>]*>([\s\S]*?)<\/div>/i
        );
        if (gdDesc) rawDescHtml = gdDesc[1];
      }
    }
  }

  // 8h. Greenhouse / ATS rich text
  if (!rawDescHtml) {
    const ghDesc = html.match(/<div[^>]*class=["']?[^"'>]*rich-text[^"'>]*["']?[^>]*>([\s\S]*?)<\/div>/i);
    if (ghDesc) rawDescHtml = ghDesc[1];
  }

  // 8h1. Workday description container
  if (!rawDescHtml && (html.includes("jobPostingDescription") || /myworkdayjobs\.com/i.test(url + html))) {
    const wdDesc = html.match(/data-automation-id=["']?jobPostingDescription["']?[^>]*>([\s\S]*?)<\/div>/i);
    if (wdDesc) rawDescHtml = wdDesc[1];
  }

  // 8i. ZipRecruiter Container
  if (!rawDescHtml) {
    const zrDesc = html.match(
      /class=["']?[^"'>]*job-description-html[^"'>]*["']?[^>]*>([\s\S]*?)<\/div>/i
    );
    if (zrDesc) rawDescHtml = zrDesc[1];
  }

  // 8j. Generic body container fallback
  if (!rawDescHtml) {
    const mainContainer = html.match(
      /<(?:main|article|div)[^>]*(?:id|class)=["']?[^"'>]*(?:job-description|posting-content|description-content)[^"'>]*["']?[^>]*>([\s\S]*?)<\/(?:main|article|div)>/i
    );
    if (mainContainer) rawDescHtml = mainContainer[1];
  }

  if (!rawDescHtml) return null;

  const structured = parseStructuredJobSections(rawDescHtml);
  if (!isLegitimateJobContent(structured.coreMarkdown)) {
    return null;
  }

  // Fall back to extracting salary from the description text if not captured in top badges
  if (!salary && structured.fullReconstructedMarkdown) {
    const extracted = extractSalaryFromText(structured.fullReconstructedMarkdown);
    if (extracted) {
      salary = extracted;
    }
  }

  // Fall back to extracting location from the description text if missing or was invalid zip
  if (!location && structured.fullReconstructedMarkdown) {
    const descLoc = extractLocationFromText(structured.fullReconstructedMarkdown);
    if (descLoc.city && descLoc.state) {
      location = standardizeLocation(`${descLoc.city}, ${descLoc.state}`);
    } else if (descLoc.isRemote) {
      location = "Remote";
    }
  }

  const cleanedMeta = cleanTitleAndCompany(title, company);
  const resolvedTitle = cleanedMeta.title || title || undefined;
  const resolvedCompany = cleanedMeta.company || company || undefined;

  let applyUrl = url || undefined;
  if (/glassdoor\.com/i.test((url || "") + html)) {
    const activeJlidMatch =
      html.match(/\bid=["']?jd-(?:job-title|salary)-(\d{10,})/i) ||
      html.match(/data-brandviews=["'][^"']*joblisting-(?:header|description)[^"']*jlid=(\d{10,})/i) ||
      html.match(/\bid=["']?jd-view-original-job-(\d{10,})/i) ||
      (url ? url.match(/[?&]jl=(\d{10,})/i) : null);
    const activeJlid = activeJlidMatch ? activeJlidMatch[1] : null;

    if (activeJlid) {
      const activeAnchorMatch = html.match(
        new RegExp(`<a[^>]+href=["']([^"']*(?:jlid=|jl=|jobListingId=)${activeJlid}[^"']*)["']`, "i")
      );
      if (activeAnchorMatch) {
        applyUrl = activeAnchorMatch[1].startsWith("http")
          ? activeAnchorMatch[1]
          : `https://www.glassdoor.com${activeAnchorMatch[1]}`;
      } else {
        applyUrl = `https://www.glassdoor.com/job-listing/?jl=${activeJlid}`;
      }
    } else if (canonicalUrl && /glassdoor\.com\/job-listing\//i.test(canonicalUrl)) {
      applyUrl = canonicalUrl;
    } else {
      const gdLinkMatch = html.match(
        /class=["'][^"']*JobsList_selected[^"']*["'][\s\S]*?<a[^>]+href=["'](\/job-listing\/[^"']+|https:\/\/www\.glassdoor\.com\/job-listing\/[^"']+)/i
      );
      if (gdLinkMatch) {
        applyUrl = gdLinkMatch[1].startsWith("http")
          ? gdLinkMatch[1]
          : `https://www.glassdoor.com${gdLinkMatch[1]}`;
      }
    }
  } else if (/jobleads\.com/i.test((url || "") + html)) {
    if (canonicalUrl && /jobleads\.com\/[a-z]{2}\/job\//i.test(canonicalUrl)) {
      applyUrl = canonicalUrl;
    } else if (url && /jobleads\.com\/[a-z]{2}\/job\//i.test(url) && !url.includes("?from=")) {
      applyUrl = url;
    } else {
      const jlLinkMatch =
        html.match(/data-active=["']?true["']?[\s\S]*?<a[^>]+data-testid=["']?search-job-card-link["']?[^>]+href=["']([^"']+)["']/i) ||
        html.match(/data-active=["']?true["']?[\s\S]*?<a[^>]+href=["'](\/us\/job\/[^"']+|\/job\/[^"']+|https:\/\/www\.jobleads\.com\/[^\s"'>]+)/i) ||
        html.match(/class=["'][^"']*job-preview-card[^"']*["'][\s\S]*?<a[^>]+href=["'](\/us\/job\/[^"']+|\/job\/[^"']+|https:\/\/www\.jobleads\.com\/[^\s"'>]+)/i);
      if (jlLinkMatch && !jlLinkMatch[1].includes("from=")) {
        applyUrl = jlLinkMatch[1].startsWith("http") ? jlLinkMatch[1] : `https://www.jobleads.com${jlLinkMatch[1]}`;
      }
    }
  } else if (/monster\.com/i.test((url || "") + html)) {
    if (canonicalUrl && /monster\.com\/job-openings\//i.test(canonicalUrl)) {
      applyUrl = canonicalUrl;
    } else {
      const mLinkMatch =
        html.match(/id=["']?BigJobCardId["']?[\s\S]*?<a[^>]+href=["'](\/\/www\.monster\.com\/job-openings\/[^"']+|\/job-openings\/[^"']+|https:\/\/www\.monster\.com\/job-openings\/[^"']+)/i) ||
        html.match(/data-testid=["']?svx-split-view-job-panel["']?[\s\S]*?<a[^>]+href=["'](\/\/www\.monster\.com\/job-openings\/[^"']+|\/job-openings\/[^"']+|https:\/\/www\.monster\.com\/job-openings\/[^"']+)/i) ||
        html.match(/<a[^>]+href=["'](https:\/\/www\.monster\.com\/job-openings\/[^"']+|\/\/www\.monster\.com\/job-openings\/[^"']+|\/job-openings\/[^"']+)["']/i);
      if (mLinkMatch) {
        const rawLink = mLinkMatch[1];
        if (rawLink.startsWith("//")) {
          applyUrl = `https:${rawLink}`;
        } else if (rawLink.startsWith("http")) {
          applyUrl = rawLink;
        } else {
          applyUrl = `https://www.monster.com${rawLink}`;
        }
      }
    }
  }

  return {
    title: resolvedTitle,
    company: resolvedCompany,
    location,
    salary,
    salaryMax,
    description: structured.fullReconstructedMarkdown,
    coreDescription: structured.coreMarkdown,
    overviewSnippet: structured.overviewSnippet,
    datePosted,
    logoUrl,
    sections: structured.sections,
    applyUrl,
  };
}
