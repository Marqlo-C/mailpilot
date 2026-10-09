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
import { cleanDisplayUrl } from "@/lib/utils/format";

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

const tailorSchema = z.object({
  tailoredSummary: z.string().optional(),
  tailoredSkills: skillsSchema.optional(),
  selectedBulletIds: z.array(z.string()).default([]),
  selectedProjectIds: z.array(z.string()).default([]),
  strategyRationale: strategyRationaleSchema.optional(),
  coverLetter: z.string(),
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

/** Stage A: lean selection of bullets/projects/skills within a page budget. */
export function buildTailoredStrategySystemPrompt(input: {
  seniorityTier: string;
  timelineContext: string;
  professionalYears: number;
  includeSummary?: boolean;
}): string {
  const tenurePhrase = formatProfessionalTenureYears(input.professionalYears);
  const timeline = input.timelineContext.trim() || "No additional timeline context.";
  const includeSummary = input.includeSummary !== false;
  const summaryBlock = includeSummary
    ? `2. SUMMARY CONSTRAINTS:
   - Draft a punchy, confident 2-sentence executive summary highlighting alignment with the target role requirements and concrete, verifiable achievements.
   - NEVER quote raw profile telemetry or internal transition metrics (e.g., do NOT write "transitioning from an earlier field" or cite "13 years in a previous field").
   - NEVER adopt inflated seniority titles (e.g., Senior, Lead, Staff, Principal) if the candidate's verified tenure indicates early career or career switcher.`
    : `2. SUMMARY OMITTED:
   - The candidate has opted to omit the Summary section.
   - Set tailoredSummary to null.
   - Maximize signal in Experience and Projects using the expanded bullet budget.`;

  return `You are a senior talent strategist evaluating a candidate's master database for an opening at your organization.

Your task is to select the most relevant roles, projects, and bullets for a targeted resume, and explain WHY each choice beats alternatives for this specific role and company.

CRITICAL FACTUAL & SENIORITY CONSTRAINTS:
1. SENIORITY INTEGRITY: Verified persona tier is "${input.seniorityTier}". Candidate has ${tenurePhrase}.
   Timeline context: ${timeline}
   - Profile content MUST reflect only the scope and scale documented in the candidate's profile records.
   - NEVER adopt seniority designations, ownership claims, or scale metrics from the target job posting unless that exact achievement is explicitly present in the candidate's master database.
   - Do not describe the candidate at a higher career level than their verified tenure and persona allow, even if the posting or recruiter message implies a more senior bar.
${summaryBlock}
3. PROJECT INTEGRITY: Only feature distinct projects with concrete, verifiable outcomes. Skip empty placeholders and profile-only pages. Prefer 2–4 strong bullets per project.
4. TRUTH INTEGRITY: Only select IDs that exist in the candidate's database. Never invent experience, metrics, or tools.
5. SKILLS: Return tailoredSkills as groups of { "label": string, "items": string[] }. Reorder items so competencies requested by the job description appear first. Preserve the candidate's category labels. Do not invent categories or skills that are not in the profile.
6. STRICT BUDGET: Select at most the specified bullet budget across all experiences to guarantee the document fits the page target.
7. STRATEGY RATIONALE: Provide explicit recruiter-style reasoning for role fit, skill prioritization, featured experiences, and featured projects.
8. CREDENTIALS: Certifications, honors, and interests are separate profile sections. Never invent them, and do not fold them into skills or education.

Return ONLY valid JSON:
{
  "tailoredSummary": string,
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

const REFRAME_SYSTEM_PROMPT = `You are a resume editor. Reframe these chosen bullets to highlight alignment with the target role description.

STRICT CONSTRAINTS:
1. TRUTH PRESERVATION: Never invent tools, methods, credentials, certifications, systems, or responsibilities not substantiated by the source text.
2. ACTION-ORIENTED: Start each bullet with a strong action verb matching the candidate's verified level.
3. NO DUPLICATES: Do NOT generate duplicate bullets for the same technology or metric claim. Maintain a strict 1:1 mapping with the input bullet IDs.
4. LENGTH: Keep each bullet between 16 and 28 words.

Return ONLY valid JSON:
{ "reframedBullets": [{ "id": string, "rawText": string }] }`;

const reframeSchema = z.object({
  reframedBullets: z.array(
    z.object({
      id: z.string(),
      rawText: z.string(),
    })
  ),
});

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
  roleTitle?: string | null
): StrategyRationale {
  const role = roleTitle?.trim() || "the target role";
  const company = companyName?.trim() || "the company";
  return {
    roleFitAnalysis: `Selected verified profile evidence that best maps to ${role} at ${company}, staying within the candidate's documented scope.`,
    selectedSkillsReasoning:
      "Prioritized skills that appear in both the job requirements and the candidate's master skill inventory.",
    featuredExperiencesReasoning:
      "Featured roles with the strongest evidence of shipped work relevant to this posting while respecting the page budget.",
    featuredProjectsReasoning:
      "Included distinct implementation-heavy projects that reinforce the same stack and outcomes as the target role.",
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
};

export async function tailorResumeForJob(
  jobRequirements: string[],
  profile: MasterProfileInput,
  options: TailorOptions = {}
): Promise<TailorResult> {
  const includeSummary = options.includeSummary === true;
  const profileWithPersona = profile as ProfileWithPersonaCache;
  const persona = await getCachedOrSynthesizePersona(
    profileWithPersona,
    options.dbClient ?? null
  );

  const careerYears = estimateCareerYears(profile);
  const roleCount = profile.experiences.length;
  const targetPages = careerYears >= 7 && roleCount >= 4 ? 2 : 1;
  const baseBulletBudget = targetPages === 2 ? 12 : 7;
  // Omitting summary frees vertical space — allow +2 bullets on the page.
  const bulletBudgetMax = includeSummary
    ? baseBulletBudget
    : baseBulletBudget + 2;

  const bulletLibrary = profile.experiences.flatMap((exp) =>
    exp.bullets.map((b) => ({
      id: b.id,
      company: exp.company,
      role: exp.role,
      text: b.rawText.slice(0, 160),
    }))
  );

  const githubHandle = extractGitHubHandle(profile);
  const eligibleProjects = profile.projects.filter(
    (p) => !isGitHubMetaProject(p.name, githubHandle)
  );
  const projectLibrary = eligibleProjects.map((p) => ({
    id: p.id,
    name: p.name,
    tech: p.technologies.slice(0, 5),
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
    }),
    userPrompt: stageAUserPrompt,
    llmProvider: options.llmProvider ?? "OPENROUTER",
    localOllamaUrl: options.localOllamaUrl,
    ollamaModel: options.ollamaModel,
    allowCloudFallback: options.allowCloudFallback,
  });

  const parsed = result ? tailorSchema.safeParse(result) : null;

  const rawSelectedIds = parsed?.success
    ? parsed.data.selectedBulletIds
    : heuristicBulletIds(jobRequirements, profile);
  const selectedIds = new Set(rawSelectedIds.slice(0, bulletBudgetMax));

  let selectedExperience = profile.experiences
    .map((exp) => {
      const bullets = exp.bullets.filter((b) => selectedIds.has(b.id));
      return {
        ...exp,
        bullets: bullets.slice(0, 5),
      };
    })
    .filter((exp) => exp.bullets.length > 0);

  // Enforce global bullet budget after role mapping.
  let remaining = bulletBudgetMax;
  selectedExperience = selectedExperience
    .map((exp) => {
      const bullets = exp.bullets.slice(0, Math.max(0, remaining));
      remaining -= bullets.length;
      return { ...exp, bullets };
    })
    .filter((exp) => exp.bullets.length > 0);

  const selectedProjIdSet = new Set(
    parsed?.success ? parsed.data.selectedProjectIds : []
  );
  let selectedProjects = eligibleProjects
    .filter((p) => p.id && selectedProjIdSet.has(p.id))
    .map((p) => ({
      ...p,
      bullets: dedupeAndCapProjectBullets(p.bullets).slice(0, 4),
    }))
    .filter((p) => p.bullets.length > 0 || p.description?.trim());

  // Ensure every featured project has 2–4 bullets when source material allows.
  selectedProjects = selectedProjects.map((p) => {
    const capped = dedupeAndCapProjectBullets(p.bullets);
    if (capped.length >= 2) return { ...p, bullets: capped.slice(0, 4) };
    const fromDescription = p.description?.trim()
      ? [p.description.trim()]
      : [];
    return {
      ...p,
      bullets: dedupeAndCapProjectBullets([...capped, ...fromDescription]).slice(
        0,
        4
      ),
    };
  });

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
  const projectBulletsToReframe = selectedProjects.flatMap((proj) =>
    proj.bullets.map((text, idx) => ({
      id: `${proj.id ?? proj.name}-b-${idx}`,
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

    try {
      const reframeResult = await callLLMWithFallback({
        systemPrompt: REFRAME_SYSTEM_PROMPT,
        userPrompt: stageBUserPrompt,
        llmProvider: options.llmProvider ?? "OPENROUTER",
        localOllamaUrl: options.localOllamaUrl,
        ollamaModel: options.ollamaModel,
        allowCloudFallback: options.allowCloudFallback,
      });
      const reframed = reframeResult
        ? reframeSchema.safeParse(reframeResult)
        : null;
      if (reframed?.success) {
        const reframedMap = new Map(
          reframed.data.reframedBullets.map((b) => [b.id, b.rawText])
        );
        selectedExperience = selectedExperience.map((exp) => ({
          ...exp,
          bullets: exp.bullets.map((b) => ({
            ...b,
            rawText: reframedMap.get(b.id) || b.rawText,
          })),
        }));
        selectedProjects = selectedProjects.map((proj) => ({
          ...proj,
          bullets: dedupeAndCapProjectBullets(
            proj.bullets.map(
              (text, idx) =>
                reframedMap.get(`${proj.id ?? proj.name}-b-${idx}`) || text
            )
          ),
        }));
      }
    } catch {
      // Keep original selected bullet text if reframe fails.
    }
  }

  // Final project bullet hygiene after reframe.
  selectedProjects = selectedProjects.map((p) => ({
    ...p,
    bullets: dedupeAndCapProjectBullets(p.bullets),
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

  const tailoredSummary = includeSummary
    ? parsed?.success
      ? parsed.data.tailoredSummary ?? null
      : null
    : null;

  const strategyRationale =
    parsed?.success && parsed.data.strategyRationale
      ? parsed.data.strategyRationale
      : fallbackStrategyRationale(options.companyName, options.roleTitle);

  return {
    selectedExperience,
    selectedProjects,
    tailoredSummary,
    tailoredSkills: parsed?.success ? parsed.data.tailoredSkills : undefined,
    strategyRationale,
    coverLetter,
    selectedBullets,
    jobRequirements: requirements,
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
