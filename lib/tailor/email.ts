import { z } from "zod";
import {
  getCachedOrSynthesizePersona,
  type CandidatePersona,
  type PersonaDbClient,
  type ProfileWithPersonaCache,
} from "@/lib/persona";
import { callLLMWithFallback, type LlmProvider } from "@/lib/llm";
import { flattenSkillItems } from "@/lib/profile/skill-groups";
import type { AccountRules } from "@/lib/validations/rules";
import { scrubDraftPunctuation } from "./auxiliary";

export type DraftContextualEmailParams = {
  candidate: {
    firstName: string;
    recentRole?: string | null;
    summary?: string | null;
    topSkills: string[];
    persona?: CandidatePersona | null;
  };
  profile?: ProfileWithPersonaCache | null;
  dbClient?: PersonaDbClient | null;
  sender: {
    cleanFirstName?: string | null;
    titleOrPersona?: string | null;
    companyName: string;
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

export type DraftMode = "RECRUITER_REPLY" | "DIRECT_APPLICATION";

export type ContextualDraftResult = {
  subject: string;
  body: string;
};

export const contextualDraftSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
});

export const BANNED_PHRASES = [
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

export const CONTEXTUAL_DRAFT_SYSTEM_PROMPT = `You are writing a direct, natural email reply on behalf of the job seeker from your personal inbox.
Your goal is to sound concise, grounded, and human — matching the candidate's actual career stage (see CANDIDATE PERSONA / toneGuidance when provided).

CORE BEHAVIOR:
1. **Answer the Sender First:** Read the inbound email carefully. If the sender asked a direct question (like "Are you available Wednesday or Thursday?"), answer it immediately.
2. **Do not repeat their pitch:** If the recruiter already called out your background, do NOT parrot it back to them. Just acknowledge it naturally and focus on the logistics or the next step.
3. **Match length:** Keep your reply tight and focused (2–3 sentences max).
4. **Follow toneGuidance:** When CANDIDATE PERSONA includes toneGuidance and seniorityTier, adapt voice to that tier.

ABSOLUTE FACTUAL & SENIORITY INTEGRITY:
1. Only reference skills, technologies, companies, or experiences present in CANDIDATE_SKILLS / CANDIDATE_SUMMARY / timelineContext. Never invent qualifications.
2. Never fake senior alignment.
3. NUMERICAL INTEGRITY: Never output robotic, precise fractional years.

STYLE GUARDRAILS:
1. NO GREETING: Output ONLY the body paragraphs.
2. SIGN-OFF INTEGRITY: Do not include an ending sign-off or closing signature.
3. NO CORPORATE SLOP: Never use corporate filler phrases.

Return ONLY valid JSON:
{
  "subject": "Re: [Contextual subject]",
  "body": "[Body paragraphs only. No greeting. No sign-off.]"
}`;

export function stripLeadingSalutations(text: string): string {
  let next = text.trimStart();
  for (let i = 0; i < 5; i++) {
    const before = next;
    next = next.replace(/^(?:hi|hey|hello|dear)\b[^\n]{0,80}?\r?\n+/i, "");
    next = next.replace(/^(?:hi|hey|hello|dear)(?:\s+[A-Za-z][\w'.-]*){0,3}[,:!]\s+/i, "");
    next = next.trimStart();
    if (next === before) break;
  }
  return next;
}

const CLOSING_WORD =
  "(?:best(?:\\s+regards)?|warm(?:\\s+regards)?|kind(?:\\s+regards)?|all the best|thanks(?:\\s+again)?|thank you|regards|sincerely|cheers|respectfully)";

export function stripTrailingSignOffs(text: string): string {
  let next = text.trimEnd();
  for (let i = 0; i < 5; i++) {
    const before = next;
    next = next.replace(new RegExp(`\\n*${CLOSING_WORD}[,!]?\\s*\\r?\\n+[^\\n]+\\s*$`, "i"), "");
    next = next.replace(new RegExp(`\\n*${CLOSING_WORD},\\s*[A-Za-z][\\w'.-]{0,40}(?:\\s+[A-Za-z][\\w'.-]{0,40})?\\s*$`, "i"), "");
    next = next.replace(new RegExp(`\\n*${CLOSING_WORD}[,!]?\\s*$`, "i"), "");
    next = next.trimEnd();
    if (next === before) break;
  }
  return next;
}

export function scrubRoboticFractionalYears(text: string): string {
  return text.replace(/\b(\d+)\.(\d+)\s*(years?)\b/gi, (_match, whole, frac) => {
    const value = Number(`${whole}.${frac}`);
    if (!Number.isFinite(value) || value < 0.5) return "less than a year";
    const rounded = Math.max(1, Math.round(value));
    const unit = rounded === 1 ? "year" : "years";
    return `around ${rounded} ${unit}`;
  });
}

export function sanitizeDraft(text: string): string {
  let next = stripLeadingSalutations(text.trim());
  next = stripTrailingSignOffs(next);
  next = scrubRoboticFractionalYears(next);

  for (const phrase of BANNED_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
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

export function assembleEmailBody(
  cleanedBody: string,
  cleanFirstName: string | null | undefined,
  candidateFirstName: string
): string {
  const body = stripTrailingSignOffs(stripLeadingSalutations(cleanedBody)).trim();
  const greeting = cleanFirstName?.trim() ? `Hi ${cleanFirstName.trim()},` : "Hi there,";
  const signoff = `Best,\n${candidateFirstName}`;
  return `${greeting}\n\n${body}\n\n${signoff}`;
}

export function defaultBodyParagraphs(input: DraftContextualEmailParams): string {
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
  const firstName = profile.fullName.trim().split(/\s+/)[0] || profile.fullName.trim();

  return {
    firstName,
    summary: profile.summary?.trim().slice(0, 400) || null,
    topSkills,
    recentRole: recent ? `${recent.role} at ${recent.company}`.slice(0, 120) : null,
    persona: await getCachedOrSynthesizePersona(profile, dbClient),
  };
}

export async function draftContextualEmail(
  input: DraftContextualEmailParams
): Promise<ContextualDraftResult> {
  const skills = input.candidate.topSkills.slice(0, 15);
  const inboundSnippet = input.inboundSnippet.trim().slice(0, 6000);
  const firstName = input.candidate.firstName.trim() || "there";
  const cleanFirstName = input.sender.cleanFirstName?.trim() || null;

  const persona =
    input.candidate.persona ??
    (input.profile ? await getCachedOrSynthesizePersona(input.profile, input.dbClient) : null);

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
