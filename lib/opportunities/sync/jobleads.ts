import type { JobClassification, ExtractedJob } from "@/lib/ai/classification";
import { sanitizeCompanyName } from "@/lib/opportunities/context";
import {
  unwrapTrackingUrl,
  stripTrackingParams,
} from "@/lib/opportunities/context/url-unwrapper";
import { parseSalaryMax, normalizeSalaryDisplay } from "@/lib/ai/classifier";

/**
 * Recovers the true employer name from JobLeads HTML if an LLM or fallback
 * classified the company as "JobLeads".
 */
export function recoverJobLeadsCompany(
  title: string,
  html: string
): string | null {
  if (!title || !html) return null;
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 25);
  const re = new RegExp(
    `<!--\\s*Job Title\\s*-->[\\s\\S]*?${escaped}[\\s\\S]*?<!--\\s*Company Name\\s*-->[\\s\\S]*?<div[^>]*>([\\s\\S]*?)<\\/div>`,
    "i"
  );
  const match = html.match(re);
  if (match && match[1]) {
    const cleaned = cleanHtmlText(match[1]);
    if (cleaned && !/jobleads/i.test(cleaned)) {
      return sanitizeCompanyName(cleaned);
    }
  }
  return null;
}

/**
 * Checks whether an incoming message sender matches JobLeads.
 */
export function isJobLeadsEmail(
  senderEmail?: string | null,
  senderName?: string | null,
  fromHeader?: string | null
): boolean {
  if (senderEmail && /@(?:[a-z0-9-]+\.)*jobleads\.com$/i.test(senderEmail.trim())) {
    return true;
  }
  if (senderName && /jobleads/i.test(senderName.trim())) {
    return true;
  }
  if (fromHeader && /jobleads/i.test(fromHeader)) {
    return true;
  }
  return false;
}

function cleanHtmlText(str: string): string {
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/â€¢|•/g, "")
    .replace(/â€“|–/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic parser for JobLeads alert and saved search digest emails.
 *
 * Extracts individual job cards directly from the HTML tables where JobLeads
 * embeds Job Title, true hiring Company Name, Location/Arrangement chips,
 * Salary ranges, and direct application links.
 */
export function parseJobLeadsDigest(
  html: string,
  options: {
    subject?: string;
    receivedAt?: Date;
  } = {}
): JobClassification | null {
  if (!html || typeof html !== "string") {
    return null;
  }

  const jobs: ExtractedJob[] = [];

  // Strategy 1: HTML comment boundaries (<!-- Job Title --> ... <!-- Company Name -->)
  const titleCommentRe = /<!--\s*Job Title\s*-->/gi;
  const sections = html.split(titleCommentRe);

  if (sections.length > 1) {
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];

      // 1. Role Title: contained in the div before <!-- Company Name -->
      const titleMatch = section.match(
        /<div[^>]*>([\s\S]*?)<\/div>[\s\S]*?<!--\s*Company Name\s*-->/i
      );
      const rawTitle = titleMatch ? cleanHtmlText(titleMatch[1]) : null;
      if (!rawTitle) continue;

      // 2. Hiring Company: contained in the div after <!-- Company Name -->
      const companyMatch = section.match(
        /<!--\s*Company Name\s*-->[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i
      );
      let extractedCompany = companyMatch ? cleanHtmlText(companyMatch[1]) : "";

      const normalizedCo = extractedCompany.replace(/\s+/g, "").toLowerCase();
      if (
        !extractedCompany ||
        normalizedCo === "jobleads" ||
        normalizedCo.includes("savedsearch") ||
        normalizedCo.includes("basedonyour") ||
        normalizedCo.includes("jobalert")
      ) {
        extractedCompany = "Unknown Company";
      } else {
        extractedCompany = sanitizeCompanyName(extractedCompany);
      }

      // 3. Location and Salary chips
      let location: string | null = null;
      let salaryDisplay: string | null = null;
      let salaryMax: number | null = null;

      const chipMatches = [
        ...section.matchAll(
          /<td[^>]*valign="top"[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/gi
        ),
      ];

      for (const cm of chipMatches) {
        const text = cleanHtmlText(cm[1]);
        if (!text) continue;

        if (/\b(?:USD|EUR|GBP|\$|€|£|\d+[kK])\b/i.test(text) && !salaryDisplay) {
          salaryDisplay = normalizeSalaryDisplay(text);
          salaryMax = parseSalaryMax(text);
        } else if (
          /[A-Z]{2}|remote|hybrid|on-site|in_person/i.test(text) &&
          !location
        ) {
          location = text
            .replace(
              /\s*\|\s*(?:On-site|Remote|Hybrid|in_person|full-?time|part-?time)/i,
              ""
            )
            .trim();
        }
      }

      // 4. View Job Link CTA
      const linkMatch = section.match(
        /<a\b[^>]*href=["'](https?:\/\/[^"']*jobleads\.com\/[^"']*job\/[^"']+)["'][^>]*>/i
      );
      let applyUrl: string | null = null;
      if (linkMatch && linkMatch[1]) {
        const rawUrl = linkMatch[1].replace(/&amp;/g, "&");
        const unwrapped = unwrapTrackingUrl(rawUrl);
        applyUrl = stripTrackingParams(unwrapped || rawUrl);
      }

      // Synthesize clean job description
      const descParts = [rawTitle];
      if (extractedCompany && extractedCompany !== "Unknown Company") {
        descParts.push(`at ${extractedCompany}`);
      }
      if (location) {
        descParts.push(`in ${location}`);
      }
      const description = `${descParts.join(" ")}.`;

      jobs.push({
        title: rawTitle,
        company: extractedCompany || "Unknown Company",
        companyDomain: null,
        location: location || null,
        salary: salaryDisplay || null,
        salaryMax: salaryMax ?? null,
        postedAt: options.receivedAt ? options.receivedAt.toISOString() : null,
        description,
        applyUrl: applyUrl || null,
        applicationType: "EXTERNAL_LINK",
        classificationMethod: "HEURISTIC",
        isAlreadyApplied: false,
        recipientEmail: null,
        recipientName: null,
        matchScore: 0,
        matchReason: null,
      });
    }
  }

  // Strategy 2: If HTML comment boundaries were stripped, fall back to markdown link card blocks
  if (jobs.length === 0) {
    const cardRe =
      /([A-Z0-9][^\n]+)\n+([A-Z0-9][^\n]+)\n+(?:[^\n]*\n+)?\[(?:View job|View this role|Apply)\]\((https?:\/\/[^\)]+jobleads\.com[^\)]+)\)/gi;
    let match: RegExpExecArray | null;
    while ((match = cardRe.exec(html)) !== null) {
      const title = cleanHtmlText(match[1]);
      let company = cleanHtmlText(match[2]);
      const rawUrl = match[3];

      if (
        !company ||
        /jobleads|saved\s*search|based\s*on\s*your/i.test(company.replace(/\s+/g, ""))
      ) {
        company = "Unknown Company";
      } else {
        company = sanitizeCompanyName(company);
      }

      const unwrapped = unwrapTrackingUrl(rawUrl);
      const applyUrl = stripTrackingParams(unwrapped || rawUrl);

      jobs.push({
        title,
        company,
        companyDomain: null,
        location: null,
        salary: null,
        salaryMax: null,
        postedAt: options.receivedAt ? options.receivedAt.toISOString() : null,
        description: `${title} at ${company}.`,
        applyUrl: applyUrl || null,
        applicationType: "EXTERNAL_LINK",
        classificationMethod: "HEURISTIC",
        isAlreadyApplied: false,
        recipientEmail: null,
        recipientName: null,
        matchScore: 0,
        matchReason: null,
      });
    }
  }

  if (jobs.length === 0) {
    return null;
  }

  return {
    is_job_related: true,
    email_category: "JOB_BOARD_DIGEST",
    company_name: "Unknown Company",
    role_title: null,
    status: "LEAD",
    action_required: false,
    action_summary: null,
    action_url: null,
    deadline_iso: null,
    jobs,
    classificationMethod: "HEURISTIC",
    routingLines: [
      `Tier 3: JOBLEADS_PARSER -> SUCCESS (${jobs.length} jobs extracted)`,
    ],
    sourceTier: "TIER 3 (HEURISTIC)",
  };
}
