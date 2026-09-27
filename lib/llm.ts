import { z } from "zod";

import {
  type EmailCategory,
  resolveApplicationType,
} from "@/lib/application-method";
import {
  buildClassifierUserPrompt,
  buildProfileAwareClassifierSystemPrompt,
  cleanOpportunityDescription,
  detectAlreadyApplied,
  ensureCandidateProfileForScoring,
  heuristicMatchScore,
  parseSalaryMax,
  type CandidateProfileSummary,
} from "@/lib/ai/classifier";
import { cleanEmailPayload } from "@/lib/email/cleaner";
import {
  isPlaceholderTitle,
  parseApplicationEmail,
} from "@/lib/parsers/application-parser";
import { prisma } from "@/lib/prisma";

export const extractedJobSchema = z.object({
  company: z.string().min(1),
  companyDomain: z.string().nullable().optional(),
  title: z.string().min(1),
  location: z.string().nullable().optional(),
  salary: z.string().nullable().optional(),
  salaryMax: z.coerce.number().nullable().optional(),
  postedAt: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  applyUrl: z.string().nullable().optional(),
  applicationType: z
    .enum(["DIRECT_EMAIL", "EXTERNAL_LINK", "QUICK_APPLY"])
    .optional(),
  recipientEmail: z.string().nullable().optional(),
  recipientName: z.string().nullable().optional(),
  isAlreadyApplied: z.boolean().optional().default(false),
  matchScore: z.coerce.number().min(0).max(100).optional(),
  matchReason: z.string().nullable().optional(),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

export const jobClassificationSchema = z.object({
  is_job_related: z.boolean(),
  email_category: z
    .enum([
      "DIRECT_RECRUITER",
      "JOB_BOARD_DIGEST",
      "APPLICATION_STATUS",
      "IRRELEVANT",
    ])
    .default("IRRELEVANT"),
  company_name: z.string().nullable(),
  role_title: z.string().nullable(),
  status: z.enum([
    "REJECTION",
    "INTERVIEW",
    "OA",
    "RECEIVED",
    "OTHER",
    "OFFER",
    "LEAD",
    "APPLIED",
  ]),
  action_required: z.boolean(),
  action_summary: z.string().nullable(),
  action_url: z.string().nullable(),
  deadline_iso: z.string().nullable(),
  jobs: z.array(extractedJobSchema).default([]),
});

export type JobClassification = z.infer<typeof jobClassificationSchema>;

export type LlmProvider = "OPENROUTER" | "LOCAL_OLLAMA";

export type ClassifyOptions = {
  llmProvider: LlmProvider;
  localOllamaUrl?: string | null;
  subject: string;
  body: string;
  fromEmail?: string | null;
  /** When provided, scoring is profile-aware. */
  candidateProfile?: CandidateProfileSummary | null;
};

const SUBJECT_KEYWORDS = [
  "application",
  "applied",
  "application was sent",
  "thank you for applying",
  "thank you for your application",
  "interview",
  "thank you for your interest",
  "status",
  "assessment",
  "hackerrank",
  "coderpad",
  "next steps",
  "job alert",
  "jobs for you",
  "new jobs",
  "recommended jobs",
  "glassdoor",
  "indeed",
  "linkedin",
  "hiring",
  "opportunity",
  "open role",
  "we're hiring",
  "we are hiring",
  "engineer",
  "developer",
  "software",
] as const;

const DIGEST_SENDER_HINTS = [
  "glassdoor",
  "indeed",
  "linkedin",
  "jobs@",
  "noreply@",
  "no-reply@",
  "jobalert",
  "alerts@",
  "greenhouse",
  "lever.co",
  "workday",
  "ashbyhq",
  "smartrecruiters",
  "icims",
] as const;

/** LinkedIn / ATS confirmation: "your application was sent to Acme". */
const APPLICATION_SENT_TO_RE =
  /(?:your\s+)?application\s+(?:was\s+|has\s+been\s+)?sent\s+to\s+(.+?)(?:\s*[-–|·]|$)/i;

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
 * Returns true when the subject matches job-triage pre-filter keywords.
 */
export function matchesJobSubjectKeywords(subject: string): boolean {
  const lower = subject.toLowerCase();
  return SUBJECT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function looksLikeDigest(subject: string, fromEmail?: string | null): boolean {
  const hay = `${subject} ${fromEmail ?? ""}`.toLowerCase();
  return DIGEST_SENDER_HINTS.some((hint) => hay.includes(hint));
}

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
  const thankYou =
    /thank you for (?:your )?appl/i.test(subject) ||
    /application\s+(?:received|submitted|confirmed)/i.test(subject);
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
    parsed?.title && !isPlaceholderTitle(parsed.title)
      ? parsed.title
      : "Applied Position";
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
        matchReason:
          "Application confirmation detected via inbox (heuristic fallback)",
      },
    ],
  };
}

function clampScore(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Loads a compact candidate summary from the account's UserProfile (resume data).
 */
export async function loadCandidateProfileSummary(
  accountId: string
): Promise<CandidateProfileSummary | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { accountId },
    include: {
      experiences: { orderBy: { displayOrder: "asc" }, take: 4 },
      education: true,
      projects: { take: 4 },
    },
  });

  if (!profile) {
    console.warn(
      `Sync warning: Account ${accountId} has no linked UserProfile. Match scoring will use software/CS defaults.`
    );
    return null;
  }

  const skillsJson = (profile.skills ?? {}) as {
    languages?: string[];
    frameworks?: string[];
    tools?: string[];
    concepts?: string[];
  };
  const skills = [
    ...(skillsJson.languages ?? []),
    ...(skillsJson.frameworks ?? []),
    ...(skillsJson.tools ?? []),
    ...(skillsJson.concepts ?? []),
  ].filter(Boolean);

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
      `Sync warning: Account ${accountId} profile is empty. Match scoring will use software/CS defaults.`
    );
  }

  return {
    educationSummary,
    skills: [...skills, ...projectTitles].slice(0, 50),
    experienceSummary,
    targetTitles,
  };
}

/**
 * Normalizes LLM output: forces null recipientEmail for digests / no-reply,
 * clamps scores, and synthesizes jobs[] from legacy single-job fields when needed.
 */
export function normalizeClassification(
  raw: JobClassification,
  context: { subject: string; fromEmail?: string | null; emailBody?: string }
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

    const applicationType =
      job.applicationType ??
      resolveApplicationType({
        applyUrl,
        recipientEmail,
      });
    const resolvedType = resolveApplicationType({
      applyUrl,
      recipientEmail:
        applicationType === "DIRECT_EMAIL" ? recipientEmail : null,
    });
    if (resolvedType !== "DIRECT_EMAIL") {
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

    // Fix 0%/missing scores for clearly aligned software roles.
    if (matchScore === 0) {
      matchScore = heuristicMatchScore(job.title, job.company);
      if (!job.matchReason?.trim()) {
        matchReason =
          matchScore >= 75
            ? "Heuristic score: title aligns with software/CS target roles."
            : "Heuristic score: limited profile overlap signals.";
      }
    }

    const salaryMax =
      typeof job.salaryMax === "number" && !Number.isNaN(job.salaryMax)
        ? job.salaryMax
        : parseSalaryMax(job.salary);

    const rawDescription = job.description ?? null;
    const description = cleanOpportunityDescription(rawDescription);
    const isAlreadyApplied =
      Boolean(job.isAlreadyApplied) ||
      detectAlreadyApplied(rawDescription, job.title) ||
      (emailCategory === "APPLICATION_STATUS" && raw.status === "APPLIED");

    return {
      ...job,
      companyDomain,
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
 * Classifies a job-related email with optional profile-aware match scoring.
 */
export async function classifyJobEmail(
  options: ClassifyOptions
): Promise<JobClassification | null> {
  const passesSubject = matchesJobSubjectKeywords(options.subject);
  const knownJobSender = looksLikeDigest(options.subject, options.fromEmail);
  const appliedHeuristic = heuristicApplicationConfirmation({
    subject: options.subject,
    body: options.body,
    fromEmail: options.fromEmail,
  });

  if (!passesSubject && !knownJobSender && !appliedHeuristic) {
    return null;
  }

  // Fast-path clear application confirmations without burning LLM quota.
  if (appliedHeuristic) {
    return appliedHeuristic;
  }

  const sanitizedBody = sanitizeEmailBody(options.body);
  const systemPrompt = buildProfileAwareClassifierSystemPrompt(
    ensureCandidateProfileForScoring(options.candidateProfile ?? null)
  );
  const userPrompt = buildClassifierUserPrompt({
    subject: options.subject,
    body: sanitizedBody,
    fromEmail: options.fromEmail,
  });

  const result = await callLLMWithFallback({
    systemPrompt,
    userPrompt,
    llmProvider: options.llmProvider,
    localOllamaUrl: options.localOllamaUrl,
  });

  if (!result) {
    return null;
  }

  try {
    // Accept either "jobs" or "opportunities" from the model.
    const normalizedPayload =
      Array.isArray(result.jobs) || !Array.isArray(result.opportunities)
        ? result
        : { ...result, jobs: result.opportunities };

    const parsed = jobClassificationSchema.parse(normalizedPayload);
    return normalizeClassification(parsed, {
      subject: options.subject,
      fromEmail: options.fromEmail,
      emailBody: sanitizedBody,
    });
  } catch (error) {
    console.warn("Failed to parse job classification JSON", error);
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
};

/**
 * Shared LLM dispatcher with local Ollama preference and OpenRouter fallback chain.
 */
export async function callLLMWithFallback(
  options: CallLLMOptions
): Promise<Record<string, unknown> | null> {
  const provider = options.llmProvider ?? "OPENROUTER";

  if (provider === "LOCAL_OLLAMA") {
    try {
      const result = await callOllamaJson(
        options.localOllamaUrl ?? "http://localhost:11434",
        options.systemPrompt,
        options.userPrompt
      );
      if (result) {
        return result;
      }
    } catch (error) {
      console.warn("Local Ollama failed; falling back to OpenRouter", error);
    }
  }

  return callOpenRouterJson(options.systemPrompt, options.userPrompt);
}

async function callOllamaJson(
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string
): Promise<Record<string, unknown> | null> {
  const endpoint = new URL("/api/generate", baseUrl).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? "llama3.2",
      stream: false,
      format: "json",
      prompt: `${systemPrompt}\n\n${userPrompt}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}`);
  }

  const json = (await response.json()) as { response?: string };
  if (!json.response) {
    return null;
  }

  return parseJsonObject(json.response);
}

async function callOpenRouterJson(
  systemPrompt: string,
  userPrompt: string
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set");
    return null;
  }

  for (const model of DEFAULT_OPENROUTER_MODELS) {
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
      if (error instanceof RateLimitError) {
        console.warn(`OpenRouter 429 on ${model}; trying next model`);
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
