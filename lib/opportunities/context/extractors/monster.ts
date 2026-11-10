import type { ScrapedJobPosting } from "../schema.ssot";
import { parseStructuredJobSections, cleanTitleAndCompany, isValidCompanyName } from "../section-classifier";
import { isLegitimateJobContent } from "../json-ld-parser";
import { normalizeSalaryDisplay } from "@/lib/ai/classifier";
import { standardizeLocation } from "@/lib/utils/location";
import type { PlatformExtractor } from "./types";

export function extractMonsterSemanticDom(
  html: string,
  url: string = ""
): ScrapedJobPosting | null {
  if (!html || html.length < 250) return null;

  const mCardIdx = html.indexOf("svx-split-view-job-panel") !== -1
    ? html.indexOf("svx-split-view-job-panel")
    : html.indexOf("id=job-view-header") !== -1
    ? html.indexOf("id=job-view-header")
    : html.indexOf("id=\"job-view-header\"");
  const mSlice = mCardIdx !== -1 ? html.slice(mCardIdx) : html;

  // Title
  let title = "";
  const mTitle =
    mSlice.match(/data-testid=["']?jobTitle["']?[^>]*>([^<]+)<\/h\d>/i) ||
    mSlice.match(/id=["']?job-view-header["']?[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/i) ||
    html.match(/data-testid=["']?jobTitle["']?[^>]*>([^<]+)<\/h\d>/i);
  if (mTitle) {
    title = mTitle[1].trim();
  }

  // Company
  let company = "";
  const mComp =
    mSlice.match(/data-testid=["']?company["']?[^>]*>([^<]+)<\/span>/i) ||
    mSlice.match(/data-testid=["']?jobHeaderCompanyLogo["']?[^>]*title=["']?([^"'>]+)["']?/i) ||
    mSlice.match(/title=["']?([^"'>]+)["']?[^>]*data-testid=["']?jobHeaderCompanyLogo["']?/i);
  if (mComp && isValidCompanyName(mComp[1])) {
    company = mComp[1].trim();
  }

  // Location
  let rawLoc: string | undefined;
  const mLoc = mSlice.match(/data-testid=["']?jobDetailLocation["']?[^>]*>([^<]+)/i);
  if (mLoc) {
    rawLoc = mLoc[1].trim();
  }
  const location = standardizeLocation(rawLoc);

  // Salary
  let salary: string | undefined;
  const mCompSal =
    mSlice.match(/data-testid=["']?(?:jobDetailSalary|svx-job-salary)["']?[^>]*>([\s\S]*?)<\/(?:li|div|span)>/i) ||
    mSlice.match(/Compensation:[^$]*(\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:-|–|to)\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:\/|\s*per\s*|\s*an\s*|\s*a\s*)(?:hr|hours?|yr|years?|month|week))?)/i);
  if (mCompSal) {
    const cleanSal = (mCompSal[1] || mCompSal[0]).replace(/<[^>]+>/g, " ").trim();
    const normalized = normalizeSalaryDisplay(cleanSal);
    if (normalized) salary = normalized;
  }

  // Description
  let rawDescHtml = "";
  const mDesc =
    html.match(/data-testid=["']?svx-description-container-inner["']?[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/id=["']?job-description["']?[^>]*>([\s\S]*?)<\/div>/i);
  if (mDesc) {
    rawDescHtml = mDesc[1];
  }

  if (!rawDescHtml) return null;

  const structured = parseStructuredJobSections(rawDescHtml);
  if (!isLegitimateJobContent(structured.coreMarkdown)) {
    return null;
  }

  const cleanedMeta = cleanTitleAndCompany(title, company);

  let applyUrl = url || undefined;
  const canonicalMatch =
    html.match(/<link\s+[^>]*rel=["']?canonical["']?[^>]*href=["']?([^"'\s>]+)/i) ||
    html.match(/<link\s+[^>]*href=["']?([^"'\s>]+)["']?[^>]*rel=["']?canonical["']?/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1].trim() : "";

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

  return {
    title: cleanedMeta.title || title || undefined,
    company: cleanedMeta.company || company || undefined,
    location,
    salary,
    description: structured.fullReconstructedMarkdown,
    coreDescription: structured.coreMarkdown,
    overviewSnippet: structured.overviewSnippet,
    sections: structured.sections,
    applyUrl,
  };
}

export const monsterExtractor: PlatformExtractor = {
  name: "Monster",
  matches(html: string, url: string): boolean {
    return /monster\.com/i.test(url) || html.includes("BigJobCardId") || html.includes("svx-split-view-job-panel");
  },
  extract(html: string, url: string): ScrapedJobPosting | null {
    return extractMonsterSemanticDom(html, url);
  },
};
