/**
 * ============================================================================
 * LINK PARSER ENRICHMENT: SCHEMA.ORG JSON-LD EXTRACTOR
 * 
 * Extracts structured JobPosting metadata from public web URLs to hydrate
 * thin email digest listings (< 300 characters).
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import { decryptToken } from "@/lib/crypto";
import { assertSafeHttpsUrl } from "@/lib/ssrf";
import type { AccountRules } from "@/lib/validations/rules";

export interface ScraperFailureEntry {
  url: string;
  status?: number | string;
  reason: string;
  timestamp: string;
}

/**
 * Dev-only helper to record failed scrape attempts (bot walls, 403s, 429s, timeouts)
 * to a local .scraper-failures.json file for standalone local testing.
 */
export function recordScraperFailure(entry: ScraperFailureEntry): void {
  if (process.env.NODE_ENV === "production") return;

  try {
    const filePath = path.resolve(process.cwd(), ".scraper-failures.json");
    let failures: ScraperFailureEntry[] = [];

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          failures = parsed;
        }
      } catch {
        failures = [];
      }
    }

    const existingIdx = failures.findIndex((f) => f.url === entry.url);
    if (existingIdx >= 0) {
      failures[existingIdx] = { ...failures[existingIdx], ...entry };
    } else {
      failures.push(entry);
    }

    fs.writeFileSync(filePath, JSON.stringify(failures, null, 2), "utf-8");
  } catch {
    // Non-fatal dev logging
  }
}

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
  if (!urlString || typeof urlString !== "string") return "";
  let normalized = urlString.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    return "";
  }
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

  return /^https?:\/\//i.test(normalized) ? normalized : "";
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

/**
 * Parses Nuxt 3 SSR state payload (<script id="__NUXT_DATA__">)
 * to extract rich job specifications from single-page apps (like JobLeads)
 * without requiring a headless browser.
 */
export function extractNuxtData(html: string): ScrapedJobPosting | null {
  if (!html || !html.includes('id="__NUXT_DATA__"')) return null;

  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match || !match[1]) return null;

  try {
    const nuxtArray = JSON.parse(match[1]);
    if (!Array.isArray(nuxtArray)) return null;

    let title: string | undefined;
    let company: string | undefined;
    let location: string | undefined;

    // 1. Extract Title & Location from <title> tag if available
    const pageTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (pageTitleMatch && pageTitleMatch[1]) {
      const parts = pageTitleMatch[1].split("|")[0].split("-");
      title = parts[0]?.trim();
      if (parts[1]) location = parts[1]?.trim();
    }

    // 2. Detect Company candidate in early strings
    const companyCandidate = nuxtArray.find(
      (item): item is string =>
        typeof item === "string" &&
        item.length > 2 &&
        item.length < 50 &&
        !item.startsWith("/") &&
        !item.startsWith("http") &&
        (item.includes("Inc") ||
          item.includes("LLC") ||
          item.includes("Corp") ||
          item.includes("Tech") ||
          item.includes("Technologies") ||
          item.includes("Solutions") ||
          item.includes("Group"))
    );
    if (companyCandidate) {
      company = companyCandidate.trim();
    }

    // 3. Filter candidate strings according to Nuxt specification rules
    const isJwtToken = (str: string) =>
      /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(str.trim());

    const validParagraphs = nuxtArray
      .filter((item): item is string => typeof item === "string" && item.length > 80)
      .filter(
        (str) =>
          !isJwtToken(str) &&
          !str.startsWith("/") &&
          !str.startsWith("http") &&
          !str.includes("/_nucf/") &&
          !str.includes("@font-face") &&
          !str.includes("data:image") &&
          !str.startsWith('{"') &&
          !str.endsWith("}") &&
          !/seeks a .* to design|all rights reserved|job board/i.test(str)
      );

    if (validParagraphs.length === 0) return null;

    // Clean inline HTML tags & collapse excess spaces
    const cleanParagraph = (raw: string) =>
      raw
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const uniqueParagraphs = Array.from(new Set(validParagraphs.map(cleanParagraph))).filter(
      (p) => p.length > 40
    );

    if (uniqueParagraphs.length === 0) return null;

    const description = uniqueParagraphs.join("\n\n").slice(0, 4000);

    return {
      title,
      company,
      location,
      description,
    };
  } catch {
    return null;
  }
}

export interface ScrapingAntResult {
  data: ScrapedJobPosting | null;
  status?: number;
  errorMsg?: string;
}

/**
 * Fetches and enriches job postings via ScrapingAnt's fast proxy endpoint (browser=false, 1 credit, ~2.5s).
 * Passes HTML through Schema.org JSON-LD, Nuxt 3 SSR state, or direct cleaned body text.
 */
export async function fetchViaScrapingAnt(
  url: string,
  apiKey: string,
  timeoutMs: number = 6000
): Promise<ScrapingAntResult> {
  if (!apiKey || !url) return { data: null };

  const displayUrl = url.length > 90 ? `${url.slice(0, 87)}...` : url;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const endpoint = new URL("https://api.scrapingant.com/v2/general");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("x-api-key", apiKey);
    endpoint.searchParams.set("browser", "false");

    let res: Response;
    try {
      res = await fetch(endpoint.toString(), {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.warn(`[scrapingant] Proxy request failed for ${displayUrl}: HTTP ${res.status}`);
      return { data: null, status: res.status };
    }

    const html = await res.text();

    const isChallenge =
      /(?:just a moment|verify you are human|attention required|cloudflare ray id|security check)/i.test(
        html
      );
    if (isChallenge) {
      console.warn(`[scrapingant] Challenge detected in proxy payload for ${displayUrl}`);
      return { data: null, status: res.status, errorMsg: "Challenge detected" };
    }

    // 1. Check Schema.org JobPosting JSON-LD
    const jsonLd = extractJsonLdJobPosting(html);
    if (jsonLd?.description && isLegitimateJobContent(jsonLd.description)) {
      return {
        data: {
          ...jsonLd,
          applyUrl: jsonLd.applyUrl ?? url,
        },
        status: res.status,
      };
    }

    // 2. Check Nuxt 3 SSR State (__NUXT_DATA__)
    const nuxtData = extractNuxtData(html);
    if (nuxtData?.description && isLegitimateJobContent(nuxtData.description)) {
      return {
        data: {
          ...nuxtData,
          applyUrl: url,
        },
        status: res.status,
      };
    }

    // 3. General sanitized body fallback
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");

    const text = cleanHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length >= 250 && isLegitimateJobContent(text)) {
      return {
        data: {
          ...(jsonLd ?? {}),
          description: text.slice(0, 4000),
          applyUrl: url,
        },
        status: res.status,
      };
    }

    return { data: null, status: res.status };
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
    console.warn(`[scrapingant] Error fetching ${displayUrl}: ${errorMsg}`);
    return { data: null, errorMsg };
  }
}

/**
 * Extracts numeric job ID from various LinkedIn URL formats.
 */
export function extractLinkedInJobId(urlString: string): string | null {
  if (!urlString) return null;
  const match =
    urlString.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i) ||
    urlString.match(/currentJobId=(\d+)/i) ||
    urlString.match(/jobs-guest\/jobs\/api\/jobPosting\/(\d+)/i);
  return match && match[1] ? match[1] : null;
}

/**
 * Detects LinkedIn job URLs and maps them to the public unauthenticated
 * jobs-guest API endpoint, bypassing login walls.
 */
export function transformToLinkedInGuestUrl(urlString: string): string | null {
  const jobId = extractLinkedInJobId(urlString);
  if (jobId) {
    return `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
  }
  return null;
}

/**
 * Fetches LinkedIn job posting details using a 2-tier fallback strategy:
 * Tier 1: Public unauthenticated jobs-guest API endpoint (/jobs-guest/jobs/api/jobPosting/{id}).
 * Tier 2: Public job view URL with Googlebot User-Agent extracting Schema.org JSON-LD.
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
          ...(parsedJsonLd ?? {}),
          description: text.slice(0, 4000),
          applyUrl: url,
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
      if (parsedJsonLd?.description && isLegitimateJobContent(parsedJsonLd.description)) {
        return {
          ...parsedJsonLd,
          description: parsedJsonLd.description.slice(0, 4000),
          applyUrl: url,
        };
      }

      const cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
      const text = cleanHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length >= 250 && isLegitimateJobContent(text)) {
        return {
          ...(parsedJsonLd ?? {}),
          description: text.slice(0, 4000),
          applyUrl: url,
        };
      }
    }
  } catch {
    // Both tiers exhausted
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
 * For Glassdoor: fast-fails immediately to 0ms (retaining parsed email digest context).
 * For LinkedIn: uses public guest endpoint (< 600ms, never routed to proxies).
 * Target ATS / Direct Fetch: attempts direct fetch with desktop browser headers.
 * Proxy Fallback: if direct fetch hits HTTP 403/429 (and domain is not blacklisted),
 * falls back to ScrapingAnt (1-credit proxy) using account BYOK key.
 */
export async function scrapeJobPostingJsonLd(
  rawUrl: string,
  accountRulesOrTimeout?: Partial<AccountRules> | number | null,
  timeoutOrApiKey?: number | string | null
): Promise<ScrapedJobPostingResult> {
  const url = unwrapTrackingUrl(rawUrl);

  // Fast Exit for Glassdoor: 0ms without external fetching (On-Demand Hydration)
  if (rawUrl.includes("glassdoor.com") || url.includes("glassdoor.com")) {
    return {
      data: null,
      telemetry: "Deferred (Glassdoor - On-Demand Hydration)",
    };
  }

  // Fast Exit for Indeed: 0ms without external fetching (On-Demand Hydration)
  if (rawUrl.includes("indeed.com") || url.includes("indeed.com")) {
    return {
      data: null,
      telemetry: "Deferred (Indeed - On-Demand Hydration)",
    };
  }

  let accountRules: Partial<AccountRules> | null = null;
  let timeoutMs = 5000;

  if (typeof accountRulesOrTimeout === "number") {
    timeoutMs = accountRulesOrTimeout;
    if (typeof timeoutOrApiKey === "string") {
      accountRules = { encryptedScrapingAntApiKey: null };
    }
  } else if (accountRulesOrTimeout && typeof accountRulesOrTimeout === "object") {
    accountRules = accountRulesOrTimeout;
    if (typeof timeoutOrApiKey === "number") {
      timeoutMs = timeoutOrApiKey;
    }
  }

  // LinkedIn Fast-Path: public guest endpoint (< 600ms, never routed to proxies)
  if (url.includes("linkedin.com") || rawUrl.includes("linkedin.com")) {
    const guestData = await fetchLinkedInGuestPosting(url);
    if (guestData) {
      return {
        data: guestData,
        telemetry: `Hydrated ${Math.min(guestData.description?.length ?? 0, 4000).toLocaleString()} chars via LinkedIn Guest API`,
      };
    }

    recordScraperFailure({
      url,
      status: 200,
      reason: "Auth Wall / Non-Job Content",
      timestamp: new Date().toISOString(),
    });
    return {
      data: null,
      telemetry: "Skipped (Auth wall or non-job content detected)",
    };
  }

  // Target ATS / Direct Fetch
  try {
    const validatedUrl = await assertSafeHttpsUrl(url);
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

    if (res.ok) {
      const html = await res.text();

      // 1. Primary: Schema.org JobPosting JSON-LD
      const parsed = extractJsonLdJobPosting(html);
      if (parsed?.description) {
        const chars = parsed.description.length;
        return {
          data: { ...parsed, applyUrl: parsed.applyUrl ?? url },
          telemetry: `Hydrated ${chars.toLocaleString()} chars via JSON-LD`,
        };
      }

      // 2. Secondary: Nuxt 3 SSR state (__NUXT_DATA__)
      const nuxtData = extractNuxtData(html);
      if (nuxtData?.description && isLegitimateJobContent(nuxtData.description)) {
        return {
          data: { ...nuxtData, applyUrl: url },
          telemetry: `Hydrated ${nuxtData.description.length.toLocaleString()} chars via Nuxt SSR State`,
        };
      }

      // 3. Fallback: Direct clean HTML body text
      const cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");

      const text = cleanHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length >= 500 && isLegitimateJobContent(text)) {
        return {
          data: {
            description: text.slice(0, 4000),
            applyUrl: url,
          },
          telemetry: `Hydrated ${Math.min(text.length, 4000).toLocaleString()} chars via Direct HTML`,
        };
      }

      if (text.length >= 250 && !isLegitimateJobContent(text)) {
        recordScraperFailure({
          url,
          status: 200,
          reason: "Auth Wall / Non-Job Content",
          timestamp: new Date().toISOString(),
        });
        return {
          data: null,
          telemetry: "Skipped (Auth wall or non-job content detected)",
        };
      }

      return {
        data: null,
        telemetry: "Skipped (No JSON-LD / HTML too thin)",
      };
    }

    // Bot wall check (HTTP 403 or 429)
    if (res.status === 403 || res.status === 429) {
      recordScraperFailure({
        url,
        status: res.status,
        reason: "Bot Wall",
        timestamp: new Date().toISOString(),
      });

      // ScrapingAnt free tier blacklist (indeed.com)
      if (url.includes("indeed.com")) {
        return {
          data: null,
          telemetry: `Skipped (HTTP ${res.status} Bot Wall - indeed.com restricted on proxy)`,
        };
      }

      let scrapingAntApiKey: string | null = null;
      if (accountRules?.encryptedScrapingAntApiKey) {
        try {
          scrapingAntApiKey = decryptToken(accountRules.encryptedScrapingAntApiKey).trim() || null;
        } catch {
          scrapingAntApiKey = null;
        }
      }

      if (!scrapingAntApiKey) {
        return {
          data: null,
          telemetry: `Skipped (HTTP ${res.status} Bot Wall - Configure ScrapingAnt Key in Settings)`,
        };
      }

      console.log(
        `  ├─ LinkParser: Fallback via ScrapingAnt (BYOK Key) [HTTP ${res.status} Bot Wall]`
      );

      const antResult = await fetchViaScrapingAnt(url, scrapingAntApiKey);
      if (antResult.data?.description) {
        return {
          data: { ...antResult.data, applyUrl: antResult.data.applyUrl ?? url },
          telemetry: `Hydrated ${antResult.data.description.length.toLocaleString()} chars via ScrapingAnt (BYOK Key)`,
        };
      }

      if (antResult.status === 409) {
        recordScraperFailure({
          url,
          status: 409,
          reason: "ScrapingAnt Concurrency Limit (HTTP 409)",
          timestamp: new Date().toISOString(),
        });
        return {
          data: null,
          telemetry: "Skipped (ScrapingAnt: HTTP 409)",
        };
      }

      recordScraperFailure({
        url,
        status: antResult.status || 504,
        reason: antResult.errorMsg || "ScrapingAnt Timeout / Bot Wall",
        timestamp: new Date().toISOString(),
      });

      return {
        data: null,
        telemetry: "Skipped (ScrapingAnt timeout or bot wall)",
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
    const errorMsg = isTimeout
      ? `Timeout > ${timeoutMs}ms`
      : (err as Error)?.message || "Network Error";

    recordScraperFailure({
      url,
      reason: errorMsg,
      timestamp: new Date().toISOString(),
    });

    if (isTimeout) {
      return {
        data: null,
        telemetry: `Skipped (Timeout > ${timeoutMs}ms)`,
      };
    }
    return {
      data: null,
      telemetry: `Skipped (${errorMsg})`,
    };
  }
}
