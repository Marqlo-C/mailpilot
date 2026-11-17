import { flattenSkillItems, skillGroupsFromUnknown } from "@/lib/profile/skill-groups";
import {
  awardsSchema,
  certificationsSchema,
  interestsSchema,
  readEducationStatus,
} from "@/lib/validations/profile.schema";
import {
  type EmailCategory,
  resolveApplicationType,
} from "@/lib/opportunities/application-method";
import {
  cleanOpportunityDescription,
  clampScore,
  detectAlreadyApplied,
  heuristicMatchScore,
  parseSalaryMax,
  normalizeSalaryDisplay,
  sanitizeCompanyName,
  seniorityMismatchPenalty,
  type CandidateProfileSummary,
} from "./classifier";
import { JOB_BOARD_KEYWORDS } from "@/lib/constants/job-sources";
import { extractLocationFromText, standardizeLocation } from "@/lib/utils/location";
import {
  buildSynthesizedJobOverview,
  resolveJobOpportunity,
  normalizePostedAt,
  relativeTimeToIso,
} from "@/lib/opportunities/context";
import { evaluateOpportunityMatch } from "@/lib/matching/evaluator";
import { extractMatchCandidateLens } from "@/lib/matching/lens";
import { looksLikeDigest } from "./prefilter";
import { getCachedOrSynthesizePersona } from "@/lib/persona";
import {
  extractCardApplyUrl,
  segmentDigestBlocks,
} from "./email-cleaner";
import { prisma } from "@/lib/core/prisma";
import { parseAccountRules } from "@/lib/validations/rules.schema";
import type { JobClassification } from "@/lib/validations/classification.schema";

/**
 * Validates an extracted organization or employer name.
 * Discards date patterns, timestamps, and job alert metadata prefixes.
 */
export function isValidEmployerName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  const invalidPatterns = [
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i,
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
    /\b\d{1,2}\s*(?:st|nd|rd|th)?\s*(?:based on|saved search)/i,
    /^(?:based on|jobs matching|new jobs|top picks|recommended|job alert)/i,
    /\b(?:based on your saved search|saved search|most recent jobs)\b/i,
    /^(?:today|yesterday|just posted|\d+[dhwm]\s+ago)/i,
    /^(?:view|apply|see job|click here|full-?time|part-?time|contract|remote|hybrid|internship)/i,
    /^(?:m\/w\/d|f\/m\/d|all genders|w\/m\/d|d\/m\/w)$/i,
  ];
  return !invalidPatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Validates an extracted job role title.
 * Discards date patterns, timestamps, saved-search banners, and generic action text.
 */
export function isValidRoleTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;

  const noSpace = trimmed.replace(/\s+/g, "").toLowerCase();
  if (
    noSpace.includes("basedonyour") ||
    noSpace.includes("savedsearch") ||
    noSpace.includes("mostrelevantjobs") ||
    noSpace.includes("toppicksforyou") ||
    noSpace.includes("jobalert")
  ) {
    return false;
  }

  const invalidPatterns = [
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s*\d{0,2}\s*(?:st|nd|rd|th)?\s*(?:based\s*on|saved\s*search)/i,
    /\b\d{1,2}\s*(?:st|nd|rd|th)?\s*(?:based\s*on|saved\s*search)/i,
    /\b(?:based\s+on\s+your\s+saved\s+search|saved\s+search|most\s+recent\s+jobs|jobs\s+matching\s+your\s+search)\b/i,
    /^(?:job\s+alert|new\s+jobs?\s+for\s+you|top\s+picks|recommended\s+jobs?|jobs?\s+tailored)[:\s-]*$/i,
    /^(?:view\s+job|see\s+job|apply\s+now|click\s+here|view\s+details|full-?time|part-?time|contract|remote|hybrid)$/i,
  ];

  return !invalidPatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Strips aggregator alert preambles and date headers from a role title.
 * e.g., "Job alert: Software Engineer" -> "Software Engineer"
 * e.g., "October 13 - Senior Accountant" -> "Senior Accountant"
 */
export function sanitizeRoleTitle(title: string | null | undefined): string {
  if (!title) return "Role";
  const cleaned = title
    .replace(/^[A-Za-z]+\s+\d{1,2}\s*[-–|:]\s*/i, "")
    .replace(/^job\s+alert[:\s-]*/i, "")
    .replace(/^(?:new\s+)?jobs?\s+(?:matching|for\s+you|tailored\s+for\s+you)[:\s-]*/i, "")
    .replace(/_[a-zA-Z]{3}\d{1,2}$/i, "")
    .trim();

  if (!isValidRoleTitle(cleaned)) {
    return "Role";
  }
  return cleaned;
}

/**
 * Loads a compact candidate summary from the account's UserProfile (resume data),
 * cached persona columns, and excluded title patterns from AccountSettings.rules.
 */
export async function loadCandidateProfileSummary(
  accountId: string
): Promise<CandidateProfileSummary | null> {
  const [profile, settings] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { accountId },
      include: {
        experiences: { orderBy: { displayOrder: "asc" }, take: 4 },
        education: true,
        projects: { take: 4 },
      },
    }),
    prisma.accountSettings.findUnique({
      where: { accountId },
      select: { rules: true },
    }),
  ]);

  const excludedTitles = parseAccountRules(settings?.rules).excludedTitles;

  if (!profile) {
    console.warn(
      `Sync warning: Account ${accountId} has no linked UserProfile. Match scoring will use generic profile defaults.`
    );
    return {
      educationSummary: "Not specified",
      skills: [],
      experienceSummary: "Not specified",
      targetTitles: [],
      excludedTitles,
      persona: null,
    };
  }

  const skillGroups = skillGroupsFromUnknown(profile.skills);
  const skills = flattenSkillItems(skillGroups);

  const educationSummary =
    profile.education.length > 0
      ? profile.education
          .map((ed) =>
            [ed.degree, ed.fieldOfStudy, ed.institution]
              .filter(Boolean)
              .join(" — ")
          )
          .join("; ")
      : "n/a";

  const experienceSummary =
    profile.experiences.length > 0
      ? profile.experiences
          .map((e) => `${e.role} at ${e.company}`)
          .join("; ")
      : profile.summary?.slice(0, 280) || "n/a";

  const projectTitles = profile.projects.map((p) => p.name).filter(Boolean);
  const targetTitles = [
    ...new Set(profile.experiences.map((e) => e.role).filter(Boolean)),
  ];

  if (skills.length === 0 && experienceSummary === "n/a") {
    console.warn(
      `Sync warning: Account ${accountId} profile is empty. Match scoring will use generic profile defaults.`
    );
  }

  const persona = await getCachedOrSynthesizePersona(
    {
      accountId: profile.accountId,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      summary: profile.summary,
      links: [],
      skills: skillGroups,
      experiences: profile.experiences.map((e) => ({
        id: e.id,
        company: e.company,
        role: e.role,
        location: e.location,
        category: e.category,
        startDate: e.startDate,
        endDate: e.endDate,
        bullets: [],
        displayOrder: e.displayOrder,
      })),
      projects: profile.projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        technologies: p.technologies,
        link: p.link,
        bullets: p.bullets,
      })),
      education: profile.education.map((ed) => ({
        id: ed.id,
        institution: ed.institution,
        subSchool: ed.subSchool ?? null,
        degree: ed.degree,
        fieldOfStudy: ed.fieldOfStudy,
        startDate: ed.startDate ?? null,
        graduationDate: ed.graduationDate,
        status: readEducationStatus(ed.status),
        gpa: ed.gpa ?? null,
        honors: Array.isArray(ed.honors)
          ? ed.honors.filter((item): item is string => typeof item === "string")
          : [],
        coursework: Array.isArray(ed.coursework)
          ? ed.coursework.filter(
              (item): item is string => typeof item === "string"
            )
          : [],
      })),
      certifications: certificationsSchema.parse(profile.certifications),
      awards: awardsSchema.parse(profile.awards),
      interests: interestsSchema.parse(profile.interests),
      seniorityTier: profile.seniorityTier,
      timelineContext: profile.timelineContext,
      toneGuidance: profile.toneGuidance,
    },
    prisma
  );

  return {
    educationSummary,
    skills: [...skills, ...projectTitles].slice(0, 50),
    experienceSummary,
    targetTitles,
    excludedTitles,
    persona: {
      seniorityTier: persona.seniorityTier,
      timelineContext: persona.timelineContext,
      toneGuidance: persona.toneGuidance,
    },
  };
}

/**
 * Softens local-LLM quirks: unwraps common wrappers, maps camelCase aliases,
 * promotes `opportunities` → `jobs`, and infers `is_job_related` from job lists.
 */
export function coerceClassificationPayload(
  raw: Record<string, unknown>
): Record<string, unknown> {
  let payload: Record<string, unknown> = raw;

  for (const key of ["data", "result", "classification"] as const) {
    const nested = payload[key];
    if (
      nested &&
      typeof nested === "object" &&
      !Array.isArray(nested) &&
      (Array.isArray((nested as Record<string, unknown>).jobs) ||
        Array.isArray((nested as Record<string, unknown>).opportunities) ||
        typeof (nested as Record<string, unknown>).is_job_related ===
          "boolean" ||
        typeof (nested as Record<string, unknown>).is_job_related ===
          "string" ||
        typeof (nested as Record<string, unknown>).isJobRelated === "boolean" ||
        typeof (nested as Record<string, unknown>).isJobRelated === "string")
    ) {
      payload = nested as Record<string, unknown>;
      break;
    }
  }

  const next: Record<string, unknown> = { ...payload };

  if (next.is_job_related === undefined && next.isJobRelated !== undefined) {
    next.is_job_related = next.isJobRelated;
  }
  if (next.email_category === undefined && next.emailCategory !== undefined) {
    next.email_category = next.emailCategory;
  }
  if (next.company_name === undefined && next.companyName !== undefined) {
    next.company_name = next.companyName;
  }
  if (next.role_title === undefined && next.roleTitle !== undefined) {
    next.role_title = next.roleTitle;
  }
  if (next.action_required === undefined && next.actionRequired !== undefined) {
    next.action_required = next.actionRequired;
  }
  if (next.action_summary === undefined && next.actionSummary !== undefined) {
    next.action_summary = next.actionSummary;
  }
  if (next.action_url === undefined && next.actionUrl !== undefined) {
    next.action_url = next.actionUrl;
  }
  if (next.deadline_iso === undefined && next.deadlineIso !== undefined) {
    next.deadline_iso = next.deadlineIso;
  }

  if (!Array.isArray(next.jobs) && Array.isArray(next.opportunities)) {
    next.jobs = next.opportunities;
  }

  if (typeof next.is_job_related === "string") {
    next.is_job_related =
      (next.is_job_related as string).trim().toLowerCase() === "true";
  }
  if (typeof next.isJobRelated === "string") {
    next.is_job_related =
      (next.isJobRelated as string).trim().toLowerCase() === "true";
  }
  if (typeof next.action_required === "string") {
    next.action_required =
      (next.action_required as string).trim().toLowerCase() === "true";
  }
  if (typeof next.actionRequired === "string") {
    next.action_required =
      (next.actionRequired as string).trim().toLowerCase() === "true";
  }

  if (Array.isArray(next.jobs)) {
    next.jobs = (next.jobs as unknown[])
      .map((j) => {
        if (!j || typeof j !== "object" || Array.isArray(j)) return null;
        const jobObj = { ...(j as Record<string, unknown>) };
        for (const key of [
          "company",
          "title",
          "location",
          "companyDomain",
          "salary",
          "postedAt",
          "description",
          "url",
          "applyUrl",
          "recipientEmail",
          "recipientName",
          "matchReason",
        ] as const) {
          if (jobObj[key] === null || jobObj[key] === undefined) {
            if (key === "company" || key === "title") {
              jobObj[key] = "";
            } else {
              jobObj[key] = null;
            }
          }
        }
        if (typeof jobObj.isAlreadyApplied === "string") {
          jobObj.isAlreadyApplied =
            (jobObj.isAlreadyApplied as string).trim().toLowerCase() === "true";
        }
        return jobObj;
      })
      .filter((j): j is Record<string, unknown> => {
        if (!j) return false;
        const company =
          typeof j.company === "string" ? j.company.trim() : "";
        const title = typeof j.title === "string" ? j.title.trim() : "";
        return company.length > 0 && title.length > 0;
      });
  }

  const jobs = Array.isArray(next.jobs) ? next.jobs : [];
  if (jobs.length > 0 && next.is_job_related === undefined) {
    next.is_job_related = true;
  }

  if (next.is_job_related === false) {
    next.jobs = [];
  }

  return next;
}

/**
 * Normalizes LLM output: forces null recipientEmail for digests / no-reply,
 * clamps scores, and synthesizes jobs[] from legacy single-job fields when needed.
 */
export function normalizeClassification(
  raw: JobClassification,
  context: {
    subject: string;
    fromEmail?: string | null;
    fromName?: string | null;
    emailBody?: string;
    candidateProfile?: CandidateProfileSummary | null;
    routingLines?: string[];
    sourceTier?: "TIER 1 (OLLAMA)" | "TIER 2 (CLOUD)" | "TIER 3 (HEURISTIC)";
    receivedAt?: Date | string | null;
    emailDate?: Date | string | null;
  }
): JobClassification {
  let emailCategory: EmailCategory = raw.email_category;
  if (
    emailCategory === "IRRELEVANT" &&
    raw.is_job_related &&
    looksLikeDigest(context.subject, context.fromEmail)
  ) {
    emailCategory = "JOB_BOARD_DIGEST";
  }

  let jobs = [...(raw.jobs ?? [])];
  if (
    jobs.length === 0 &&
    raw.is_job_related &&
    raw.company_name &&
    raw.role_title
  ) {
    const mailto = raw.action_url?.match(/mailto:([^?&\s]+)/i)?.[1] ?? null;
    jobs = [
      {
        company: raw.company_name,
        companyDomain: null,
        title: raw.role_title,
        location: null,
        salary: null,
        salaryMax: null,
        postedAt: null,
        description: raw.action_summary,
        applyUrl: raw.action_url,
        recipientEmail: mailto,
        recipientName: null,
        isAlreadyApplied:
          raw.status === "APPLIED" ||
          detectAlreadyApplied(
            context.subject,
            raw.action_summary,
            context.emailBody
          ),
        matchScore: 50,
        matchReason: "Synthesized from single-job classification fields.",
      },
    ];
  }

  const isDigest = emailCategory === "JOB_BOARD_DIGEST";
  const fromIsNoReply = /noreply|no-reply|donotreply|jobs@|alerts@/i.test(
    context.fromEmail ?? ""
  );

  // Direct outreach with empty jobs[] must still produce a draftable opportunity.
  if (jobs.length === 0 && emailCategory === "DIRECT_RECRUITER") {
    const fallbackTitle =
      raw.role_title ||
      context.subject.replace(/^re:\s*/i, "").trim() ||
      "Role";
    const fallbackCompany = raw.company_name || "Company";
    jobs.push({
      company: fallbackCompany,
      companyDomain: null,
      title: fallbackTitle,
      location: null,
      salary: null,
      salaryMax: null,
      postedAt: null,
      description: raw.action_summary || context.subject,
      applyUrl: null,
      recipientEmail:
        context.fromEmail && !fromIsNoReply ? context.fromEmail : null,
      recipientName: null,
      isAlreadyApplied: false,
      matchScore: 80,
      matchReason: "Direct inbound recruiter or hiring manager outreach.",
      applicationType: "DIRECT_EMAIL",
    });
  }

  const bodyMarkdownUrls = [
    ...(context.emailBody?.matchAll(/\[([^\]]*)\]\((https?:[^)\s]+)\)/gi) ?? []),
  ].map((m) => m[2]);

  const digestBlocks = segmentDigestBlocks(context.emailBody || "");

  // Universal Sender Metadata Extraction for De-biasing
  let senderDisplayName: string | null = context.fromName?.trim().toLowerCase() || null;
  let senderDomainStem: string | null = null;
  if (context.fromEmail) {
    const angleMatch = context.fromEmail.match(/^(.*?)\s*<([^>]+)>\s*$/);
    const rawEmail = angleMatch ? angleMatch[2] : context.fromEmail;
    if (!senderDisplayName && angleMatch && angleMatch[1]) {
      const cleanedName = angleMatch[1].trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
      if (cleanedName) {
        senderDisplayName = cleanedName;
      }
    }
    const atIdx = rawEmail.indexOf("@");
    if (atIdx >= 0) {
      const fullDomain = rawEmail.slice(atIdx + 1).toLowerCase().trim().replace(/:\d+$/, "");
      const parts = fullDomain.split(".");
      if (parts.length >= 2) {
        if (parts.length >= 3 && parts[parts.length - 1].length <= 3 && parts[parts.length - 2].length <= 3) {
          senderDomainStem = parts[parts.length - 3];
        } else {
          senderDomainStem = parts[parts.length - 2];
        }
      }
    }
  }

  const isLocationOrSalaryCandidate = (line: string): boolean => {
    const trimmed = line.trim();
    if (
      /^(?:remote|hybrid|onsite|on-site|wfh|work\s+from\s+home|telecommute|relocation)/i.test(trimmed) ||
      /,\s*[A-Z]{2}(?:\s+\d{5})?$/i.test(trimmed) ||
      /,\s*(?:usa|united\s+states|uk|canada|germany|france|australia)\b/i.test(trimmed) ||
      /[\$€£¥]|\b\d+k\b|\b(?:hourly|annual|salary|per\s+hour|per\s+year|\/hr|\/yr)\b/i.test(trimmed)
    ) {
      return true;
    }
    const extracted = extractLocationFromText(trimmed);
    return Boolean(extracted.state || (extracted.city && extracted.state) || extracted.isRemote);
  };

  jobs = jobs.slice(0, 15).map((job, index) => {
    let resolvedTitle = sanitizeRoleTitle(job.title);

    if (resolvedTitle === "Role" && digestBlocks.length > 0) {
      const cardBlock =
        (index < digestBlocks.length ? digestBlocks[index] : null) ||
        digestBlocks.find((b) => {
          const lower = b.toLowerCase();
          return Boolean(
            job.description && lower.includes(job.description.slice(0, 30).toLowerCase())
          );
        }) || "";

      if (cardBlock) {
        const anchorMatch = cardBlock.match(/\[([A-Z0-9][^\]\n]{2,60})\]\((?:https?:[^\)]+)\)/i);
        if (
          anchorMatch &&
          anchorMatch[1] &&
          isValidRoleTitle(anchorMatch[1]) &&
          !/^(?:view|apply|see job|click|more|details|read)/i.test(anchorMatch[1]) &&
          (!job.company || anchorMatch[1].toLowerCase() !== job.company.toLowerCase())
        ) {
          resolvedTitle = anchorMatch[1].trim();
        }

        if (resolvedTitle === "Role") {
          const lines = cardBlock.split("\n").map((l) => l.trim()).filter(Boolean);
          for (const line of lines) {
            const strippedLine = line.replace(/^[#*•\-\s]+/, "").trim();
            if (
              isValidRoleTitle(strippedLine) &&
              strippedLine.length >= 3 &&
              strippedLine.length <= 60 &&
              !isLocationOrSalaryCandidate(strippedLine) &&
              !isValidEmployerName(strippedLine) &&
              !/^(?:view|apply|see job|click|more|details|read|http)/i.test(strippedLine)
            ) {
              resolvedTitle = strippedLine;
              break;
            }
          }
        }
      }
    }

    let resolvedCompany = sanitizeCompanyName(job.company);
    if (!isValidEmployerName(resolvedCompany)) {
      resolvedCompany = "Unknown Company";
    }
    const c = (resolvedCompany || "").toLowerCase().trim();

    const matchesSenderStem = Boolean(
      senderDomainStem &&
        (c === senderDomainStem ||
          c.startsWith(`${senderDomainStem} `) ||
          c.includes(`${senderDomainStem} job`))
    );
    const matchesSenderDisplay = Boolean(
      senderDisplayName &&
        (c === senderDisplayName ||
          senderDisplayName.includes(c) ||
          c.includes(senderDisplayName))
    );
    const isAggregatorKeyword = JOB_BOARD_KEYWORDS.some((kw) => {
      return c === kw || c.startsWith(`${kw} `) || c.includes(`${kw} job`);
    });

    const isSenderOrAggregator =
      resolvedCompany === "Unknown Company" ||
      matchesSenderStem ||
      matchesSenderDisplay ||
      isAggregatorKeyword;

    if (emailCategory !== "DIRECT_RECRUITER" && isSenderOrAggregator) {
      const titleMatch =
        resolvedTitle?.match(/(?:at|for|with|@)\s+([A-Z0-9][A-Za-z0-9&.' -]{1,35}?)(?=\s+(?:in|on|at|via|near|located|\$|\d|full-?time|part-?time|contract|remote|hybrid|just|\b[A-Z]{2}\b)|[,\n\r(]|$)/i) ||
        resolvedTitle?.match(/\(([A-Z0-9][A-Za-z0-9&.' -]{1,35}?)\)/i) ||
        resolvedTitle?.match(/[-–|]\s*([A-Z0-9][A-Za-z0-9&.' -]{1,35})$/i);

      const cardBlock =
        digestBlocks.find((b) => {
          const lower = b.toLowerCase();
          return (
            (job.title && lower.includes(job.title.toLowerCase().slice(0, 30))) ||
            (job.description && lower.includes(job.description.slice(0, 30).toLowerCase()))
          );
        }) || digestBlocks[Math.min(index, digestBlocks.length - 1)] || "";

      let blockEmployer: string | null = null;
      if (cardBlock) {
        const blockLines = cardBlock.split("\n").map((l) => l.trim()).filter(Boolean);
        const titleIdx = blockLines.findIndex((l) =>
          job.title && l.toLowerCase().includes(job.title.toLowerCase().slice(0, 25))
        );
        if (titleIdx >= 0 && titleIdx + 1 < blockLines.length) {
          const nextLine = blockLines[titleIdx + 1];
          if (
            isValidEmployerName(nextLine) &&
            !isLocationOrSalaryCandidate(nextLine) &&
            !/^(?:remote|hybrid|onsite|\$|€|£|\d+|view|apply|full-?time|part-?time|contract)/i.test(nextLine) &&
            !nextLine.includes("http") &&
            !nextLine.includes(":") &&
            !nextLine.includes(".")
          ) {
            blockEmployer = nextLine;
          }
        }
        if (!blockEmployer) {
          const blockMatch =
            cardBlock.match(/(?:at|for|with|@)\s+([A-Z0-9][A-Za-z0-9&.' -]{1,35}?)(?=\s+(?:in|on|at|via|near|located|\$|\d|full-?time|part-?time|contract|remote|hybrid|just|\b[A-Z]{2}\b)|[,\n\r(]|$)/i) ||
            cardBlock.match(/\(([A-Z0-9][A-Za-z0-9&.' -]{1,35}?)\)/i) ||
            cardBlock.match(/([A-Z0-9][A-Za-z0-9&.' -]{1,35})\s+(?:is|are)\s+hiring/i) ||
            cardBlock.match(/(?:employer|company|client):\s*([A-Z0-9][A-Za-z0-9&.' -]{1,35})/i);
          if (blockMatch?.[1] && isValidEmployerName(blockMatch[1])) {
            blockEmployer = blockMatch[1].trim();
          }
        }
      }

      const firstSentence = (job.description || "").split(/(?<=[.!?])\s+|\n+/)[0] || "";
      const descMatch =
        firstSentence.match(/(?:at|for|with|@)\s+([A-Z0-9][A-Za-z0-9&.' -]{1,35}?)(?=\s+(?:in|on|at|via|near|located|\$|\d|full-?time|part-?time|contract|remote|hybrid|just|\b[A-Z]{2}\b)|[,\n\r(]|$)/i) ||
        firstSentence.match(/\(([A-Z0-9][A-Za-z0-9&.' -]{1,35}?)\)/i) ||
        job.description?.match(/([A-Z0-9][A-Za-z0-9&.' -]{1,35})\s+(?:is|are)\s+hiring/i);

      let candidateEmployer: string | null = null;
      if (titleMatch?.[1]) {
        const cleaned = sanitizeCompanyName(titleMatch[1]);
        if (isValidEmployerName(cleaned)) candidateEmployer = cleaned;
      } else if (blockEmployer) {
        const cleaned = sanitizeCompanyName(blockEmployer);
        if (isValidEmployerName(cleaned)) candidateEmployer = cleaned;
      } else if (descMatch?.[1]) {
        const cleaned = sanitizeCompanyName(descMatch[1]);
        if (isValidEmployerName(cleaned)) candidateEmployer = cleaned;
      }

      if (candidateEmployer) {
        const candidateTrimmed = candidateEmployer.trim();
        const candidateLower = candidateTrimmed.toLowerCase();
        const candidateIsSender =
          (senderDomainStem && (candidateLower === senderDomainStem || candidateLower.includes(senderDomainStem))) ||
          (senderDisplayName && (candidateLower === senderDisplayName || candidateLower.includes(senderDisplayName))) ||
          JOB_BOARD_KEYWORDS.some((kw) => candidateLower === kw || candidateLower.includes(kw));

        if (
          !candidateIsSender &&
          isValidEmployerName(candidateTrimmed) &&
          !isLocationOrSalaryCandidate(candidateTrimmed)
        ) {
          resolvedCompany = candidateTrimmed;
        }
      }
    }

    let resolvedLocation = job.location ? standardizeLocation(job.location) ?? null : null;
    const isZipOnly = job.location ? /^\d{5}(?:-\d{4})?$/.test(job.location.trim()) : false;
    if (!resolvedLocation || isZipOnly || /unspecified/i.test(resolvedLocation)) {
      const parsed = extractLocationFromText(job.description || context.emailBody);
      if (parsed.city && parsed.state) {
        resolvedLocation = `${parsed.city}, ${parsed.state}`;
      } else if (parsed.city) {
        resolvedLocation = parsed.city;
      } else if (isZipOnly) {
        resolvedLocation = null;
      }
    }

    let recipientEmail = (job.recipientEmail ?? "").trim() || null;
    if (recipientEmail) {
      const lower = recipientEmail.toLowerCase();
      if (
        isDigest ||
        fromIsNoReply ||
        /noreply|no-reply|donotreply|notifications@/i.test(lower)
      ) {
        recipientEmail = null;
      }
    }
    if (!recipientEmail && job.applyUrl?.toLowerCase().startsWith("mailto:")) {
      const mailto = job.applyUrl.replace(/^mailto:/i, "").split("?")[0]?.trim();
      if (mailto && mailto.includes("@") && !isDigest) {
        recipientEmail = mailto;
      }
    }
    if (
      !recipientEmail &&
      emailCategory === "DIRECT_RECRUITER" &&
      context.fromEmail &&
      !fromIsNoReply
    ) {
      recipientEmail = context.fromEmail;
    }

    let applyUrl = (job.applyUrl ?? "").trim() || null;
    if (applyUrl && (!/^https?:\/\//i.test(applyUrl) || /unsubscribe|mailto:|privacy|preferences|opt-?out/i.test(applyUrl))) {
      applyUrl = null;
    }
    if (!applyUrl && digestBlocks.length > 0) {
      const cardBlock =
        (index < digestBlocks.length ? digestBlocks[index] : null) ||
        digestBlocks.find((b) => {
          const lower = b.toLowerCase();
          return Boolean(
            (resolvedTitle && resolvedTitle !== "Role" && lower.includes(resolvedTitle.toLowerCase().slice(0, 30))) ||
            (job.description && lower.includes(job.description.slice(0, 30).toLowerCase()))
          );
        });

      if (cardBlock) {
        const candidate = extractCardApplyUrl(cardBlock);
        if (candidate && /^https?:\/\//i.test(candidate)) {
          applyUrl = candidate;
        }
      }
    }

    if (!applyUrl && jobs.length === 1 && bodyMarkdownUrls.length === 1) {
      const candidate = bodyMarkdownUrls[0];
      if (candidate && /^https?:\/\//i.test(candidate) && !/unsubscribe|privacy|preferences|opt-?out/i.test(candidate)) {
        applyUrl = candidate;
      }
    }

    const validApplyUrl = applyUrl && /^https?:\/\//i.test(applyUrl) ? applyUrl : null;

    let resolvedType: "DIRECT_EMAIL" | "EXTERNAL_LINK" | "QUICK_APPLY" =
      "EXTERNAL_LINK";

    if (recipientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      resolvedType = "DIRECT_EMAIL";
    } else {
      resolvedType = resolveApplicationType({
        applyUrl: validApplyUrl,
        recipientEmail: null,
      });
      recipientEmail = null;
    }

    const companyDomain =
      (job.companyDomain ?? "")
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0] || null;

    const normalizedSalary = job.salary ? normalizeSalaryDisplay(job.salary) : null;
    const normalizedSalaryMax =
      typeof job.salaryMax === "number" && !Number.isNaN(job.salaryMax)
        ? job.salaryMax
        : normalizedSalary
          ? parseSalaryMax(normalizedSalary)
          : null;

    const normalizedPostedAt =
      relativeTimeToIso(
        job.postedAt,
        context.receivedAt ?? context.emailDate ?? new Date()
      ) ??
      normalizePostedAt(
        job.postedAt,
        null,
        context.receivedAt ?? context.emailDate
      );

    const rawDescription = job.description ?? null;
    let description = cleanOpportunityDescription(rawDescription);
    if (!description || description.length < 40 || /^job alert/i.test(description)) {
      description = buildSynthesizedJobOverview({
        roleTitle: resolvedTitle,
        company: resolvedCompany,
        location: resolvedLocation,
        salary: normalizedSalary,
      });
    }

    let matchScore = clampScore(job.matchScore);
    let matchReason = (job.matchReason ?? "").trim();

    if (matchScore === 0) {
      if (context.candidateProfile) {
        const candidateLens = extractMatchCandidateLens(
          context.candidateProfile,
          context.candidateProfile.persona
        );
        const normalizedOpp = resolveJobOpportunity({
          company: resolvedCompany,
          title: resolvedTitle,
          description,
          location: resolvedLocation,
          salary: normalizedSalary,
          postedAt: normalizedPostedAt,
          applyUrl: validApplyUrl,
        });
        const evaluated = evaluateOpportunityMatch({
          opportunity: normalizedOpp,
          candidate: candidateLens,
          mode: "HEURISTIC",
        });
        matchScore = evaluated.score;
        matchReason = evaluated.reason;
      } else {
        matchScore = heuristicMatchScore(
          resolvedTitle,
          resolvedCompany,
          context.candidateProfile
        );
        if (!matchReason) {
          matchReason =
            matchScore >= 75
              ? "Position aligns with candidate profile criteria and preferences."
              : "Limited overlap with candidate profile criteria.";
        }
      }
    } else {
      const penalty = seniorityMismatchPenalty(
        resolvedTitle,
        context.candidateProfile?.persona?.seniorityTier
      );
      if (penalty >= 40 && matchScore >= 50) {
        matchScore = Math.min(matchScore, 34);
        if (!/seniority|staff|principal|tenure|years/i.test(matchReason)) {
          matchReason = `${matchReason} Seniority mismatch vs candidate persona.`.trim();
        }
      } else if (penalty >= 20 && matchScore >= 70) {
        matchScore = Math.min(matchScore, 58);
      }
      if (!matchReason) {
        matchReason = "Match score provided by classifier.";
      }
    }

    const isAlreadyApplied =
      Boolean(job.isAlreadyApplied) ||
      detectAlreadyApplied(rawDescription, resolvedTitle) ||
      (emailCategory === "APPLICATION_STATUS" && raw.status === "APPLIED");

    return {
      ...job,
      title: resolvedTitle,
      company: sanitizeCompanyName(resolvedCompany),
      companyDomain,
      logoUrl: job.logoUrl ?? null,
      location: resolvedLocation,
      salary: normalizedSalary,
      salaryMax: normalizedSalaryMax,
      postedAt: normalizedPostedAt,
      description,
      recipientEmail,
      applyUrl: validApplyUrl,
      applicationType: resolvedType,
      isAlreadyApplied,
      matchScore,
      matchReason,
    };
  });

  return {
    ...raw,
    email_category: emailCategory,
    classificationMethod: raw.classificationMethod ?? "AI",
    routingLines: context.routingLines ?? raw.routingLines,
    sourceTier: context.sourceTier ?? raw.sourceTier,
    jobs,
  };
}
