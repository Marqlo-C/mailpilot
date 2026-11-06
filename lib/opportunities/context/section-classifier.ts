/**
 * ============================================================================
 * UNIVERSAL JOB SECTION CLASSIFIER & DUAL-PAYLOAD PARSER
 * 
 * Career-, site-, and candidate-agnostic section segmenter.
 * Categorizes document blocks into standard taxonomies (about_company,
 * overview, responsibilities, qualifications, benefits, etc.) and constructs:
 * 1. coreMarkdown: High-signal text for downstream AI matching & RAG tailoring.
 * 2. fullReconstructedMarkdown: Natural verbatim flow for the card modal.
 * 3. overviewSnippet: Crisp ~150-char role summary for the card face.
 * ============================================================================
 */

import type {
  JobSectionCategory,
  ParsedJobSection,
  StructuredJobDescription,
} from "./schema.ssot";
import { htmlToStructuredMarkdown } from "./html-markdown";
import { US_STATES_AND_TERRITORIES, VALID_STATE_CODES } from "@/lib/utils/location";

/**
 * Universal validation for candidate company names.
 * Rejects aggregator/navigation boilerplate, pure locations, US states, and zip codes.
 */
export function isValidCompanyName(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;

  // 1. Reject aggregator and navigation chrome
  if (
    /^(jobs?|careers?|search|company|apply|sign in|home|navigation|menu|ziprecruiter|indeed|linkedin|glassdoor|jobleads|monster)$/i.test(
      trimmed
    )
  ) {
    return false;
  }

  // 2. Reject city, state patterns (e.g. "Elk Grove, CA 95624", "Austin, TX")
  if (/,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(trimmed)) {
    return false;
  }

  // 3. Reject US 5-digit zip codes
  if (/^\d{5}(?:-\d{4})?$/.test(trimmed)) {
    return false;
  }

  // 4. Reject workplace arrangement tags
  if (/^(?:remote|hybrid|on-site|onsite)(?:\s+in\s+.*)?$/i.test(trimmed)) {
    return false;
  }

  // 5. Reject standalone US states or state postal codes
  const upper = trimmed.toUpperCase();
  if (VALID_STATE_CODES.has(upper)) {
    return false;
  }
  const cleanStateKey = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  if (US_STATES_AND_TERRITORIES[cleanStateKey]) {
    return false;
  }

  return true;
}

/**
 * Universal classification rules mapping heading strings to semantic categories.
 * Treats every candidate discipline completely neutrally with zero domain bias.
 */
export function classifySectionHeading(headingText: string): JobSectionCategory {
  const h = headingText.trim().toLowerCase();

  // 1. About Company / Who We Are
  if (
    /\b(?:about (?:the )?(?:company|organization|firm|business|us)|who we are|our story|our mission|company overview|company description|conversations @|life at [a-z0-9&.,' -]{1,30}|about [a-z0-9&.,' -]{1,30}|why join\b[a-z0-9&.,' -]{0,40})\b/i.test(
      h
    )
  ) {
    if (!/\b(?:role|job|position|opportunity)\b/i.test(h)) {
      return "about_company";
    }
  }

  // 2. Minimum / Required Qualifications
  if (
    /\b(?:minimum|basic|required|must have|essential)\s+(?:qualifications|requirements|skills|criteria)\b/i.test(
      h
    )
  ) {
    return "qualifications_required";
  }

  // 3. Preferred / Nice-to-Have Qualifications
  if (
    /\b(?:preferred|desired|bonus|nice to have|additional|advantageous)\s+(?:qualifications|requirements|skills)\b/i.test(
      h
    )
  ) {
    return "qualifications_preferred";
  }

  // 4. General Qualifications / What You Need
  if (
    /\b(?:qualifications|requirements|skills & qualifications|your qualifications|what you(?:\s+will|'ll)?\s+need|what you need to be successful|required capabilities|skills|you should have the following)\b/i.test(
      h
    )
  ) {
    return "qualifications_required";
  }

  // 5. Role Overview / Summary / Plain English Description
  if (
    /\b(?:job (?:overview|summary|details|description)|position overview|role overview|about the (?:role|job|position)|the (?:role|position|job)|summary|overview|tl;dr|project scope)\b/i.test(
      h
    )
  ) {
    return "overview";
  }

  // 6. Responsibilities / What You'll Do
  if (
    /\b(?:responsibilities|key responsibilities|core duties|duties|what you(?:'ll| will) do|what will you be doing|what you will be doing|day in the life|role description|your growth)\b/i.test(
      h
    )
  ) {
    return "responsibilities";
  }

  // 6. Candidate Profile / What We're Looking For
  if (
    /\b(?:what we(?:'re| are) looking for|what you(?:'ll| will) bring|who you are|candidate profile|ideal candidate|put your skills to work)\b/i.test(
      h
    )
  ) {
    return "candidate_profile";
  }

  // 7. Role Overview / Summary / Plain English Description
  if (
    /\b(?:job (?:overview|summary|details|description)|position overview|role overview|about the (?:role|job|position)|summary|overview|tl;dr|project scope)\b/i.test(
      h
    )
  ) {
    return "overview";
  }

  // 8. Compensation & Benefits
  if (
    /\b(?:benefits|perks|compensation|what we offer|why join us|pay details|our office|advantages of contracting|salary range)\b/i.test(
      h
    )
  ) {
    return "compensation_benefits";
  }

  // 9. Compliance / EEO / Disclosures
  if (
    /\b(?:equal opportunity|diversity|affirmative action|voluntary self-identification|physical demands)\b/i.test(
      h
    )
  ) {
    return "legal_eeo";
  }

  return "general";
}

/**
 * Strips platform-level applicant chrome (e.g. "Reposted 3 weeks ago", "People you can reach out to")
 * and trailing aggregator widgets (e.g. "More jobs", "Benefits found in job post", "Looking for talent?", "Questions? Visit our Help Center")
 * from scraped DOM or pasted text.
 */
export function sanitizeAggregatorChrome(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw;

  // 1. Strip platform navigation and applicant stats preamble
  const aboutJobIdx = s.search(/(?:^|[\n\r]|(?<=[a-z]))About the (?:job|role|position)/i);
  if (aboutJobIdx > 30) {
    const preamble = s.slice(0, aboutJobIdx);
    if (/reposted|applicants|easy apply|match details|people you can reach out to|sign in|applied ai/i.test(preamble)) {
      s = s.slice(aboutJobIdx).trim();
    }
  }

  // 1b. Strip Indeed right-pane Job details / benefits preamble
  s = s.replace(
    /(?:^|[\n\r])(?:#+\s*)?Job details[\s\S]*?(?=(?:#+\s*(?:Why this role|Role Overview|What you will do|What You'll Do|Responsibilities|Qualifications|Requirements|Job Description|About)|<p><b>|Work Location:))/i,
    ""
  );

  // 2. Strip platform trailing widgets, recommendations carousel, and footers
  const postamblePatterns = [
    /(?:\b|(?<=[a-z]))(?:Benefits found in job post|Set alert for similar jobs|Job search (?:faster|smarter) with Premium|Looking for talent\?|Start hiring|More jobs|Similar jobs|Jobs you may like|See more jobs like this|About Accessibility|LinkedIn Corporation ©|Questions\? Visit our Help Center|Recommendation transparency|Select language)[\s\S]*$/i,
    /\b(?:About the company\s*[\s\S]*?)?(?:More jobs|Similar jobs|Looking for talent\?)[\s\S]*$/i,
  ];
  for (const rx of postamblePatterns) {
    s = s.replace(rx, "").trim();
  }

  // 3. Strip stray trailing ellipses / "more" buttons
  s = s.replace(/[….]\s*more\s*$/i, "").trim();

  return s;
}

/**
 * Universal job title & company sanitization.
 * Unpacks compound titles (e.g. "Job Title | Company | LinkedIn") across platforms.
 */
export function cleanTitleAndCompany(
  rawTitle: string,
  currentCompany = ""
): { title: string; company: string } {
  let title = (rawTitle || "").trim();
  let company = (currentCompany || "").trim();

  // Pattern: "Job Title | Company | LinkedIn" or "Job Title - Company - Indeed"
  const tripleMatch = title.match(
    /^(.+?)\s*[|｜•·-]\s*(.+?)\s*[|｜•·-]\s*(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter|JobLeads|Greenhouse|Lever|Ashby|Workday|Monster)/i
  );
  if (tripleMatch) {
    title = tripleMatch[1].trim();
    const token2 = tripleMatch[2].trim();
    // On JobLeads or Indeed, token 2 is often the location (e.g. "Software Engineer - Austin | JobLeads" or "... - Elk Grove, CA 95624 - Indeed.com"), not the company!
    const isLocationToken =
      /,\s*[A-Z]{2}(?:\s+\d{5})?$/i.test(token2) ||
      /JobLeads/i.test(rawTitle) ||
      !isValidCompanyName(token2);
    if (!company && !isLocationToken && isValidCompanyName(token2)) {
      company = token2;
    }
    return { title, company };
  }

  // Pattern: "Company hiring Job Title in Location" (Glassdoor)
  const hiringMatch = title.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+Job\s+in|\s*\||$)/i);
  if (hiringMatch) {
    if (!company) company = hiringMatch[1].trim();
    title = hiringMatch[2].trim();
    return { title, company };
  }

  // Pattern: "Job Title at Company | Platform"
  const atMatch = title.match(/^(.+?)\s+at\s+([^|｜•·-]+)/i);
  if (atMatch) {
    title = atMatch[1].trim();
    if (!company) company = atMatch[2].trim();
  }

  // Pattern: "Job Title | Company - RequisitionNumber" (e.g. Porter | Stellantis - AutoNation ... - 42947)
  const pipeMatch = title.match(/^([^|｜]+?)\s*[|｜]\s*([^|｜]+)$/);
  if (pipeMatch && !/LinkedIn|Indeed|Glassdoor|ZipRecruiter|JobLeads|Monster|Jobs/i.test(pipeMatch[2])) {
    title = pipeMatch[1].trim();
    if (!company) {
      company = pipeMatch[2]
        .replace(/\s*[-–]\s*\d{3,}\s*$/, "")
        .replace(/^(?:Stellantis\s*[-–]\s*)/i, "")
        .replace(/Careers?/i, "")
        .trim();
    }
    return { title, company };
  }

  // Strip trailing platform suffixes
  title = title
    .replace(
      /\s*[|｜•·-]\s*(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter|JobLeads|Greenhouse|Lever|Ashby|Workday|Monster|Careers?).*$/i,
      ""
    )
    .trim();

  // Clean company of aggregator/requisition prefixes or suffixes
  if (company) {
    company = company
      .replace(/^(?:Stellantis\s*[-–]\s*)/i, "")
      .replace(/\s*[-–]\s*\d{3,}\s*$/, "")
      .trim();
  }

  // If title still has "| Company", strip company if known
  if (company && title.toLowerCase().includes(company.toLowerCase())) {
    const rx = new RegExp(
      `\\s*[|｜•·-]\\s*${company.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}.*$`,
      "i"
    );
    title = title.replace(rx, "").trim();
  }

  return { title, company };
}

const HEADING_LINE_REGEX = /^(?:#{1,4}\s+|(?:\*\*)?([A-Z][A-Za-z0-9&/,' -]{2,60})(?:\*\*)?[:\s-]*$)/;

/**
 * Parses markdown or raw HTML into classified sections and dual payloads.
 */
export function parseStructuredJobSections(
  rawTextOrHtml: string
): StructuredJobDescription {
  if (!rawTextOrHtml || typeof rawTextOrHtml !== "string") {
    return {
      coreMarkdown: "",
      fullReconstructedMarkdown: "",
      overviewSnippet: "",
      sections: [],
    };
  }

  // 1. Strip raw platform chrome before parsing
  const unchromed = sanitizeAggregatorChrome(rawTextOrHtml);

  // 2. Ensure content is in structured Markdown format
  const markdown = htmlToStructuredMarkdown(unchromed);

  const lines = markdown.split("\n");
  const sections: ParsedJobSection[] = [];

  let currentHeading = "Overview";
  let currentCategory: JobSectionCategory = "overview";
  let currentBodyLines: string[] = [];

  const flushCurrentSection = () => {
    const body = currentBodyLines.join("\n").trim();
    if (body || currentHeading !== "Overview") {
      sections.push({
        heading: currentHeading,
        category: currentCategory,
        body,
      });
    }
    currentBodyLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for markdown heading: ### Heading
    const mdHeadingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (mdHeadingMatch) {
      flushCurrentSection();
      currentHeading = mdHeadingMatch[1].replace(/\*\*/g, "").trim();
      currentCategory = classifySectionHeading(currentHeading);
      continue;
    }

    // Check for bold standalone title line acting as a heading: **Key Responsibilities**
    const boldHeadingMatch = trimmed.match(/^\*\*([A-Za-z0-9&/,' -]{3,60})\*\*[:\s-]*$/);
    if (boldHeadingMatch && !trimmed.startsWith("-")) {
      flushCurrentSection();
      currentHeading = boldHeadingMatch[1].trim();
      currentCategory = classifySectionHeading(currentHeading);
      continue;
    }

    currentBodyLines.push(line);
  }

  flushCurrentSection();

  // If no sections were produced, wrap the entire text as general/overview
  if (sections.length === 0 && markdown) {
    sections.push({
      heading: "Job Overview",
      category: "overview",
      body: markdown,
    });
  }

  // 1. Build fullReconstructedMarkdown (Natural sequence for the user modal)
  const fullBlocks = sections
    .map((s) => {
      const isDefaultHeading =
        (s.heading === "Overview" || s.heading === "Job Overview") &&
        sections.length === 1;
      const prefix = s.heading && !isDefaultHeading ? `### ${s.heading}\n\n` : "";
      return `${prefix}${s.body}`.trim();
    })
    .filter(Boolean);
  const fullReconstructedMarkdown = fullBlocks.join("\n\n");

  // 2. Build coreMarkdown (High-signal text for downstream matching & RAG tailoring)
  // Excludes "about_company" and "legal_eeo" to prevent LLM concept bleed
  const coreBlocks = sections
    .filter((s) => s.category !== "about_company" && s.category !== "legal_eeo")
    .map((s) => {
      const isDefaultHeading =
        (s.heading === "Overview" || s.heading === "Job Overview") &&
        sections.length === 1;
      const prefix = s.heading && !isDefaultHeading ? `### ${s.heading}\n\n` : "";
      return `${prefix}${s.body}`.trim();
    })
    .filter(Boolean);
  const coreMarkdown = coreBlocks.length > 0 ? coreBlocks.join("\n\n") : fullReconstructedMarkdown;

  // 3. Build overviewSnippet (Crisp 2-line snippet for the card face)
  let overviewSnippet = "";
  const eligibleSections = sections.filter(
    (s) => s.category !== "about_company" && s.category !== "legal_eeo"
  );
  const overviewSection =
    eligibleSections.find((s) => s.category === "overview" && s.body.length > 30) ||
    eligibleSections.find((s) => s.category === "general" && s.body.length > 30) ||
    eligibleSections.find((s) => s.category === "responsibilities" && s.body.length > 30) ||
    eligibleSections.find((s) => s.body.length > 30) ||
    sections[0];

  if (overviewSection && overviewSection.body) {
    // Find the first natural sentence or paragraph
    const firstPara = overviewSection.body
      .split("\n\n")[0]
      .replace(/^[-*•]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    overviewSnippet = firstPara.length > 220 ? `${firstPara.slice(0, 217)}...` : firstPara;
  }

  return {
    coreMarkdown,
    fullReconstructedMarkdown,
    overviewSnippet,
    sections,
  };
}
