import type { MasterProfileInput } from "@/lib/validations/profile";

export const SENIORITY_TIERS = [
  "Early Career / New Grad",
  "Mid-Level Professional",
  "Senior Engineer / Tech Lead",
  "Career Switcher",
] as const;

export type SeniorityTier = (typeof SENIORITY_TIERS)[number];

export type CandidatePersona = {
  seniorityTier: SeniorityTier;
  timelineContext: string;
  toneGuidance: string;
};

/** Profile shape that may already carry cached persona columns from UserProfile. */
export type ProfileWithPersonaCache = MasterProfileInput & {
  seniorityTier?: string | null;
  timelineContext?: string | null;
  toneGuidance?: string | null;
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Parse flexible resume dates: "2021-06", "Jun 2021", "2021", "Present", etc.
 */
function parseFlexibleDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (/^(present|current|now|ongoing)$/i.test(value)) {
    return new Date();
  }

  const isoMonth = value.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (isoMonth) {
    const year = Number(isoMonth[1]);
    const month = Number(isoMonth[2]) - 1;
    const day = isoMonth[3] ? Number(isoMonth[3]) : 1;
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const yearOnly = value.match(/^(\d{4})$/);
  if (yearOnly) {
    return new Date(Number(yearOnly[1]), 0, 1);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function yearsBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / MS_PER_YEAR);
}

function roundYears(years: number): number {
  return Math.round(years * 10) / 10;
}

type RoleSignal = {
  role: string;
  company: string;
  start: Date;
  end: Date;
  years: number;
};

function collectRoles(profile: MasterProfileInput): RoleSignal[] {
  const now = new Date();
  const roles: RoleSignal[] = [];

  for (const exp of profile.experiences) {
    const start = parseFlexibleDate(exp.startDate);
    if (!start) continue;
    const end = parseFlexibleDate(exp.endDate) ?? now;
    const years = yearsBetween(start, end);
    if (years <= 0) continue;
    roles.push({
      role: exp.role,
      company: exp.company,
      start,
      end,
      years,
    });
  }

  return roles.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Approximate total years with light overlap collapse (union of intervals). */
function totalYearsExperience(roles: RoleSignal[]): number {
  if (roles.length === 0) return 0;
  const sorted = [...roles].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  let cursorStart = sorted[0]!.start.getTime();
  let cursorEnd = sorted[0]!.end.getTime();
  let totalMs = 0;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.start.getTime() <= cursorEnd) {
      cursorEnd = Math.max(cursorEnd, next.end.getTime());
    } else {
      totalMs += cursorEnd - cursorStart;
      cursorStart = next.start.getTime();
      cursorEnd = next.end.getTime();
    }
  }
  totalMs += cursorEnd - cursorStart;
  return totalMs / MS_PER_YEAR;
}

function latestGraduation(profile: MasterProfileInput): Date | null {
  let latest: Date | null = null;
  for (const ed of profile.education) {
    const grad = parseFlexibleDate(ed.graduationDate);
    if (!grad) continue;
    if (!latest || grad.getTime() > latest.getTime()) {
      latest = grad;
    }
  }
  return latest;
}

function looksLikeCareerSwitcher(
  roles: RoleSignal[],
  grad: Date | null,
  totalYears: number
): boolean {
  if (roles.length < 2) return false;

  const recent = roles[roles.length - 1]!;
  const earlier = roles.slice(0, -1);
  const recentYears = yearsBetween(recent.start, recent.end);
  // Short tenure in current track after longer prior career
  const priorYears = totalYears - recentYears;
  if (priorYears < 2 || recentYears > 3) return false;

  const priorText = earlier.map((r) => r.role.toLowerCase()).join(" ");
  const recentText = recent.role.toLowerCase();
  const techRecent =
    /\b(engineer|developer|software|fullstack|full-stack|backend|frontend|sre|devops|data)\b/i.test(
      recentText
    );
  const techPrior =
    /\b(engineer|developer|software|fullstack|full-stack|backend|frontend|sre|devops|data)\b/i.test(
      priorText
    );

  // Graduated recently into a technical role after non-tech history
  if (grad) {
    const yearsSinceGrad = yearsBetween(grad, new Date());
    if (yearsSinceGrad <= 3 && techRecent && !techPrior) return true;
  }

  return techRecent && !techPrior && priorYears >= 2;
}

function toneForTier(tier: SeniorityTier): string {
  switch (tier) {
    case "Early Career / New Grad":
      return "Write as an early-career candidate: curious, clear, and concise. Emphasize availability and eagerness to learn without sounding desperate. Do not claim senior ownership, leadership scope, or deep domain authority you have not earned.";
    case "Mid-Level Professional":
      return "Write as a mid-level peer: confident, practical, and grounded. Reference recent shipping work casually when useful. Prefer logistics and next steps over resume salesmanship.";
    case "Senior Engineer / Tech Lead":
      return "Write as a senior peer speaking to a hiring manager or recruiter: terse, calm, and logistics-first. Do not oversell or restate your resume. Match their level of formality and keep replies short.";
    case "Career Switcher":
      return "Write as a career switcher: honest about your path, highlight transferable strengths without inventing domain tenure. Stay humble about new-stack depth. Focus on motivation, learning velocity, and concrete next steps.";
  }
}

/**
 * Inspect experiences + education to derive seniority, timeline summary, and tone guardrails.
 */
export function synthesizeCandidatePersona(
  profile: MasterProfileInput
): CandidatePersona {
  const roles = collectRoles(profile);
  const totalYears = roundYears(totalYearsExperience(roles));
  const grad = latestGraduation(profile);
  const yearsSinceGrad = grad
    ? roundYears(yearsBetween(grad, new Date()))
    : null;

  let seniorityTier: SeniorityTier;

  if (looksLikeCareerSwitcher(roles, grad, totalYears)) {
    seniorityTier = "Career Switcher";
  } else if (
    totalYears < 2 ||
    (yearsSinceGrad !== null && yearsSinceGrad <= 1.5 && totalYears < 3)
  ) {
    seniorityTier = "Early Career / New Grad";
  } else if (totalYears >= 6) {
    seniorityTier = "Senior Engineer / Tech Lead";
  } else {
    seniorityTier = "Mid-Level Professional";
  }

  const latestRole = roles.length > 0 ? roles[roles.length - 1] : null;
  const firstRole = roles.length > 0 ? roles[0] : null;
  const timelineParts: string[] = [];

  if (totalYears > 0) {
    timelineParts.push(
      `~${totalYears} year${totalYears === 1 ? "" : "s"} of professional experience`
    );
  } else {
    timelineParts.push("Limited formal work history on file");
  }

  if (firstRole && latestRole) {
    const startYear = firstRole.start.getFullYear();
    const endLabel =
      latestRole.end.getTime() > Date.now() - 45 * 24 * 60 * 60 * 1000
        ? "Present"
        : String(latestRole.end.getFullYear());
    timelineParts.push(
      `Roles span ${startYear}–${endLabel} (latest: ${latestRole.role} at ${latestRole.company})`
    );
  }

  if (grad) {
    timelineParts.push(
      `Most recent graduation around ${grad.getFullYear()}${
        yearsSinceGrad !== null ? ` (~${yearsSinceGrad}y ago)` : ""
      }`
    );
  }

  if (seniorityTier === "Career Switcher" && latestRole) {
    timelineParts.push(
      `Signals a pivot into ${latestRole.role} after earlier non-matching roles`
    );
  }

  return {
    seniorityTier,
    timelineContext: timelineParts.join(". ") + ".",
    toneGuidance: toneForTier(seniorityTier),
  };
}

/**
 * Prefer DB-cached persona fields when present; otherwise synthesize from resume data.
 */
export function getCachedOrSynthesizePersona(
  profile: ProfileWithPersonaCache
): CandidatePersona {
  const tier = profile.seniorityTier?.trim();
  const tone = profile.toneGuidance?.trim();
  const timeline = profile.timelineContext?.trim();

  if (
    tier &&
    tone &&
    SENIORITY_TIERS.includes(tier as SeniorityTier)
  ) {
    return {
      seniorityTier: tier as SeniorityTier,
      timelineContext:
        timeline ||
        synthesizeCandidatePersona(profile).timelineContext,
      toneGuidance: tone,
    };
  }

  return synthesizeCandidatePersona(profile);
}
