import type { ScrapedJobPosting } from "../schema.ssot";
import { parseStructuredJobSections, cleanTitleAndCompany } from "../section-classifier";
import { isLegitimateJobContent } from "../json-ld-parser";
import { standardizeLocation } from "@/lib/utils/location";
import type { PlatformExtractor } from "./types";

export function extractLeverSemanticDom(
  html: string,
  url: string = ""
): ScrapedJobPosting | null {
  if (!html || html.length < 250) return null;

  // Title
  let title = "";
  const headlineMatch =
    html.match(/class=["'][^"']*posting-headline[^"']*["'][\s\S]*?<h2[^>]*>([^<]+)<\/h2>/i) ||
    html.match(/<h2[^>]*class=["'][^"']*posting-headline[^"']*["'][^>]*>([^<]+)<\/h2>/i);
  if (headlineMatch) {
    title = headlineMatch[1].trim();
  }

  // Company
  let company = "";
  const logoMatch =
    html.match(/class=["'][^"']*main-header-logo[^"']*["'][\s\S]*?alt=["']([^"']+)["']/i) ||
    html.match(/alt=["']([^"']+)["'][^>]*class=["'][^"']*main-header-logo[^"']*["']/i);
  if (logoMatch && !/Lever/i.test(logoMatch[1])) {
    company = logoMatch[1].replace(/\s*logo$/i, "").trim();
  }

  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleTag = titleTagMatch ? titleTagMatch[1].trim() : "";
  if (!company && titleTag) {
    const parts = titleTag.split(/\s*-\s*/);
    if (parts.length >= 2) {
      company = parts[0].trim();
      if (!title) title = parts[1].trim();
    }
  }

  // Location
  let rawLoc: string | undefined;
  const locMatch =
    html.match(/class=["'][^"']*posting-categories[^"']*["'][\s\S]*?class=["'][^"']*location[^"']*["'][^>]*>([^<]+)<\/span>/i) ||
    html.match(/class=["'][^"']*workplaceTypes[^"']*["'][^>]*>([^<]+)<\/span>/i);
  if (locMatch) {
    rawLoc = locMatch[1].trim();
  }
  const location = standardizeLocation(rawLoc);

  // Logo
  let logoUrl: string | undefined;
  const imgMatch = html.match(/class=["'][^"']*main-header-logo[^"']*["'][\s\S]*?src=["']([^"']+)["']/i);
  if (imgMatch && /^https?:\/\//i.test(imgMatch[1])) {
    logoUrl = imgMatch[1];
  }

  // Description
  let rawDescHtml = "";
  const descMatch =
    html.match(/class=["'][^"']*section-page[^"']*["'][\s\S]*?<div[^>]*class=["'][^"']*content[^"']*["'][\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/i) ||
    html.match(/data-qa=["']?job-description["']?[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    rawDescHtml = descMatch[1];
  }

  if (!rawDescHtml) return null;

  const structured = parseStructuredJobSections(rawDescHtml);
  if (!isLegitimateJobContent(structured.coreMarkdown)) {
    return null;
  }

  const cleanedMeta = cleanTitleAndCompany(title, company);

  return {
    title: cleanedMeta.title || title || undefined,
    company: cleanedMeta.company || company || undefined,
    location,
    description: structured.fullReconstructedMarkdown,
    coreDescription: structured.coreMarkdown,
    overviewSnippet: structured.overviewSnippet,
    logoUrl,
    sections: structured.sections,
    applyUrl: url || undefined,
  };
}

export const leverExtractor: PlatformExtractor = {
  name: "Lever",
  matches(html: string, url: string): boolean {
    return /jobs\.lever\.co/i.test(url) || /posting-headline/i.test(html);
  },
  extract(html: string, url: string): ScrapedJobPosting | null {
    return extractLeverSemanticDom(html, url);
  },
};
