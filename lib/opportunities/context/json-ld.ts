/**
 * ============================================================================
 * LINK PARSER & ENRICHMENT ORCHESTRATOR
 * 
 * Unified entry point for link-based opportunity enrichment.
 * Coordinates Schema.org JSON-LD parsing, Nuxt SSR state parsing,
 * Semantic DOM extraction, and ScrapingAnt fallbacks with zero-token time.
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import { resolveDecryptedScrapingAntKey } from "@/lib/llm/vault";
import { assertSafeHttpsUrl } from "@/lib/core/ssrf";
import type { AccountRules } from "@/lib/validations/rules";

// Re-export decoupled types and SSOT contracts
export type {
  ScrapedJobPosting,
  ScrapedJobPostingResult,
  ScraperFailureEntry,
  JobSectionCategory,
  ParsedJobSection,
  StructuredJobDescription,
} from "./schema.ssot";

// Re-export submodules for complete backward compatibility
export {
  unwrapTrackingUrl,
  safeDecodeUrl,
  extractLinkedInJobId,
  transformToLinkedInGuestUrl,
  stripTrackingParams,
} from "./url-unwrapper";

export {
  htmlToStructuredMarkdown,
  decodeHtmlEntities,
} from "./html-markdown";

export {
  classifySectionHeading,
  parseStructuredJobSections,
} from "./section-classifier";

export {
  extractJsonLdJobPosting,
  extractNuxtData,
  extractRemixData,
  isLegitimateJobContent,
} from "./json-ld-parser";

export { extractJobFromSemanticDom, extractIndeedSemanticDom } from "./dom-extractor";

import type {
  ScrapedJobPosting,
  ScrapedJobPostingResult,
  ScraperFailureEntry,
} from "./schema.ssot";
import { unwrapTrackingUrl, extractLinkedInJobId } from "./url-unwrapper";
import {
  extractJsonLdJobPosting,
  extractNuxtData,
  extractRemixData,
  isLegitimateJobContent,
} from "./json-ld-parser";
import { extractJobFromSemanticDom } from "./dom-extractor";
import { parseStructuredJobSections } from "./section-classifier";

function hasRichHtmlTags(str?: string): boolean {
  if (!str) return false;
  return /<(?:p|h[1-6]|ul|ol|li|strong|b|br|div)\b/i.test(str);
}

function formatLogLine(line: string, maxLen = 100): string {
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 3)}...`;
}

function formatShortUrl(rawUrl: string, maxLen = 38): string {
  try {
    const u = new URL(rawUrl);
    const short = `${u.hostname}${u.pathname}`;
    return short.length > maxLen ? `${short.slice(0, maxLen - 3)}...` : short;
  } catch {
    return rawUrl.length > maxLen ? `${rawUrl.slice(0, maxLen - 3)}...` : rawUrl;
  }
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

export interface ScrapingAntResult {
  data: ScrapedJobPosting | null;
  status?: number;
  errorMsg?: string;
}

// In-memory cache of domains known to trigger bot walls (HTTP 403 / 429)
const PRE_SEEDED_BOT_WALLED_DOMAINS = ["jobleads.com", "www.jobleads.com"];
const botWalledDomainCache = new Map<string, number>();
const BOT_WALL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

for (const d of PRE_SEEDED_BOT_WALLED_DOMAINS) {
  botWalledDomainCache.set(d, Date.now() + BOT_WALL_CACHE_TTL_MS);
}

export function markDomainBotWalled(domain: string): void {
  botWalledDomainCache.set(domain.toLowerCase(), Date.now() + BOT_WALL_CACHE_TTL_MS);
}

export function isDomainBotWalled(domain: string): boolean {
  const norm = domain.toLowerCase();
  const stripped = norm.replace(/^www\./, "");
  const expiresAt = botWalledDomainCache.get(norm) ?? botWalledDomainCache.get(stripped);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    botWalledDomainCache.delete(norm);
    botWalledDomainCache.delete(stripped);
    return false;
  }
  return true;
}

export function clearBotWalledDomainsForTesting(): void {
  botWalledDomainCache.clear();
}

/**
 * Global mutex for ScrapingAnt BYOK proxy requests.
 * ScrapingAnt enforces a strict concurrency limit of 1 on standard tiers;
 * serializing requests ensures parallel hydration workers never collide with HTTP 409.
 */
let scrapingAntCooldownMs = 500;
let scrapingAntMutex: Promise<unknown> = Promise.resolve();

async function withScrapingAntLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const currentLock = scrapingAntMutex;
  scrapingAntMutex = nextLock;

  try {
    await currentLock.catch(() => {});
    return await fn();
  } finally {
    // Progressive cooldown grace period between 500ms and 1500ms
    await new Promise((r) => setTimeout(r, scrapingAntCooldownMs));
    release();
  }
}

/**
 * Fetches and enriches job postings via ScrapingAnt's fast proxy endpoint (browser=false, 1 credit, ~2.5s).
 * Passes HTML through Schema.org JSON-LD, Nuxt 3 SSR state, or direct semantic DOM.
 */
export async function fetchViaScrapingAnt(
  url: string,
  apiKey: string,
  timeoutMs: number = 5000
): Promise<ScrapingAntResult> {
  if (!apiKey || !url) return { data: null };

  return withScrapingAntLock(async () => {
    const displayUrl = formatShortUrl(url, 38);
    const maxAttempts = 3;
    const retryDelays = [500, 1000, 1500];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

        if ((res.status === 409 || res.status === 423) && attempt < maxAttempts) {
          const delayMs = retryDelays[attempt - 1] ?? 1500;
          scrapingAntCooldownMs = Math.min(1500, delayMs + 500);
          console.warn(
            formatLogLine(
              `[scrapingant] HTTP ${res.status} lock for ${displayUrl}, retry in ${(delayMs / 1000).toFixed(1)}s (${attempt}/${maxAttempts})...`
            )
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        if (!res.ok) {
          console.warn(
            formatLogLine(`[scrapingant] Proxy request failed for ${displayUrl}: HTTP ${res.status}`)
          );
          return { data: null, status: res.status };
        }

        // Reset cooldown to baseline 500ms on success
        scrapingAntCooldownMs = 500;

        const html = await res.text();

        const isChallenge =
          /(?:just a moment|verify you are human|attention required|cloudflare ray id|security check)/i.test(
            html
          );
        if (isChallenge) {
          console.warn(formatLogLine(`[scrapingant] Challenge detected for ${displayUrl}`));
          return { data: null, status: res.status, errorMsg: "Challenge detected" };
        }

        const jsonLd = extractJsonLdJobPosting(html);
        const domData = extractJobFromSemanticDom(html, url);

        // 1. Workday Pattern: Prefer Semantic DOM if it has rich HTML formatting and legitimate job content
        const domIsRich = Boolean(
          domData?.description &&
          hasRichHtmlTags(domData.rawDescription || domData.description) &&
          isLegitimateJobContent(domData.coreDescription || domData.description)
        );

        if (domIsRich && domData?.description) {
          return {
            data: {
              ...(jsonLd ?? {}),
              ...domData,
              applyUrl: domData.applyUrl ?? jsonLd?.applyUrl ?? url,
              title: jsonLd?.title || domData.title,
              company: jsonLd?.company || domData.company,
              salary: jsonLd?.salary || domData.salary,
              salaryMax: jsonLd?.salaryMax || domData.salaryMax,
              datePosted: jsonLd?.datePosted || domData.datePosted,
              logoUrl: jsonLd?.logoUrl || domData.logoUrl,
            },
            status: res.status,
          };
        }

        // 2. Primary: Schema.org JobPosting JSON-LD (supports both rich HTML and clean plain text)
        if (jsonLd?.description && isLegitimateJobContent(jsonLd.coreDescription || jsonLd.description)) {
          return {
            data: {
              ...jsonLd,
              applyUrl: jsonLd.applyUrl ?? url,
              location: domData?.location || jsonLd.location,
              salary: jsonLd.salary || domData?.salary,
              salaryMax: jsonLd.salaryMax || domData?.salaryMax,
              datePosted: jsonLd.datePosted || domData?.datePosted,
              logoUrl: jsonLd.logoUrl || domData?.logoUrl,
            },
            status: res.status,
          };
        }

        // 3. Secondary: Nuxt 3 SSR State (__NUXT_DATA__)
        const nuxtData = extractNuxtData(html);
        if (nuxtData?.description && isLegitimateJobContent(nuxtData.coreDescription || nuxtData.description)) {
          return {
            data: {
              ...nuxtData,
              applyUrl: url,
              salary: nuxtData.salary || domData?.salary,
              salaryMax: nuxtData.salaryMax || domData?.salaryMax,
              datePosted: nuxtData.datePosted || domData?.datePosted,
            },
            status: res.status,
          };
        }

        // 4. Tertiary: Semantic DOM Extraction (plain or non-rich DOM fallback)
        if (domData?.description && isLegitimateJobContent(domData.coreDescription || domData.description)) {
          return {
            data: {
              ...(jsonLd ?? {}),
              ...domData,
              applyUrl: domData.applyUrl ?? jsonLd?.applyUrl ?? url,
              title: jsonLd?.title || domData.title,
              company: jsonLd?.company || domData.company,
              salary: jsonLd?.salary || domData.salary,
              salaryMax: jsonLd?.salaryMax || domData.salaryMax,
              datePosted: jsonLd?.datePosted || domData.datePosted,
              logoUrl: jsonLd?.logoUrl || domData.logoUrl,
            },
            status: res.status,
          };
        }

        // 5. Fallback: Clean HTML body text via structured section classifier
        const cleanHtml = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");

        const text = cleanHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (text.length >= 250 && isLegitimateJobContent(text)) {
          const structured = parseStructuredJobSections(cleanHtml);
          return {
            data: {
              ...(jsonLd ?? {}),
              ...(domData ?? {}),
              description: (structured.fullReconstructedMarkdown || text).slice(0, 4000),
              coreDescription: (structured.coreMarkdown || text).slice(0, 4000),
              overviewSnippet: structured.overviewSnippet,
              salary: jsonLd?.salary || domData?.salary,
              salaryMax: jsonLd?.salaryMax || domData?.salaryMax,
              datePosted: jsonLd?.datePosted || domData?.datePosted,
              logoUrl: jsonLd?.logoUrl || domData?.logoUrl,
              applyUrl: url,
            },
            status: res.status,
          };
        }

        if (process.env.NODE_ENV !== "production") {
          console.warn(
            formatLogLine(
              `[scrapingant] Unextracted 200 OK (${displayUrl}): len=${html.length}, jsonLd=${Boolean(jsonLd?.description)}, dom=${Boolean(domData?.description)}`
            )
          );
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
        console.warn(formatLogLine(`[scrapingant] Error for ${displayUrl}: ${errorMsg}`));
        return { data: null, errorMsg };
      }
    }

    return { data: null, status: 409 };
  });
}

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

/**
 * Reads HTML response stream with early exit:
 * - As soon as Schema.org JobPosting JSON-LD script closes
 * - Or as soon as Nuxt 3 SSR state script closes
 * - Or when maxBytes (256KB) is reached
 * Cancels the underlying stream to avoid downloading megabytes of unused assets.
 */
async function readHtmlWithEarlyExit(
  res: Response,
  maxBytes = 256 * 1024
): Promise<string> {
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulated = "";
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          accumulated += decoder.decode(value, { stream: true });

          // Early exit 1: Schema.org JSON-LD JobPosting complete
          if (accumulated.includes("JobPosting")) {
            const jpIndex = accumulated.indexOf("JobPosting");
            const closeScriptIndex = accumulated.indexOf("</script>", jpIndex);
            if (closeScriptIndex !== -1) {
              await reader.cancel().catch(() => {});
              return accumulated.slice(0, closeScriptIndex + 9);
            }
          }

          // Early exit 2: Nuxt 3 SSR state complete
          if (accumulated.includes("__NUXT_DATA__")) {
            const nuxtIndex = accumulated.indexOf("__NUXT_DATA__");
            const closeScriptIndex = accumulated.indexOf("</script>", nuxtIndex);
            if (closeScriptIndex !== -1) {
              await reader.cancel().catch(() => {});
              return accumulated.slice(0, closeScriptIndex + 9);
            }
          }

          // Early exit 3: Remix SSR state complete (Greenhouse job-boards)
          if (accumulated.includes("__remixContext")) {
            const remixIndex = accumulated.indexOf("__remixContext");
            const closeScriptIndex = accumulated.indexOf("</script>", remixIndex);
            if (closeScriptIndex !== -1) {
              await reader.cancel().catch(() => {});
              return accumulated.slice(0, closeScriptIndex + 9);
            }
          }

          // Early exit 4: Exceeded safety ceiling (256KB)
          if (totalBytes >= maxBytes) {
            await reader.cancel().catch(() => {});
            return accumulated;
          }
        }
      }
      return accumulated;
    } catch {
      return accumulated;
    }
  }

  return typeof res.text === "function" ? await res.text() : "";
}

/**
 * Public link parser: fetches public job page and extracts JobPosting metadata.
 * For Glassdoor: fast-fails immediately to 0ms (retaining parsed email digest context).
 * For Indeed: fast-fails immediately to 0ms (retaining parsed email digest context).
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
        telemetry: `Hydrated ${Math.min(guestData.description?.length ?? 0, 8000).toLocaleString()} chars via LinkedIn Guest API`,
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

  let domain = "";
  try {
    domain = new URL(url).hostname.toLowerCase();
  } catch {
    domain = "";
  }

  // Fast-Path: If domain is already known to bot-wall direct fetch (HTTP 403 / 429), bypass doomed 1.8s timeout
  if (domain && isDomainBotWalled(domain)) {
    const scrapingAntApiKey = resolveDecryptedScrapingAntKey(accountRules);
    if (scrapingAntApiKey) {
      console.log(
        `  ├─ LinkParser: Fast-path via ScrapingAnt (Known Bot Wall: ${domain})`
      );
      const antResult = await fetchViaScrapingAnt(url, scrapingAntApiKey);
      if (antResult.data?.description) {
        return {
          data: { ...antResult.data, applyUrl: antResult.data.applyUrl ?? url },
          telemetry: `Hydrated ${antResult.data.description.length.toLocaleString()} chars via ScrapingAnt (BYOK Key)`,
        };
      }

      if (antResult.status === 409 || antResult.status === 423) {
        recordScraperFailure({
          url,
          status: antResult.status,
          reason: `ScrapingAnt Concurrency Limit (HTTP ${antResult.status})`,
          timestamp: new Date().toISOString(),
        });
        return {
          data: null,
          telemetry: `Skipped (ScrapingAnt: HTTP ${antResult.status})`,
        };
      }

      const isTimeout = Boolean(antResult.errorMsg?.includes("Timeout"));
      let failureReason = "Skipped (ScrapingAnt timeout or bot wall)";
      if (isTimeout) {
        failureReason = "Skipped (Timeout > 5s - Likely offline)";
      } else if (antResult.status === 200) {
        failureReason = "Skipped (ScrapingAnt: No job spec on page)";
      }

      recordScraperFailure({
        url,
        status: antResult.status || (isTimeout ? 408 : 504),
        reason: antResult.errorMsg || "ScrapingAnt Timeout / Bot Wall",
        timestamp: new Date().toISOString(),
      });

      return {
        data: null,
        telemetry: failureReason,
      };
    }
  }

  // Target ATS / Direct Fetch
  try {
    const validatedUrl = await assertSafeHttpsUrl(url);
    const controller = new AbortController();

    // Two-Phase Timeout:
    // Phase 1 (Connect / TTFB): Fail dead/hanging servers in 1800ms
    // Phase 2 (Transfer): Stream chunks with early exit up to transfer ceiling
    const connectTimeoutMs = Math.min(1800, timeoutMs);
    const transferTimeoutMs = Math.min(3000, timeoutMs);
    let timer = setTimeout(() => controller.abort(), connectTimeoutMs);

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
      timer = setTimeout(() => controller.abort(), transferTimeoutMs);
      let html = "";
      try {
        html = await readHtmlWithEarlyExit(res, 256 * 1024);
      } finally {
        clearTimeout(timer);
      }

      // 1. Primary: Schema.org JobPosting JSON-LD
      const parsed = extractJsonLdJobPosting(html);
      const domData = extractJobFromSemanticDom(html, url);

      const domIsRich = Boolean(
        domData?.description &&
        hasRichHtmlTags(domData.rawDescription || domData.description) &&
        isLegitimateJobContent(domData.coreDescription || domData.description)
      );

      if (parsed?.description && (hasRichHtmlTags(parsed.rawDescription) || !domIsRich)) {
        const chars = parsed.description.length;
        return {
          data: {
            ...parsed,
            applyUrl: parsed.applyUrl ?? url,
            location: domData?.location || parsed.location,
            salary: parsed.salary || domData?.salary,
            salaryMax: parsed.salaryMax || domData?.salaryMax,
            datePosted: parsed.datePosted || domData?.datePosted,
            logoUrl: parsed.logoUrl || domData?.logoUrl,
          },
          telemetry: `Hydrated ${chars.toLocaleString()} chars via JSON-LD`,
        };
      }

      // 2. Secondary: Nuxt 3 SSR state (__NUXT_DATA__)
      const nuxtData = extractNuxtData(html);
      if (nuxtData?.description && isLegitimateJobContent(nuxtData.coreDescription || nuxtData.description)) {
        return {
          data: {
            ...nuxtData,
            applyUrl: url,
            salary: nuxtData.salary || domData?.salary,
            salaryMax: nuxtData.salaryMax || domData?.salaryMax,
            datePosted: nuxtData.datePosted || domData?.datePosted,
            logoUrl: nuxtData.logoUrl || domData?.logoUrl,
          },
          telemetry: `Hydrated ${nuxtData.description.length.toLocaleString()} chars via Nuxt SSR State`,
        };
      }

      // 3. Tertiary: Remix SSR state (e.g. Greenhouse job-boards)
      const remixData = extractRemixData(html);
      if (remixData?.description && isLegitimateJobContent(remixData.coreDescription || remixData.description)) {
        return {
          data: {
            ...remixData,
            applyUrl: remixData.applyUrl ?? url,
            salary: remixData.salary || domData?.salary,
            salaryMax: remixData.salaryMax || domData?.salaryMax,
            datePosted: remixData.datePosted || domData?.datePosted,
            logoUrl: remixData.logoUrl || domData?.logoUrl,
          },
          telemetry: `Hydrated ${remixData.description.length.toLocaleString()} chars via Remix SSR State`,
        };
      }

      // 4. Fallback: Semantic DOM Extraction (e.g. Workday rich DOM when JSON-LD is plain text)
      if (domData?.description && isLegitimateJobContent(domData.coreDescription || domData.description)) {
        return {
          data: {
            ...(parsed ?? {}),
            ...domData,
            applyUrl: domData.applyUrl ?? parsed?.applyUrl ?? url,
            title: parsed?.title || domData.title,
            company: parsed?.company || domData.company,
            salary: parsed?.salary || domData.salary,
            salaryMax: parsed?.salaryMax || domData.salaryMax,
            datePosted: parsed?.datePosted || domData.datePosted,
            logoUrl: parsed?.logoUrl || domData.logoUrl,
          },
          telemetry: `Hydrated ${domData.description.length.toLocaleString()} chars via Direct HTML`,
        };
      }

      // 4. Fallback: Direct clean HTML body text
      const cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");

      const text = cleanHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length >= 250 && isLegitimateJobContent(text)) {
        const structured = parseStructuredJobSections(cleanHtml);
        return {
          data: {
            ...(parsed ?? {}),
            ...(domData ?? {}),
            description: (structured.fullReconstructedMarkdown || text).slice(0, 4000),
            coreDescription: (structured.coreMarkdown || text).slice(0, 4000),
            overviewSnippet: structured.overviewSnippet,
            salary: parsed?.salary || domData?.salary,
            salaryMax: parsed?.salaryMax || domData?.salaryMax,
            datePosted: parsed?.datePosted || domData?.datePosted,
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
      if (domain) {
        markDomainBotWalled(domain);
      }
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

      const scrapingAntApiKey = resolveDecryptedScrapingAntKey(accountRules);

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

      if (antResult.status === 409 || antResult.status === 423) {
        recordScraperFailure({
          url,
          status: antResult.status,
          reason: `ScrapingAnt Concurrency Limit (HTTP ${antResult.status})`,
          timestamp: new Date().toISOString(),
        });
        return {
          data: null,
          telemetry: `Skipped (ScrapingAnt: HTTP ${antResult.status})`,
        };
      }

      const isTimeout = Boolean(antResult.errorMsg?.includes("Timeout"));
      let failureReason = "Skipped (ScrapingAnt timeout or bot wall)";
      if (isTimeout) {
        failureReason = "Skipped (Timeout > 5s - Likely offline)";
      } else if (antResult.status === 200) {
        failureReason = "Skipped (ScrapingAnt: No job spec on page)";
      }

      recordScraperFailure({
        url,
        status: antResult.status || (isTimeout ? 408 : 504),
        reason: antResult.errorMsg || "ScrapingAnt Timeout / Bot Wall",
        timestamp: new Date().toISOString(),
      });

      return {
        data: null,
        telemetry: failureReason,
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
