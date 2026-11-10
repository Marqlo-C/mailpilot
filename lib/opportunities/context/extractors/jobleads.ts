import type { ScrapedJobPosting } from "../context.schema";
import { parseStructuredJobSections, cleanTitleAndCompany, isValidCompanyName } from "../section-classifier";
import { isLegitimateJobContent } from "../json-ld-parser";
import { normalizeSalaryDisplay } from "@/lib/ai/classifier";
import { standardizeLocation } from "@/lib/utils/location";
import type { PlatformExtractor } from "./types";

export function extractJobleadsSemanticDom(
  html: string,
  url: string = ""
): ScrapedJobPosting | null {
  if (!html || html.length < 250) return null;

  // Title
  let title = "";
  const jlTitle =
    html.match(/class=["'][^"']*job-preview__heading[^"']*["'][^>]*>([^<]+)<\/h\d>/i) ||
    html.match(/data-testid=["']?job-preview-title["']?[^>]*>([^<]+)<\/h\d>/i) ||
    html.match(/data-active=["']?true["']?[\s\S]*?data-testid=["']?search-job-card-link["']?[^>]*>([^<]+)<\/a>/i);
  if (jlTitle) {
    title = jlTitle[1].trim();
  }

  // Company
  let company = "";
  const jlCompMatch =
    html.match(/data-testid=["']?job-preview-company-name["']?[^>]*>([^<]+)<\/span>/i) ||
    html.match(/<meta[^>]+name=["']?description["']?[^>]+content=["']([^"']+?)\s+(?:is\s+hiring|hiring)/i);
  if (jlCompMatch && isValidCompanyName(jlCompMatch[1])) {
    company = jlCompMatch[1].trim();
  }

  // Location
  let rawLoc: string | undefined;
  const jlLocMatch =
    html.match(/data-testid=["']?job-card-chip-location["']?[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["'][^"']*\sin\s+([A-Za-z\s.-]+(?:\s*\([A-Z]{2}\))?)\./i);
  if (jlLocMatch) {
    rawLoc = jlLocMatch[1].replace(/<[^>]+>/g, " ").trim();
  }
  const location = standardizeLocation(rawLoc);

  // Salary
  let salary: string | undefined;
  const jlSalMatch = html.match(/data-testid=["']?job-card-chip-salary["']?[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  if (jlSalMatch) {
    salary = normalizeSalaryDisplay(jlSalMatch[1].replace(/<[^>]+>/g, " ").trim()) ?? jlSalMatch[1].replace(/<[^>]+>/g, " ").trim();
  }

  // Description
  let rawDescHtml = "";
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
    const jlDesc =
      html.match(/class=["'][^"']*job-content-scrollable[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/class=["'][^"']*job-preview2024[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (jlDesc) rawDescHtml = jlDesc[1];
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

export const jobleadsExtractor: PlatformExtractor = {
  name: "JobLeads",
  matches(html: string, url: string): boolean {
    return /jobleads\.com/i.test(url + html);
  },
  extract(html: string, url: string): ScrapedJobPosting | null {
    return extractJobleadsSemanticDom(html, url);
  },
};
