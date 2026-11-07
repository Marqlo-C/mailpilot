/**
 * ============================================================================
 * SCHEMA.ORG JSON-LD & NUXT STATE PARSER
 * 
 * Extracts structured JobPosting metadata from public web URLs.
 * Handles HTML5 unquoted attributes, quantitative salary ranges, high-res logos,
 * and passes descriptions through the section classifier to preserve formatting.
 * ============================================================================
 */

import type { ScrapedJobPosting } from "./schema.ssot";
import { parseStructuredJobSections } from "./section-classifier";
import { extractSalaryFromText, parseSalaryMax } from "@/lib/ai/classifier";

/**
 * Parses Schema.org JobPosting JSON-LD blocks out of HTML content.
 * Supports HTML5 unquoted attributes (<script type=application/ld+json>).
 */
export function extractJsonLdJobPosting(html: string): ScrapedJobPosting | null {
  if (!html || !html.includes("application/ld+json")) return null;

  const scriptRegex =
    /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
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

          let company: string | undefined;
          let logoUrl: string | undefined;

          if (typeof item.hiringOrganization === "object" && item.hiringOrganization !== null) {
            if (typeof item.hiringOrganization.name === "string") {
              company = item.hiringOrganization.name.trim();
            }
            const logo = item.hiringOrganization.logo;
            if (typeof logo === "string" && /^https?:\/\//i.test(logo.trim())) {
              logoUrl = logo.trim();
            } else if (typeof logo === "object" && logo !== null && typeof logo.url === "string") {
              if (/^https?:\/\//i.test(logo.url.trim())) {
                logoUrl = logo.url.trim();
              }
            }
          } else if (typeof item.hiringOrganization === "string") {
            company = item.hiringOrganization.trim();
          }

          let location: string | undefined;
          if (
            item.jobLocationType === "TELECOMMUTE" ||
            item.applicantLocationRequirements
          ) {
            location = "Remote";
          } else if (item.jobLocation) {
            const locObj = Array.isArray(item.jobLocation) ? item.jobLocation[0] : item.jobLocation;
            if (locObj?.address) {
              const addr = locObj.address;
              const locality = addr.addressLocality || "";
              const region = addr.addressRegion || "";
              const country = addr.addressCountry?.name || addr.addressCountry || "";
              const parts = [locality, region].filter(Boolean);
              if (parts.length > 0) {
                location = parts.join(", ");
              } else if (country && country !== "US" && country !== "USA") {
                location = country;
              }
            }
          }

          let salary: string | undefined;
          let salaryMax: number | undefined;
          const salaryObj = item.baseSalary || item.estimatedSalary;

          const formatRate = (n: unknown) => {
            const num = Number(n);
            if (isNaN(num)) return String(n);
            const rounded = Math.round(num * 10) / 10;
            return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
          };

          if (typeof salaryObj === "string" && salaryObj.trim()) {
            salary = salaryObj.trim();
          } else if (salaryObj && typeof salaryObj === "object") {
            const val = salaryObj.value || salaryObj;
            if (typeof val === "object" && val !== null) {
              const unit = typeof val.unitText === "string" ? ` / ${val.unitText.toLowerCase()}` : "";
              if (val.minValue != null && val.maxValue != null) {
                salary = `$${formatRate(val.minValue)} - $${formatRate(val.maxValue)}${unit}`;
                salaryMax = Math.round(Number(val.maxValue) * 100) / 100;
              } else if (val.value != null) {
                salary = `$${formatRate(val.value)}${unit}`;
                salaryMax = Math.round(Number(val.value) * 100) / 100;
              }
            } else if (typeof val === "number" || typeof val === "string") {
              salary = `$${formatRate(val)}`;
            }
          }

          if (!logoUrl) {
            const ogImageMatch =
              html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
              html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
            if (ogImageMatch && /^https?:\/\//i.test(ogImageMatch[1]) && !/default|share-logo|glassdoor|indeed|linkedin/i.test(ogImageMatch[1])) {
              logoUrl = ogImageMatch[1];
            }
          }

          let rawDescription: string | undefined;
          let description: string | undefined;
          let coreDescription: string | undefined;
          let overviewSnippet: string | undefined;
          let sections = undefined;

          if (typeof item.description === "string" && item.description.trim()) {
            rawDescription = item.description;
            const structured = parseStructuredJobSections(item.description);
            description = structured.fullReconstructedMarkdown;
            coreDescription = structured.coreMarkdown;
            overviewSnippet = structured.overviewSnippet;
            sections = structured.sections;

            // Fallback: extract salary from description text when baseSalary is omitted in JSON-LD
            if (!salary && description) {
              const extracted = extractSalaryFromText(description);
              if (extracted) {
                salary = extracted;
                salaryMax = parseSalaryMax(extracted) ?? undefined;
              }
            }
          }

          const applyUrl =
            typeof item.url === "string" ? item.url : undefined;
          const datePosted =
            typeof item.datePosted === "string"
              ? item.datePosted
              : typeof item.dateCreated === "string"
                ? item.dateCreated
                : typeof item.dateModified === "string"
                  ? item.dateModified
                  : undefined;

          return {
            title,
            company,
            location,
            salary,
            salaryMax,
            rawDescription,
            description,
            coreDescription,
            overviewSnippet,
            applyUrl,
            datePosted,
            logoUrl,
            sections,
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

    const rawMarkdown = validParagraphs.join("\n\n").slice(0, 8000);
    const structured = parseStructuredJobSections(rawMarkdown);

    // 4. Detect Date Posted candidate
    const dateCandidate = nuxtArray.find(
      (item): item is string =>
        typeof item === "string" &&
        /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?/.test(item.trim())
    );
    const datePosted = dateCandidate ? dateCandidate.trim() : undefined;

    // 5. Detect Salary candidate
    const salaryCandidate = nuxtArray.find(
      (item): item is string =>
        typeof item === "string" &&
        item.length < 50 &&
        /\$\s*\d{1,3}(?:,\d{3})*(?:\s*-\s*\$?\d{1,3}(?:,\d{3})*)?/i.test(item.trim())
    );
    const salary = salaryCandidate ? salaryCandidate.trim() : undefined;

    return {
      title,
      company,
      location,
      salary,
      description: structured.fullReconstructedMarkdown,
      coreDescription: structured.coreMarkdown,
      overviewSnippet: structured.overviewSnippet,
      datePosted,
      sections: structured.sections,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts structured job specifications from modern Remix SSR state (e.g. Greenhouse job-boards).
 */
export function extractRemixData(html: string): ScrapedJobPosting | null {
  if (!html || !html.includes("window.__remixContext")) return null;

  const match = html.match(
    /window\.__remixContext\s*=\s*([\s\S]*?);\s*<\/script>/i
  );
  if (!match || !match[1]) return null;

  try {
    const data = JSON.parse(match[1]);
    const loaderData = data.state?.loaderData || {};

    let jobPost: Record<string, unknown> | null = null;
    for (const val of Object.values(loaderData)) {
      if (val && typeof val === "object" && "jobPost" in (val as Record<string, unknown>)) {
        jobPost = (val as Record<string, unknown>).jobPost as Record<string, unknown>;
        break;
      }
    }
    if (!jobPost) return null;

    const title = typeof jobPost.title === "string" ? jobPost.title.trim() : undefined;
    const company = typeof jobPost.company_name === "string" ? jobPost.company_name.trim() : undefined;
    const location = typeof jobPost.job_post_location === "string" ? jobPost.job_post_location.trim() : undefined;
    const datePosted = typeof jobPost.published_at === "string" ? jobPost.published_at.trim() : undefined;
    const applyUrl = typeof jobPost.public_url === "string" ? jobPost.public_url.trim() : undefined;

    // High-resolution logo from OpenGraph meta image
    const ogImageMatch =
      html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
    const logoUrl =
      ogImageMatch?.[1] && /^https?:\/\//i.test(ogImageMatch[1])
        ? ogImageMatch[1]
        : undefined;

    const rawContent = typeof jobPost.content === "string" ? jobPost.content : "";
    const cleanContent = rawContent
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();

    const salary = extractSalaryFromText(cleanContent) ?? undefined;
    const salaryMax = salary ? parseSalaryMax(salary) ?? undefined : undefined;

    const structured = parseStructuredJobSections(cleanContent);

    return {
      title,
      company,
      location,
      salary,
      salaryMax,
      datePosted,
      applyUrl,
      logoUrl,
      description: structured.fullReconstructedMarkdown || cleanContent,
      coreDescription: structured.coreMarkdown || cleanContent,
      overviewSnippet: structured.overviewSnippet,
      sections: structured.sections,
      rawDescription: rawContent,
    };
  } catch {
    return null;
  }
}

/**
 * Structural/semantic validator for job posting content.
 * Discards auth-walled, login-redirected, or bot-challenge pages without brittle string matches.
 */
export function isLegitimateJobContent(text: string): boolean {
  if (!text || text.trim().length < 250) return false;

  // Check for presence of common job posting structural markers across disciplines
  const jobStructureMarkers = [
    /\b(?:responsibilities|qualifications|requirements|experience|skills|duties|what you('ll| will) do|about the (?:role|job|position)|about us)\b/i,
    /\b(?:bachelor|master|degree|years of|salary|benefits|compensation|equal opportunity)\b/i,
  ];

  const hasJobMarkers = jobStructureMarkers.some((regex) => regex.test(text));

  // Check for auth wall / bot challenge markers
  const authMarkers = [
    /\b(?:sign in|log in|login|continue with apple|passkey|enter your email|forgot password)\b/i,
    /\b(?:verify you are human|security check|cloudflare|attention required|enable cookies)\b/i,
  ];

  const authCount = authMarkers.filter((regex) => regex.test(text)).length;

  if (authCount >= 2 && !hasJobMarkers) return false;
  if (!hasJobMarkers) return false;

  return true;
}
