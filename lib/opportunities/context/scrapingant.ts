/**
 * ScrapingAnt BYOK proxy transport with global concurrency mutex,
 * progressive cooldown backoff, and bot-wall domain tracking.
 */

import fs from "fs";
import path from "path";
import type {
  ScrapedJobPosting,
  ScraperFailureEntry,
} from "./context.schema";
import {
  extractJsonLdJobPosting,
  extractNuxtData,
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
