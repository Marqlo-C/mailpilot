/**
 * ============================================================================
 * LINK PARSER ENRICHMENT: SCHEMA.ORG JSON-LD EXTRACTOR
 * 
 * Extracts structured JobPosting metadata from public web URLs to hydrate
 * thin email digest listings (< 300 characters).
 * ============================================================================
 */

import { assertSafeHttpsUrl } from "@/lib/ssrf";

export interface ScrapedJobPosting {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  description?: string;
  applyUrl?: string;
  datePosted?: string;
}

export interface ScrapedJobPostingResult {
  data: ScrapedJobPosting | null;
  telemetry: string;
}

function safeDecodeUrl(val: string): string | null {
  try {
    let current = val.trim();
    if (!current) return null;

    if (current.startsWith("//")) {
      current = "https:" + current;
    }

    // Up to 5 decode passes to unroll multi-level percent encoding (e.g. tgt=https%253A...)
    for (let i = 0; i < 5; i++) {
      if (/^https?:\/\//i.test(current)) {
        return current.replace(/^http:\/\//i, "https://");
      }
      try {
        const decoded = decodeURIComponent(current);
        if (decoded === current) break;
        current = decoded.trim();
        if (current.startsWith("//")) {
          current = "https:" + current;
        }
      } catch {
        break;
      }
    }

    if (/^https?:\/\//i.test(current)) {
      return current.replace(/^http:\/\//i, "https://");
    }
  } catch {}
  return null;
}

/**
 * Unpacks destination target URLs from aggregator or tracking redirects.
 * Handles parameters like tgt, dest, url, target, redirect, r, out, link, to, etc.
 * and recursive redirects, upgrading any http:// targets to https://.
 */
export function unwrapTrackingUrl(urlString: string, maxDepth: number = 5): string {
  if (!urlString) return urlString;
  let normalized = urlString.trim();
  if (/^http:\/\//i.test(normalized)) {
    normalized = normalized.replace(/^http:\/\//i, "https://");
  }

  if (maxDepth <= 0) return normalized;

  try {
    const parsed = new URL(normalized);

    // Direct Glassdoor partner listing redirect bypass:
    // e.g. glassdoor.com/partner/jobListing.htm?...jobListingId=12345 -> https://www.glassdoor.com/job-listing/?jl=12345
    if (parsed.hostname.includes("glassdoor.com") && parsed.pathname.includes("jobListing.htm")) {
      const jlId = parsed.searchParams.get("jobListingId") || parsed.searchParams.get("jl");
      if (jlId && /^\d+$/.test(jlId)) {
        return `https://www.glassdoor.com/job-listing/?jl=${jlId}`;
      }
      const match = normalized.match(/jobListingId[=%](\d+)/i);
      if (match && match[1]) {
        return `https://www.glassdoor.com/job-listing/?jl=${match[1]}`;
      }
    }

    // Direct LinkedIn job listing normalization:
    // e.g. linkedin.com/comm/jobs/view/123?trk=... or currentJobId=123 -> https://www.linkedin.com/jobs/view/123
    if (parsed.hostname.includes("linkedin.com")) {
      const match =
        normalized.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i) ||
        normalized.match(/[?&]currentJobId=(\d+)/i);
      if (match && match[1]) {
        return `https://www.linkedin.com/jobs/view/${match[1]}`;
      }
    }

    // 1. Check known priority parameters
    const priorityParams = [
      "tgt",
      "dest",
      "url",
      "target",
      "redirect",
      "r",
      "out",
      "link",
      "to",
      "redirect_url",
      "redirect_uri",
      "destination",
      "dest_url",
      "destUrl",
      "target_url",
      "targetUrl",
      "next",
      "u",
    ];

    for (const key of priorityParams) {
      const val = parsed.searchParams.get(key);
      if (val) {
        const decoded = safeDecodeUrl(val);
        if (decoded && decoded !== normalized) {
          return unwrapTrackingUrl(decoded, maxDepth - 1);
        }
      }
    }

    // 2. Check hash fragments (e.g. #tgt=https%3A%2F%2F...)
    if (parsed.hash && parsed.hash.includes("=")) {
      const hashQuery = parsed.hash.replace(/^#\/?/, "");
      const hashParams = new URLSearchParams(hashQuery);
      for (const key of priorityParams) {
        const val = hashParams.get(key);
        if (val) {
          const decoded = safeDecodeUrl(val);
          if (decoded && decoded !== normalized) {
            return unwrapTrackingUrl(decoded, maxDepth - 1);
          }
        }
      }
    }

    // 3. Scan all searchParams for any embedded http(s) URL
    for (const [, val] of parsed.searchParams.entries()) {
      if (
        val &&
        (val.includes("http%3A") ||
          val.includes("https%3A") ||
          val.includes("http%253A") ||
          val.includes("https%253A") ||
          val.startsWith("http://") ||
          val.startsWith("https://"))
      ) {
        const decoded = safeDecodeUrl(val);
        if (decoded && decoded !== normalized) {
          return unwrapTrackingUrl(decoded, maxDepth - 1);
        }
      }
    }

    // 4. Pathname regex for embedded destination URLs (e.g. /redirect/https://...)
    const pathMatch = parsed.pathname.match(/(https?[:%].*)/i);
    if (pathMatch && pathMatch[1]) {
      const decoded = safeDecodeUrl(pathMatch[1]);
      if (decoded && decoded !== normalized) {
        return unwrapTrackingUrl(decoded, maxDepth - 1);
      }
    }
  } catch {
    // If not a parseable URL, return normalized
  }

  return normalized;
}

/**
 * Parses Schema.org JobPosting JSON-LD blocks out of HTML content.
 */
export function extractJsonLdJobPosting(html: string): ScrapedJobPosting | null {
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"] && Array.isArray(parsed["@graph"])
        ? parsed["@graph"]
        : [parsed];

      for (const item of items) {
        if (
          item &&
          (item["@type"] === "JobPosting" ||
            (Array.isArray(item["@type"]) && item["@type"].includes("JobPosting")))
        ) {
          const title =
            typeof item.title === "string" ? item.title.trim() : undefined;
          const company =
            typeof item.hiringOrganization?.name === "string"
              ? item.hiringOrganization.name.trim()
              : undefined;

          let location: string | undefined;
          if (
            item.jobLocationType === "TELECOMMUTE" ||
            item.applicantLocationRequirements
          ) {
            location = "Remote";
          } else if (item.jobLocation?.address) {
            const addr = item.jobLocation.address;
            const locality = addr.addressLocality || "";
            const region = addr.addressRegion || "";
            if (locality && region) location = `${locality}, ${region}`;
            else if (locality) location = locality;
          }

          let salary: string | undefined;
          if (item.baseSalary?.value) {
            const val = item.baseSalary.value;
            if (val.minValue && val.maxValue) {
              salary = `$${val.minValue} - $${val.maxValue}`;
            } else if (val.value) {
              salary = `$${val.value}`;
            }
          }

          let description: string | undefined;
          if (typeof item.description === "string") {
            description = item.description
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          }

          const applyUrl =
            typeof item.url === "string" ? item.url : undefined;
          const datePosted =
            typeof item.datePosted === "string" ? item.datePosted : undefined;

          return {
            title,
            company,
            location,
            salary,
            description,
            applyUrl,
            datePosted,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

export interface JinaReaderResponse {
  text: string | null;
  error?: string;
}

/**
 * Fetches Markdown/text content via the public Jina Reader endpoint (r.jina.ai).
 * Uses public free tier (20 RPM) by default, or passes Bearer auth if user configured BYOK.
 * Uses 12000ms timeout to allow Jina to complete proxy challenge resolution.
 */
export async function fetchViaJinaReader(
  targetUrl: string,
  apiKey?: string | null,
  timeoutMs = 12000
): Promise<JinaReaderResponse> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Accept: "text/plain",
      "X-No-Cache": "true",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = `HTTP ${res.status}`;
      console.warn(`[jina] Failed to fetch ${targetUrl}: ${err}`);
      return { text: null, error: err };
    }
    const text = await res.text();
    return { text, error: undefined };
  } catch (err: unknown) {
    const isTimeout =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name?: string }).name === "AbortError");
    const errorMsg = isTimeout
      ? `Timeout > ${timeoutMs}ms`
      : (err as Error)?.message || "Network Error";
    console.warn(`[jina] Error fetching ${targetUrl}: ${errorMsg}`);
    return { text: null, error: errorMsg };
  }
}

/**
 * Sanitizes markdown returned from Jina Reader:
 * Strips metadata prefixes, Cloudflare challenge signatures, navigation links,
 * and clamps to 4,000 characters.
 */
export function sanitizeJinaMarkdown(raw: string): string {
  if (!raw) return "";

  const hasChallengeSignature =
    /just a moment\.\.\./i.test(raw) ||
    /enable javascript/i.test(raw) ||
    /cloudflare ray id/i.test(raw) ||
    /verify you are human/i.test(raw) ||
    /attention required!\s*\|\s*cloudflare/i.test(raw) ||
    /checking your browser/i.test(raw);

  let cleaned = raw
    .replace(/^Title:.*$/gm, "")
    .replace(/^URL Source:.*$/gm, "")
    .replace(/^Markdown Content:.*$/gm, "")
    .replace(
      /.*(?:just a moment\.\.\.|enable javascript and cookies|cloudflare ray id|attention required!\s*\|\s*cloudflare|verify you are human).*/gi,
      ""
    )
    .replace(/\[(?:Apply|View|Sign In|Cookie Policy)[^\]]*\]\([^)]+\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // If the payload was primarily a bot wall challenge, discard
  if (hasChallengeSignature && cleaned.length < 300) {
    return "";
  }

  return cleaned.slice(0, 4000);
}

/**
 * Detects LinkedIn job URLs and maps them to the public unauthenticated
 * jobs-guest API endpoint, bypassing login walls.
 */
export function transformToLinkedInGuestUrl(urlString: string): string | null {
  if (!urlString) return null;
  const match =
    urlString.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i) ||
    urlString.match(/currentJobId=(\d+)/i);
  if (match && match[1]) {
    return `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${match[1]}`;
  }
  return null;
}

/**
 * Structural/semantic validator for job posting content.
 * Discards auth-walled, login-redirected, or bot-challenge pages without brittle string matches.
 */
export function isLegitimateJobContent(text: string): boolean {
  if (!text || text.trim().length < 250) return false;

  // Check for presence of common job posting structural markers across disciplines
  const jobStructureMarkers = [
    /\b(?:responsibilities|qualifications|requirements|experience|skills|duties|what you('ll| will) do|about the (?:role|position)|about us)\b/i,
    /\b(?:bachelor|master|degree|years of|salary|benefits|compensation|equal opportunity)\b/i,
  ];

  const hasJobMarkers = jobStructureMarkers.some((regex) => regex.test(text));

  // Check for auth wall / bot challenge markers
  const authMarkers = [
    /\b(?:sign in|log in|login|continue with apple|passkey|enter your email|forgot password)\b/i,
    /\b(?:verify you are human|security check|cloudflare|attention required|enable cookies)\b/i,
  ];

  const authCount = authMarkers.filter((regex) => regex.test(text)).length;

  // If heavy auth language and no job structure, it's a blocked page
  if (authCount >= 2 && !hasJobMarkers) return false;
  if (!hasJobMarkers) return false;

  return true;
}

/**
 * Public JSON-LD scraper: fetches public job page and extracts JobPosting LD+JSON.
 * For LinkedIn URLs, bypasses auth walls via public jobs-guest API endpoint.
 * If direct fetch hits a bot challenge (HTTP 403/429) or returns without JSON-LD,
 * falls back to Jina Reader (free 20 RPM or account BYOK key).
 * Discards auth-walled or bot-challenged pages via structural validation.
 */
export async function scrapeJobPostingJsonLd(
  rawUrl: string,
  timeoutMs: number = 2500,
  jinaApiKey?: string | null
): Promise<ScrapedJobPostingResult> {
  const url = unwrapTrackingUrl(rawUrl);
  const linkedInGuestUrl = transformToLinkedInGuestUrl(url);
  const fetchUrl = linkedInGuestUrl ?? url;
  const authLabel = jinaApiKey ? "BYOK Key" : "Public Free Tier";

  try {
    const validatedUrl = await assertSafeHttpsUrl(fetchUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(validatedUrl.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    let parsed: ScrapedJobPosting | null = null;
    if (res.ok) {
      const html = await res.text();

      // Specialized LinkedIn Guest API handling
      if (linkedInGuestUrl) {
        let text = "";
        const markupMatch = html.match(
          /<div[^>]*class=["'][^"']*show-more-less-html__markup[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
        );
        if (markupMatch && markupMatch[1]) {
          text = markupMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        } else {
          const cleanHtml = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
          text = cleanHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }

        const parsedJsonLd = extractJsonLdJobPosting(html);
        if (!text && parsedJsonLd?.description) {
          text = parsedJsonLd.description;
        }

        if (isLegitimateJobContent(text)) {
          return {
            data: {
              ...(parsedJsonLd ?? {}),
              description: text.slice(0, 4000),
              applyUrl: url,
            },
            telemetry: `Hydrated ${Math.min(text.length, 4000).toLocaleString()} chars via LinkedIn Guest API`,
          };
        }

        return {
          data: null,
          telemetry: "Skipped (Auth wall or non-job content detected)",
        };
      }

      parsed = extractJsonLdJobPosting(html);
      if (parsed?.description) {
        const chars = parsed.description.length;
        return {
          data: { ...parsed, applyUrl: parsed.applyUrl ?? url },
          telemetry: `Hydrated ${chars.toLocaleString()} chars via JSON-LD`,
        };
      }

      // No JSON-LD on 200 OK: extract plain HTML description directly
      const cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");

      const text = cleanHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length >= 250) {
        if (!isLegitimateJobContent(text)) {
          return {
            data: null,
            telemetry: "Skipped (Auth wall or non-job content detected)",
          };
        }

        return {
          data: {
            ...(parsed ?? {}),
            description: text.slice(0, 4000),
            applyUrl: parsed?.applyUrl ?? url,
          },
          telemetry: `Hydrated ${Math.min(text.length, 4000).toLocaleString()} chars via Direct HTML`,
        };
      }

      return {
        data: null,
        telemetry: "Skipped (No JSON-LD / HTML too thin)",
      };
    }

    // Bot wall check (HTTP 403 or 429)
    if (res.status === 403 || res.status === 429) {
      // Jina requires an API key for heavy domains (Glassdoor, Amazon, LinkedIn)
      if (!jinaApiKey) {
        return {
          data: null,
          telemetry: `Skipped (HTTP ${res.status} Bot Wall - Configure Jina Key in Settings)`,
        };
      }

      console.log(
        `  ├─ LinkParser: Fallback via Jina (BYOK Key) [HTTP ${res.status} Bot Wall]`
      );

      const jinaRes = await fetchViaJinaReader(url, jinaApiKey, 12000);
      if (jinaRes.text) {
        const sanitized = sanitizeJinaMarkdown(jinaRes.text);
        if (sanitized.length > 150) {
          if (!isLegitimateJobContent(sanitized)) {
            return {
              data: null,
              telemetry: "Skipped (Auth wall or non-job content detected)",
            };
          }

          return {
            data: {
              description: sanitized,
              applyUrl: url,
            },
            telemetry: `Hydrated ${sanitized.length.toLocaleString()} chars via Jina (BYOK Key)`,
          };
        }
      }

      return {
        data: null,
        telemetry: "Skipped (Jina timeout or bot wall)",
      };
    }

    // Other non-OK status (e.g. 404, 500)
    return {
      data: null,
      telemetry: `Skipped (HTTP ${res.status})`,
    };
  } catch (err: unknown) {
    const isTimeout =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name?: string }).name === "AbortError");
    if (isTimeout) {
      return {
        data: null,
        telemetry: `Skipped (Timeout > ${timeoutMs}ms)`,
      };
    }
    const message = (err as Error)?.message || "Network Error";
    return {
      data: null,
      telemetry: `Skipped (${message})`,
    };
  }
}
