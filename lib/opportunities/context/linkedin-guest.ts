/**
 * Public unauthenticated LinkedIn guest scraping strategies.
 */

import { assertSafeHttpsUrl } from "@/lib/core/ssrf";
import type { ScrapedJobPosting } from "./context.schema";
import { extractLinkedInJobId } from "./url-unwrapper";
import {
  extractJsonLdJobPosting,
  isLegitimateJobContent,
} from "./json-ld-parser";
import { extractJobFromSemanticDom } from "./dom-extractor";
import { parseStructuredJobSections } from "./section-classifier";

/**
 * Fetches LinkedIn job posting details using a 2-tier fallback strategy:
 * Tier 1: Public unauthenticated jobs-guest API endpoint (/jobs-guest/jobs/api/jobPosting/{id}).
 * Tier 2: Public job view URL with Googlebot User-Agent extracting Schema.org JSON-LD or Semantic DOM.
 * Never routes to external proxies.
 */
export async function fetchLinkedInGuestPosting(
  url: string,
  timeoutMs: number = 3000
): Promise<ScrapedJobPosting | null> {
  const jobId = extractLinkedInJobId(url);
  if (!jobId) return null;

  // Tier 1: Public unauthenticated jobs-guest API
  try {
    const linkedInGuestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
    const validatedUrl = await assertSafeHttpsUrl(linkedInGuestUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(validatedUrl.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      const html = await res.text();

      // 1. Check LinkedIn guest markup directly
      const markupMatch = html.match(
        /<div[^>]*class=["'][^"']*show-more-less-html__markup[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
      );
      if (markupMatch && markupMatch[1]) {
        const structured = parseStructuredJobSections(markupMatch[1]);
        const text = structured.coreMarkdown || markupMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (isLegitimateJobContent(text)) {
          const parsedJsonLd = extractJsonLdJobPosting(html);
          const domData = extractJobFromSemanticDom(html, url);
          return {
            ...(parsedJsonLd ?? {}),
            ...(domData ?? {}),
            description: structured.fullReconstructedMarkdown || text,
            coreDescription: structured.coreMarkdown || text,
            overviewSnippet: structured.overviewSnippet,
            applyUrl: `https://www.linkedin.com/jobs/view/${jobId}`,
            logoUrl: parsedJsonLd?.logoUrl || domData?.logoUrl,
          };
        }
      }

      // 2. Check JSON-LD in guest response
      const parsedJsonLd = extractJsonLdJobPosting(html);
      const domData = extractJobFromSemanticDom(html, url);
      if (parsedJsonLd?.description && isLegitimateJobContent(parsedJsonLd.coreDescription || parsedJsonLd.description)) {
        return {
          ...parsedJsonLd,
          ...(domData ?? {}),
          applyUrl: `https://www.linkedin.com/jobs/view/${jobId}`,
          logoUrl: parsedJsonLd.logoUrl || domData?.logoUrl,
        };
      }

      // 3. Check Semantic DOM in guest response
      if (domData?.description && isLegitimateJobContent(domData.coreDescription || domData.description)) {
        return {
          ...(parsedJsonLd ?? {}),
          ...domData,
          applyUrl: `https://www.linkedin.com/jobs/view/${jobId}`,
          logoUrl: parsedJsonLd?.logoUrl || domData.logoUrl,
        };
      }
    }
  } catch {
    // Soft failure on Tier 1; fall through to Tier 2 Googlebot fallback
  }

  // Tier 2: Public job view URL with Googlebot User-Agent & Schema.org JSON-LD extraction
  try {
    const directViewUrl = `https://www.linkedin.com/jobs/view/${jobId}`;
    const validatedUrl = await assertSafeHttpsUrl(directViewUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(validatedUrl.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      const html = await res.text();
      const parsedJsonLd = extractJsonLdJobPosting(html);
      const domData = extractJobFromSemanticDom(html, url);
      if (parsedJsonLd?.description && isLegitimateJobContent(parsedJsonLd.coreDescription || parsedJsonLd.description)) {
        return {
          ...parsedJsonLd,
          ...(domData ?? {}),
          applyUrl: url,
          logoUrl: parsedJsonLd.logoUrl || domData?.logoUrl,
        };
      }

      if (domData?.description && isLegitimateJobContent(domData.coreDescription || domData.description)) {
        return {
          ...(parsedJsonLd ?? {}),
          ...domData,
          applyUrl: url,
          logoUrl: parsedJsonLd?.logoUrl || domData.logoUrl,
        };
      }
    }
  } catch {
    // Both tiers exhausted
  }

  return null;
}
