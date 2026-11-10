import { flattenSkillItems } from "@/lib/profile/skill-groups";
import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import type { StrategyRationale, TailorOptions } from "@/lib/validations/tailor.schema";
import type { CandidatePersona } from "@/lib/validations/persona.schema";
import { callLLMWithFallback } from "@/lib/ai";

/** Strict blacklist of persona system diagnostic terms forbidden in candidate summaries. */
export const BANNED_SUMMARY_PERSONA_TERMS = [
  "career switcher", "career switch", "career change", "career transition",
  "title family", "in-field tenure", "calendar years", "calendar year",
  "discipline switch", "transitional candidate", "verified trajectory",
  "earlier field", "previous field", "do not treat", "legacy time",
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

  if (cleanSentences.length === 0) return null;

  return cleanSentences.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Reorders items within each skill category and ranks skill categories themselves
 * so tools and competencies matching the target job appear first.
 * On 1-page budgets, proportionally curates oversized lists to prevent physical page overflow
 * while strictly guaranteeing that target-matched items are never dropped.
 * Preserves the candidate's exact category labels and items verbatim without hallucination.
 */
export interface ReorderSkillsOptions {
  targetPages?: 1 | 2;
  maxTotalItems?: number;
}

export function reorderSkillsForTarget(
  skills: MasterProfileInput["skills"],
  matchedKeywords: string[],
  options: ReorderSkillsOptions = {}
): MasterProfileInput["skills"] {
  if (!skills || skills.length === 0) return [];

  const targetPages = options.targetPages ?? 1;
  const maxTotalItems = options.maxTotalItems ?? (targetPages === 1 ? 24 : 50);

  const matchSet = new Set(
    (matchedKeywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean)
  );

  // 1. Sort items within each category so target matches appear first
  const scoredGroups = skills.map((group) => {
    let matchedCount = 0;
    const items = [...group.items].sort((a, b) => {
      const aMatch = matchSet.has(a.name.toLowerCase()) ? 1 : 0;
      const bMatch = matchSet.has(b.name.toLowerCase()) ? 1 : 0;
      return bMatch - aMatch;
    });

    items.forEach((item) => {
      if (matchSet.has(item.name.toLowerCase())) {
        matchedCount += 1;
      }
    });

    const labelLower = group.label.toLowerCase();
    const labelMatch =
      matchSet.has(labelLower) ||
      (matchedKeywords || []).some((k) => labelLower.includes(k.toLowerCase()))
        ? 2
        : 0;

    return {
      group: {
        ...group,
        items,
      },
      score: matchedCount * 10 + labelMatch,
    };
  });

  // 2. Rank the categories themselves so the most relevant categories appear first
  scoredGroups.sort((a, b) => b.score - a.score);

  const totalCandidateItems = skills.reduce((sum, g) => sum + g.items.length, 0);
  if (totalCandidateItems <= maxTotalItems) {
    return scoredGroups.map((s) => s.group);
  }

  // 3. Proportional physical space distribution for single-page resumes
  // Invariant 1: Any item matching target job competencies is NEVER dropped.
  // Invariant 2: Preserves candidate's verbatim category names and remaining items fairly.
  const perCategoryCap = Math.max(
    4,
    Math.floor(maxTotalItems / Math.max(1, scoredGroups.length))
  );

  return scoredGroups
    .map((s) => {
      const matchingItems: typeof s.group.items = [];
      const nonMatchingItems: typeof s.group.items = [];

      s.group.items.forEach((item) => {
        if (matchSet.has(item.name.toLowerCase())) {
          matchingItems.push(item);
        } else {
          nonMatchingItems.push(item);
        }
      });

      const needed = Math.max(0, perCategoryCap - matchingItems.length);
      const chosen = [...matchingItems, ...nonMatchingItems.slice(0, needed)];

      return {
        ...s.group,
        items: chosen,
      };
    })
    .filter((g) => g.items.length > 0);
}

/**
 * Dynamically selects the best matching verified role title from the candidate's
 * real work history that aligns with the target job posting.
 */
export function selectBestVerifiedCandidateTitle(params: {
  experiences: Array<{ role: string; company?: string }>;
  targetRole?: string | null;
  targetCompetencies?: string[];
  titleFamily?: string | null;
}): string {
  const verifiedRoles = params.experiences
    .map((e) => e.role?.trim())
    .filter((r): r is string => Boolean(r));

  if (verifiedRoles.length === 0) {
    return params.titleFamily?.trim() || "Professional";
  }

  const targetTokens = new Set(
    `${params.targetRole || ""} ${(params.targetCompetencies || []).join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );

  let bestTitle = verifiedRoles[0];
  let bestScore = -1;

  for (const rawRole of verifiedRoles) {
    // Clean corporate team prefixes (e.g. "Mobility Team Backend Engineer" -> "Backend Engineer")
    const cleanRole = rawRole.replace(/^[A-Za-z0-9\s|]+\s+Team\s+/i, "").trim() || rawRole;
    const roleTokens = cleanRole.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);

    let score = 0;
    for (const token of roleTokens) {
      for (const targetToken of targetTokens) {
        if (
          token === targetToken ||
          (token.length >= 4 && targetToken.startsWith(token)) ||
          (targetToken.length >= 4 && token.startsWith(targetToken))
        ) {
          score += 10;
        }
      }
    }

    if (params.targetRole) {
      const targetLower = params.targetRole.toLowerCase();
      const roleLower = cleanRole.toLowerCase();
      if (roleLower === targetLower) {
        score += 50;
      } else if (roleLower.includes(targetLower) || targetLower.includes(roleLower)) {
        score += 25;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTitle = cleanRole;
    }
  }

  return bestTitle || verifiedRoles[0];
}

/**
 * Synthesizes a universal, 100% career-agnostic executive summary grounded in the
 * candidate's verified background and persona.
 * Dynamically selects the best verified title from the candidate's history that aligns
 * with the target role, completely barring unearned or fabricated titles.
 */
export function generateAgnosticExecutiveSummary(params: {
  roleTitle?: string | null;
  experiences: Array<{ role: string; company: string }>;
  skills: MasterProfileInput["skills"];
  targetCompetencies: string[];
  persona?: CandidatePersona | null;
  isCareerSwitcherOrEarlyTenure?: boolean;
}): string | null {
  const isEarly = params.isCareerSwitcherOrEarlyTenure ??
    ["Career Switcher", "Student / Intern", "Early Career / New Grad"].includes(params.persona?.seniorityTier || "");
  const focusTitle = selectBestVerifiedCandidateTitle({
    experiences: params.experiences,
    targetRole: params.roleTitle,
    targetCompetencies: params.targetCompetencies,
    titleFamily: params.persona?.titleFamily,
  });
  if (!focusTitle) return null;

  const matchSet = new Set((params.targetCompetencies || []).map((k) => k.toLowerCase().trim()).filter(Boolean));
  const allSkills = params.skills.flatMap((g) => g.items.map((i) => i.name));
  const matched = allSkills.filter((s) => matchSet.has(s.toLowerCase()));
  const topSkills = (matched.length >= 2 ? matched : allSkills).slice(0, 3);
  const skillClause = topSkills.length > 0 ? ` specializing in ${topSkills.join(", ")}` : "";

  return sanitizeTailoredSummary(
    isEarly
      ? `Disciplined ${focusTitle}${skillClause} with strong technical fundamentals, hands-on project delivery, and cross-functional execution rigor. Adept at translating organizational requirements into reliable, scalable outcomes while applying systematic problem-solving across collaborative teams.`
      : `Results-oriented ${focusTitle}${skillClause} with a proven track record of execution, cross-functional collaboration, and high-impact delivery. Adept at translating organizational requirements into robust, scalable outcomes while optimizing workflow efficiency and operational quality.`
  );
}

export async function synthesizeAgnosticExecutiveSummary(params: {
  roleTitle?: string | null;
  companyName?: string | null;
  experiences: Array<{ role: string; company: string }>;
  skills: MasterProfileInput["skills"];
  targetCompetencies: string[];
  persona?: CandidatePersona | null;
  isCareerSwitcherOrEarlyTenure?: boolean;
  options?: TailorOptions;
}): Promise<string | null> {
  const fallback = generateAgnosticExecutiveSummary(params);
  if (!fallback) return null;

  const focusTitle = selectBestVerifiedCandidateTitle({
    experiences: params.experiences,
    targetRole: params.roleTitle,
    targetCompetencies: params.targetCompetencies,
    titleFamily: params.persona?.titleFamily,
  });

  const prompt = JSON.stringify({
    verifiedTitle: focusTitle,
    targetRole: params.roleTitle ?? null,
    targetCompany: params.companyName ?? null,
    coreCompetencies: (params.targetCompetencies || []).slice(0, 8),
    baselineSummary: fallback,
  });

  try {
    const raw = await callLLMWithFallback({
      systemPrompt: `You are an expert executive resume writer. Synthesize a concise professional summary (2 sentences, 40 to 60 words).
Ground strictly in candidate's verified background and title. Align naturally with target role and company operational focus without inventing credentials.
Return ONLY valid JSON: { "summary": "..." }`,
      userPrompt: prompt,
      llmProvider: params.options?.llmProvider ?? "OPENROUTER",
      localOllamaUrl: params.options?.localOllamaUrl,
      ollamaModel: params.options?.ollamaModel,
      devModelOverride: params.options?.devModelOverride,
      allowCloudFallback: params.options?.allowCloudFallback,
      accountId: params.options?.accountId,
      accountRules: params.options?.accountRules,
      ollamaOptions: { temperature: 0.35 },
    });
    const parsed = typeof raw === "object" && raw !== null ? (raw as { summary?: string }).summary : String(raw || "");
    const cleaned = sanitizeTailoredSummary(parsed);
    if (cleaned && cleaned.length >= 50) return cleaned;
  } catch {
    // Fall back to baseline
  }
  return fallback;
}

export function scrubDraftPunctuation(text: string): string {
  return text
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, ",")
    .replace(/\u2011/g, "-")
    .replace(/;/g, ",")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeCoverLetterGreeting(body: string, candidateName: string): string {
  const name = candidateName.trim();
  if (!name) return body.trim();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let next = body.replace(new RegExp(`^(?:\\s*)(?:dear|hello|hi|hey)\\s+${escaped}\\b[,!:]?\\s*`, "i"), "Hi,\n\n");
  const first = name.split(/\s+/)[0];
  if (first && first.length > 1) {
    next = next.replace(new RegExp(`^(?:\\s*)(?:dear|hello|hi|hey)\\s+${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[,!:]?\\s*`, "i"), "Hi,\n\n");
  }
  const firstName = first || name;
  if (!/\b(best|regards|sincerely|thanks|thank you)\b/i.test(next.slice(-220))) {
    next = `${next.trim()}\n\nBest,\n${firstName}`;
  }
  return next.trim();
}

export function defaultCoverLetter(profile: MasterProfileInput, requirements: string[], companyName?: string | null): string {
  const skills = flattenSkillItems(profile.skills).slice(0, 6).join(", ");
  const company = companyName?.trim() || "your team";
  const firstName = profile.fullName.trim().split(/\s+/)[0] || profile.fullName;
  const background = profile.summary?.slice(0, 180) ?? (skills ? `My background includes ${skills}.` : "I am writing to share my background.");
  const reqStr = requirements.length ? ` Relevant areas include ${requirements.slice(0, 3).join(", ")}.` : "";
  return `Hi,\n\nI am ${profile.fullName}, writing about an opening at ${company}. ${background}${reqStr}\n\nHappy to share a resume or jump on a quick call.\n\nBest,\n${firstName}`;
}

export function fallbackStrategyRationale(companyName?: string | null, roleTitle?: string | null, inventMetrics?: boolean): StrategyRationale {
  const role = roleTitle?.trim() || "the target role";
  const company = companyName?.trim() || "the company";
  return {
    roleFitAnalysis: `Selected verified profile evidence that best maps to ${role} at ${company}, translating functional crossovers while staying within the candidate's documented scope.`,
    selectedSkillsReasoning: "Prioritized skills that appear in both the job requirements and the candidate's master skill inventory.",
    featuredExperiencesReasoning: inventMetrics === false
      ? "Featured roles highlighting core competencies and execution rigor. For unquantified achievements, recommend measuring turnaround times, accuracy rates, and stakeholder volumes."
      : "Featured roles with the strongest evidence of operational impact relevant to this posting while respecting the page budget.",
    featuredProjectsReasoning: "Included distinct implementation-heavy projects that reinforce practical execution and outcomes for the target role.",
  };
}
