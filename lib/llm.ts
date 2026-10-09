import { z } from "zod";

import { flattenSkillItems, skillGroupsFromUnknown } from "@/lib/skill-groups";
import {
  awardsSchema,
  certificationsSchema,
  interestsSchema,
  readEducationStatus,
} from "@/lib/validations/profile";

import {
  type EmailCategory,
  resolveApplicationType,
} from "@/lib/application-method";
import {
  buildClassifierUserPrompt,
  buildProfileAwareClassifierSystemPrompt,
  cleanOpportunityDescription,
  clampScore,
  detectAlreadyApplied,
  ensureCandidateProfileForScoring,
  heuristicMatchScore,
  parseSalaryMax,
  normalizeSalaryDisplay,
  seniorityMismatchPenalty,
  type CandidateProfileSummary,
} from "@/lib/ai/classifier";
import { matchesConfirmationSignal } from "@/lib/constants/job-sources";
import {
  APPLICATION_SENT_TO_RE,
  DIGEST_SENDER_HINTS,
  JOB_EMAIL_KEYWORD_PATTERNS,
  looksLikeDigest,
  matchesJobEmailKeywords,
  matchesJobSubjectKeywords,
  shouldClassifyEmail,
} from "@/lib/ai/prefilter";
import { getCachedOrSynthesizePersona } from "@/lib/ai/persona";
import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import {
  genericRoleTitle,
  isGenericTitle,
  parseApplicationEmail,
} from "@/lib/parsers/application-parser";
import { prisma } from "@/lib/prisma";
import { parseAccountRules } from "@/lib/validations/rules";

export {
  JOB_EMAIL_KEYWORD_PATTERNS,
  matchesJobEmailKeywords,
  matchesJobSubjectKeywords,
  shouldClassifyEmail,
  looksLikeDigest,
};

export const extractedJobSchema = z.object({
  company: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().min(1)
  ),
  companyDomain: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  title: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().min(1)
  ),
  location: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  salary: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  salaryMax: z.coerce.number().nullable().optional(),
  postedAt: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  description: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  applyUrl: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  applicationType: z
    .enum(["DIRECT_EMAIL", "EXTERNAL_LINK", "QUICK_APPLY"])
    .optional(),
  recipientEmail: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  recipientName: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  isAlreadyApplied: z.boolean().optional().default(false),
  matchScore: z.coerce.number().min(0).max(100).optional(),
  matchReason: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

export const jobClassificationSchema = z.object({
  is_job_related: z.boolean().default(true),
  email_category: z
    .enum([
      "DIRECT_RECRUITER",
      "JOB_BOARD_DIGEST",
      "APPLICATION_STATUS",
      "IRRELEVANT",
    ])
    .default("JOB_BOARD_DIGEST"),
  company_name: z.string().nullish().default(null),
  role_title: z.string().nullish().default(null),
  status: z
    .enum([
      "REJECTION",
      "INTERVIEW",
      "OA",
      "RECEIVED",
      "OTHER",
      "OFFER",
      "LEAD",
      "APPLIED",
    ])
    .nullish()
    .transform((value) => value ?? "LEAD"),
  action_required: z.boolean().default(false),
  action_summary: z.string().nullish().default(null),
  action_url: z.string().nullish().default(null),
  deadline_iso: z.string().nullish().default(null),
  jobs: z.array(extractedJobSchema).default([]),
});

export type JobClassification = z.infer<typeof jobClassificationSchema>;

export type LlmProvider = "OPENROUTER" | "LOCAL_OLLAMA";

export type ClassifyOptions = {
  llmProvider: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  subject: string;
  body: string;
  fromEmail?: string | null;
  /** When provided, scoring is profile-aware. */
  candidateProfile?: CandidateProfileSummary | null;
  /** Account rule: allow OpenRouter when local Ollama fails. */
  allowCloudFallback?: boolean;
};

const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";

/**
 * Strips trailing slashes and a trailing `/v1` so `/api/tags` and `/api/chat`
 * resolve against the Ollama root (not an OpenAI-compat base path).
 */
export function normalizeOllamaBaseUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  if (base.toLowerCase().endsWith("/v1")) {
    base = base.slice(0, -3).replace(/\/+$/, "");
  }
  // Replace localhost with IPv4 127.0.0.1 to avoid Node IPv6 resolution failures
  base = base.replace(/^http:\/\/localhost(?::|$)/i, (match) =>
    match.replace("localhost", "127.0.0.1")
  );
  return base || "http://127.0.0.1:11434";
}

/**
 * Live reachability probe: GET /api/tags must return 200 + parseable models list.
 * Used before any "[Ollama:Active] health_ok" / bridgeConnected=true claim.
 */
export async function probeOllamaTags(
  baseUrl: string,
  timeoutMs = 5000
): Promise<{ models: string[] }> {
  const base = normalizeOllamaBaseUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${base}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "MailPilot-OllamaProbe/1.0",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new OllamaUnreachableError(base, detail);
  }

  if (!res.ok) {
    throw new OllamaUnreachableError(base, `health check HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new OllamaUnreachableError(
      base,
      "health check returned non-JSON (not a valid Ollama /api/tags response)"
    );
  }

  if (
    !json ||
    typeof json !== "object" ||
    !("models" in json) ||
    !Array.isArray((json as { models: unknown }).models)
  ) {
    throw new OllamaUnreachableError(
      base,
      "health check JSON missing models[] (not a valid Ollama daemon)"
    );
  }

  const models = (json as { models: Array<string | { name?: string; model?: string }> })
    .models
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      return (entry.name ?? entry.model ?? "").trim();
    })
    .filter((name) => name.length > 0)
    .sort((a, b) => a.localeCompare(b));

  return { models };
}

/**
 * Retries /api/tags — Cloudflare Quick Tunnels are often flaky from serverless.
 */
export async function probeOllamaTagsWithRetry(
  baseUrl: string,
  opts?: { timeoutMs?: number; attempts?: number; gapMs?: number }
): Promise<{ models: string[] }> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const attempts = opts?.attempts ?? 3;
  const gapMs = opts?.gapMs ?? 750;
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await probeOllamaTags(baseUrl, timeoutMs);
    } catch (err) {
      lastError = err;
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, gapMs * i));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new OllamaUnreachableError(baseUrl, String(lastError));
}

const DEFAULT_OPENROUTER_MODELS = [
  process.env.OPENROUTER_MODEL,
  "qwen/qwen3.8-27b:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "liquid/lfm-2.5-2.6b:free",
  "meta-llama/llama-3.1-8b-instruct",
  "meta-llama/llama-3.2-3b-instruct",
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
].filter(Boolean) as string[];

/**
 * Deterministic APPLICATION_STATUS classification when LLM is unavailable
 * but the subject clearly confirms an application was submitted.
 */
export function heuristicApplicationConfirmation(input: {
  subject: string;
  body?: string;
  fromEmail?: string | null;
}): JobClassification | null {
  const { subject, body, fromEmail } = input;
  const parsed = parseApplicationEmail(subject, body ?? "");
  const sentMatch = subject.match(APPLICATION_SENT_TO_RE);
  const thankYou = matchesConfirmationSignal(subject);
  const appliedSignal = detectAlreadyApplied(subject, body);

  if (!parsed && !sentMatch && !thankYou && !appliedSignal) {
    return null;
  }

  let company = parsed?.company?.trim() || null;
  if (!company && sentMatch?.[1]) {
    company = sentMatch[1].replace(/\s+/g, " ").trim();
  }
  if (!company && fromEmail) {
    const domain = fromEmail.split("@")[1]?.toLowerCase() ?? "";
    if (
      domain &&
      !DIGEST_SENDER_HINTS.some((hint) =>
        domain.includes(hint.replace("@", ""))
      )
    ) {
      company = domain.split(".")[0] ?? null;
    }
  }

  const resolvedCompany =
    company && company.length > 0 ? company : "Unknown Company";
  const title =
    parsed?.title && !isGenericTitle(parsed.title, resolvedCompany)
      ? parsed.title
      : genericRoleTitle(resolvedCompany);
  const location = parsed?.location ?? null;

  return {
    is_job_related: true,
    email_category: "APPLICATION_STATUS",
    company_name: resolvedCompany,
    role_title: title,
    status: "APPLIED",
    action_required: false,
    action_summary: "Application confirmation detected from inbox",
    action_url: null,
    deadline_iso: null,
    jobs: [
      {
        company: resolvedCompany,
        companyDomain: null,
        title,
        location,
        salary: null,
        salaryMax: null,
        postedAt: null,
        description: location
          ? `Application submitted (${location}).`
          : "Application submitted; confirmation email detected.",
        applyUrl: null,
        applicationType: "EXTERNAL_LINK",
        recipientEmail: null,
        recipientName: null,
        isAlreadyApplied: true,
        matchScore: 80,
        matchReason: "Application confirmed via email receipt.",
      },
    ],
  };
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

  // Prefer DB-cached persona; synthesize + write-back on miss.
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
          ? ed.coursework.filter((item): item is string => typeof item === "string")
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
 * Normalizes LLM output: forces null recipientEmail for digests / no-reply,
 * clamps scores, and synthesizes jobs[] from legacy single-job fields when needed.
 */
export function normalizeClassification(
  raw: JobClassification,
  context: {
    subject: string;
    fromEmail?: string | null;
    emailBody?: string;
    candidateProfile?: CandidateProfileSummary | null;
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
  if (jobs.length === 0 && raw.is_job_related && raw.company_name && raw.role_title) {
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

  jobs = jobs.slice(0, 15).map((job, index) => {
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
    // If direct reach-out and no specific recipient extracted, fall back to sender
    if (
      !recipientEmail &&
      emailCategory === "DIRECT_RECRUITER" &&
      context.fromEmail &&
      !fromIsNoReply
    ) {
      recipientEmail = context.fromEmail;
    }

    let applyUrl = (job.applyUrl ?? "").trim() || null;
    if (
      applyUrl &&
      /unsubscribe|mailto:|privacy|preferences/i.test(applyUrl)
    ) {
      applyUrl = null;
    }
    // Recover aggregator apply links from preserved markdown when LLM omitted them.
    if (!applyUrl && bodyMarkdownUrls.length > 0) {
      const candidate =
        bodyMarkdownUrls[Math.min(index, bodyMarkdownUrls.length - 1)] ?? null;
      if (candidate && !/unsubscribe|privacy|preferences/i.test(candidate)) {
        applyUrl = candidate;
      }
    }

    // Direct emails with a valid contact must ALWAYS resolve to DIRECT_EMAIL
    let resolvedType: "DIRECT_EMAIL" | "EXTERNAL_LINK" | "QUICK_APPLY" =
      "EXTERNAL_LINK";

    if (recipientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      resolvedType = "DIRECT_EMAIL";
    } else {
      resolvedType = resolveApplicationType({
        applyUrl,
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

    let matchScore = clampScore(job.matchScore);
    let matchReason =
      (job.matchReason ?? "").trim() ||
      "No match rationale returned by the classifier.";

    // Fix 0%/missing scores with a light profile-overlap heuristic.
    if (matchScore === 0) {
      matchScore = heuristicMatchScore(
        job.title,
        job.company,
        context.candidateProfile
      );
      if (!job.matchReason?.trim()) {
        matchReason =
          matchScore >= 75
            ? "Position aligns with candidate profile criteria and preferences."
            : "Limited overlap with candidate profile criteria.";
      }
    } else {
      // Soft-enforce persona seniority mismatch when the model over-scores.
      const penalty = seniorityMismatchPenalty(
        job.title,
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
    }

    const salary = normalizeSalaryDisplay(job.salary);
    // Prefer raw string for salaryMax so "per hour" / hourly cues aren't lost
    // after display cleanup strips pay-period chrome.
    const salaryMax =
      typeof job.salaryMax === "number" && !Number.isNaN(job.salaryMax)
        ? job.salaryMax
        : parseSalaryMax(job.salary) ?? parseSalaryMax(salary);

    const rawDescription = job.description ?? null;
    const description = cleanOpportunityDescription(rawDescription);
    const isAlreadyApplied =
      Boolean(job.isAlreadyApplied) ||
      detectAlreadyApplied(rawDescription, job.title) ||
      (emailCategory === "APPLICATION_STATUS" && raw.status === "APPLIED");

    return {
      ...job,
      companyDomain,
      salary,
      salaryMax,
      postedAt: job.postedAt ?? null,
      description,
      recipientEmail,
      applyUrl,
      applicationType: resolvedType,
      isAlreadyApplied,
      matchScore,
      matchReason,
    };
  });

  return {
    ...raw,
    email_category: emailCategory,
    jobs,
  };
}

/**
 * Strips HTML/tracking while preserving link destinations for applyUrl extraction.
 * Delegates to cleanEmailPayload for a single minification path.
 */
export function sanitizeEmailBody(raw: string): string {
  return cleanEmailPayload(raw);
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

  // Local LLMs often emit "true"/"false" strings — coerce before Zod.
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
        // Local LLMs emit null for optional job strings — coerce before Zod.
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

  // Non-job digests/newsletters must not carry partial job stubs that blow Zod.
  if (next.is_job_related === false) {
    next.jobs = [];
  }

  return next;
}

/**
 * Classifies a job-related email with optional profile-aware match scoring.
 */
export async function classifyJobEmail(
  options: ClassifyOptions
): Promise<JobClassification | null> {
  const appliedHeuristic = heuristicApplicationConfirmation({
    subject: options.subject,
    body: options.body,
    fromEmail: options.fromEmail,
  });

  if (
    !shouldClassifyEmail({
      subject: options.subject,
      body: options.body,
      fromEmail: options.fromEmail,
    }) &&
    !appliedHeuristic
  ) {
    return null;
  }

  // Fast-path clear application confirmations without burning LLM quota.
  if (appliedHeuristic) {
    return appliedHeuristic;
  }

  // Classifier gets cleaned text only (already cleaned upstream; re-sanitize + hard cap).
  // Full rawBody is never passed here — it is stored separately on EmailMessage.
  const sanitizedBody = sanitizeEmailBody(options.body).slice(0, 4000);
  const systemPrompt = buildProfileAwareClassifierSystemPrompt(
    ensureCandidateProfileForScoring(options.candidateProfile ?? null)
  );
  const userPrompt = buildClassifierUserPrompt({
    subject: options.subject,
    body: sanitizedBody,
    fromEmail: options.fromEmail,
  });

  let result: Record<string, unknown> | null;
  try {
    result = await callLLMWithFallback({
      systemPrompt,
      userPrompt,
      llmProvider: options.llmProvider,
      localOllamaUrl: options.localOllamaUrl,
      ollamaModel: options.ollamaModel,
      allowCloudFallback: options.allowCloudFallback,
    });
  } catch (error) {
    // Sync/scan paths must not crash the request — park as PENDING_AI via null.
    if (error instanceof OllamaUnreachableError) {
      console.error(
        `[classify] ${error.message} — skipping LLM classification for this message`
      );
      return null;
    }
    console.error("[classify] Unexpected LLM failure", error);
    return null;
  }

  if (!result) {
    return null;
  }

  try {
    const normalizedPayload = coerceClassificationPayload(result);
    const parsed = jobClassificationSchema.parse(normalizedPayload);
    return normalizeClassification(parsed, {
      subject: options.subject,
      fromEmail: options.fromEmail,
      emailBody: sanitizedBody,
      candidateProfile: options.candidateProfile,
    });
  } catch (error) {
    console.warn(
      "Failed to parse job classification JSON",
      error,
      JSON.stringify(result).slice(0, 300)
    );
    return null;
  }
}

/** Spec alias used by historical scan. */
export const classifyEmail = classifyJobEmail;

export type CallLLMOptions = {
  systemPrompt: string;
  userPrompt: string;
  llmProvider?: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  /**
   * When true (or env OLLAMA_ALLOW_OPENROUTER_FALLBACK=true), LOCAL_OLLAMA may
   * fall back to OpenRouter after local failure. Default: no silent fallback.
   * Prefer account rule `allowCloudFallback`.
   */
  allowCloudFallback?: boolean;
  /** @deprecated Use allowCloudFallback */
  allowOpenRouterFallback?: boolean;
  /** When set, OpenRouter tries only these models, in order. */
  openRouterModels?: string[];
  /** Local generation limits. Omitted calls keep Ollama defaults. */
  ollamaOptions?: {
    num_ctx: number;
    num_predict: number;
    temperature: number;
  };
};

/** Thrown when LOCAL_OLLAMA is selected but the instance cannot be reached. */
export class OllamaUnreachableError extends Error {
  readonly url: string;

  constructor(url: string, detail?: string) {
    const suffix = detail?.trim() ? `: ${detail.trim()}` : "";
    super(`Local Ollama instance unreachable at ${url}${suffix}`);
    this.name = "OllamaUnreachableError";
    this.url = url;
  }
}

function isOpenRouterFallbackEnabled(options: CallLLMOptions): boolean {
  if (options.allowCloudFallback === true) return true;
  if (options.allowOpenRouterFallback === true) return true;
  const env = process.env.OLLAMA_ALLOW_OPENROUTER_FALLBACK?.trim().toLowerCase();
  return env === "1" || env === "true" || env === "yes";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveOllamaBaseUrl(configured?: string | null): string {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) return "http://127.0.0.1:11434";
  return normalizeOllamaBaseUrl(
    configured?.trim() || "http://127.0.0.1:11434"
  );
}

/** Adaptive idle / hard-cap timeouts from prompt payload size. */
function computeOllamaTimeouts(payloadChars: number): {
  idleTimeoutMs: number;
  hardCapMs: number;
} {
  const idleTimeoutMs = Math.min(
    180_000,
    Math.max(45_000, 30_000 + Math.ceil(payloadChars / 40) * 800)
  );
  const hardCapMs = Math.min(
    600_000,
    Math.max(120_000, idleTimeoutMs * 2 + Math.ceil(payloadChars / 25) * 1000)
  );
  return { idleTimeoutMs, hardCapMs };
}

/**
 * Normalize local Ollama failures into a descriptive Error suitable to throw
 * or pass into the OpenRouter failover path.
 */
function toLocalOllamaError(baseUrl: string, error: unknown): Error {
  if (error instanceof OllamaUnreachableError) return error;
  if (error instanceof Error) {
    const msg = error.message;
    if (
      /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|timeout|AbortError|aborted|hard.?cap|idle/i.test(
        msg
      ) ||
      error.name === "AbortError" ||
      error.name === "TimeoutError"
    ) {
      return new OllamaUnreachableError(baseUrl, msg);
    }
    return error;
  }
  return new Error(String(error));
}

/**
 * Shared LLM dispatcher. LOCAL_OLLAMA never silently falls back to OpenRouter
 * unless allowCloudFallback / OLLAMA_ALLOW_OPENROUTER_FALLBACK is set.
 *
 * On genuine local failure (unreachable, timeout/hard-cap abort, outage):
 * - allowCloudFallback=true  → warn [Ollama:Fallback] and route to OpenRouter
 * - allowCloudFallback=false → error [Ollama:Error] and throw immediately
 */
export async function callLLMWithFallback(
  options: CallLLMOptions
): Promise<Record<string, unknown> | null> {
  const provider = options.llmProvider ?? "OPENROUTER";

  if (provider === "LOCAL_OLLAMA") {
    const baseUrl = resolveOllamaBaseUrl(options.localOllamaUrl);
    const allowFallback = isOpenRouterFallbackEnabled(options);

    try {
      const result = await callOllamaJson(
        baseUrl,
        options.systemPrompt,
        options.userPrompt,
        options.ollamaModel,
        options.ollamaOptions
      );
      if (result) {
        console.info("[Ollama:Done]", {
          url: baseUrl,
          status: "success",
          reachable: true,
          generated: true,
        });
        return result;
      }
      throw new OllamaUnreachableError(
        baseUrl,
        "empty or invalid JSON after local retries (service may be overloaded or model failed to respond)"
      );
    } catch (error) {
      const localError = toLocalOllamaError(baseUrl, error);

      if (allowFallback) {
        console.warn(
          "[Ollama:Fallback] Local generation failed. Failing over to OpenRouter...",
          localError
        );
        const cloudResult = await callOpenRouterJson(
          options.systemPrompt,
          options.userPrompt,
          options.openRouterModels
        );
        if (cloudResult) {
          console.info(
            "[Ollama:Fallback] OpenRouter failover succeeded after local failure."
          );
        } else {
          console.error(
            "[Ollama:Fallback] OpenRouter failover also failed after local failure."
          );
        }
        return cloudResult;
      }

      console.error(
        "[Ollama:Error] Local generation failed. Cloud fallback disabled (allowCloudFallback=false) — not routing to OpenRouter.",
        localError
      );
      throw localError;
    }
  }

  return callOpenRouterJson(
    options.systemPrompt,
    options.userPrompt,
    options.openRouterModels
  );
}

/**
 * Health-check once, then generate with a single brief retry for blips / bad JSON.
 */
async function callOllamaJson(
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string,
  model?: string | null,
  ollamaOptions?: CallLLMOptions["ollamaOptions"]
): Promise<Record<string, unknown> | null> {
  const resolvedModel =
    model?.trim() || process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
  const payloadChars = systemPrompt.length + userPrompt.length;
  const timeouts = computeOllamaTimeouts(payloadChars);

  // Strict probe: HTTP 200 alone is not enough — must look like Ollama /api/tags.
  const probe = await probeOllamaTags(baseUrl, 5000);

  console.info("[Ollama:Active]", {
    phase: "health_ok",
    reachable: true,
    url: baseUrl,
    model: resolvedModel,
    modelsCount: probe.models.length,
    payloadChars,
    idleTimeoutMs: timeouts.idleTimeoutMs,
    hardCapMs: timeouts.hardCapMs,
  });

  const maxAttempts = 2;
  let lastFailure: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      console.info("[Ollama:Active]", {
        phase: "generate_start",
        attempt,
        maxAttempts,
        url: baseUrl,
        model: resolvedModel,
        payloadChars,
        startedAt: new Date(startedAt).toISOString(),
      });

      const result = await callOllamaGenerateOnce(
        baseUrl,
        resolvedModel,
        systemPrompt,
        userPrompt,
        timeouts,
        ollamaOptions
      );
      const durationMs = Date.now() - startedAt;
      if (result) {
        console.info("[Ollama:Done]", {
          phase: "generate_success",
          reachable: true,
          generated: true,
          attempt,
          url: baseUrl,
          model: resolvedModel,
          durationMs,
          payloadChars,
        });
        return result;
      }
      lastFailure = "empty or invalid JSON content";
      console.error("[Ollama:Error]", {
        phase: "generate_empty_json",
        reachable: true,
        generated: false,
        attempt,
        durationMs,
        lastFailure,
      });
    } catch (error) {
      // Daemon was reachable (probe passed). Soft aborts/retries stay local;
      // hard connection loss still escalates as unreachable.
      if (error instanceof OllamaUnreachableError) throw error;
      lastFailure = error instanceof Error ? error.message : String(error);
      console.error("[Ollama:Error]", {
        phase: "generate_attempt_failed",
        reachable: true,
        generated: false,
        attempt,
        durationMs: Date.now() - startedAt,
        message: lastFailure,
      });
    }

    if (attempt < maxAttempts) {
      await sleep(500);
    }
  }

  console.error("[Ollama:Error]", {
    phase: "give_up",
    reachable: true,
    generated: false,
    url: baseUrl,
    model: resolvedModel,
    attempts: maxAttempts,
    lastFailure,
  });
  return null;
}

async function callOllamaGenerateOnce(
  baseUrl: string,
  resolvedModel: string,
  systemPrompt: string,
  userPrompt: string,
  timeouts: { idleTimeoutMs: number; hardCapMs: number },
  ollamaOptions?: CallLLMOptions["ollamaOptions"]
): Promise<Record<string, unknown> | null> {
  const url = `${baseUrl}/api/chat`;
  const controller = new AbortController();
  const hardCapTimer = setTimeout(() => {
    controller.abort();
  }, timeouts.hardCapMs);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      controller.abort();
    }, timeouts.idleTimeoutMs);
  };

  try {
    resetIdle();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: resolvedModel,
        stream: true,
        format: "json",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        ...(ollamaOptions ? { options: ollamaOptions } : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error("[Ollama:Error]", {
        phase: "http_error",
        status: response.status,
        model: resolvedModel,
        url,
        body: errorBody.slice(0, 300),
      });
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Ollama response missing body stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      chunkCount += 1;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx >= 0) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        newlineIdx = buffer.indexOf("\n");
        if (!line) continue;

        try {
          const event = JSON.parse(line) as {
            message?: { content?: string };
            response?: string;
            done?: boolean;
            error?: string;
          };
          if (event.error) {
            throw new Error(event.error);
          }
          const piece = event.message?.content ?? event.response ?? "";
          if (piece) content += piece;
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) continue;
          throw parseErr;
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      try {
        const event = JSON.parse(trailing) as {
          message?: { content?: string };
          response?: string;
        };
        const piece = event.message?.content ?? event.response ?? "";
        if (piece) content += piece;
      } catch {
        // ignore
      }
    }

    console.info("[Ollama:Active]", {
      phase: "stream_complete",
      chunks: chunkCount,
      contentChars: content.length,
      model: resolvedModel,
    });

    if (!content.trim()) {
      return null;
    }

    return parseJsonObject(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "";
    // Idle/hard-cap aborts mean the daemon answered health but generate stalled —
    // do NOT label that as unreachable (probe already succeeded).
    if (
      name === "AbortError" ||
      name === "TimeoutError" ||
      /AbortError|aborted|hard.?cap|idle/i.test(detail)
    ) {
      throw new Error(`Ollama generate aborted: ${detail}`);
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/i.test(detail)) {
      throw new OllamaUnreachableError(baseUrl, detail);
    }
    throw error;
  } finally {
    clearTimeout(hardCapTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }
}

async function callOpenRouterJson(
  systemPrompt: string,
  userPrompt: string,
  models?: string[]
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set");
    return null;
  }

  const selected = models && models.length > 0 ? models : DEFAULT_OPENROUTER_MODELS;
  for (const model of selected) {
    try {
      const result = await callOpenRouterModel(
        apiKey,
        model,
        systemPrompt,
        userPrompt
      );
      if (result) {
        return result;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const is403 = /\b403\b/.test(message);
      if (error instanceof RateLimitError || is403) {
        console.warn(
          `OpenRouter ${error instanceof RateLimitError ? "429" : "403"} on ${model}; trying next model`
        );
        continue;
      }
      console.warn(`OpenRouter model ${model} failed`, error);
    }
  }

  return null;
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

async function callOpenRouterModel(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<Record<string, unknown> | null> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL ?? "https://mailpilot.local",
      "X-Title": "MailPilot",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (response.status === 429) {
    throw new RateLimitError(`Rate limited by ${model}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter HTTP ${response.status}: ${detail.slice(0, 200)}`
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  return parseJsonObject(content);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    const parsed: unknown = JSON.parse(unfenced);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (error) {
    console.warn("Failed to parse LLM JSON", error);
    return null;
  }
}

/**
 * Extracts a plain-text body from a Gmail message payload (recursive parts).
 */
export function extractMessageBody(
  payload: {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: unknown[];
    }> | null;
  } | null | undefined
): string {
  if (!payload) {
    return "";
  }

  const plain = findPartByMime(payload, "text/plain");
  if (plain) {
    return decodeBase64Url(plain);
  }

  const html = findPartByMime(payload, "text/html");
  if (html) {
    return decodeBase64Url(html);
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return "";
}

function findPartByMime(
  payload: {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: unknown[];
    }> | null;
  },
  mime: string
): string | null {
  if (payload.mimeType === mime && payload.body?.data) {
    return payload.body.data;
  }

  for (const part of payload.parts ?? []) {
    if (part.mimeType === mime && part.body?.data) {
      return part.body.data;
    }
    if (part.parts) {
      const nested = findPartByMime(
        part as {
          mimeType?: string | null;
          body?: { data?: string | null } | null;
          parts?: Array<{
            mimeType?: string | null;
            body?: { data?: string | null } | null;
            parts?: unknown[];
          }> | null;
        },
        mime
      );
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}
