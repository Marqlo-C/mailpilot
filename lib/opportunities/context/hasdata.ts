/**
 * ============================================================================
 * LINK PARSER ENRICHMENT: HASDATA BYOK SCRAPER ADAPTER
 * 
 * Provides on-demand extraction for Glassdoor and Indeed postings via HasData API.
 * Protected under the On-Demand boundary: never invoked during background sync.
 * ============================================================================
 */

import { assertSafeHttpsUrl } from "@/lib/core/ssrf";
import type { ScrapedJobPosting } from "./json-ld";

export interface HasDataResult {
  data: ScrapedJobPosting | null;
  status?: number;
  errorMsg?: string;
}

function truncateUrl(url: string, maxLen: number = 90): string {
  if (!url || url.length <= maxLen) return url;
  return `${url.slice(0, maxLen - 3)}...`;
}

/**
 * Fetches and normalizes a job posting from Glassdoor or Indeed using HasData API.
 * Requires customer BYOK HasData API key.
 */
export async function fetchViaHasData(
  url: string,
  apiKey: string,
  platform?: "glassdoor" | "indeed" | null,
  timeoutMs: number = 8000
): Promise<HasDataResult> {
  if (!apiKey || !url) {
    return { data: null, errorMsg: "Missing API key or URL" };
  }

  const cleanUrl = url.trim();
  const resolvedPlatform =
    platform ??
    (/glassdoor\.com/i.test(cleanUrl)
      ? "glassdoor"
      : /indeed\.com/i.test(cleanUrl)
        ? "indeed"
        : null);

  if (!resolvedPlatform) {
    return {
      data: null,
      errorMsg: "Unsupported platform for HasData (expected Glassdoor or Indeed)",
    };
  }

  const displayUrl = truncateUrl(cleanUrl);

  try {
    const endpoint = `https://api.hasdata.com/scrape/${resolvedPlatform}/job?url=${encodeURIComponent(
      cleanUrl
    )}`;
    const validatedUrl = await assertSafeHttpsUrl(endpoint);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(validatedUrl.toString(), {
        signal: controller.signal,
        headers: {
          "x-api-key": apiKey.trim(),
          Accept: "application/json",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.warn(
        `[hasdata] Scraping failed for ${displayUrl}: HTTP ${res.status}`
      );
      return { data: null, status: res.status };
    }

    const json = await res.json();
    if (!json || typeof json !== "object") {
      return { data: null, status: res.status, errorMsg: "Invalid JSON response" };
    }

    // HasData returns { job: { ... } } or root job object
    const rawJob =
      (json as { job?: Record<string, unknown>; data?: Record<string, unknown> }).job ??
      (json as { job?: Record<string, unknown>; data?: Record<string, unknown> }).data ??
      json;

    const job = rawJob as Record<string, unknown>;

    // 1. Title
    const title =
      typeof job.title === "string"
        ? job.title.trim()
        : typeof job.jobTitle === "string"
          ? job.jobTitle.trim()
          : undefined;

    // 2. Company / Employer
    let company: string | undefined;
    if (typeof job.company === "string") {
      company = job.company.trim();
    } else if (
      job.company &&
      typeof job.company === "object" &&
      "name" in job.company &&
      typeof (job.company as { name?: unknown }).name === "string"
    ) {
      company = ((job.company as { name: string }).name).trim();
    } else if (
      job.employer &&
      typeof job.employer === "object" &&
      "name" in job.employer &&
      typeof (job.employer as { name?: unknown }).name === "string"
    ) {
      company = ((job.employer as { name: string }).name).trim();
    } else if (typeof job.employer === "string") {
      company = job.employer.trim();
    }

    // 3. Location
    let location: string | undefined;
    if (typeof job.location === "string" && job.location.trim()) {
      location = job.location.trim();
    } else if (job.address && typeof job.address === "object") {
      const addr = job.address as Record<string, unknown>;
      const city =
        typeof addr.city === "string"
          ? addr.city.trim()
          : typeof addr.addressLocality === "string"
            ? addr.addressLocality.trim()
            : "";
      const region =
        typeof addr.region === "string"
          ? addr.region.trim()
          : typeof addr.addressRegion === "string"
            ? addr.addressRegion.trim()
            : typeof addr.state === "string"
              ? addr.state.trim()
              : "";
      const formatted = [city, region].filter(Boolean).join(", ");
      if (formatted) location = formatted;
    }

    // 4. Salary
    let salary: string | undefined;
    if (typeof job.salary === "string" && job.salary.trim()) {
      salary = job.salary.trim();
    } else if (job.salary && typeof job.salary === "object") {
      const sal = job.salary as Record<string, unknown>;
      if (typeof sal.text === "string" && sal.text.trim()) {
        salary = sal.text.trim();
      } else if (sal.min != null && sal.max != null) {
        const periodStr = typeof sal.period === "string" ? ` / ${sal.period}` : "";
        salary = `$${sal.min} - $${sal.max}${periodStr}`;
      } else if (sal.value != null) {
        salary = `$${sal.value}`;
      }
    }

    // 5. Description & Qualifications
    let descriptionText = "";
    if (typeof job.description === "string") {
      descriptionText = job.description;
    } else if (typeof job.descriptionHtml === "string") {
      descriptionText = job.descriptionHtml;
    } else if (typeof job.snippet === "string") {
      descriptionText = job.snippet;
    }

    // Append structured responsibilities / qualifications if present
    const sections: string[] = [];
    if (Array.isArray(job.responsibilities) && job.responsibilities.length > 0) {
      const respItems = job.responsibilities
        .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
        .map((r) => `• ${r.trim()}`);
      if (respItems.length > 0) {
        sections.push(`Responsibilities:\n${respItems.join("\n")}`);
      }
    }

    if (Array.isArray(job.qualifications) && job.qualifications.length > 0) {
      const qualItems = job.qualifications
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .map((q) => `• ${q.trim()}`);
      if (qualItems.length > 0) {
        sections.push(`Qualifications:\n${qualItems.join("\n")}`);
      }
    } else if (Array.isArray(job.requirements) && job.requirements.length > 0) {
      const reqItems = job.requirements
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .map((q) => `• ${q.trim()}`);
      if (reqItems.length > 0) {
        sections.push(`Requirements:\n${reqItems.join("\n")}`);
      }
    }

    if (sections.length > 0) {
      descriptionText = `${descriptionText}\n\n${sections.join("\n\n")}`.trim();
    }

    const cleanDescription = descriptionText
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim()
      .slice(0, 4000);

    // 6. Apply URL & Date Posted
    const applyUrl =
      typeof job.applyUrl === "string" && job.applyUrl.trim()
        ? job.applyUrl.trim()
        : typeof job.url === "string" && job.url.trim()
          ? job.url.trim()
          : cleanUrl;

    const datePosted =
      typeof job.datePosted === "string"
        ? job.datePosted.trim()
        : typeof job.postedAt === "string"
          ? job.postedAt.trim()
          : undefined;

    return {
      data: {
        title,
        company,
        location,
        salary,
        description: cleanDescription || undefined,
        applyUrl,
        datePosted,
      },
      status: res.status,
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

    console.warn(`[hasdata] Error fetching ${displayUrl}: ${errorMsg}`);
    return { data: null, errorMsg };
  }
}
