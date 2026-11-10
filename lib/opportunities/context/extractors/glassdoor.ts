import type { ScrapedJobPosting } from "../context.schema";
import { parseStructuredJobSections, cleanTitleAndCompany } from "../section-classifier";
import { isLegitimateJobContent } from "../json-ld-parser";
import { normalizeSalaryDisplay, extractSalaryFromText } from "@/lib/ai/classifier";
import { standardizeLocation, extractLocationFromText } from "@/lib/utils/location";
import type { PlatformExtractor } from "./types";

export function extractGlassdoorSemanticDom(
  html: string,
  url: string = ""
): ScrapedJobPosting | null {
  if (!html || html.length < 250) return null;

  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleTag = titleTagMatch ? titleTagMatch[1].trim() : "";

  // Title
  let title = "";
  const gdPaneTitle =
    html.match(/id=["']?jd-job-title-[^"'\s>]+["']?[^>]*>([^<]+)<\/h1>/i) ||
    html.match(/data-test=["']?job-details-header["']?[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i);
  if (gdPaneTitle) {
    title = gdPaneTitle[1].trim();
  }

  if (!title && titleTag) {
    const gdMatch = titleTag.match(/^(.+?)\s+hiring\s+(.+?)\s+Job\s+in/i);
    if (gdMatch) {
      title = gdMatch[2].trim();
    }
  }

  // Company
  let company = "";
  const gdPaneComp =
    html.match(/data-test=["']?job-details-header["']?[\s\S]*?<h4[^>]*>([^<]+)<\/h4>/i) ||
    html.match(/class=["'][^"']*EmployerProfile_employerNameHeading[^"']*["'][^>]*>([^<]+)<\/h4>/i);
  if (gdPaneComp && !/Glassdoor|Job/i.test(gdPaneComp[1])) {
    company = gdPaneComp[1].trim();
  }
  if (!company && titleTag) {
    const gdComp = titleTag.match(/^(.+?)\s+hiring\s+/i);
    if (gdComp) company = gdComp[1].trim();
  }

  // Location
  let rawLoc: string | undefined;
  const gdPaneLoc =
    html.match(/data-test=["']?job-details-header["']?[\s\S]*?data-test=["']?location["']?[^>]*>([^<]+)<\/div>/i) ||
    html.match(/id=["']?jd-job-title-[^"']*["'][\s\S]*?data-test=["']?location["']?[^>]*>([^<]+)<\/div>/i);
  if (gdPaneLoc) {
    rawLoc = gdPaneLoc[1].trim();
  }
  if (!rawLoc && titleTag) {
    const gdLoc = titleTag.match(/Job in\s+([^|]+?)(?:\s*\||$)/i);
    if (gdLoc) rawLoc = gdLoc[1].trim();
  }
  let location = standardizeLocation(rawLoc);

  // Salary
  let salary: string | undefined;
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

  // Logo
  let logoUrl: string | undefined;
  const cdnLogoMatch = html.match(
    /<img[^>]*(?:src|data-delayed-url|data-ghost-url)=["'](https:\/\/media\.glassdoor\.com\/[^"']+)["']/i
  );
  if (cdnLogoMatch) {
    logoUrl = cdnLogoMatch[1].replace(/&amp;/g, "&");
  }

  // Description
  let rawDescHtml = "";
  if (html.includes("JobDetails_jobDescription")) {
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

  if (!rawDescHtml) return null;

  const structured = parseStructuredJobSections(rawDescHtml);
  if (!isLegitimateJobContent(structured.coreMarkdown)) {
    return null;
  }

  if (!salary && structured.fullReconstructedMarkdown) {
    const extracted = extractSalaryFromText(structured.fullReconstructedMarkdown);
    if (extracted) salary = extracted;
  }

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

  return {
    title: resolvedTitle,
    company: resolvedCompany,
    location,
    salary,
    description: structured.fullReconstructedMarkdown,
    coreDescription: structured.coreMarkdown,
    overviewSnippet: structured.overviewSnippet,
    logoUrl,
    sections: structured.sections,
    applyUrl,
  };
}

export const glassdoorExtractor: PlatformExtractor = {
  name: "Glassdoor",
  matches(html: string, url: string): boolean {
    return (
      /glassdoor\.com/i.test(url) ||
      /data-test=["']?job-details-header/i.test(html) ||
      /<title[^>]*>.*?Glassdoor.*?<\/title>/i.test(html)
    );
  },
  extract(html: string, url: string): ScrapedJobPosting | null {
    return extractGlassdoorSemanticDom(html, url);
  },
};
