/**
 * ============================================================================
 * SINGLE SOURCE OF TRUTH (SSOT): GRAND HEURISTIC ENGINE
 * 
 * ATTENTION FUTURE DEVELOPERS:
 * This file is the canonical zero-token, deterministic classification and
 * extraction engine. It operates completely locally without external LLM
 * inference, providing 100% career-agnostic heuristic parsing of company,
 * role title, status, location, salary, apply URLs, and JSON-LD metadata.
 * ============================================================================
 */

import {
  type JobClassification,
  type ExtractedJob,
} from "@/lib/llm/classification";
import {
  parseSalaryMax,
  normalizeSalaryDisplay,
  heuristicMatchScore,
  type CandidateProfileSummary,
} from "@/lib/ai/classifier";
import {
  parseApplicationEmail,
  genericRoleTitle,
  isGenericTitle,
} from "@/lib/parsers/application-parser";
import {
  ENTERPRISE_ATS_DOMAINS,
  UNIVERSAL_JOB_BOARD_DOMAINS,
  DIGEST_SENDER_HINTS,
  matchesConfirmationSignal,
  SOURCING_HOOK_PATTERN,
  DIGEST_SUBJECT_PHRASES,
  ATS_DOMAIN_PATTERN,
  JOB_BOARD_DOMAIN_PATTERN,
} from "@/lib/constants/job-sources";
import {
  APPLICATION_SENT_TO_RE,
  NON_JOB_SUBJECT_PATTERNS,
  looksLikeDigest,
  shouldClassifyEmail,
} from "@/lib/ai/prefilter";
import {
  extractCleanSnippet,
  resolveJobOpportunity,
} from "@/lib/opportunities/context";
import {
  extractMatchCandidateLens,
  evaluateOpportunityMatch,
} from "@/lib/matching";

/* -------------------------------------------------------------------------- */
/*                                URL PATTERNS                                */
/* -------------------------------------------------------------------------- */

const URL_SCAN_REGEX = /https?:\/\/[^\s<>"'()[\]{}|\\^`]+/gi;

const ATS_DOMAIN_STRINGS = [
  ...ENTERPRISE_ATS_DOMAINS,
  ...UNIVERSAL_JOB_BOARD_DOMAINS,
  "ashbyhq.com",
  "myworkdayjobs.com",
  "lever.co",
  "greenhouse.io",
  "smartrecruiters.com",
  "rippling.com",
  "workable.com",
  "breezy.hr",
  "icims.com",
  "jobvite.com",
  "bamboohr.com",
];

const JOB_URL_PATH_REGEX = /\/(?:jobs?|careers?|positions?|apply|requisition)\b/i;

/* -------------------------------------------------------------------------- */
/*                               STATUS PATTERNS                              */
/* -------------------------------------------------------------------------- */

const OFFER_PATTERNS = [
  /\bpleased to offer\b/i,
  /\boffer of employment\b/i,
  /\bjob offer\b/i,
  /\bformal offer\b/i,
  /\boffer letter\b/i,
  /\bcongratulations on your offer\b/i,
];

const INTERVIEW_PATTERNS = [
  /\binvitation to interview\b/i,
  /\bschedule (?:an?|your) interview\b/i,
  /\binterview invitation\b/i,
  /\binterview (?:schedule|confirmation|request)\b/i,
  /\bphone screen\b/i,
  /\bhiring manager (?:screen|chat|call)\b/i,
  /\bvideo interview\b/i,
  /\bschedule a (?:quick )?chat\b/i,
  /\bintroductory call\b/i,
  /\bintro call\b/i,
];

const ASSESSMENT_PATTERNS = [
  /\bonline assessment\b/i,
  /\bskills assessment\b/i,
  /\btake-home (?:assignment|test|challenge)\b/i,
  /\bcomplete (?:your|the) assessment\b/i,
  /\bhackerrank\b/i,
  /\bcodesignal\b/i,
  /\bevaluation exercise\b/i,
  /\bwork sample\b/i,
];

const REJECTION_PATTERNS = [
  /\bregret to inform\b/i,
  /\bnot moving forward\b/i,
  /\bwill not be moving forward\b/i,
  /\bdecided to pursue other\b/i,
  /\bother candidates\b/i,
  /\bunfortunately\b/i,
  /\bnot selected for\b/i,
  /\bdecided not to proceed\b/i,
  /\bposition has been filled\b/i,
];

const RECRUITER_OUTREACH_PATTERNS = [
  /\breaching out (?:about|regarding)\b/i,
  /\bsaw your profile\b/i,
  /\bcame across your profile\b/i,
  /\bjoin our team\b/i,
  /\bwe(?:'re| are) hiring\b/i,
  /\bopen to (?:new )?opportunities\b/i,
  /\bexciting opportunity\b/i,
  /\bpotential fit\b/i,
];

/* -------------------------------------------------------------------------- */
/*                              EXTRACTORS                                    */
/* -------------------------------------------------------------------------- */

/**
 * Extracts candidate apply/listing URL from text or HTML body.
 */
export function extractApplyUrl(text: string): string | null {
  const matches = text.match(URL_SCAN_REGEX);
  if (!matches) return null;

  // 1. Check for ATS / job platform domains first
  for (const rawUrl of matches) {
    const cleanUrl = rawUrl.replace(/[.,;:)\]>]+$/, "");
    try {
      const parsed = new URL(cleanUrl);
      const host = parsed.hostname.toLowerCase();
      if (ATS_DOMAIN_STRINGS.some((domain) => host.includes(domain))) {
        return cleanUrl;
      }
    } catch {
      continue;
    }
  }

  // 2. Check for career/job path in URL
  for (const rawUrl of matches) {
    const cleanUrl = rawUrl.replace(/[.,;:)\]>]+$/, "");
    try {
      const parsed = new URL(cleanUrl);
      if (JOB_URL_PATH_REGEX.test(parsed.pathname)) {
        return cleanUrl;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Extracts candidate apply/listing URL from a specific block without cross-block bleed.
 */
export function extractBlockApplyUrl(block: string): string | null {
  const directMatch = block.match(
    /https?:\/\/[^\s<>"')]+(?:linkedin\.com\/(?:comm\/)?jobs\/view\/|greenhouse\.io|lever\.co|workday|ashbyhq\.com|smartrecruiters\.com|indeed\.com\/viewjob)[^\s<>"')]+/i
  );
  if (directMatch) return directMatch[0].replace(/[.,;:)\]>]+$/, "");

  const atsMatch = extractApplyUrl(block);
  if (atsMatch) return atsMatch;

  const mdMatch = block.match(
    /\[(?:apply|view\s+job|view\s+role|details|link|[^\]]+)\]\((https?:\/\/[^\s)]+)\)/i
  );
  if (
    mdMatch &&
    !/unsubscribe|privacy|preferences|notification|settings/i.test(mdMatch[1])
  ) {
    return mdMatch[1].replace(/[.,;:)\]>]+$/, "");
  }

  const anyUrl = block.match(/https?:\/\/[^\s<>"')]+/i);
  if (
    anyUrl &&
    !/unsubscribe|privacy|preferences|settings|notification/i.test(anyUrl[0])
  ) {
    return anyUrl[0].replace(/[.,;:)\]>]+$/, "");
  }

  return null;
}

/**
 * Splits multi-job digest bodies (LinkedIn, Indeed, etc.) into distinct job blocks
 * and extracts individual opportunities without cross-block URL or company bleed.
 */
export function parseDigestJobs(
  body: string,
  defaultCompany: string,
  candidateProfile?: CandidateProfileSummary | null
): ExtractedJob[] {
  // Split on markdown link anchors or "is hiring for" / "view job" phrases
  const splitRegex =
    /(?=\[[^\]]+\]\(https?:\/\/[^\s)]+\)|(?:\n\s*(?:[A-Z0-9][A-Za-z0-9&.,' -]{1,40}\s+(?:is|are)\s+(?:hiring|seeking)))|\b(?:is hiring for|view job|apply now)\b)/i;

  const rawBlocks = body
    .split(splitRegex)
    .map((b) => b.trim())
    .filter((b) => b.length > 20);

  if (rawBlocks.length <= 1) {
    // If split by regex didn't produce multiple blocks, try splitting by double newline if multiple URLs exist
    const urls = body.match(URL_SCAN_REGEX) || [];
    if (urls.length > 1) {
      const newlineBlocks = body
        .split(/\n\s*\n/)
        .map((b) => b.trim())
        .filter((b) => b.length > 20 && extractBlockApplyUrl(b) !== null);
      if (newlineBlocks.length > 1) {
        const jobs = parseDigestBlocks(newlineBlocks, defaultCompany, candidateProfile);
        if (jobs.length > 1) return jobs;
      }
    }
    return [];
  }

  const jobs = parseDigestBlocks(rawBlocks, defaultCompany, candidateProfile);
  return jobs.length > 1 ? jobs : [];
}

function parseDigestBlocks(
  blocks: string[],
  defaultCompany: string,
  candidateProfile?: CandidateProfileSummary | null
): ExtractedJob[] {
  const jobs: ExtractedJob[] = [];
  const candidateLens = extractMatchCandidateLens(candidateProfile);

  for (const block of blocks) {
    const applyUrl = extractBlockApplyUrl(block);

    // 1. Title extraction
    let title: string | null = null;
    const mdTitleMatch = block.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (
      mdTitleMatch &&
      !/^(?:apply|view\s+job|view\s+role|details|link|learn\s+more|click\s+here|unsubscribe)$/i.test(
        mdTitleMatch[1].trim()
      )
    ) {
      title = mdTitleMatch[1].trim();
    }

    if (!title) {
      const isHiringTitle =
        block.match(
          /(?:is|are)\s+(?:hiring|seeking)\s+for\s+an?\s+([^,\n|–—\r]+?)(?:\s+(?:in|at|near|\.|\n|$))/i
        ) ||
        block.match(/(?:role|position|opening|job):\s*([^,\n|–—\r]+)/i) ||
        block.match(/(?:is|are)\s+(?:hiring|seeking)\s+(?:for\s+)?([^,\n|–—\r]+)/i);

      if (isHiringTitle?.[1]) {
        title = isHiringTitle[1].trim();
      }
    }

    if (!title) {
      const firstLine = block.split("\n")[0]?.trim();
      if (firstLine && firstLine.length < 60 && !firstLine.includes("http")) {
        title = firstLine
          .replace(/^(?:[-*•]|\d+\.)\s*/, "")
          .replace(/\s+(?:at|@|·|-)\s+[A-Z].*$/, "")
          .trim();
      }
    }

    // 2. Company extraction
    let company: string | null = null;
    const isHiringComp =
      block.match(/^([A-Z0-9][A-Za-z0-9&.,' -]{1,40}?)\s+(?:is|are)\s+(?:hiring|seeking)/i) ||
      block.match(/\n([A-Z0-9][A-Za-z0-9&.,' -]{1,40}?)\s+(?:is|are)\s+(?:hiring|seeking)/i);

    if (isHiringComp) {
      company = isHiringComp[1].trim();
    } else {
      const bulletMatch = block.match(
        /(?:^|\n)\s*([A-Z0-9][A-Za-z0-9&.,' -]{1,40}?)\s*(?:·|•|-)\s*([A-Z][A-Za-z\s,]+)/
      );
      if (bulletMatch) {
        company = bulletMatch[1].trim();
      } else {
        const atCompMatch = block.match(
          /(?:at|@)\s+([A-Z0-9][A-Za-z0-9&.,' -]{1,40}?)(?:\s*(?:·|\n|-|,|\.|\s*\$|\s*\(|$))/i
        );
        if (atCompMatch) {
          company = atCompMatch[1].trim();
        }
      }
    }

    let resolvedCompany = company || defaultCompany;
    resolvedCompany = resolvedCompany
      .replace(/\s+(?:and|&)\s+\d+\s+more\b.*$/i, "")
      .replace(/\s+(?:is|are)\s+hiring\b.*$/i, "")
      .trim();
    if (!resolvedCompany) resolvedCompany = defaultCompany || "Unknown Company";

    let resolvedTitle = title ? title.trim() : "";
    resolvedTitle = resolvedTitle
      .replace(/^(?:new\s+jobs?\s+(?:similar\s+to|like|for)\s+)/i, "")
      .replace(/^(?:jobs?\s+similar\s+to\s+)/i, "")
      .replace(/^(?:top\s+picks?\s+for\s+)/i, "")
      .replace(/^(?:recommended\s+jobs?:\s*)/i, "")
      .trim();

    if (resolvedTitle.startsWith("http://") || resolvedTitle.startsWith("https://")) {
      resolvedTitle = genericRoleTitle(resolvedCompany);
    }

    if (!resolvedTitle || isGenericTitle(resolvedTitle, resolvedCompany)) {
      if (!applyUrl) {
        continue;
      }
      resolvedTitle = genericRoleTitle(resolvedCompany);
    }

    // 3. Metadata
    const { salary, salaryMax } = extractSalary(block);
    const location = extractLocation(block);
    const cleanSnippet = extractCleanSnippet(block, 200, 800);

    // 4. Match evaluation
    const normalizedOpportunity = resolveJobOpportunity(
      {
        company: resolvedCompany,
        title: resolvedTitle,
        description:
          cleanSnippet ||
          (location
            ? `Role at ${resolvedCompany} (${location})`
            : `Role at ${resolvedCompany}`),
        location: location || null,
        salary: salary || null,
        salaryMax: salaryMax ?? null,
        applyUrl: applyUrl || null,
        classificationMethod: "HEURISTIC",
      },
      block
    );

    const matchResult = evaluateOpportunityMatch({
      opportunity: normalizedOpportunity,
      candidate: candidateLens,
      mode: "HEURISTIC",
    });

    jobs.push({
      company: resolvedCompany,
      companyDomain: null,
      title: resolvedTitle,
      location: location || null,
      salary: salary || null,
      salaryMax: salaryMax ?? null,
      postedAt: null,
      description:
        cleanSnippet ||
        (location
          ? `Role at ${resolvedCompany} (${location})`
          : `Role at ${resolvedCompany}`),
      applyUrl: applyUrl || null,
      applicationType: applyUrl ? "EXTERNAL_LINK" : "DIRECT_EMAIL",
      recipientEmail: null,
      recipientName: null,
      isAlreadyApplied: false,
      matchScore: matchResult.score,
      matchReason: matchResult.reason,
    });
  }

  return jobs;
}

/**
 * Extracts salary display string and max annualized number from text.
 */
export function extractSalary(text: string): {
  salary: string | null;
  salaryMax: number | null;
} {
  let res: { salary: string | null; salaryMax: number | null } = {
    salary: null,
    salaryMax: null,
  };

  // Pattern 1: $120,000 - $150,000, $120K - $160K, $120K - 160, 112K - 187, $45 - $65/hr
  const rangeMatch = text.match(
    /(?:(\$)?(\d{1,3}(?:,\d{3})*|\d{2,3})\s*(k)?)\s*(?:-|–|—|to)\s*(?:(\$)?(\d{1,3}(?:,\d{3})*|\d{2,3})\s*(k)?)(?:\s*(\/yr|\/year|per\s+year|annually|\/hr|per\s+hour|an\s+hour|hourly))?/i
  );

  if (rangeMatch) {
    const hasDollar1 = Boolean(rangeMatch[1]);
    const hasK1 = Boolean(rangeMatch[3]);
    const hasDollar2 = Boolean(rangeMatch[4]);
    const hasK2 = Boolean(rangeMatch[6]);
    const unit = rangeMatch[7];

    if (hasDollar1 || hasDollar2 || hasK1 || hasK2 || unit) {
      const raw = rangeMatch[0].trim();
      const normalized = normalizeSalaryDisplay(raw);
      if (normalized) {
        res = {
          salary: normalized,
          salaryMax: parseSalaryMax(normalized),
        };
      }
    }
  }

  // Pattern 2: Single $120,000/yr or $50/hr
  if (!res.salary) {
    const singleMatch = text.match(
      /(?:\$)?(\d{1,3}(?:,\d{3})*|\d{2,3})\s*(k)?(?:\s*(\/yr|\/year|per\s+year|annually|\/hr|per\s+hour|an\s+hour|hourly))/i
    );
    if (singleMatch) {
      const raw = singleMatch[0].trim();
      const normalized = normalizeSalaryDisplay(raw);
      if (normalized) {
        res = {
          salary: normalized,
          salaryMax: parseSalaryMax(normalized),
        };
      }
    }
  }

  const isHourly =
    /\b(?:hr|hour|hourly|\/hr)\b/i.test(text) ||
    (res.salaryMax != null && res.salaryMax < 200);

  if (isHourly && res.salary) {
    if (!res.salary.includes("/hr")) {
      res.salary = `${res.salary}/hr`;
    }
    if (res.salaryMax != null && res.salaryMax < 1000) {
      res.salaryMax = Math.round(res.salaryMax * 2080);
    }
  }

  return res;
}

/**
 * Extracts workplace location or work model (Remote, Hybrid, City, State).
 */
export function extractLocation(text: string): string | null {
  // Check for collapsed boundary directly: e.g. "DeveloperMadison, WI"
  const collapsedMatch = text.match(
    /[a-z]([A-Z][a-zA-Z\s.-]{1,20}),\s*([A-Z]{2})\b/
  );
  if (collapsedMatch) {
    let city = collapsedMatch[1].trim();
    city = city
      .replace(
        /^.*?\b(?:engineer|developer|manager|specialist|lead|analyst)\s+/i,
        ""
      )
      .trim();
    return `${city}, ${collapsedMatch[2]}`;
  }

  // Separate words collapsed before city capitalization
  const normalizedText = text.replace(
    /([a-z])([A-Z][a-z]+,\s*[A-Z]{2})/g,
    "$1 $2"
  );
  const cityStateMatch = normalizedText.match(
    /\b([A-Z][a-zA-Z\s.-]{2,25}),\s*([A-Z]{2})\b/
  );
  if (cityStateMatch) {
    let city = cityStateMatch[1].trim();
    city = city
      .replace(
        /^.*?\b(?:engineer|developer|manager|specialist|lead|analyst)\s+/i,
        ""
      )
      .trim();
    city = city.replace(/^.*?\b(?:in|at|near)\s+/i, "").trim();
    return `${city}, ${cityStateMatch[2]}`;
  }

  if (/\b(?:fully\s+)?remote\b/i.test(text)) return "Remote";
  if (/\bhybrid\b/i.test(text)) return "Hybrid";
  if (/\bon-site\b/i.test(text)) return "On-site";

  return null;
}

/**
 * Extracts structured schema.org JobPosting metadata from JSON-LD scripts in HTML.
 */
export function extractJsonLdJobPosting(html: string): {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  description?: string;
  applyUrl?: string;
  datePosted?: string;
} | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
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
          const title = typeof item.title === "string" ? item.title.trim() : undefined;
          const company =
            typeof item.hiringOrganization?.name === "string"
              ? item.hiringOrganization.name.trim()
              : undefined;

          let location: string | undefined;
          if (item.jobLocationType === "TELECOMMUTE" || item.applicantLocationRequirements) {
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
            description = item.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          }

          const applyUrl = typeof item.url === "string" ? item.url : undefined;
          const datePosted = typeof item.datePosted === "string" ? item.datePosted : undefined;

          return { title, company, location, salary, description, applyUrl, datePosted };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Public JSON-LD scraper: fetches public job page and extracts JobPosting LD+JSON.
 */
export async function scrapeJobPostingJsonLd(url: string): Promise<{
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  description?: string;
  applyUrl?: string;
  datePosted?: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    return extractJsonLdJobPosting(html);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                       CLASSIFIER & LIFECYCLE ENGINE                        */
/* -------------------------------------------------------------------------- */

export type GrandHeuristicInput = {
  subject: string;
  body: string;
  fromEmail?: string | null;
  candidateProfile?: CandidateProfileSummary | null;
};

/**
 * Classifies an email purely via deterministic heuristics (zero LLM token consumption).
 */
export function classifyWithGrandHeuristic(
  input: GrandHeuristicInput
): JobClassification | null {
  const { subject, body, fromEmail, candidateProfile } = input;
  const cleanSubject = subject.trim();
  const textCorpus = `${cleanSubject}\n\n${body}`;

  // 0. Non-Job / Automated / Marketing Reject Guard
  if (NON_JOB_SUBJECT_PATTERNS.some((re) => re.test(cleanSubject))) {
    return {
      is_job_related: false,
      email_category: "IRRELEVANT",
      company_name: null,
      role_title: null,
      status: "LEAD",
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      classificationMethod: "HEURISTIC",
      routingLines: ["Tier 3: HEURISTIC -> Filtered as Non-Job (Automated/Promo)"],
      jobs: [],
    };
  }

  // 1. Initial Relevance Check
  const sentMatch = cleanSubject.match(APPLICATION_SENT_TO_RE);
  const thankYou = matchesConfirmationSignal(cleanSubject);
  const parsedApp = parseApplicationEmail(cleanSubject, body);
  const prefilterPass = shouldClassifyEmail({ subject: cleanSubject, body, fromEmail });

  if (!sentMatch && !thankYou && !parsedApp && !prefilterPass) {
    return {
      is_job_related: false,
      email_category: "IRRELEVANT",
      company_name: null,
      role_title: null,
      status: "LEAD",
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      classificationMethod: "HEURISTIC",
      routingLines: ["Tier 3: HEURISTIC -> Filtered as Non-Job (Automated/Promo)"],
      jobs: [],
    };
  }

  // 2. Lifecycle Status & Email Category Resolution
  let status: "REJECTION" | "INTERVIEW" | "OA" | "RECEIVED" | "OTHER" | "OFFER" | "LEAD" | "APPLIED" = "LEAD";
  let emailCategory: "DIRECT_RECRUITER" | "JOB_BOARD_DIGEST" | "APPLICATION_STATUS" | "IRRELEVANT" = "IRRELEVANT";

  if (OFFER_PATTERNS.some((p) => p.test(textCorpus))) {
    status = "OFFER";
    emailCategory = "APPLICATION_STATUS";
  } else if (INTERVIEW_PATTERNS.some((p) => p.test(textCorpus))) {
    status = "INTERVIEW";
    emailCategory = "APPLICATION_STATUS";
  } else if (ASSESSMENT_PATTERNS.some((p) => p.test(textCorpus))) {
    status = "OA";
    emailCategory = "APPLICATION_STATUS";
  } else if (REJECTION_PATTERNS.some((p) => p.test(textCorpus))) {
    status = "REJECTION";
    emailCategory = "APPLICATION_STATUS";
  } else if (sentMatch || thankYou || parsedApp || /\bapplication\s+(?:received|submitted|confirmed)\b/i.test(textCorpus)) {
    status = "APPLIED";
    emailCategory = "APPLICATION_STATUS";
  } else if (
    SOURCING_HOOK_PATTERN.test(textCorpus) ||
    RECRUITER_OUTREACH_PATTERNS.some((p) => p.test(textCorpus))
  ) {
    status = "LEAD";
    emailCategory = "DIRECT_RECRUITER";
  } else if (
    looksLikeDigest(cleanSubject, fromEmail) ||
    DIGEST_SUBJECT_PHRASES.some((phrase) =>
      cleanSubject.toLowerCase().includes(phrase.replace(/"/g, "").toLowerCase())
    ) ||
    JOB_BOARD_DOMAIN_PATTERN.test(textCorpus) ||
    /\b(?:top\s+picks?|recommended\s+jobs?|jobs?\s+for\s+you|jobs?\s+similar\s+to|job\s+matches?)\b/i.test(
      cleanSubject
    )
  ) {
    status = "LEAD";
    emailCategory = "JOB_BOARD_DIGEST";
  } else if (
    ATS_DOMAIN_PATTERN.test(textCorpus) ||
    extractApplyUrl(textCorpus) ||
    /\b(?:we(?:'re|\s+are)\s+hiring|now\s+hiring|(?:is|are)\s+hiring|opening\s+at|opportunity\s+at|role\s+at|opening\s+for|position\s+at)\b/i.test(
      cleanSubject
    ) ||
    /\b(?:at|@)\s+[A-Z0-9]/i.test(cleanSubject)
  ) {
    status = "LEAD";
    emailCategory = "DIRECT_RECRUITER";
  }

  // 3. Company Resolution
  let company = parsedApp?.company?.trim() || null;
  if (!company && sentMatch?.[1]) {
    company = sentMatch[1].replace(/\s+/g, " ").trim();
  }
  if (!company) {
    const isHiringMatch = cleanSubject.match(
      /^([A-Z0-9][A-Za-z0-9&.,' -]{1,40}?)\s+(?:is|are)\s+hiring/i
    );
    if (isHiringMatch) {
      company = isHiringMatch[1].trim();
    }
  }
  if (!company) {
    // Subject regex: "at Company", "with Company", "from Company"
    const subjectCompanyMatch = cleanSubject.match(
      /(?:at|@|with|from)\s+([A-Z0-9][A-Za-z0-9&.,' -]{1,40}?)(?:\s+(?:is hiring|team|career|job|role|!|\.)|\s*$)/i
    );
    if (subjectCompanyMatch) {
      company = subjectCompanyMatch[1].trim();
    } else {
      const prefixMatch = cleanSubject.match(
        /^([A-Z0-9][A-Za-z0-9&.,' -]{1,40})\s+(?:is\s+hiring|careers?|jobs?)/i
      );
      if (prefixMatch) {
        company = prefixMatch[1].trim();
      }
    }
  }
  if (!company && fromEmail) {
    const domain = fromEmail.split("@")[1]?.toLowerCase() ?? "";
    if (
      domain &&
      !DIGEST_SENDER_HINTS.some((hint) => domain.includes(hint.replace("@", "")))
    ) {
      const brand = domain.split(".")[0];
      if (brand && brand.length > 1) {
        company = brand.charAt(0).toUpperCase() + brand.slice(1);
      }
    }
  }
  let resolvedCompany = company && company.length > 0 ? company : "Unknown Company";
  resolvedCompany = resolvedCompany
    .replace(/\s+(?:and|&)\s+\d+\s+more\b.*$/i, "")
    .replace(/\s+(?:is|are)\s+hiring\b.*$/i, "")
    .trim();
  if (!resolvedCompany) resolvedCompany = "Unknown Company";

  // 4. Role Title Resolution
  let roleTitle = parsedApp?.title?.trim() || null;
  if (!roleTitle || isGenericTitle(roleTitle, resolvedCompany)) {
    // Check subject patterns
    const titleFromSubject =
      cleanSubject.match(/(?:role|position|job|opening)\s*:\s*([^,\n|–—\r]+)/i) ||
      cleanSubject.match(/(?:for the|for an?)\s+([^,\n|–—\r]+?)\s+(?:role|position|opening|job)/i) ||
      cleanSubject.match(/(?:hiring for|hiring)\s*:\s*([^,\n|–—\r]+)/i) ||
      cleanSubject.match(/(?:hiring for)\s+([^,\n|–—\r]+?)(?:\s+(?:at|in|with|\.)|\s*$)/i) ||
      cleanSubject.match(/(?:new job|opportunity)\s*:\s*([^,\n|–—\r]+)/i) ||
      cleanSubject.match(/^([^,\n|–—\r]+?)\s+(?:at|@)\s+[A-Z0-9]/i);

    if (titleFromSubject?.[1]?.trim()) {
      roleTitle = titleFromSubject[1].trim();
    }
  }
  let resolvedTitle = roleTitle ? roleTitle.trim() : "";
  resolvedTitle = resolvedTitle
    .replace(/^(?:new\s+jobs?\s+(?:similar\s+to|like|for)\s+)/i, "")
    .replace(/^(?:jobs?\s+similar\s+to\s+)/i, "")
    .replace(/^(?:top\s+picks?\s+for\s+)/i, "")
    .replace(/^(?:recommended\s+jobs?:\s*)/i, "")
    .trim();

  if (resolvedTitle.startsWith("http://") || resolvedTitle.startsWith("https://")) {
    resolvedTitle = genericRoleTitle(resolvedCompany);
  }

  if (!resolvedTitle || isGenericTitle(resolvedTitle, resolvedCompany)) {
    resolvedTitle = genericRoleTitle(resolvedCompany);
  }

  // 5. Multi-Job Digest Handling (LinkedIn / Indeed)
  if (emailCategory === "JOB_BOARD_DIGEST") {
    const digestJobs = parseDigestJobs(body, resolvedCompany, candidateProfile);
    if (digestJobs.length > 0) {
      return {
        is_job_related: true,
        email_category: emailCategory,
        company_name: digestJobs[0].company,
        role_title: digestJobs[0].title,
        status,
        action_required: false,
        action_summary: null,
        action_url: digestJobs[0].applyUrl || null,
        deadline_iso: null,
        classificationMethod: "HEURISTIC",
        sourceTier: "TIER 3 (HEURISTIC)",
        routingLines: [
          "Tier 3: HEURISTIC    -> Grand Heuristic Engine [< 2ms]",
        ],
        jobs: digestJobs,
      };
    }
  }

  // 6. Metadata Extractors
  const applyUrl = extractApplyUrl(textCorpus);
  const { salary, salaryMax } = extractSalary(textCorpus);
  const location = parsedApp?.location ?? extractLocation(textCorpus);
  const cleanSnippet = extractCleanSnippet(body, 500, 1500);

  if (emailCategory === "IRRELEVANT") {
    return {
      is_job_related: false,
      email_category: "IRRELEVANT",
      company_name: null,
      role_title: null,
      status: "LEAD",
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      classificationMethod: "HEURISTIC",
      routingLines: ["Tier 3: HEURISTIC -> Filtered as Non-Job (No structural verification)"],
      jobs: [],
    };
  }

  // Block generic placeholder jobs ("Role at Company") without an ATS apply link or direct recruiter contact
  const hasApplyProof = Boolean(applyUrl || (emailCategory === "DIRECT_RECRUITER" && fromEmail));
  if (isGenericTitle(resolvedTitle, resolvedCompany) && !hasApplyProof && status === "LEAD") {
    return {
      is_job_related: false,
      email_category: "IRRELEVANT",
      company_name: null,
      role_title: null,
      status: "LEAD",
      action_required: false,
      action_summary: null,
      action_url: null,
      deadline_iso: null,
      classificationMethod: "HEURISTIC",
      routingLines: ["Tier 3: HEURISTIC -> Generic placeholder lacking application proof"],
      jobs: [],
    };
  }

  // 6. Match Score & Rationale Engine
  const candidateLens = extractMatchCandidateLens(candidateProfile);
  const normalizedOpportunity = resolveJobOpportunity(
    {
      company: resolvedCompany,
      title: resolvedTitle,
      description:
        cleanSnippet ||
        (location
          ? `Role at ${resolvedCompany} (${location})`
          : `Role at ${resolvedCompany}`),
      location: location || null,
      salary: salary || null,
      salaryMax: salaryMax ?? null,
      applyUrl: applyUrl || null,
      classificationMethod: "HEURISTIC",
    },
    body
  );
  const matchResult = evaluateOpportunityMatch({
    opportunity: normalizedOpportunity,
    candidate: candidateLens,
    mode: "HEURISTIC",
  });

  const isAlreadyApplied =
    status === "APPLIED" ||
    status === "INTERVIEW" ||
    status === "OA" ||
    status === "REJECTION" ||
    status === "OFFER";

  const actionRequired =
    status === "INTERVIEW" || status === "OA" || status === "OFFER";

  let actionSummary: string | null = null;
  if (status === "INTERVIEW") actionSummary = "Interview invitation detected";
  else if (status === "OA") actionSummary = "Online assessment detected";
  else if (status === "OFFER") actionSummary = "Job offer detected";
  else if (status === "REJECTION") actionSummary = "Application status update";
  else if (status === "APPLIED") actionSummary = "Application confirmation detected";
  else if (emailCategory === "DIRECT_RECRUITER") actionSummary = "Recruiter outreach lead";

  const extractedJob: ExtractedJob = {
    company: resolvedCompany,
    companyDomain: null,
    title: resolvedTitle,
    location: location || null,
    salary: salary || null,
    salaryMax: salaryMax ?? null,
    postedAt: null,
    description: cleanSnippet || (location ? `Role at ${resolvedCompany} (${location})` : `Role at ${resolvedCompany}`),
    applyUrl: applyUrl || null,
    applicationType: applyUrl ? "EXTERNAL_LINK" : "DIRECT_EMAIL",
    recipientEmail: emailCategory === "DIRECT_RECRUITER" ? (fromEmail ?? null) : null,
    recipientName: null,
    isAlreadyApplied,
    matchScore: matchResult.score,
    matchReason: matchResult.reason,
  };

  return {
    is_job_related: true,
    email_category: emailCategory,
    company_name: resolvedCompany,
    role_title: resolvedTitle,
    status,
    action_required: actionRequired,
    action_summary: actionSummary,
    action_url: applyUrl || null,
    deadline_iso: null,
    classificationMethod: "HEURISTIC",
    sourceTier: "TIER 3 (HEURISTIC)",
    routingLines: [
      "Tier 3: HEURISTIC    -> Grand Heuristic Engine [< 2ms]",
    ],
    jobs: [extractedJob],
  };
}
