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

const SENIOR_ROLE_REGEX = /\b(senior|sr\.?|lead|staff|principal|director|head|vp|vice\s+president|executive|chief)\b/i;
const JUNIOR_ROLE_REGEX = /\b(intern|junior|jr|entry|associate|trainee)\b/i;

/** Universal Section Segmentation regexes */
const MANDATORY_SECTION_REGEX =
  /(?:(?:minimum|basic|required|mandatory)\s+(?:qualifications|requirements|skills|criteria)|(?:core|key)\s+(?:requirements|qualifications)|requirements|qualifications|must\s+haves?|what\s+you(?:'ll|\s+will)?\s+need):?([\s\S]*?)(?=(?:preferred|desired|bonus|nice\s+to\s+have|additional|benefits|what\s+we\s+offer|equal\s+opportunity|$))/i;

const PREFERRED_SECTION_REGEX =
  /(?:preferred|desired|bonus|nice\s+to\s+have|additional)\s+(?:qualifications|requirements|skills):?([\s\S]*?)(?=(?:benefits|what\s+we\s+offer|equal\s+opportunity|$))/i;

const GENERIC_REQUIREMENTS_REGEX =
  /(?:requirements|qualifications|skills|must\s+have|what\s+you\s+need):?([\s\S]{1,1200})/i;

/** Universal Depth & Tenure Detection regexes */
const TENURE_REGEX = /\b(\d+)\+?\s*(?:years?|yrs?)\b/gi;

const DEPTH_MODIFIERS_REGEX =
  /\b(proficient|expert|deep understanding|demonstrated experience|hands-on|proven track record|licensed|certified)\b/i;

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
    lowerTier.includes("intern") ||
    lowerTier.includes("career switcher") ||
    lowerTier.includes("new grad") ||
    lowerTier.includes("student");

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
 * Strips LLM-directed prompt instructions and internal candidate metadata
 * (e.g. "Do NOT treat...", role span dumps, graduation dates) from timelineContext,
 * formatting a clean, concise, human-readable alignment phrase for user-facing copy.
 */
export function formatUserFacingTrajectory(params: {
  timelineContext?: string | null;
  seniorityTier?: string | null;
  inFieldYears?: number | null;
}): string | null {
  const { timelineContext, seniorityTier, inFieldYears } = params;

  if (timelineContext && timelineContext.trim()) {
    // 1. Strip system prompt directives and internal persona guidance
    let cleaned = timelineContext
      .replace(/\bdo not\b[^.]*(\.|$)/gi, "")
      .replace(/\bin-field seniority reflects[^.]*(\.|$)/gi, "")
      .replace(/\broles span\b[^.]*(\.|$)/gi, "")
      .replace(/\bmost recent graduation\b[^.]*(\.|$)/gi, "")
      .replace(/\([^)]*calendar span[^)]*\)\.?/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    // Strip leading/trailing punctuation
    cleaned = cleaned.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");

    // 2. Career switcher pattern
    const switcherMatch = cleaned.match(
      /career switcher:?.*?then\s+([^.]*?)\s+in the current field/i
    );
    if (switcherMatch) {
      const tenure = switcherMatch[1].trim();
      return `career switcher background with ${tenure} in current field`;
    }

    if (/^career switcher\b/i.test(cleaned)) {
      if (inFieldYears !== null && inFieldYears !== undefined && inFieldYears > 0) {
        return `career switcher background with ${inFieldYears} yr${inFieldYears === 1 ? "" : "s"} in current field`;
      }
      return "career switcher background";
    }

    // 3. Student / intern pattern
    if (/^student\s*\/\s*intern:?\s*/i.test(cleaned)) {
      const practical = cleaned.replace(/^student\s*\/\s*intern:?\s*/i, "").trim();
      if (practical) {
        return practical;
      }
      return "student / intern practical experience";
    }

    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  if (inFieldYears !== null && inFieldYears !== undefined && inFieldYears > 0) {
    return `${inFieldYears} yr${inFieldYears === 1 ? "" : "s"} in-field tenure`;
  }

  return null;
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
  tenureFloor?: number | null;
  inFieldYears?: number | null;
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
    tenureFloor,
    inFieldYears,
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
      if (
        tenureFloor !== null &&
        tenureFloor !== undefined &&
        inFieldYears !== null &&
        inFieldYears !== undefined &&
        inFieldYears < tenureFloor
      ) {
        sentences.push(
          `Posting requires ${tenureFloor}+ years of experience, exceeding your verified in-field trajectory (${inFieldYears} yr${inFieldYears === 1 ? "" : "s"}).`
        );
      }
      sentences.push(
        "Scope represents a career stretch requiring higher seniority or leadership expectations."
      );
    } else if (seniorityFit === "OVERQUALIFIED") {
      sentences.push(
        "Position requirements are below current professional leveling."
      );
    } else {
      const trajectory = formatUserFacingTrajectory({
        timelineContext,
        seniorityTier,
        inFieldYears,
      });
      if (trajectory) {
        sentences.push(
          `Leveling aligns with your verified trajectory (${trajectory}).`
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
    if (
      tenureFloor !== null &&
      tenureFloor !== undefined &&
      inFieldYears !== null &&
      inFieldYears !== undefined &&
      inFieldYears < tenureFloor
    ) {
      sentences.push(
        `Posting requires ${tenureFloor}+ years of experience, exceeding your verified in-field trajectory (${inFieldYears} yr${inFieldYears === 1 ? "" : "s"}).`
      );
    }
    sentences.push(
      "Scope represents a career stretch requiring higher seniority or leadership expectations."
    );
  } else if (seniorityFit === "OVERQUALIFIED") {
    sentences.push(
      "Position requirements are below current professional leveling."
    );
  } else if (score >= 75) {
    const trajectory = formatUserFacingTrajectory({
      timelineContext,
      seniorityTier,
      inFieldYears,
    });
    if (trajectory) {
      sentences.push(
        `Leveling and scope align with your verified trajectory (${trajectory}).`
      );
    } else if (seniorityTier) {
      sentences.push(
        `Leveling and scope align with your verified ${seniorityTier} trajectory.`
      );
    } else {
      sentences.push(
        "Leveling and scope align with current verified trajectory."
      );
    }
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

  let seniorityFit = evaluateSeniorityFit(
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
  const jobDescription = opportunity.jobDescription || "";
  const jobText = `${opportunity.roleTitle} ${jobDescription}`.toLowerCase();

  // 2a. Universal Section Segmentation
  const mandatoryMatch = jobDescription.match(MANDATORY_SECTION_REGEX);
  const preferredMatch = jobDescription.match(PREFERRED_SECTION_REGEX);
  const genericReqMatch = !mandatoryMatch
    ? jobDescription.match(GENERIC_REQUIREMENTS_REGEX)
    : null;

  const mandatoryBlock = mandatoryMatch ? mandatoryMatch[1] : null;
  const preferredBlock = preferredMatch ? preferredMatch[1] : null;
  const activeReqBlock = mandatoryBlock || (genericReqMatch ? genericReqMatch[1] : null);
  const isExplicitMandatory = Boolean(mandatoryBlock);

  // 2b. Universal Depth & Tenure Floor Detection
  let mandatoryTenureFloor: number | null = null;
  const tenureSourceText = mandatoryBlock || activeReqBlock || jobDescription;
  if (tenureSourceText) {
    const tenureMatches = Array.from(tenureSourceText.matchAll(TENURE_REGEX));
    for (const m of tenureMatches) {
      const parsedYears = parseInt(m[1], 10);
      if (!isNaN(parsedYears) && parsedYears > 0 && parsedYears <= 25) {
        if (mandatoryTenureFloor === null || parsedYears > mandatoryTenureFloor) {
          mandatoryTenureFloor = parsedYears;
        }
      }
    }
  }

  // If candidate inFieldYears is below a parsed mandatory/required tenure floor, classify seniorityFit as REACH
  if (
    mandatoryTenureFloor !== null &&
    candidate.inFieldYears !== null &&
    candidate.inFieldYears !== undefined &&
    candidate.inFieldYears < mandatoryTenureFloor
  ) {
    seniorityFit = "REACH";
  }

  // 2c. Dynamic Skill Matching Across Sections
  const matchedSkills: string[] = [];
  const matchedMandatorySkills: string[] = [];
  const matchedPreferredSkills: string[] = [];
  const missingRequirements: string[] = [];
  let deepMissingCount = 0;

  const mandatoryLower = mandatoryBlock ? mandatoryBlock.toLowerCase() : "";
  const preferredLower = preferredBlock ? preferredBlock.toLowerCase() : "";

  for (const skill of candidate.skills) {
    const sLower = skill.toLowerCase();
    if (sLower.length >= 2) {
      if (jobText.includes(sLower)) {
        matchedSkills.push(skill);
      }
      if (mandatoryLower && mandatoryLower.includes(sLower)) {
        matchedMandatorySkills.push(skill);
      }
      if (preferredLower && preferredLower.includes(sLower)) {
        matchedPreferredSkills.push(skill);
      }
    }
  }

  // Extract unmet requirement lines from the active requirements block
  if (activeReqBlock) {
    const lines = activeReqBlock
      .split(/\n|;|\u2022/)
      .map((l) => l.replace(/^[\s•\-\*]+\s*/, "").trim())
      .filter((l) => l.length > 5 && l.length < 100);

    for (const line of lines.slice(0, 6)) {
      const lineLower = line.toLowerCase();

      // If the requirement is tenure-based and candidate's inFieldYears meets or exceeds it, requirement is met
      const tenureMatch = line.match(/\b(\d+)\+?\s*(?:years?|yrs?)\b/i);
      if (
        tenureMatch &&
        candidate.inFieldYears !== null &&
        candidate.inFieldYears !== undefined
      ) {
        const requiredYears = parseInt(tenureMatch[1], 10);
        if (candidate.inFieldYears >= requiredYears) {
          continue;
        }
      }

      // Filter out generic soft skills, boilerplate education, and company culture statements
      const isGenericBoilerplate =
        /\b(?:communication|written\s+and\s+verbal|team\s+player|interpersonal|passion(?:ate)?|fast[- ]paced|bachelor|degree|equal\s+opportunity|eagerness|self[- ]starter|attention\s+to\s+detail|collaborative|problem[- ]solving)\b/i.test(
          lineLower
        );

      const covered = candidate.skills.some((s) =>
        lineLower.includes(s.toLowerCase())
      );
      if (!covered && !isGenericBoilerplate) {
        missingRequirements.push(line);
        if (DEPTH_MODIFIERS_REGEX.test(line)) {
          deepMissingCount++;
        }
      }
    }
  }

  // 2d. Scoring Logic
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

  // Early-career / Junior alignment bonus: when junior/early candidate aligns with entry/junior role
  const isEarlyCandidate =
    candidate.seniorityTier?.toLowerCase().includes("early") ||
    candidate.seniorityTier?.toLowerCase().includes("junior") ||
    candidate.seniorityTier?.toLowerCase().includes("entry") ||
    candidate.seniorityTier?.toLowerCase().includes("intern") ||
    candidate.seniorityTier?.toLowerCase().includes("career switcher") ||
    candidate.seniorityTier?.toLowerCase().includes("new grad") ||
    candidate.seniorityTier?.toLowerCase().includes("student");

  const isJuniorRole = JUNIOR_ROLE_REGEX.test(opportunity.roleTitle);
  if (isJuniorRole && isEarlyCandidate) {
    baseScore += 8;
  }

  // Mandatory / Minimum priority & penalties
  if (isExplicitMandatory) {
    // High priority for skills matched in mandatory section
    if (matchedMandatorySkills.length >= 2) {
      baseScore += 6;
    } else if (matchedMandatorySkills.length >= 1) {
      baseScore += 3;
    }

    // Missing candidate skills in mandatory section apply a larger penalty
    baseScore -= missingRequirements.length * 3;
    if (deepMissingCount > 0) {
      baseScore -= deepMissingCount * 2;
    }
  }

  // Preferred / Desired section additive bonus
  if (matchedPreferredSkills.length > 0) {
    const preferredBonus = Math.min(10, matchedPreferredSkills.length * 3);
    baseScore += preferredBonus;
  }

  // Seniority penalty / adjustment
  if (seniorityFit === "REACH") {
    const tenureGap =
      mandatoryTenureFloor !== null &&
      candidate.inFieldYears !== null &&
      candidate.inFieldYears !== undefined
        ? Math.max(0, mandatoryTenureFloor - candidate.inFieldYears)
        : 0;
    baseScore -= tenureGap >= 3 ? 28 : 18;
  }
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
    tenureFloor: mandatoryTenureFloor,
    inFieldYears: candidate.inFieldYears,
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
