import type {
  MasterProfileInput,
  WorkExperienceInput,
} from "@/lib/validations/profile";
import type { CandidatePersona } from "@/lib/persona/schema.ssot";
import type { AccountRules } from "@/lib/validations/rules";
import {
  CAREER_SWITCHER_SECTION_ORDER,
  DEFAULT_SECTION_ORDER,
  RESUME_SECTION_KEYS,
  type ResumeExportConfig,
  type ResumeInclusionMode,
  type ResumeOrderingMode,
  type ResumePageBudget,
  type ResumeSectionKey,
} from "./schema.ssot";
import { normalizeProjectName } from "@/lib/utils/format";

/**
 * ============================================================================
 * RESUME DRAFTING ADAPTER LENS
 * 
 * Adapts MasterProfileInput, CandidatePersona, and account rules / draft overrides
 * into a normalized, strictly-ordered resume drafting lens.
 * ============================================================================
 */

export interface ResolvedResumeDraftLens {
  profile: MasterProfileInput;
  sectionOrder: ResumeSectionKey[];
  disabledSections: ResumeSectionKey[];
  orderingMode: ResumeOrderingMode;
  inclusionMode: ResumeInclusionMode;
  inventMetrics: boolean;
  pageBudget: ResumePageBudget;
  includeSummary: boolean;
  isCareerSwitcherOrEarlyTenure: boolean;
}

/**
 * Parses date string or relative token into numerical year/month for deterministic sorting.
 */
function parseDateScore(val: string | null | undefined): {
  isCurrent: boolean;
  score: number;
} {
  if (!val || !val.trim()) {
    return { isCurrent: false, score: 0 };
  }
  const clean = val.trim().toLowerCase();
  if (
    clean === "present" ||
    clean === "current" ||
    clean === "now" ||
    clean === "ongoing"
  ) {
    return { isCurrent: true, score: 999999 };
  }

  // Look for 4-digit year
  const yearMatch = clean.match(/\b(19\d\d|20\d\d)\b/);
  if (!yearMatch) {
    return { isCurrent: false, score: 0 };
  }
  const year = parseInt(yearMatch[1], 10);

  // Look for month (name or number)
  let month = 1;
  const monthMatch = clean.match(
    /\b(0?[1-9]|1[0-2])\b|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?/
  );
  if (monthMatch) {
    const mStr = monthMatch[0];
    if (/^\d+$/.test(mStr)) {
      month = parseInt(mStr, 10);
    } else {
      const monthNames = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ];
      const idx = monthNames.findIndex((name) => mStr.startsWith(name));
      if (idx >= 0) month = idx + 1;
    }
  }

  return { isCurrent: false, score: year * 100 + month };
}

/**
 * Strict reverse-chronological sorting for work experiences by date.
 * Current/ongoing positions appear first, sorted by startDate descending.
 * Concluded positions are sorted by endDate descending, then startDate descending.
 */
export function sortExperiencesReverseChronological(
  experiences: WorkExperienceInput[]
): WorkExperienceInput[] {
  return [...experiences].sort((a, b) => {
    const endA = parseDateScore(a.endDate);
    const endB = parseDateScore(b.endDate);

    if (endA.isCurrent && !endB.isCurrent) return -1;
    if (!endA.isCurrent && endB.isCurrent) return 1;

    if (endA.isCurrent && endB.isCurrent) {
      const startA = parseDateScore(a.startDate);
      const startB = parseDateScore(b.startDate);
      return startB.score - startA.score;
    }

    if (endA.score !== endB.score) {
      return endB.score - endA.score;
    }

    const startA = parseDateScore(a.startDate);
    const startB = parseDateScore(b.startDate);
    return startB.score - startA.score;
  });
}

/**
 * Strict reverse-chronological sorting for education by date.
 */
export function sortEducationReverseChronological(
  education: MasterProfileInput["education"]
): MasterProfileInput["education"] {
  return [...education].sort((a, b) => {
    const isEnrolledA =
      a.status === "IN_PROGRESS" ||
      !a.graduationDate ||
      /present|current|ongoing/i.test(a.graduationDate);
    const isEnrolledB =
      b.status === "IN_PROGRESS" ||
      !b.graduationDate ||
      /present|current|ongoing/i.test(b.graduationDate);

    if (isEnrolledA && !isEnrolledB) return -1;
    if (!isEnrolledA && isEnrolledB) return 1;

    const dateA = parseDateScore(a.graduationDate ?? a.startDate);
    const dateB = parseDateScore(b.graduationDate ?? b.startDate);

    return dateB.score - dateA.score;
  });
}

/**
 * Detects whether a candidate profile or persona represents a career switcher
 * or early in-field tenure candidate (< 2 years).
 */
export function isCareerSwitcherOrEarlyTenure(
  persona?: CandidatePersona | null,
  profile?: MasterProfileInput | null
): boolean {
  if (persona) {
    if (
      persona.seniorityTier === "Career Switcher" ||
      persona.seniorityTier === "Student / Intern" ||
      persona.seniorityTier === "Early Career / New Grad"
    ) {
      return true;
    }

    if (typeof persona.inFieldYears === "number" && persona.inFieldYears < 2) {
      return true;
    }

    if (
      /\bcareer\s+switch(?:er)?\b/i.test(persona.timelineContext || "") ||
      /\bearlier\s+field\b/i.test(persona.timelineContext || "")
    ) {
      return true;
    }
  }

  // Also check persona cache properties on profile if present
  const profileWithPersona = profile as (MasterProfileInput & {
    seniorityTier?: string | null;
    timelineContext?: string | null;
  }) | null | undefined;

  if (profileWithPersona) {
    if (
      profileWithPersona.seniorityTier === "Career Switcher" ||
      profileWithPersona.seniorityTier === "Student / Intern" ||
      profileWithPersona.seniorityTier === "Early Career / New Grad"
    ) {
      return true;
    }
    if (
      /\bcareer\s+switch(?:er)?\b/i.test(profileWithPersona.timelineContext || "") ||
      /\bearlier\s+field\b/i.test(profileWithPersona.timelineContext || "")
    ) {
      return true;
    }
  }

  // Fallback heuristic based on profile experiences if persona is unavailable
  if (profile && profile.experiences.length > 0) {
    const hasProjects = profile.projects && profile.projects.length > 0;
    if (profile.experiences.length <= 1 && hasProjects) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves the canonical section order taking into account candidate leveling/trajectory
 * and manual override preferences.
 */
export function resolveSectionOrder(input: {
  orderingMode: ResumeOrderingMode;
  isSwitcherOrEarlyTenure: boolean;
  hasProjects: boolean;
  preferredOrder?: string[];
  disabledSections?: string[];
}): ResumeSectionKey[] {
  const disabledSet = new Set((input.disabledSections ?? []).map((s) => s.toLowerCase()));

  let baseOrder: ResumeSectionKey[];

  if (input.orderingMode === "AI_OPTIMAL") {
    // In AI_OPTIMAL mode: for career switchers or early-tenure profiles (< 2 yrs),
    // prioritize demonstrated target-discipline sections (like Projects / Practical Portfolio)
    // above legacy out-of-field experience.
    if (input.isSwitcherOrEarlyTenure && input.hasProjects) {
      baseOrder = [...CAREER_SWITCHER_SECTION_ORDER];
    } else {
      baseOrder = [...DEFAULT_SECTION_ORDER];
    }
  } else {
    // MANUAL mode: consume preferred order if specified
    if (input.preferredOrder && input.preferredOrder.length > 0) {
      const validKeys: ResumeSectionKey[] = [];
      for (const item of input.preferredOrder) {
        const lower = item.toLowerCase() as ResumeSectionKey;
        if (RESUME_SECTION_KEYS.includes(lower) && !validKeys.includes(lower)) {
          validKeys.push(lower);
        }
      }
      baseOrder = validKeys.length > 0 ? validKeys : [...DEFAULT_SECTION_ORDER];
    } else {
      baseOrder = [...DEFAULT_SECTION_ORDER];
    }
  }

  // Always append any missing canonical keys at the end (e.g. awards, interests) if not disabled
  for (const key of RESUME_SECTION_KEYS) {
    if (!baseOrder.includes(key)) {
      baseOrder.push(key);
    }
  }

  return baseOrder.filter((key) => !disabledSet.has(key));
}

/**
 * Dedicated adapter lens translating MasterProfileInput, CandidatePersona,
 * and account rules / draft overrides into a normalized drafting lens.
 */
export function resolveResumeDraftLens(input: {
  profile: MasterProfileInput;
  persona?: CandidatePersona | null;
  rules?: Partial<AccountRules> | null;
  draftOverrides?: Partial<ResumeExportConfig> | null;
}): ResolvedResumeDraftLens {
  const { profile, persona, rules, draftOverrides } = input;
  const prefs = rules?.resumePreferences;

  // Resolve ordering and inclusion settings with draft-override priority
  const orderingMode: ResumeOrderingMode =
    draftOverrides?.orderingMode ?? prefs?.orderingMode ?? "AI_OPTIMAL";

  const inclusionMode: ResumeInclusionMode =
    draftOverrides?.inclusionMode ?? prefs?.inclusionMode ?? "AI_OPTIMAL";

  const inventMetrics: boolean =
    draftOverrides?.inventMetrics ?? prefs?.inventMetrics ?? false;

  const pageBudget: ResumePageBudget =
    draftOverrides?.pageBudget ?? prefs?.maxPages ?? "auto";

  const includeSummary: boolean =
    draftOverrides?.includeSummary ?? prefs?.includeSummary ?? false;

  const disabledRaw = draftOverrides?.disabledSections ?? prefs?.disabledSections ?? [];
  const disabledSections = disabledRaw
    .map((s) => s.toLowerCase())
    .filter((s): s is ResumeSectionKey =>
      RESUME_SECTION_KEYS.includes(s as ResumeSectionKey)
    );

  const switcherOrEarly = isCareerSwitcherOrEarlyTenure(persona, profile);
  const hasProjects = Boolean(profile.projects && profile.projects.length > 0);

  const preferredOrder = draftOverrides?.sectionOrder ?? prefs?.sectionOrder;

  const sectionOrder = resolveSectionOrder({
    orderingMode,
    isSwitcherOrEarlyTenure: switcherOrEarly,
    hasProjects,
    preferredOrder,
    disabledSections,
  });

  // Apply strict reverse-chronological ordering to experiences and education, and normalize project names
  const normalizedProfile: MasterProfileInput = {
    ...profile,
    projects: profile.projects.map((p) => ({
      ...p,
      name: normalizeProjectName(p.name),
    })),
    experiences: sortExperiencesReverseChronological(profile.experiences),
    education: sortEducationReverseChronological(profile.education),
  };

  return {
    profile: normalizedProfile,
    sectionOrder,
    disabledSections,
    orderingMode,
    inclusionMode,
    inventMetrics,
    pageBudget,
    includeSummary,
    isCareerSwitcherOrEarlyTenure: switcherOrEarly,
  };
}
