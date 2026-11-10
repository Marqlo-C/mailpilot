import type { ScrapedJobPosting } from "../schema.ssot";
import { parseStructuredJobSections, cleanTitleAndCompany } from "../section-classifier";
import { isLegitimateJobContent } from "../json-ld-parser";
import { standardizeLocation } from "@/lib/utils/location";
import type { PlatformExtractor } from "./types";

export function extractGreenhouseSemanticDom(
  html: string,
  url: string = ""
): ScrapedJobPosting | null {
  if (!html || html.length < 250) return null;

  // Title
  let title = "";
  const h1Match = html.match(/<h1[^>]*class=["']?[^"'>]*app-title[^"'>]*["']?[^>]*>([^<]+)<\/h1>/i) ||
                  html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) {
    title = h1Match[1].trim();
  }

  // Company
  let company = "";
  const ghComp =
    html.match(/class=["']?application-form-header--company-name["']?[^>]*>([^<]+)<\/h3>/i) ||
    html.match(/class=["']?company-logo__logo["']?[^>]*alt=["']([^"']+)["']/i) ||
    html.match(/alt=["']([^"']+)["'][^>]*class=["']?company-logo__logo["']/i);
  if (ghComp && !/Greenhouse/i.test(ghComp[1])) {
    company = ghComp[1].trim();
  }
  if (!company) {
    const h3Comp = html.match(/<h3[^>]*>([A-Za-z0-9&.,' -]+?)<\/h3>/i);
    if (h3Comp && !/Greenhouse|Apply|Application/i.test(h3Comp[1])) {
      company = h3Comp[1].trim();
    }
  }

  // Location
  let rawLoc: string | undefined;
  const ghLoc = html.match(
    /(?:data-slot=["']?dialog-content["']?|role=["']?dialog["']?)[\s\S]*?<span[^>]*class=["'][^"']*tag-text[^"']*["'][^>]*>([A-Za-z\s.-]+,\s*[A-Z]{2})<\/span>/i
  ) || html.match(/class=["'][^"']*location[^"']*["'][^>]*>([^<]+)<\/div>/i);
  if (ghLoc) {
    rawLoc = ghLoc[1].trim();
  }
  const location = standardizeLocation(rawLoc);

  // Logo
  let logoUrl: string | undefined;
  const logoMatch = html.match(/<img[^>]*class=["']?[^"'>]*logo[^"'>]*["']?[^>]*src=["']([^"']+)["']/i);
  if (logoMatch && /^https?:\/\//i.test(logoMatch[1])) {
    logoUrl = logoMatch[1];
  }

  // Description
  let rawDescHtml = "";
  const ghDesc =
    html.match(/<div[^>]*class=["']?[^"'>]*rich-text[^"'>]*["']?[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/id=["']?content["']?[^>]*>([\s\S]*?)<\/div>/i);
  if (ghDesc) {
    rawDescHtml = ghDesc[1];
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

export const greenhouseExtractor: PlatformExtractor = {
  name: "Greenhouse",
  matches(html: string, url: string): boolean {
    return /greenhouse\.io|boards\.greenhouse/i.test(url) || /application-form-header--company-name/i.test(html);
  },
  extract(html: string, url: string): ScrapedJobPosting | null {
    return extractGreenhouseSemanticDom(html, url);
  },
};
