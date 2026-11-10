import type { ScrapedJobPosting } from "../schema.ssot";
import {
  parseStructuredJobSections,
  isValidCompanyName,
} from "../section-classifier";
import { normalizeSalaryDisplay, extractSalaryFromText } from "@/lib/ai/classifier";
import { standardizeLocation } from "@/lib/utils/location";
import type { PlatformExtractor } from "./types";

/**
 * Dedicated semantic DOM extractor for Indeed postings
 * (single-pane /viewjob, dual-pane SERP #jobsearch-ViewjobPaneWrapper, and company /cmp/ layouts).
 * Isolated completely so changes to Indeed do not affect any other platforms.
 */
export function extractIndeedSemanticDom(
  html: string,
  url: string = ""
): ScrapedJobPosting | null {
  if (!html || html.length < 250) return null;

  // 1. Title
  let title = "";
  const indPaneMatch =
    html.match(/id=["']?jobsearch-ViewjobPaneWrapper["']?[\s\S]*?data-testid=["']?vj-job-title["']?[^>]*>([^<]+)<\/h2>/i) ||
    html.match(/data-testid=["']?vj-job-title["']?[^>]*>([^<]+)</i) ||
    html.match(/data-testid=["']?jobDetailTitle["']?[^>]*><h\d[^>]*>([^<]+)<\/h\d>/i) ||
    html.match(/data-testid=["']?jobDetailTitle["']?[^>]*>([^<]+)</i) ||
    html.match(/data-testid=["']?jobsearch-JobInfoHeader-title["']?[^>]*>([^<]+)</i) ||
    html.match(/class=["']?jobsearch-JobInfoHeader-title["']?[^>]*>([^<]+)</i);
  if (indPaneMatch) {
    const candidate = indPaneMatch[1].replace(/&amp;/g, "&").trim();
    if (!/\$|\/Hr|\/yr|\b(?:an?\s*hour|a\s*year|full-time|part-time)\b/i.test(candidate)) {
      title = candidate;
    }
  }

  if (!title) {
    const indActiveTitle =
      html.match(/aria-pressed=true[^>]*>[\s\S]*?<span[^>]*title=["']([^"']+)["']/i) ||
      html.match(/id=["']?jobTitle-[^"'>\s]+["']?[^>]*>([^<]+)<\/span>/i);
    if (indActiveTitle) {
      const candidate = (indActiveTitle[1] || indActiveTitle[2] || "").trim();
      if (!/\$|\/Hr|\/yr|\b(?:an?\s*hour|a\s*year)\b/i.test(candidate)) {
        title = candidate;
      }
    }
  }

  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleTag = titleTagMatch ? titleTagMatch[1].trim() : "";

  if (!title && titleTag) {
    const cleanedTitleTag = titleTag
      .replace(/\s*-\s*[A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?\s*-\s*Indeed\.com$/i, "")
      .replace(/\s*\|\s*Indeed\.com$/i, "")
      .replace(/\s*-\s*Indeed\.com$/i, "")
      .trim();
    if (cleanedTitleTag && !/jobs?|search/i.test(cleanedTitleTag) && !/\$|\/Hr|\/yr/i.test(cleanedTitleTag)) {
      title = cleanedTitleTag;
    }
  }

  // 2. Company
  let company = "";
  const cmpSubtitle = html.match(/data-testid=["']?jobDetailSubtitle["']?[^>]*>([\s\S]*?)<\/div>/i);
  if (cmpSubtitle) {
    const cleanSub = cmpSubtitle[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").trim();
    const parts = cleanSub.split(/\s*-\s*/);
    if (parts.length >= 2 && isValidCompanyName(parts[0])) {
      company = parts[0].trim();
    } else if (isValidCompanyName(cleanSub)) {
      company = cleanSub;
    }
  }

  if (!company) {
    const metaCo =
      html.match(/data-testid=["']?inlineHeader-companyName["']?[^>]*>(?:<a[^>]*>)?([^<]+)/i) ||
      html.match(/data-testid=["']?company-info-metadata["']?[\s\S]{0,500}?<a[^>]*>([^<]+)<\/a>/i);
    if (metaCo && isValidCompanyName(metaCo[1])) {
      company = metaCo[1].replace(/&amp;/g, "&").trim();
    }
  }

  if (!company) {
    const cmpLink =
      html.match(/<a\s+[^>]*href=["'](?:https:\/\/(?:www\.)?indeed\.com)?\/cmp\/[^"']+["'][^>]*aria-label=["']([^"'(]+?)(?:\s*\(opens in a new tab\))?["']/i) ||
      html.match(/<a\s+[^>]*aria-label=["']([^"'(]+?)(?:\s*\(opens in a new tab\))?["'][^>]*href=["'](?:https:\/\/(?:www\.)?indeed\.com)?\/cmp\/[^"']+["']/i) ||
      html.match(/<a\s+[^>]*href=["'](?:https:\/\/(?:www\.)?indeed\.com)?\/cmp\/[^"']+["'][^>]*>([^<]+)<\/a>/i);
    if (cmpLink && isValidCompanyName(cmpLink[1])) {
      company = cmpLink[1].replace(/&amp;/g, "&").trim();
    }
  }

  if (!company) {
    const bannerAlt =
      html.match(/<img\s+[^>]*alt=["']([^"']+?)\s+logo["'][^>]*data-testid=["']?(?:company-banner|company-logo)["']?/i) ||
      html.match(/data-testid=["']?(?:company-banner-wrapper|company-logo-shadow)["']?[\s\S]{0,400}?<img\s+[^>]*alt=["']([^"']+?)\s+logo["']/i);
    if (bannerAlt && isValidCompanyName(bannerAlt[1])) {
      company = bannerAlt[1].replace(/&amp;/g, "&").trim();
    }
  }

  if (!company) {
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const script of jsonLdMatch) {
        try {
          const content = script.replace(/<script[^>]*>|<\/script>/gi, "").trim();
          const parsed = JSON.parse(content);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const it of items) {
            if ((it["@type"] === "LocalBusiness" || it["@type"] === "Organization") && typeof it.name === "string") {
              if (isValidCompanyName(it.name)) {
                company = it.name.trim();
                break;
              }
            }
          }
        } catch {}
      }
    }
  }

  if (!company && titleTag) {
    const m = titleTag.match(/^([A-Za-z0-9&.,' -]+?)\s+Jobs\s+in\s+/i);
    if (m && isValidCompanyName(m[1])) {
      company = m[1].trim();
    }
  }

  // 3. Location
  let location: string | undefined;
  if (cmpSubtitle) {
    const cleanSub = cmpSubtitle[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").trim();
    const parts = cleanSub.split(/\s*-\s*/);
    if (parts.length >= 2) {
      const locPart = parts.slice(1).join(" - ").trim();
      location = standardizeLocation(locPart) || locPart;
    }
  }

  if (!location && titleTag) {
    const titleWithoutIndeed = titleTag.replace(/\s*-\s*Indeed\.com$/i, "").trim();
    const titleParts = titleWithoutIndeed.split(/\s*-\s*/);
    const lastPart = titleParts[titleParts.length - 1]?.trim();
    if (lastPart && lastPart !== title && !/jobs?|search/i.test(lastPart)) {
      const std = standardizeLocation(lastPart);
      if (std) location = std;
    }
  }

  if (!location) {
    const metaMatch = html.match(/data-testid=["']?company-info-metadata["']?([\s\S]*?)<\/div>\s*<\/div>/i);
    if (metaMatch) {
      const cleanedMeta = metaMatch[1].replace(/<a\b[\s\S]*?<\/a>/gi, " ");
      const isRemote = /remote|work from home|wfh/i.test(cleanedMeta);
      const stateMatch =
        cleanedMeta.match(/>([A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5})?)</i) ||
        cleanedMeta.match(/>([A-Za-z\s.'-]+)</i);
      if (stateMatch) {
        const candidate = stateMatch[1].replace(/<[^>]+>/g, " ").trim();
        if (candidate && candidate !== "·" && !/^\d+\.\d+$/.test(candidate)) {
          const std = standardizeLocation(candidate);
          if (std && (!company || (std.toLowerCase() !== company.toLowerCase() && !std.toLowerCase().includes(company.toLowerCase())))) {
            location = isRemote && !std.includes("Remote") ? `${std} (Remote)` : std;
          }
        }
      }
    }
  }

  if (!location) {
    const locMatch =
      html.match(/>(Remote\s+in\s+[A-Za-z\s.'-]+,\s*[A-Z]{2})</i) ||
      html.match(/>([A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5})?)\s*[•·]?\s*(?:Remote)?</i) ||
      html.match(/data-testid=["']?(?:inlineHeader-companyLocation|jobsearch-JobInfoHeader-companyLocation)["']?[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class=["'][^"']*css-146c3p1[^"']*["'][^>]*>([A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5})?)<\/div>/i);
    if (locMatch) {
      const locText = locMatch[1].replace(/<[^>]+>/g, " ").trim();
      if (!company || locText.toLowerCase() !== company.toLowerCase()) {
        const dotIdx = locText.search(/·|•/i);
        const cityPart = dotIdx !== -1 ? locText.slice(0, dotIdx).trim() : locText;
        const std = standardizeLocation(cityPart || locText);
        location = std || locText;
      }
    }
  }

  if (location && company && (location.toLowerCase() === company.toLowerCase() || location === company)) {
    location = undefined;
  }

  // 4. Salary
  let salary: string | undefined;
  const indCmpPay =
    html.match(/data-testid=["']?jobDetailSubtitle["']?[\s\S]{0,400}?<span[^>]*>(?:From\s+)?(\$[\d,.]+(?:\s*(?:-|to)\s*\$[\d,.]+)?\s*an\s*hour)<\/span>/i) ||
    html.match(/<span[^>]*class=["'][^"']*(?:css-1o18umh|css-zydy3i)[^"']*["'][^>]*>(?:From\s+)?(\$[\d,.]+(?:\s*(?:-|to)\s*\$[\d,.]+)?\s*an\s*hour)<\/span>/i);
  if (indCmpPay) {
    salary = normalizeSalaryDisplay(indCmpPay[1]) || indCmpPay[1];
  }

  if (!salary) {
    const indSal =
      html.match(/data-testid=["']?jobsearch-JobInfoHeader-salary["']?[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class=["'][^"']*css-146c3p1[^"']*["'][^>]*>(?:From\s+)?(\$[\d,.]+(?:\s*(?:-|to)\s*\$[\d,.]+)?\s*(?:an?\s*(?:hour|yr|year|month))?)<\/div>/i) ||
      html.match(/id=["']?salaryInfoAndJobType["']?[^>]*>([\s\S]*?)<\/div>/i);
    if (indSal) {
      const cleanSal = indSal[1].replace(/<[^>]+>/g, " ").trim();
      salary = normalizeSalaryDisplay(cleanSal) || extractSalaryFromText(cleanSal) || undefined;
    }
  }

  // 5. Logo
  let logoUrl: string | undefined;
  const jsonLdLogoMatch = html.match(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdLogoMatch) {
    for (const script of jsonLdLogoMatch) {
      try {
        const content = script.replace(/<script[^>]*>|<\/script>/gi, "").trim();
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          if ((it["@type"] === "LocalBusiness" || it["@type"] === "Organization") && typeof it.image === "string") {
            logoUrl = it.image.trim();
            break;
          }
        }
      } catch {}
      if (logoUrl) break;
    }
  }

  if (!logoUrl) {
    const indLogo =
      html.match(/data-testid=["']?company-logo["']?[^>]*src=["']([^"']+)["']/i) ||
      html.match(/data-testid=["']?(?:company-logo|company-logo-shadow)["']?[\s\S]{0,400}?background-image:\s*url\(["']?([^"')]+)["']?\)/i) ||
      html.match(/src=["'](https:\/\/[^"']*cloudfront\.net\/s\/_squarelogo\/[^"']+)["']/i) ||
      html.match(/src=["'](https:\/\/[^"']*images\.indeed\.com\/[^"']+)["']/i);
    if (indLogo) {
      logoUrl = indLogo[1].trim();
    }
  }

  // 6. Description
  let rawDescHtml = "";
  const cmpDesc = html.match(/data-testid=["']?jobDetailDescription["']?[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i) ||
                  html.match(/data-testid=["']?jobDetailDescription["']?[^>]*>([\s\S]*?)<\/div>/i);
  if (cmpDesc) {
    rawDescHtml = cmpDesc[1].trim();
  } else {
    const indDescMatch =
      html.match(/(<div[^>]*class=["'][^"']*simple-job-description-html[^"']*["'][\s\S]*)/i) ||
      html.match(/(<div[^>]*id=["']?jobDescriptionText["']?[\s\S]*)/i);
    if (indDescMatch) {
      let descChunk = indDescMatch[1];
      const endMarker = descChunk.search(/class=["'][^"']*jobsearch-JobDescriptionSection-section--seenMerge/i);
      if (endMarker !== -1) {
        descChunk = descChunk.slice(0, endMarker);
      }
      const expIdx = descChunk.search(/(?:id=["']?jobDescriptionSeen["']|<div[^>]*class=["'][^"']*css-1tbyf4m|Explore other jobs)/i);
      if (expIdx !== -1) {
        descChunk = descChunk.slice(0, expIdx);
      }
      rawDescHtml = descChunk.trim();
    }
  }

  const structured = parseStructuredJobSections(rawDescHtml);
  let finalDescription = structured.fullReconstructedMarkdown || rawDescHtml.replace(/<[^>]+>/g, " ").trim();

  if (!salary && finalDescription) {
    salary = extractSalaryFromText(finalDescription) || undefined;
  }

  // 7. Apply URL
  let applyUrl = url;
  const jkMatch = url.match(/[?&](?:vjk|jk)=([a-zA-Z0-9_-]+)/i);
  if (jkMatch) {
    applyUrl = `https://www.indeed.com/viewjob?jk=${jkMatch[1]}`;
  } else {
    const canonicalMatch =
      html.match(/<link\s+[^>]*rel=["']?canonical["']?[^>]*href=["']?([^"'\s>]+)/i) ||
      html.match(/<link\s+[^>]*href=["']?([^"'\s>]+)["']?[^>]*rel=["']?canonical["']?/i);
    if (canonicalMatch && /indeed\.com/i.test(canonicalMatch[1])) {
      applyUrl = canonicalMatch[1].trim();
    }
  }

  return {
    title: title || "Job Opportunity",
    company: company || "Company",
    location,
    salary,
    description: finalDescription,
    applyUrl,
    logoUrl,
  };
}

export const indeedExtractor: PlatformExtractor = {
  name: "Indeed",
  matches(html: string, url: string): boolean {
    return (
      /indeed\.com/i.test(url) ||
      /data-testid=["']?(?:vj-job-title|jobDetailTitle|jobsearch-CompanyAvatarImage|jobsearch-ViewjobPaneWrapper)/i.test(html) ||
      /id=["']?jobsearch-ViewjobPaneWrapper["']?/i.test(html) ||
      /<title[^>]*>.*?Indeed.*?<\/title>/i.test(html)
    );
  },
  extract(html: string, url: string): ScrapedJobPosting | null {
    return extractIndeedSemanticDom(html, url);
  },
};
