/**
 * ============================================================================
 * MATCH SCORING EVALUATOR
 * 
 * Evaluates candidate fit against normalized job opportunities.
 * Handles MINIMAL_LEAD vs RICH_SPEC postings with deterministic fallback.
 * ============================================================================
 */

import type { ContextRichness, NormalizedJobOpportunity } from "@/lib/opportunities/context";
import type {
  MatchCandidateLens,
  MatchResult,
  MatchTier,
  SeniorityFit,
} from "./schema.ssot";

const SENIOR_ROLE_REGEX = /\b(lead|staff|principal|director|head|vp|vice\s+president|executive|chief)\b/i;
const JUNIOR_ROLE_REGEX = /\b(intern|junior|jr|entry|associate|trainee)\b/i;

function evaluateSeniorityFit(
  roleTitle: string,
  candidateTier: string | null
): SeniorityFit {
  const isSeniorJob = SENIOR_ROLE_REGEX.test(roleTitle);
  const isJuniorJob = JUNIOR_ROLE_REGEX.test(roleTitle);

  const lowerTier = (candidateTier ?? "").toLowerCase();
  const isCandidateSenior =
    lowerTier.includes("senior") ||
    lowerTier.includes("lead") ||
    lowerTier.includes("staff") ||
    lowerTier.includes("director") ||
    lowerTier.includes("executive");
  const isCandidateEarly =
    lowerTier.includes("early") ||
    lowerTier.includes("junior") ||
    lowerTier.includes("entry") ||
    lowerTier.includes("intern");

  if (isSeniorJob && isCandidateEarly) {
    return "REACH";
  }
  if (isJuniorJob && isCandidateSenior) {
    return "OVERQUALIFIED";
  }
  return "ALIGNED";
}

function computeMatchTier(score: number): MatchTier {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MID";
  return "LOW";
}

/**
 * Modular rationale engine that explains exact match percentage,
 * skill alignment, leveling fit, and gaps.
 */
export function composeMatchReason(params: {
  score: number;
  roleTitle: string;
  company: string;
  matchedSkills: string[];
  missingRequirements: string[];
  seniorityFit: SeniorityFit;
  richness: ContextRichness;
  candidateRoles: string[];
  hasTitleOverlap: boolean;
  salary?: string | null;
  seniorityTier?: string | null;
  timelineContext?: string | null;
  titleFamily?: string | null;
}): string {
  const {
    score,
    roleTitle,
    company,
    matchedSkills,
    missingRequirements,
    seniorityFit,
    richness,
    hasTitleOverlap,
    salary,
    seniorityTier,
    timelineContext,
    titleFamily,
  } = params;

  const sentences: string[] = [];
  const domainLabel =
    titleFamily ||
    (hasTitleOverlap ? roleTitle : params.candidateRoles[0] || roleTitle);

  // 1. Inbound Minimal Lead or Short Snippet (< 3 skills matched)
  if (richness === "MINIMAL_LEAD" || matchedSkills.length === 0) {
    if (hasTitleOverlap) {
      sentences.push(
        `Direct title alignment with your verified background in ${domainLabel} at ${company}.`
      );
    } else {
      sentences.push(`Opportunity identified for ${roleTitle} at ${company}.`);
    }

    if (seniorityFit === "REACH") {
      sentences.push(
        "Scope represents a career stretch requiring higher seniority or leadership expectations."
      );
    } else if (seniorityFit === "OVERQUALIFIED") {
      sentences.push(
        "Position requirements are below current professional leveling."
      );
    } else if (timelineContext) {
      sentences.push(
        `Leveling aligns with your verified trajectory (${timelineContext}).`
      );
    } else if (seniorityTier) {
      sentences.push(
        `Leveling aligns with your verified ${seniorityTier} trajectory.`
      );
    } else {
      sentences.push(
        "Leveling and scope align with current verified trajectory."
      );
    }

    if (salary) {
      sentences.push(`Compensated at ${salary}.`);
    }

    return sentences.join(" ");
  }

  // 2. Rich Spec: Primary Fit & Skill Overlap
  if (matchedSkills.length >= 3) {
    const topSkills = matchedSkills.slice(0, 3).join(", ");
    sentences.push(
      `Strong competency overlap at ${company} matching key profile skills: ${topSkills}.`
    );
  } else if (matchedSkills.length > 0) {
    sentences.push(
      `Partial skill match at ${company} on ${matchedSkills.join(", ")}.`
    );
  } else if (hasTitleOverlap) {
    sentences.push(
      `Title aligns with recent candidate roles for ${roleTitle} at ${company}.`
    );
  } else {
    sentences.push(
      `Limited direct overlap with current verified profile keywords.`
    );
  }

  // 3. Seniority & Leveling Assessment
  if (seniorityFit === "REACH") {
    sentences.push(
      "Scope represents a career stretch requiring higher seniority or leadership expectations."
    );
  } else if (seniorityFit === "OVERQUALIFIED") {
    sentences.push(
      "Position requirements are below current professional leveling."
    );
  } else if (timelineContext && score >= 75) {
    sentences.push(
      `Leveling and scope align with your verified trajectory (${timelineContext}).`
    );
  } else if (seniorityTier && score >= 75) {
    sentences.push(
      `Leveling and scope align with your verified ${seniorityTier} trajectory.`
    );
  } else if (score >= 75) {
    sentences.push(
      "Leveling and scope align with current verified trajectory."
    );
  }

  // 4. Gap Analysis
  if (missingRequirements.length > 0 && score < 75) {
    const keyGap = missingRequirements[0]?.slice(0, 70).replace(/[.:]$/, "");
    if (keyGap) {
      sentences.push(
        `Posting emphasizes competencies not highlighted in profile (${keyGap}).`
      );
    }
  }

  // 5. Compensation
  if (salary && score >= 70) {
    sentences.push(`Compensated at ${salary}.`);
  }

  return sentences.join(" ");
}

/**
 * Evaluates an opportunity against candidate facts.
 * Performs deterministic heuristic scoring (zero external token usage),
 * scaling appropriately between minimal leads and detailed job specs.
 */
export function evaluateOpportunityMatch(params: {
  opportunity: NormalizedJobOpportunity;
  candidate: MatchCandidateLens;
  mode?: "AI" | "HEURISTIC";
}): MatchResult {
  const { opportunity, candidate } = params;

  const seniorityFit = evaluateSeniorityFit(
    opportunity.roleTitle,
    candidate.seniorityTier
  );

  // 1. PATH A: Minimal Inbound Lead (Recruiter note, brief digest alert)
  if (opportunity.richness === "MINIMAL_LEAD") {
    const titleWords = opportunity.roleTitle
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);

    const hasTitleOverlap = candidate.recentRoles.some((role) =>
      titleWords.some((w) => role.toLowerCase().includes(w))
    );

    let score = hasTitleOverlap ? 85 : 80;
    if (seniorityFit === "REACH") score -= 15;
    if (seniorityFit === "OVERQUALIFIED") score -= 10;

    const tier = computeMatchTier(score);
    const reason = composeMatchReason({
      score,
      roleTitle: opportunity.roleTitle,
      company: opportunity.company,
      matchedSkills: [],
      missingRequirements: [],
      seniorityFit,
      richness: opportunity.richness,
      candidateRoles: candidate.recentRoles,
      hasTitleOverlap,
      salary: opportunity.salary,
      seniorityTier: candidate.seniorityTier,
      timelineContext: candidate.timelineContext,
      titleFamily: candidate.titleFamily,
    });

    return {
      score,
      tier,
      reason,
      matchedSkills: [],
      missingRequirements: [],
      seniorityFit,
    };
  }

  // 2. PATH B: Rich Job Specification
  const jobText = `${opportunity.roleTitle} ${opportunity.jobDescription}`.toLowerCase();

  const matchedSkills: string[] = [];
  const missingRequirements: string[] = [];

  for (const skill of candidate.skills) {
    const sLower = skill.toLowerCase();
    if (sLower.length >= 2 && jobText.includes(sLower)) {
      matchedSkills.push(skill);
    }
  }

  // Extract explicit requirements keywords from job text if present
  const reqMatch = opportunity.jobDescription.match(
    /(?:requirements|qualifications|skills|must have):?([\s\S]{1,600})/i
  );
  if (reqMatch?.[1]) {
    const lines = reqMatch[1]
      .split(/\n|•|-|;/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5 && l.length < 80);

    for (const line of lines.slice(0, 5)) {
      const lineLower = line.toLowerCase();
      const covered = candidate.skills.some((s) =>
        lineLower.includes(s.toLowerCase())
      );
      if (!covered) {
        missingRequirements.push(line);
      }
    }
  }

  // Base score on skill overlap ratio
  const candidateSkillCount = Math.max(candidate.skills.length, 1);
  const matchedCount = matchedSkills.length;

  let baseScore = 40;
  if (matchedCount >= 8) baseScore = 90;
  else if (matchedCount >= 5) baseScore = 80;
  else if (matchedCount >= 3) baseScore = 68;
  else if (matchedCount >= 1) baseScore = 55;

  // Title relevance bonus
  const titleWords = opportunity.roleTitle
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  const hasTitleOverlap = candidate.recentRoles.some((role) =>
    titleWords.some((w) => role.toLowerCase().includes(w))
  );
  if (hasTitleOverlap) baseScore += 5;

  // Seniority penalty / adjustment
  if (seniorityFit === "REACH") baseScore -= 18;
  if (seniorityFit === "OVERQUALIFIED") baseScore -= 10;

  const score = Math.max(10, Math.min(98, Math.round(baseScore)));
  const tier = computeMatchTier(score);

  const reason = composeMatchReason({
    score,
    roleTitle: opportunity.roleTitle,
    company: opportunity.company,
    matchedSkills,
    missingRequirements,
    seniorityFit,
    richness: opportunity.richness,
    candidateRoles: candidate.recentRoles,
    hasTitleOverlap,
    salary: opportunity.salary,
    seniorityTier: candidate.seniorityTier,
    timelineContext: candidate.timelineContext,
    titleFamily: candidate.titleFamily,
  });

  return {
    score,
    tier,
    reason,
    matchedSkills: matchedSkills.slice(0, 10),
    missingRequirements: missingRequirements.slice(0, 5),
    seniorityFit,
  };
}
