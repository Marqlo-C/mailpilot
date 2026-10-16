import { z } from "zod";

import {
  getCachedOrSynthesizePersona,
  type CandidatePersona,
  type PersonaDbClient,
  type ProfileWithPersonaCache,
} from "@/lib/ai/persona";
import { callLLMWithFallback, type LlmProvider } from "@/lib/llm";
import { flattenSkillItems } from "@/lib/skill-groups";
import {
  skillsSchema,
  type MasterProfileInput,
  type ProjectInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile";
import type { AccountRules } from "@/lib/validations/rules";
import { cleanDisplayUrl } from "@/lib/utils/format";
import {
  calculateElasticPageBudget,
  isCareerSwitcherOrEarlyTenure,
} from "@/lib/resume-draft";
import { prisma } from "@/lib/prisma";

export type StrategyRationale = {
  roleFitAnalysis: string;
  selectedSkillsReasoning: string;
  featuredExperiencesReasoning: string;
  featuredProjectsReasoning: string;
};

export type TailorResult = {
  selectedExperience: WorkExperienceInput[];
  selectedProjects: ProjectInput[];
  tailoredSummary?: string | null;
  tailoredSkills?: MasterProfileInput["skills"];
  strategyRationale?: StrategyRationale;
  coverLetter: string;
  selectedBullets: string[];
  jobRequirements: string[];
  warningFlags?: string[];
};

export type DraftContextualEmailParams = {
  candidate: {
    firstName: string;
    recentRole?: string | null;
    summary?: string | null;
    topSkills: string[];
    /** Optional cached/lazy persona for voice adaptation. */
    persona?: CandidatePersona | null;
  };
  /** Full profile (or cache-bearing profile) for lazy persona synthesis when candidate.persona is absent. */
  profile?: ProfileWithPersonaCache | null;
  /** Prisma client used for lazy persona write-back on cache miss. */
  dbClient?: PersonaDbClient | null;
  sender: {
    cleanFirstName?: string | null;
    titleOrPersona?: string | null;
    companyName: string;
    /** Used only for subject line generation — never invent levels. */
    roleLabel?: string | null;
  };
  inboundSnippet: string;
  customInstruction?: string;
  llmConfig: {
    provider: LlmProvider;
    localOllamaUrl?: string | null;
    ollamaModel?: string | null;
    allowCloudFallback?: boolean;
    accountId?: string | null;
    accountRules?: Partial<AccountRules> | null;
  };
};

/** @deprecated Prefer DraftContextualEmailParams — kept for gradual migration. */
export type DraftMode = "RECRUITER_REPLY" | "DIRECT_APPLICATION";

export type ContextualDraftResult = {
  subject: string;
  body: string;
};

const strategyRationaleSchema = z.object({
  roleFitAnalysis: z.string(),
  selectedSkillsReasoning: z.string(),
  featuredExperiencesReasoning: z.string(),
  featuredProjectsReasoning: z.string(),
});

export const tailorSchema = z.object({
  tailoredSummary: z.string().nullable().optional(),
  tailoredSkills: skillsSchema.optional(),
  selectedBulletIds: z.array(z.string()).default([]),
  selectedProjectIds: z.array(z.string()).default([]),
  strategyRationale: strategyRationaleSchema.optional(),
  coverLetter: z.string().default(""),
  jobRequirements: z.array(z.string()).default([]),
});

const contextualDraftSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
});

const BANNED_PHRASES = [
  "i am excited to apply",
  "i'm excited to apply",
  "i am thrilled to apply",
  "i'm thrilled to apply",
  "i am confident in my ability",
  "i'm confident in my ability",
  "drive innovative solutions",
  "seamless",
  "spearhead",
  "testament to",
  "delve",
  "thrilled",
  "synergy",
  "fast-paced environment",
  "aligns with your requirements",
  "aligns with the requirements",
  "aligns with the requirements you described",
  "matches the backend work you mentioned",
  "requirements you described",
  "your note about the role caught my attention",
  "i hope this email finds you well",
  "i was glad to see your message in my inbox",
  "i appreciate you taking the time to review my profile",
  "i feel well-positioned to contribute",
  "i am confident i would be a great fit",
  "i'm confident i would be a great fit",
  "my background aligns closely with what you are looking for",
  "i believe my skills would be an asset to the team",
  "i know i have what it takes to excel",
  "supporting the initiatives described in your note",
  "leverage my expertise",
] as const;

/** Body-only contextual email drafts — persona-aware, concise, human. */
export const CONTEXTUAL_DRAFT_SYSTEM_PROMPT = `You are writing a direct, natural email reply on behalf of the job seeker from your personal inbox.
Your goal is to sound concise, grounded, and human — matching the candidate's actual career stage (see CANDIDATE PERSONA / toneGuidance when provided).

CORE BEHAVIOR:
1. **Answer the Sender First:** Read the inbound email carefully. If the sender asked a direct question (like "Are you available Wednesday or Thursday?"), answer it immediately.
2. **Do not repeat their pitch:** If the recruiter already called out your background (e.g., your recent work on a key project or a past employer), do NOT parrot it back to them or try to "sell" yourself. They already know your background. Just acknowledge it naturally and focus on the logistics or the next step.
3. **Match length:** If their email is long and detailed, keep your reply tight and focused (2–3 sentences max). If they asked for a time to chat, give them a time or ask a quick logistical question.
4. **Follow toneGuidance:** When CANDIDATE PERSONA includes toneGuidance and seniorityTier, adapt voice to that tier. Do not default to a generic "senior professional" register if the persona is Early Career or Career Switcher.

ABSOLUTE FACTUAL & SENIORITY INTEGRITY:
1. Only reference skills, technologies, companies, or experiences present in CANDIDATE_SKILLS / CANDIDATE_SUMMARY / timelineContext. Never invent qualifications, years of experience, leadership scope, or tool proficiencies.
2. Never fake senior alignment. If the opportunity is Staff / Principal / Lead / Senior and the candidate persona is Early Career, Mid-Level, or Career Switcher, do NOT claim you are a natural fit for that level, do NOT exaggerate tenure, do NOT exaggerate the scope of your work, and do NOT speak as if you have owned broad scope or a large organization.
3. For Career Switchers: treat years in the current field as the only seniority signal. Earlier years in another field are transferable context, not seniority in the new field. Never blur them into "X years in the current field."
4. **NUMERICAL INTEGRITY:** Never output robotic, precise fractional years (e.g., "0.7 years" or "8.3 years"). Always round to the nearest whole number and use natural conversational qualifiers if needed (e.g., "around 1 year", "over 8 years", "about 3 years"). Treat any decimal tenure in timelineContext as a signal to rephrase — never copy decimals into the email.
5. Never use self-validation about level ("I'm ready for a senior role", "my experience aligns with Staff expectations", "I operate at a lead level").

STYLE GUARDRAILS:
1. **NO GREETING:** Output ONLY the body paragraphs. Do not include an opening salutation or greeting (e.g. "Hi [Name],", "Hey [Name],", "Hello,", "Dear [Name],") — the application layout prepends it automatically. Never start the body with Hi/Hey/Hello/Dear.
2. **SIGN-OFF INTEGRITY:** Do not include an ending sign-off or closing signature (e.g., "Best, [Name]" or "Sincerely, [Name]") in your generated body text, as the application layer automatically appends the candidate's signature block. Never end with Best/Thanks/Regards/Sincerely/Cheers plus a name.
3. **NO CORPORATE SLOP:** Never use filler like "I hope this email finds you well", "Your note caught my attention", "I'm thrilled/excited", or "I feel well-positioned to contribute."
4. **PUNCTUATION:** No em-dashes (—). No semicolons (;). Use standard punctuation and normal hyphens (-).

Return ONLY valid JSON:
{
  "subject": "Re: [Contextual subject]",
  "body": "[Body paragraphs only. No greeting. No sign-off.]"
}`;

function formatProfessionalTenureYears(years: number): string {
  if (!Number.isFinite(years) || years < 0.5) {
    return "less than 1 year of professional experience";
  }
  const rounded = Math.max(1, Math.round(years));
  return `${rounded} year${rounded === 1 ? "" : "s"} of professional experience`;
}

/** Strict blacklist of persona system diagnostic terms forbidden in candidate summaries. */
export const BANNED_SUMMARY_PERSONA_TERMS = [
  "career switcher",
  "career switch",
  "career change",
  "career transition",
  "title family",
  "in-field tenure",
  "calendar years",
  "calendar year",
  "discipline switch",
  "transitional candidate",
  "verified trajectory",
  "earlier field",
  "previous field",
  "do not treat",
  "legacy time",
] as const;

const BANNED_SUMMARY_REGEXES: RegExp[] = [
  ...BANNED_SUMMARY_PERSONA_TERMS.map(
    (term) => new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i")
  ),
  /\bcareer\s+switch(?:er|ing)?\b/i,
  /\bcareer\s+transition(?:ing)?\b/i,
  /\bdo\s+not\s+treat\b/i,
  /\blegacy\s+(?:time|experience|seniority)\b/i,
];

/**
 * Sanitizes candidate summary copy ensuring zero leakage of persona diagnostic terms.
 */
export function sanitizeTailoredSummary(
  summary: string | null | undefined
): string | null {
  if (!summary || !summary.trim()) return null;

  const sentences = summary
    .replace(/([.?!])\s+/g, "$1|SPLIT|")
    .split("|SPLIT|")
    .map((s) => s.trim())
    .filter(Boolean);

  const cleanSentences = sentences.filter((sentence) => {
    return !BANNED_SUMMARY_REGEXES.some((regex) => regex.test(sentence));
  });

  if (cleanSentences.length === 0) {
    return null;
  }

  return cleanSentences.join(" ").replace(/\s+/g, " ").trim();
}

/** Stage A: lean selection of bullets/projects/skills within a page budget. */
export function buildTailoredStrategySystemPrompt(input: {
  seniorityTier: string;
  timelineContext: string;
  professionalYears: number;
  includeSummary?: boolean;
  inventMetrics?: boolean;
  projectsDisabled?: boolean;
  isCareerSwitcherOrEarlyTenure?: boolean;
}): string {
  const tenurePhrase = formatProfessionalTenureYears(input.professionalYears);
  const timeline = input.timelineContext.trim() || "No additional timeline context.";
  const includeSummary = input.includeSummary !== false;
  const summaryBlock = includeSummary
    ? `2. SUMMARY CONSTRAINTS:
   - Draft a punchy, confident 2-sentence executive summary highlighting alignment with the target role requirements and concrete, verifiable achievements.
   - Write strictly as a practicing professional in the target discipline.
   - NEVER refer to yourself as a "career switcher" or mention career transitions, "in-field tenure", "title family", or "calendar years" in the summary. Natural career stages like "student", "intern", or "recent graduate" are permissible when applicable, but never system diagnostic terms.
   - NEVER quote raw profile telemetry or internal transition metrics (e.g., do NOT write "transitioning from an earlier field" or cite "13 years in a previous field").
   - NEVER adopt inflated seniority titles (e.g., Senior, Lead, Staff, Principal) if the candidate's verified tenure indicates early career or career switcher.`
    : `2. SUMMARY OMITTED:
   - The candidate has opted to omit the Summary section.
   - Set tailoredSummary to null.
   - Since the summary is omitted, fill the single-page budget by featuring 2–3 relevant projects alongside relevant experiences with strong signal, avoiding empty vertical space on the sheet.`;

  let projectDirective: string;
  if (input.projectsDisabled) {
    projectDirective = `3. PROJECT INTEGRITY: The candidate has opted to omit the Projects section. Set selectedProjectIds to [].`;
  } else if (input.isCareerSwitcherOrEarlyTenure) {
    projectDirective = `3. PROJECT INTEGRITY: For career switchers or early-tenure candidates, select 2–3 distinct practical projects that directly demonstrate target-discipline capability and tools matching the target job description. Only feature distinct projects with concrete outcomes. Prefer 2–4 strong bullets per project.`;
  } else {
    projectDirective = `3. PROJECT INTEGRITY: Select 1–3 distinct projects demonstrating key competencies requested by the job description. Feature 2–4 strong bullets per project. Skip empty placeholders and profile-only pages.`;
  }

  const metricGuidance = input.inventMetrics === false
    ? `9. METRIC INTEGRITY: Do NOT invent metrics or unverified numbers. In strategyRationale (under featuredExperiencesReasoning or roleFitAnalysis), include constructive advice on what metrics the candidate could measure themselves for un-metricized achievements.`
    : `9. METRIC INTEGRITY: Modest, realistic metrics calibrated to candidate leveling (${input.seniorityTier}) may be synthesized when source bullets lack metrics using domain-native impact dimensions (efficiency, quality, volume, satisfaction). Never invent inflated enterprise revenue.`;

  const crossoverDirective = `10. FUNCTIONAL CROSSOVER & MULTI-ROLE CONTINUITY:
    - When evaluating candidate work experiences outside the target role's immediate title family (e.g. prior operations, logistics, support, or analysis work), do NOT reject or drop those roles simply because domain keywords differ from the target job posting.
    - Evaluate and select out-of-family roles through universal functional crossover: workflow orchestration, process automation, data accuracy, SLA/deadline adherence, root-cause troubleshooting, risk mitigation, and cross-functional coordination.
    - Ground Truth vs. Framing Agility: NEVER invent tools, platforms, or responsibilities absent from the source bullet. Translate raw operational tasks into rigorous, outcome-driven language.
    - For candidates with under 2 years in their current field or career switchers, do NOT drop preceding history to leave a half-empty page. Ensure you select 2–3 high-ownership bullets from prior roles to demonstrate professional accountability, scale, and execution.`;

  return `You are a senior talent strategist evaluating a candidate's master database for an opening at your organization.

Your task is to select the most relevant roles, projects, and bullets for a targeted resume, and explain WHY each choice beats alternatives for this specific role and company.

CRITICAL FACTUAL & SENIORITY CONSTRAINTS:
1. SENIORITY INTEGRITY: Verified persona tier is "${input.seniorityTier}". Candidate has ${tenurePhrase}.
   Timeline context: ${timeline}
   - Profile content MUST reflect only the scope and scale documented in the candidate's profile records.
   - NEVER adopt seniority designations, ownership claims, or scale metrics from the target job posting unless that exact achievement is explicitly present in the candidate's master database.
   - Do not describe the candidate at a higher career level than their verified tenure and persona allow, even if the posting or recruiter message implies a more senior bar.
${summaryBlock}
${projectDirective}
4. TRUTH INTEGRITY: Only select IDs that exist in the candidate's database. Never invent experience, metrics, or tools.
5. SKILLS: Return tailoredSkills as groups of { "label": string, "items": string[] }. Reorder items so competencies requested by the job description appear first. Preserve the candidate's category labels. Do not invent categories or skills that are not in the profile.
6. DOCUMENT BUDGET: Allocate 2–4 strong bullets per featured role and 2–4 strong bullets per featured project to create a complete, well-proportioned single-page document. Do not leave large empty gaps on the page.
7. STRATEGY RATIONALE: Provide explicit recruiter-style reasoning for role fit, skill prioritization, featured experiences, and featured projects.
8. CREDENTIALS: Certifications, honors, and interests are separate profile sections. Never invent them, and do not fold them into skills or education.
${metricGuidance}
${crossoverDirective}

Return ONLY valid JSON:
{
  "tailoredSummary": string | null,
  "tailoredSkills": [
    { "label": "Category", "items": ["Skill"] }
  ],
  "selectedBulletIds": string[],
  "selectedProjectIds": string[],
  "strategyRationale": {
    "roleFitAnalysis": string,
    "selectedSkillsReasoning": string,
    "featuredExperiencesReasoning": string,
    "featuredProjectsReasoning": string
  },
  "coverLetter": string,
  "jobRequirements": string[]
}`;
}

/** @deprecated Prefer buildTailoredStrategySystemPrompt({ seniorityTier, timelineContext, professionalYears }). */
export const TAILORED_STRATEGY_SYSTEM_PROMPT = buildTailoredStrategySystemPrompt({
  seniorityTier: "Mid-Level Professional",
  timelineContext: "",
  professionalYears: 3,
});

function extractGitHubHandle(profile: MasterProfileInput): string | null {
  for (const link of profile.links ?? []) {
    const url = cleanDisplayUrl(link.url);
    const match = /github\.com\/([A-Za-z0-9-]+)(?:\/|$)/i.exec(url);
    if (match?.[1] && match[1].toLowerCase() !== "orgs") {
      return match[1].toLowerCase();
    }
  }
  return null;
}

function isGitHubMetaProject(
  name: string,
  githubHandle: string | null
): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower) return false;
  if (lower.endsWith(".github.io")) return true;
  if (githubHandle && lower === githubHandle) return true;
  return false;
}

/**
 * Builds the Stage B bullet reframing prompt incorporating Google XYZ formatting,
 * universal 4-dimensional metric taxonomy, and strict metric integrity controls.
 */
export function buildReframeSystemPrompt(
  optionsOrInventMetrics:
    | boolean
    | {
        inventMetrics?: boolean;
        seniorityTier?: string;
      } = {}
): string {
  const options =
    typeof optionsOrInventMetrics === "boolean"
      ? { inventMetrics: optionsOrInventMetrics }
      : optionsOrInventMetrics;
  const inventMetrics = options.inventMetrics === true;

  const metricDirective = inventMetrics
    ? `METRIC SYNTHESIS PERMITTED (UNIVERSAL 4-DIMENSIONAL TAXONOMY):
- If a source bullet lacks concrete metrics, you MAY synthesize a modest, plausible metric calibrated strictly to the candidate's verified leveling (${options.seniorityTier || "Mid-Level Professional"}).
- Synthesized metrics MUST adapt directly to the NATIVE DISCIPLINE of that specific bullet across the 4 universal impact dimensions:
  1. Efficiency & Velocity: Turnaround time reduction (~10–20%), process cycle time speedup, queue clearing.
  2. Quality & Accuracy: Compliance rates (e.g., 98%+ verification accuracy), error rate reduction, protocol adherence.
  3. Volume & Throughput: Items/records/tickets/cases processed, stakeholders or units coordinated, asset volume handled.
  4. Satisfaction & Adoption: User/client/stakeholder feedback scores, workflow adoption rate, retention/renewal stability.
- STRICT DOMAIN DISCIPLINE: Never inject software/code tools, tech jargon, or foreign domain concepts into non-technical or legacy roles (e.g., never assign coding or cloud metrics to an administrative, logistical, or client-facing bullet).
- MODESTY & SENIORITY BAR: Keep synthesized metrics modest and realistic. NEVER invent massive corporate revenue, multi-million-dollar numbers, enterprise-scale claims, or unrealistic executive impact.`
    : `METRIC INTEGRITY (STRICT - NO INVENTED NUMBERS):
- If the source bullet already has numbers, latencies, percentages, or scale, NEVER change or overwrite those metrics. Refine sentence flow, action verbs, and Google XYZ structure while keeping all verified figures intact.
- If a source bullet has NO metrics, do NOT invent any numbers, percentages, or dollar amounts. Instead, emphasize qualitative execution scope, problem-solving impact, and procedural rigor. You MUST STILL RESTRUCTURE the bullet into the Google XYZ pattern ([Strong Action Verb] + [Outcome / Verified Impact] + [Method / Tooling]) using verified facts from the source text. NEVER leave the bullet un-reframed.`;

  return `You are an expert resume editor specializing in the Google XYZ resume framework. Reframe EVERY chosen bullet to highlight alignment with the target role description.

GOOGLE XYZ FRAMEWORK:
1. Follow Google's core XYZ structural formula for approximately 60%–70% of bullets:
   [Strong Action Verb] + [Quantifiable Impact / Scope / Metric] + [Method / Technical Approach]
   ("Accomplished [X] as measured by [Y] by doing [Z]").
   - STRUCTURAL PATTERN OVER RIGID TAGS: Do NOT force awkward literal template tags like "as measured by" or "by doing" unless they read naturally. Outcome-driven, fluid phrasing following Action + Metric + Method is strongly preferred.
   - Example of natural XYZ:
     "Engineered real-time vehicle telematics pipeline across 11 FastAPI endpoints, capturing 100% of fleet sensor events via automated userscript instrumentation."
     (e.g., "Decreased process turnaround time by 18% across 11 core workflows by establishing structured review gates and automated validation.")
2. For qualitative bullets (or when metric synthesis is disabled), apply the same structural XYZ pattern:
   [Strong Action Verb] + [Outcome / Verified Impact] + [Method / Tooling]
   (e.g., "Standardized cross-region configuration delivery ensuring continuous cluster synchronization by authoring declarative infrastructure templates.")
   DO NOT leave any bullet untouched or in raw source form. Every bullet must be actively restructured into the XYZ pattern.

${metricDirective}

FUNCTIONAL CROSSOVER & GROUND TRUTH:
- For bullets from earlier or cross-discipline roles, apply framing agility to highlight universal operational strengths (workflow orchestration, process automation, data accuracy, SLA/deadline adherence, troubleshooting, risk mitigation, and cross-functional delivery).
- UNBENDING GROUND TRUTH: Never invent tools, languages, platforms, certifications, systems, or responsibilities absent from the source bullet.

STRICT CONSTRAINTS:
1. TRUTH PRESERVATION: Never change or overwrite existing numbers, metrics, or substantiated tools from the source text.
2. ACTION-ORIENTED: Start each bullet with a strong action verb matching the candidate's verified level.
3. NO DUPLICATES & 1:1 MAPPING: Maintain a strict 1:1 mapping with the input bullet IDs. Every input ID must appear in reframedBullets with its reframed text.
4. LENGTH: Keep each bullet concise, between 16 and 34 words.

Return ONLY valid JSON:
{ "reframedBullets": [{ "id": string, "rawText": string }] }`;
}

export const REFRAME_SYSTEM_PROMPT = buildReframeSystemPrompt({});

const bulletItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((val) => String(val)),
    rawText: z.string().optional(),
    text: z.string().optional(),
    bullet: z.string().optional(),
    content: z.string().optional(),
  })
  .transform((val) => ({
    id: val.id,
    rawText: (val.rawText ?? val.text ?? val.bullet ?? val.content ?? "").trim(),
  }));

const reframeSchema = z.union([
  z.object({
    reframedBullets: z.array(bulletItemSchema),
  }),
  z.object({
    bullets: z.array(bulletItemSchema),
  }).transform((val) => ({ reframedBullets: val.bullets })),
  z.object({
    reframed_bullets: z.array(bulletItemSchema),
  }).transform((val) => ({ reframedBullets: val.reframed_bullets })),
  z.object({
    items: z.array(bulletItemSchema),
  }).transform((val) => ({ reframedBullets: val.items })),
]);

function normalizeBulletKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop identical or near-duplicate project bullets; hard-cap at 4. */
function dedupeAndCapProjectBullets(bullets: string[]): string[] {
  const seen: string[] = [];
  const out: string[] = [];
  for (const bullet of bullets) {
    const key = normalizeBulletKey(bullet);
    if (!key) continue;
    const duplicate = seen.some(
      (existing) =>
        existing === key ||
        existing.includes(key) ||
        key.includes(existing)
    );
    if (duplicate) continue;
    seen.push(key);
    out.push(bullet.trim());
    if (out.length >= 4) break;
  }
  return out.slice(0, 4);
}

function fallbackStrategyRationale(
  companyName?: string | null,
  roleTitle?: string | null,
  inventMetrics?: boolean
): StrategyRationale {
  const role = roleTitle?.trim() || "the target role";
  const company = companyName?.trim() || "the company";
  return {
    roleFitAnalysis: `Selected verified profile evidence that best maps to ${role} at ${company}, translating functional crossovers while staying within the candidate's documented scope.`,
    selectedSkillsReasoning:
      "Prioritized skills that appear in both the job requirements and the candidate's master skill inventory.",
    featuredExperiencesReasoning:
      inventMetrics === false
        ? "Featured roles highlighting core competencies and execution rigor. For unquantified achievements, recommend measuring turnaround times, accuracy rates, and stakeholder volumes."
        : "Featured roles with the strongest evidence of operational impact relevant to this posting while respecting the page budget.",
    featuredProjectsReasoning:
      "Included distinct implementation-heavy projects that reinforce practical execution and outcomes for the target role.",
  };
}

function parseFlexibleYearMonth(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (/present|current|now/i.test(value)) return new Date();
  const iso = /^(\d{4})(?:-(\d{1,2}))?/.exec(value);
  if (iso) {
    const year = Number(iso[1]);
    const month = iso[2] ? Number(iso[2]) - 1 : 0;
    if (year >= 1970 && year <= 2100) return new Date(year, month, 1);
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

/** Rough career span in years across all experience date ranges. */
function estimateCareerYears(profile: MasterProfileInput): number {
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const exp of profile.experiences) {
    const start = parseFlexibleYearMonth(exp.startDate);
    const end = parseFlexibleYearMonth(exp.endDate) ?? new Date();
    if (!start) continue;
    if (!earliest || start < earliest) earliest = start;
    if (!latest || end > latest) latest = end;
  }
  if (!earliest || !latest) return 0;
  const ms = latest.getTime() - earliest.getTime();
  return Math.max(0, ms / (365.25 * 24 * 60 * 60 * 1000));
}

/** Slim profile slice for fast email drafts (keeps prompts tiny). */
export async function buildSlimCandidate(
  profile: ProfileWithPersonaCache,
  dbClient?: PersonaDbClient | null
): Promise<{
  firstName: string;
  recentRole: string | null;
  summary: string | null;
  topSkills: string[];
  persona: CandidatePersona;
}> {
  const topSkills = flattenSkillItems(profile.skills).slice(0, 15);

  const recent = profile.experiences[0];
  const firstName =
    profile.fullName.trim().split(/\s+/)[0] || profile.fullName.trim();

  return {
    firstName,
    summary: profile.summary?.trim().slice(0, 400) || null,
    topSkills,
    recentRole: recent
      ? `${recent.role} at ${recent.company}`.slice(0, 120)
      : null,
    persona: await getCachedOrSynthesizePersona(profile, dbClient),
  };
}

function scrubDraftPunctuation(text: string): string {
  return text
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, ",")
    .replace(/\u2011/g, "-")
    .replace(/;/g, ",")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip leading salutations the model sometimes emits even when told not to.
 * Handles line-only greetings and same-line "Hi Name, body…" prefixes, repeatedly
 * so duplicated greetings do not survive into assembleEmailBody.
 */
function stripLeadingSalutations(text: string): string {
  let next = text.trimStart();
  for (let i = 0; i < 5; i++) {
    const before = next;
    // Entire greeting line(s): "Hi Marcus," / "Dear Hiring Manager," + newlines
    next = next.replace(
      /^(?:hi|hey|hello|dear)\b[^\n]{0,80}?\r?\n+/i,
      ""
    );
    // Same-line prefix: "Hi Marcus, Thanks for…" / "Hello, …" / "Hey there, …"
    next = next.replace(
      /^(?:hi|hey|hello|dear)(?:\s+[A-Za-z][\w'.-]*){0,3}[,:!]\s+/i,
      ""
    );
    next = next.trimStart();
    if (next === before) break;
  }
  return next;
}

const CLOSING_WORD =
  "(?:best(?:\\s+regards)?|warm(?:\\s+regards)?|kind(?:\\s+regards)?|all the best|thanks(?:\\s+again)?|thank you|regards|sincerely|cheers|respectfully)";

/**
 * Strip trailing closings the model emits even when told not to.
 * assembleEmailBody appends `Best,\\n{candidate}` — any leftover sign-off
 * becomes a double closing.
 */
function stripTrailingSignOffs(text: string): string {
  let next = text.trimEnd();
  for (let i = 0; i < 5; i++) {
    const before = next;
    // Multi-line: "Best,\nMarcus" / "Sincerely,\nFull Name"
    next = next.replace(
      new RegExp(`\\n*${CLOSING_WORD}[,!]?\\s*\\r?\\n+[^\\n]+\\s*$`, "i"),
      ""
    );
    // Same-line: "Best, Marcus" / "Thanks, Alex"
    next = next.replace(
      new RegExp(
        `\\n*${CLOSING_WORD},\\s*[A-Za-z][\\w'.-]{0,40}(?:\\s+[A-Za-z][\\w'.-]{0,40})?\\s*$`,
        "i"
      ),
      ""
    );
    // Bare closer on its own last line: "Best," / "Cheers!"
    next = next.replace(
      new RegExp(`\\n*${CLOSING_WORD}[,!]?\\s*$`, "i"),
      ""
    );
    next = next.trimEnd();
    if (next === before) break;
  }
  return next;
}

/** Replace robotic "8.3 years" / "0.7 year" with whole-year conversational phrasing. */
function scrubRoboticFractionalYears(text: string): string {
  return text.replace(/\b(\d+)\.(\d+)\s*(years?)\b/gi, (_match, whole, frac) => {
    const value = Number(`${whole}.${frac}`);
    if (!Number.isFinite(value) || value < 0.5) return "less than a year";
    const rounded = Math.max(1, Math.round(value));
    const unit = rounded === 1 ? "year" : "years";
    return `around ${rounded} ${unit}`;
  });
}

/** Single pass: strip greetings/sign-offs, banned phrases, and bad punctuation. */
function sanitizeDraft(text: string): string {
  let next = stripLeadingSalutations(text.trim());
  next = stripTrailingSignOffs(next);
  next = scrubRoboticFractionalYears(next);

  // Strip banned phrases
  for (const phrase of BANNED_PHRASES) {
    const re = new RegExp(
      phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi"
    );
    next = next.replace(re, "");
  }

  return next
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, ",")
    .replace(/\u2011/g, "-")
    .replace(/;/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assembleEmailBody(
  cleanedBody: string,
  cleanFirstName: string | null | undefined,
  candidateFirstName: string
): string {
  // Final guard: strip any greeting/sign-off that survived sanitize before wrap.
  const body = stripTrailingSignOffs(
    stripLeadingSalutations(cleanedBody)
  ).trim();
  const greeting = cleanFirstName?.trim()
    ? `Hi ${cleanFirstName.trim()},`
    : "Hi there,";
  const signoff = `Best,\n${candidateFirstName}`;
  return `${greeting}\n\n${body}\n\n${signoff}`;
}

function defaultBodyParagraphs(input: DraftContextualEmailParams): string {
  const skillHint = input.candidate.topSkills.slice(0, 2).join(" and ");
  const company = input.sender.companyName;
  return `Thanks for reaching out about the role at ${company}. ${
    skillHint
      ? `Lately my work has centered on ${skillHint}`
      : "Lately I have been focused on my recent responsibilities"
  }${
    input.candidate.recentRole ? ` (${input.candidate.recentRole})` : ""
  }. Curious what the team is focused on right now, or if you have a short JD you can share.`;
}

/**
 * Fast email-only draft. Avoids the heavy bullet library used by resume tailoring.
 * LLM returns body paragraphs only. Greeting + sign-off are assembled deterministically.
 */
export async function draftContextualEmail(
  input: DraftContextualEmailParams
): Promise<ContextualDraftResult> {
  const skills = input.candidate.topSkills.slice(0, 15);
  // Prefer fuller inbound context (full stored body cleaned upstream) over short snippets.
  const inboundSnippet = input.inboundSnippet.trim().slice(0, 6000);
  const firstName = input.candidate.firstName.trim() || "there";
  const cleanFirstName = input.sender.cleanFirstName?.trim() || null;

  const persona =
    input.candidate.persona ??
    (input.profile
      ? await getCachedOrSynthesizePersona(input.profile, input.dbClient)
      : null);

  const systemPrompt = persona
    ? `${CONTEXTUAL_DRAFT_SYSTEM_PROMPT}

CANDIDATE PERSONA (mandatory — adapt voice; do not override with fake seniority):
- seniorityTier: ${persona.seniorityTier}
- timelineContext: ${persona.timelineContext}
- toneGuidance: ${persona.toneGuidance}`
    : CONTEXTUAL_DRAFT_SYSTEM_PROMPT;

  const result = await callLLMWithFallback({
    systemPrompt,
    userPrompt: JSON.stringify({
      candidate: {
        name: firstName,
        recentRole: input.candidate.recentRole || null,
        skills,
        summary: input.candidate.summary?.slice(0, 400) || null,
        seniorityTier: persona?.seniorityTier ?? null,
        toneGuidance: persona?.toneGuidance ?? null,
        timelineContext: persona?.timelineContext ?? null,
      },
      sender: {
        company: input.sender.companyName,
        persona: input.sender.titleOrPersona || "Recruiter",
      },
      inboundSnippet: inboundSnippet || null,
      customInstruction: input.customInstruction?.trim() || null,
      CANDIDATE_SKILLS: skills,
      CANDIDATE_SUMMARY: input.candidate.summary?.slice(0, 400) || null,
    }),
    llmProvider: input.llmConfig.provider,
    localOllamaUrl: input.llmConfig.localOllamaUrl,
    ollamaModel: input.llmConfig.ollamaModel,
    allowCloudFallback: input.llmConfig.allowCloudFallback,
    accountId: input.llmConfig.accountId,
    accountRules: input.llmConfig.accountRules,
  });

  const parsed = result ? contextualDraftSchema.safeParse(result) : null;

  if (!parsed?.success && result) {
    console.warn(
      "[Draft] LLM response validation failed:",
      parsed?.error?.issues
    );
  }

  const rawBody = parsed?.success
    ? parsed.data.body
    : defaultBodyParagraphs({
        ...input,
        candidate: { ...input.candidate, topSkills: skills },
      });

  const cleanedBody = sanitizeDraft(rawBody);

  const roleLabel = input.sender.roleLabel?.trim();
  const defaultSubject = roleLabel
    ? `Re: ${roleLabel} at ${input.sender.companyName}`
    : `Re: role at ${input.sender.companyName}`;

  const subject = scrubDraftPunctuation(
    (parsed?.success && parsed.data.subject?.trim()) || defaultSubject
  );

  return {
    subject,
    body: assembleEmailBody(cleanedBody, cleanFirstName, firstName),
  };
}

/**
 * Two-stage resume tailor: (A) lean selection within a page budget,
 * (B) focused reframe of only the chosen bullets.
 * Prefer draftContextualEmail for email-only flows (much faster).
 */
export type TailorOptions = {
  llmProvider?: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  allowCloudFallback?: boolean;
  jobText?: string;
  companyName?: string | null;
  roleTitle?: string | null;
  /** Free-form guidance for bullet reselection (e.g. emphasize Python). */
  customInstruction?: string | null;
  /** Prior selection so refine can adjust instead of starting from scratch. */
  previousSelectedBulletIds?: string[] | null;
  /** Optional Prisma client for persona cache write-back. */
  dbClient?: PersonaDbClient | null;
  /** When false, omit professional summary and expand experience/project budget. */
  includeSummary?: boolean;
  /** Whether the tailor is permitted to synthesize realistic metrics when none exist in source. */
  inventMetrics?: boolean;
  /** Soft target page budget ('auto', 1, or 2). */
  targetPages?: "auto" | 1 | 2;
  accountId?: string | null;
  accountRules?: Partial<AccountRules> | null;
};

export async function tailorResumeForJob(
  jobRequirements: string[],
  profile: MasterProfileInput,
  options: TailorOptions = {}
): Promise<TailorResult> {
  const disabledSections =
    options.accountRules?.resumePreferences?.disabledSections ?? [];
  const includeSummary =
    (options.includeSummary ??
      options.accountRules?.resumePreferences?.includeSummary ??
      false) &&
    !disabledSections.includes("summary");
  const projectsDisabled = disabledSections.includes("projects");

  const profileWithPersona = profile as ProfileWithPersonaCache;
  const persona = await getCachedOrSynthesizePersona(
    profileWithPersona,
    options.dbClient ?? null
  );

  const careerYears = estimateCareerYears(profile);
  const switcherOrEarlyTenure = isCareerSwitcherOrEarlyTenure(persona, profile);
  const roleCount = profile.experiences.length;
  const inventMetrics =
    options.inventMetrics ??
    options.accountRules?.resumePreferences?.inventMetrics ??
    false;

  let effectiveOllamaModel = options.ollamaModel;
  let effectiveLocalOllamaUrl = options.localOllamaUrl;
  if ((!effectiveOllamaModel || !effectiveLocalOllamaUrl) && options.accountId) {
    try {
      const client = (options.dbClient ?? prisma) as typeof prisma;
      const settings = await client.accountSettings?.findUnique({
        where: { accountId: options.accountId },
        select: { ollamaModel: true, localOllamaUrl: true },
      });
      if (settings) {
        if (!effectiveOllamaModel && settings.ollamaModel) {
          effectiveOllamaModel = settings.ollamaModel;
        }
        if (!effectiveLocalOllamaUrl && settings.localOllamaUrl) {
          effectiveLocalOllamaUrl = settings.localOllamaUrl;
        }
      }
    } catch {
      // Ignore DB lookup errors
    }
  }

  const targetPagesPref =
    options.targetPages ??
    options.accountRules?.resumePreferences?.maxPages ??
    "auto";

  const githubHandle = extractGitHubHandle(profile);
  const eligibleProjects = projectsDisabled
    ? []
    : profile.projects.filter(
        (p) => !isGitHubMetaProject(p.name, githubHandle)
      );

  const bulletLibrary = profile.experiences.flatMap((exp) =>
    exp.bullets.map((b) => ({
      id: b.id,
      company: exp.company,
      role: exp.role,
      text: b.rawText.slice(0, 160),
    }))
  );

  const budget = calculateElasticPageBudget({
    targetPages: targetPagesPref,
    careerYears,
    roleCount,
    projectCount: eligibleProjects.length,
    hasSummary: includeSummary,
    totalSourceBullets: bulletLibrary.length,
    matchedRequirementsCount: jobRequirements.length,
    isCareerSwitcher: switcherOrEarlyTenure,
  });
  const targetPages = budget.targetPages;
  const bulletBudgetMax = budget.bulletBudgetMax;
  const projectLibrary = eligibleProjects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description?.slice(0, 160) || null,
    tech: p.technologies.slice(0, 8),
  }));

  const customInstruction = options.customInstruction?.trim() || null;
  const previousSelectedBulletIds =
    options.previousSelectedBulletIds?.filter(Boolean) ?? [];

  const stageAUserPrompt = JSON.stringify({
    applicant: {
      fullName: profile.fullName,
      email: profile.email,
      summary: profile.summary?.slice(0, 400) ?? null,
      skills: profile.skills,
      certifications: profile.certifications,
      awards: profile.awards,
      interests: profile.interests,
    },
    persona: {
      seniorityTier: persona.seniorityTier,
      timelineContext: persona.timelineContext,
      toneGuidance: persona.toneGuidance,
    },
    employer: {
      companyName: options.companyName ?? null,
      roleTitle: options.roleTitle ?? null,
    },
    jobRequirements,
    jobText: options.jobText?.slice(0, 2500) ?? null,
    targetPages,
    bulletBudgetMax,
    includeSummary,
    projectsDisabled,
    bulletLibrary,
    projectLibrary,
    ...(previousSelectedBulletIds.length > 0
      ? { previousSelectedBulletIds }
      : {}),
    ...(customInstruction
      ? {
          refineInstruction: customInstruction,
          refineNote:
            "Adjust selectedBulletIds and selectedProjectIds to satisfy refineInstruction. Stay within bulletBudgetMax. Only use ids from bulletLibrary and projectLibrary. Never inflate seniority beyond persona.seniorityTier.",
        }
      : {}),
  });

  const result = await callLLMWithFallback({
    systemPrompt: buildTailoredStrategySystemPrompt({
      seniorityTier: persona.seniorityTier,
      timelineContext: persona.timelineContext,
      professionalYears: careerYears,
      includeSummary,
      inventMetrics,
      projectsDisabled,
      isCareerSwitcherOrEarlyTenure: switcherOrEarlyTenure,
    }),
    userPrompt: stageAUserPrompt,
    llmProvider: options.llmProvider ?? "OPENROUTER",
    localOllamaUrl: effectiveLocalOllamaUrl,
    ollamaModel: effectiveOllamaModel,
    allowCloudFallback: options.allowCloudFallback,
    accountId: options.accountId,
    accountRules: options.accountRules,
  }).catch((err) => {
    console.warn(
      "[ResumeTailor] Stage A LLM call failed, falling back to heuristics:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  });

  const parsed = result ? tailorSchema.safeParse(result) : null;
  if (result && !parsed?.success) {
    console.warn(
      "[ResumeTailor] LLM response validation failed:",
      parsed?.error?.issues
    );
  }

  // 1. Resolve selected projects within page budget
  const maxProjectCount = targetPages === 1 ? (includeSummary ? 2 : 3) : 4;
  const desiredProjectCount = switcherOrEarlyTenure
    ? (includeSummary ? 2 : Math.min(3, eligibleProjects.length))
    : (includeSummary ? 1 : Math.min(2, eligibleProjects.length));

  let selectedProjIds: string[] = [];
  if (!projectsDisabled && eligibleProjects.length > 0) {
    if (parsed?.success && parsed.data.selectedProjectIds.length > 0) {
      selectedProjIds = [...parsed.data.selectedProjectIds];
    }
    // If fewer than desired projects selected (or if parsing failed/empty), backfill from heuristic rankings
    if (selectedProjIds.length < desiredProjectCount) {
      const heuristicIds = heuristicProjectIds(
        jobRequirements,
        eligibleProjects,
        desiredProjectCount
      );
      for (const id of heuristicIds) {
        if (!selectedProjIds.includes(id) && selectedProjIds.length < desiredProjectCount) {
          selectedProjIds.push(id);
        }
      }
    }
    selectedProjIds = selectedProjIds.slice(0, maxProjectCount);
  }

  const selectedProjIdSet = new Set(selectedProjIds);
  let selectedProjects = eligibleProjects
    .filter((p) => (p.id ? selectedProjIdSet.has(p.id) : selectedProjIdSet.has(p.name)))
    .slice(0, maxProjectCount)
    .map((p) => ({
      ...p,
      bullets: dedupeAndCapProjectBullets(p.bullets).slice(
        0,
        budget.bulletsPerProjectMax ?? 3
      ),
    }))
    .filter((p) => p.bullets.length > 0 || p.description?.trim());

  // Ensure every featured project has 2–3 bullets when source material allows.
  selectedProjects = selectedProjects.map((p) => {
    const capped = dedupeAndCapProjectBullets(p.bullets);
    if (capped.length >= 2) {
      return {
        ...p,
        bullets: capped.slice(0, budget.bulletsPerProjectMax ?? 3),
      };
    }
    const fromDescription = p.description?.trim()
      ? [p.description.trim()]
      : [];
    return {
      ...p,
      bullets: dedupeAndCapProjectBullets([...capped, ...fromDescription]).slice(
        0,
        budget.bulletsPerProjectMax ?? 3
      ),
    };
  });

  // Calculate total bullets consumed by selected projects
  const projectBulletCount = selectedProjects.reduce(
    (acc, p) => acc + p.bullets.length,
    0
  );

  // 2. Partition bullet budget for work experience.
  // Reserve at least 3 bullets for experience so work history is preserved.
  const experienceBulletBudget =
    selectedProjects.length > 0
      ? Math.max(3, bulletBudgetMax - projectBulletCount)
      : bulletBudgetMax;

  let rawSelectedIds = parsed?.success
    ? [...parsed.data.selectedBulletIds]
    : heuristicBulletIds(jobRequirements, profile);

  // If the model selected bullets from only 1 experience but there are multiple experiences
  // in the master profile and available experience budget, backfill bullets from other experiences
  const selectedExpIdsInRaw = new Set<string>();
  for (const bid of rawSelectedIds) {
    const parentExp = profile.experiences.find((e) =>
      e.bullets.some((b) => b.id === bid)
    );
    const expKey = parentExp?.id || (parentExp ? `${parentExp.company}-${parentExp.role}` : null);
    if (expKey) selectedExpIdsInRaw.add(expKey);
  }

  if (
    selectedExpIdsInRaw.size < Math.min(2, profile.experiences.length) &&
    experienceBulletBudget > rawSelectedIds.length
  ) {
    // 1. Try any remaining heuristic bullets first
    const allHeuristicIds = heuristicBulletIds(jobRequirements, profile);
    for (const hid of allHeuristicIds) {
      if (!rawSelectedIds.includes(hid)) {
        const parentExp = profile.experiences.find((e) =>
          e.bullets.some((b) => b.id === hid)
        );
        const expKey = parentExp?.id || (parentExp ? `${parentExp.company}-${parentExp.role}` : null);
        if (expKey && !selectedExpIdsInRaw.has(expKey)) {
          rawSelectedIds.push(hid);
          selectedExpIdsInRaw.add(expKey);
          if (
            rawSelectedIds.length >= experienceBulletBudget ||
            selectedExpIdsInRaw.size >= Math.min(2, profile.experiences.length)
          ) {
            break;
          }
        }
      }
    }

    // 2. If unrepresented experiences remain (e.g. cross-discipline / legacy roles with distinct vocabulary),
    // pick their highest-ownership bullets (preferring metrics / quantified outcomes)
    if (
      selectedExpIdsInRaw.size < Math.min(2, profile.experiences.length) &&
      experienceBulletBudget > rawSelectedIds.length
    ) {
      for (const exp of profile.experiences) {
        const expKey = exp.id || `${exp.company}-${exp.role}`;
        if (!selectedExpIdsInRaw.has(expKey)) {
          const sortedBullets = [...exp.bullets].sort((a, b) => {
            if (a.hasMetric && !b.hasMetric) return -1;
            if (!a.hasMetric && b.hasMetric) return 1;
            return 0;
          });
          for (const bullet of sortedBullets) {
            if (!rawSelectedIds.includes(bullet.id)) {
              rawSelectedIds.push(bullet.id);
              selectedExpIdsInRaw.add(expKey);
              // For switchers or when space is available, include up to 2 crossover bullets
              if (rawSelectedIds.length + 1 <= experienceBulletBudget) {
                const secondBullet = sortedBullets.find((b) => b.id !== bullet.id);
                if (secondBullet && !rawSelectedIds.includes(secondBullet.id)) {
                  rawSelectedIds.push(secondBullet.id);
                }
              }
              break;
            }
          }
          if (
            rawSelectedIds.length >= experienceBulletBudget ||
            selectedExpIdsInRaw.size >= Math.min(2, profile.experiences.length)
          ) {
            break;
          }
        }
      }
    }
  }

  const selectedIds = new Set(rawSelectedIds.slice(0, experienceBulletBudget));

  let selectedExperience = profile.experiences
    .map((exp) => {
      const bullets = exp.bullets.filter((b) => selectedIds.has(b.id));
      return {
        ...exp,
        bullets: bullets.slice(0, budget.bulletsPerRoleMax ?? 4),
      };
    })
    .filter((exp) => exp.bullets.length > 0);

  // Enforce experience bullet budget after role mapping.
  let remaining = experienceBulletBudget;
  selectedExperience = selectedExperience
    .map((exp) => {
      const bullets = exp.bullets.slice(0, Math.max(0, remaining));
      remaining -= bullets.length;
      return { ...exp, bullets };
    })
    .filter((exp) => exp.bullets.length > 0);

  // Stage B: reframe experience + project bullets (small payload, 1:1 IDs).
  const experienceBulletsToReframe = selectedExperience.flatMap((exp) =>
    exp.bullets.map((b) => ({
      id: b.id,
      rawText: b.rawText,
      kind: "experience" as const,
      role: exp.role,
      company: exp.company,
    }))
  );
  const projectBulletsToReframe = selectedProjects.flatMap((proj, pIdx) =>
    proj.bullets.map((text, idx) => ({
      id: proj.id ? `${proj.id}-b-${idx}` : `proj-${pIdx}-b-${idx}`,
      rawText: text,
      kind: "project" as const,
      projectName: proj.name,
    }))
  );
  const bulletsToReframe = [
    ...experienceBulletsToReframe,
    ...projectBulletsToReframe,
  ];

  if (bulletsToReframe.length > 0) {
    const stageBUserPrompt = JSON.stringify({
      employer: {
        companyName: options.companyName ?? null,
        roleTitle: options.roleTitle ?? null,
      },
      jobText: options.jobText?.slice(0, 1500) ?? null,
      jobRequirements: jobRequirements.slice(0, 12),
      bullets: bulletsToReframe,
    });

    console.log(
      `[Tailor:Reframe] Starting reframe for ${bulletsToReframe.length} bullets. inventMetrics =`,
      inventMetrics
    );

    try {
      const reframeResult = await callLLMWithFallback({
        systemPrompt: buildReframeSystemPrompt({
          inventMetrics,
          seniorityTier: persona.seniorityTier,
        }),
        userPrompt: stageBUserPrompt,
        llmProvider: options.llmProvider ?? "OPENROUTER",
        localOllamaUrl: effectiveLocalOllamaUrl,
        ollamaModel: effectiveOllamaModel,
        allowCloudFallback: options.allowCloudFallback,
        accountId: options.accountId,
        accountRules: options.accountRules,
      });

      if (!reframeResult) {
        console.warn(
          "[Tailor:Reframe] LLM returned null or empty result. Keeping original bullets."
        );
      } else {
        const reframed = reframeSchema.safeParse(reframeResult);
        if (!reframed.success) {
          console.error(
            "[Tailor:Reframe] Stage B reframe validation failed:",
            reframed.error.issues,
            "Raw result keys:",
            Object.keys(reframeResult)
          );
        } else {
          console.log(
            `[Tailor:Reframe] Successfully reframed ${reframed.data.reframedBullets.length} bullets.`
          );
          const reframedList = reframed.data.reframedBullets;
          const reframedMap = new Map<string, string>();
          for (const b of reframedList) {
            const text = b.rawText.trim();
            if (!text) continue;
            reframedMap.set(b.id.trim(), text);
            reframedMap.set(b.id.trim().toLowerCase(), text);
          }

          // Index fallback if 1:1 counts match
          const indexMap = new Map<string, string>();
          if (reframedList.length === bulletsToReframe.length) {
            bulletsToReframe.forEach((orig, idx) => {
              const reframedText = reframedList[idx]?.rawText?.trim();
              if (reframedText) {
                indexMap.set(orig.id, reframedText);
              }
            });
          }

          selectedExperience = selectedExperience.map((exp) => ({
            ...exp,
            bullets: exp.bullets.map((b) => ({
              ...b,
              rawText:
                reframedMap.get(b.id.trim()) ??
                reframedMap.get(b.id.trim().toLowerCase()) ??
                indexMap.get(b.id) ??
                b.rawText,
            })),
          }));

          selectedProjects = selectedProjects.map((proj, pIdx) => ({
            ...proj,
            bullets: dedupeAndCapProjectBullets(
              proj.bullets.map((text, idx) => {
                const primaryId = proj.id
                  ? `${proj.id}-b-${idx}`
                  : `proj-${pIdx}-b-${idx}`;
                const legacyNameId = `${proj.name}-b-${idx}`;
                return (
                  reframedMap.get(primaryId) ??
                  reframedMap.get(primaryId.toLowerCase()) ??
                  reframedMap.get(legacyNameId) ??
                  indexMap.get(primaryId) ??
                  text
                );
              })
            ),
          }));
        }
      }
    } catch (err) {
      console.error(
        "[Tailor:Reframe] Error during reframe:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Final project bullet hygiene after reframe.
  selectedProjects = selectedProjects.map((p) => ({
    ...p,
    bullets: dedupeAndCapProjectBullets(p.bullets).slice(
      0,
      budget.bulletsPerProjectMax ?? 3
    ),
  }));

  const selectedBullets = selectedExperience.flatMap((e) =>
    e.bullets.map((b) => b.rawText)
  );

  const rawCover =
    parsed?.success && parsed.data.coverLetter
      ? parsed.data.coverLetter
      : defaultCoverLetter(profile, jobRequirements, options.companyName);

  const coverLetter = scrubDraftPunctuation(
    sanitizeCoverLetterGreeting(rawCover, profile.fullName)
  );

  const requirements =
    parsed?.success && parsed.data.jobRequirements.length > 0
      ? parsed.data.jobRequirements
      : jobRequirements;

  const rawSummary = includeSummary
    ? parsed?.success
      ? parsed.data.tailoredSummary ?? null
      : null
    : null;
  const tailoredSummary = sanitizeTailoredSummary(rawSummary);

  const strategyRationale =
    parsed?.success && parsed.data.strategyRationale
      ? parsed.data.strategyRationale
      : fallbackStrategyRationale(options.companyName, options.roleTitle, inventMetrics);

  return {
    selectedExperience,
    selectedProjects,
    tailoredSummary,
    tailoredSkills: parsed?.success ? parsed.data.tailoredSkills : undefined,
    strategyRationale,
    coverLetter,
    selectedBullets,
    jobRequirements: requirements,
    warningFlags: budget.warningFlags,
  };
}

/**
 * Only rewrites greetings that incorrectly address the candidate by their own name.
 * Leaves natural recruiter greetings like "Hi Sarah," intact.
 */
export function sanitizeCoverLetterGreeting(
  body: string,
  candidateName: string
): string {
  const name = candidateName.trim();
  if (!name) return body.trim();

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const invertedGreeting = new RegExp(
    `^(?:\\s*)(?:dear|hello|hi|hey)\\s+${escaped}\\b[,!:]?\\s*`,
    "i"
  );

  let next = body.replace(invertedGreeting, "Hi,\n\n");

  // Also catch "Dear FirstName," when only the first token matches the candidate.
  const first = name.split(/\s+/)[0];
  if (first && first.length > 1) {
    const firstEscaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const invertedFirst = new RegExp(
      `^(?:\\s*)(?:dear|hello|hi|hey)\\s+${firstEscaped}\\b[,!:]?\\s*`,
      "i"
    );
    next = next.replace(invertedFirst, "Hi,\n\n");
  }

  const firstName = first || name;
  if (!/\b(best|regards|sincerely|thanks|thank you)\b/i.test(next.slice(-220))) {
    next = `${next.trim()}\n\nBest,\n${firstName}`;
  }

  return next.trim();
}

function heuristicBulletIds(
  requirements: string[],
  profile: MasterProfileInput
): string[] {
  const req = requirements.join(" ").toLowerCase();
  const scored = profile.experiences.flatMap((exp) =>
    exp.bullets.map((b) => {
      const hay = `${b.rawText} ${b.technologies.join(" ")}`.toLowerCase();
      let score = b.hasMetric ? 2 : 0;
      for (const token of req.split(/[^a-z0-9+#]+/).filter((t) => t.length > 2)) {
        if (hay.includes(token)) score += 1;
      }
      return { id: b.id, score };
    })
  );
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((s) => s.id);
}

const COMMON_STOP_WORDS = new Set([
  "and", "the", "for", "with", "are", "you", "our", "all", "that", "this",
  "from", "your", "will", "have", "been", "has", "not", "but", "can", "they",
  "more", "into", "their", "here", "were", "what", "when", "where", "how",
  "who", "which", "why", "per", "also", "some", "such", "than", "then",
  "about", "would", "like", "just", "role", "team", "company", "work",
  "join", "help", "need", "looking", "seeking", "experienced",
]);

export function heuristicProjectIds(
  requirements: string[],
  projects: MasterProfileInput["projects"],
  limit: number = 2
): string[] {
  if (!projects || projects.length === 0) return [];
  const reqText = requirements.join(" ").toLowerCase();
  const tokens = reqText
    .split(/[^a-z0-9+#.]/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 2 && !COMMON_STOP_WORDS.has(t));

  const scored = projects.map((p) => {
    let score = 0;
    const nameDesc = `${p.name} ${p.description ?? ""}`.toLowerCase();
    const tech = p.technologies.map((t) => t.toLowerCase()).join(" ");
    const bullets = p.bullets.map((b) => b.toLowerCase()).join(" ");

    for (const token of tokens) {
      if (tech.includes(token)) score += 4;
      if (nameDesc.includes(token)) score += 2;
      if (bullets.includes(token)) score += 1;
    }
    // Give slight boost for having detailed bullets
    if (p.bullets.length > 0) score += 1;
    return { id: p.id ?? p.name, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.id)
    .filter((id): id is string => Boolean(id));
}

function defaultCoverLetter(
  profile: MasterProfileInput,
  requirements: string[],
  companyName?: string | null
): string {
  const skills = flattenSkillItems(profile.skills).slice(0, 6).join(", ");
  const company = companyName?.trim() || "your team";
  const firstName = profile.fullName.trim().split(/\s+/)[0] || profile.fullName;
  const background =
    profile.summary?.slice(0, 180) ??
    (skills ? `My background includes ${skills}.` : "I am writing to share my background.");
  return `Hi,\n\nI am ${profile.fullName}, writing about an opening at ${company}. ${background}${
    requirements.length
      ? ` Relevant areas include ${requirements.slice(0, 3).join(", ")}.`
      : ""
  }\n\nHappy to share a resume or jump on a quick call.\n\nBest,\n${firstName}`;
}
