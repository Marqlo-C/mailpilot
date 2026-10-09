import {
  isWorkExperienceCategory,
  type MasterProfileInput,
} from "@/lib/validations/profile";
import { skillGroupsFromUnknown } from "@/lib/skill-groups";

export const SENIORITY_TIERS = [
  "Early Career / New Grad",
  "Mid-Level Professional",
  "Senior / Lead Professional",
  "Career Switcher",
] as const;

export type SeniorityTier = (typeof SENIORITY_TIERS)[number];

export type CandidatePersona = {
  seniorityTier: SeniorityTier;
  timelineContext: string;
  toneGuidance: string;
};

/** Stored persona fields plus the title-family and tenure reasoning behind them. */
export type PersonaBreakdown = CandidatePersona & {
  titleFamily: string;
  rationale: string[];
};

/** Profile shape that may already carry cached persona columns from UserProfile. */
export type ProfileWithPersonaCache = MasterProfileInput & {
  accountId?: string | null;
  seniorityTier?: string | null;
  timelineContext?: string | null;
  toneGuidance?: string | null;
};

/** Minimal Prisma-like client used for lazy persona write-back. */
export type PersonaDbClient = {
  userProfile: {
    update: (args: {
      where: { accountId: string };
      data: {
        seniorityTier: string;
        timelineContext: string;
        toneGuidance: string;
      };
    }) => Promise<unknown>;
  };
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Rank and glue words stripped before comparing job titles. Not a profession list. */
const TITLE_RANK_TOKENS = new Set([
  "senior",
  "junior",
  "jr",
  "sr",
  "lead",
  "staff",
  "principal",
  "head",
  "chief",
  "assistant",
  "associate",
  "intern",
  "manager",
  "director",
  "vp",
  "vice",
  "president",
  "of",
  "and",
  "the",
  "for",
  "level",
  "team",
  "ii",
  "iii",
  "iv",
]);

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

/** Tenths precision for internal tier thresholds only — never inject into prose. */
function roundYears(years: number): number {
  return Math.round(years * 10) / 10;
}

/**
 * Human-facing tenure phrases for prompts / timelineContext / toneGuidance.
 * Never emits robotic decimals like "0.7 years" or "8.3 years".
 */
function formatHumanYears(years: number): string {
  if (!Number.isFinite(years) || years < 0.5) {
    return "less than a year";
  }
  const rounded = Math.round(years);
  if (rounded < 1) {
    return "less than a year";
  }
  const unit = rounded === 1 ? "year" : "years";
  const floor = Math.floor(years);
  const frac = Math.round((years - floor) * 100) / 100;

  if (frac >= 0.7 && frac < 0.95) {
    const ceil = Math.ceil(years);
    return `nearly ${ceil} ${ceil === 1 ? "year" : "years"}`;
  }
  if (frac > 0.15 && frac < 0.45 && floor >= 1) {
    return `over ${floor} ${floor === 1 ? "year" : "years"}`;
  }
  if (Math.abs(years - rounded) <= 0.15) {
    return `about ${rounded} ${unit}`;
  }
  return `around ${rounded} ${unit}`;
}

/** True when cached prose still contains literal decimal tenure readouts. */
function hasRoboticDecimalYears(text: string): boolean {
  return (
    /\d+\.\d+\s*(?:years?|y)\b/i.test(text) || /~\d+\.\d+y\b/i.test(text)
  );
}

type RoleSignal = {
  role: string;
  company: string;
  start: Date;
  end: Date;
  years: number;
};

/** Content tokens of a title, so "Senior Teacher" and "Teaching Assistant" can match. */
function roleStems(title: string): string[] {
  const stems = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !TITLE_RANK_TOKENS.has(token))
    .map((token) => token.slice(0, 6));
  return [...new Set(stems)];
}

function stemsOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return true;
  for (const a of left) {
    for (const b of right) {
      if (a === b) return true;
      const width = Math.min(a.length, b.length, 5);
      if (width >= 4 && a.slice(0, width) === b.slice(0, width)) return true;
    }
  }
  return false;
}

function normalizeProfile(raw: unknown): MasterProfileInput {
  const profile = (raw ?? {}) as Partial<MasterProfileInput>;
  return {
    fullName: profile.fullName?.trim() || "Candidate",
    email: profile.email?.trim() || "",
    phone: profile.phone ?? null,
    location: profile.location ?? null,
    summary: profile.summary ?? null,
    links: Array.isArray(profile.links) ? profile.links : [],
    skills: skillGroupsFromUnknown(profile.skills),
    experiences: Array.isArray(profile.experiences) ? profile.experiences : [],
    projects: Array.isArray(profile.projects) ? profile.projects : [],
    education: Array.isArray(profile.education) ? profile.education : [],
    certifications: Array.isArray(profile.certifications)
      ? profile.certifications
      : [],
    awards: Array.isArray(profile.awards) ? profile.awards : [],
    interests: Array.isArray(profile.interests) ? profile.interests : [],
  };
}

function collectRoles(profile: MasterProfileInput): RoleSignal[] {
  const now = new Date();
  const roles: RoleSignal[] = [];

  for (const exp of profile.experiences) {
    if (!isWorkExperienceCategory(exp.category)) continue;
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
function unionYears(roles: RoleSignal[]): number {
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
    if (ed.status === "IN_PROGRESS") continue;
    const grad = parseFlexibleDate(ed.graduationDate);
    if (!grad) continue;
    if (!latest || grad.getTime() > latest.getTime()) {
      latest = grad;
    }
  }
  return latest;
}

type RoleFamily = {
  stems: string[];
  roles: RoleSignal[];
};

/** Consecutive titles that share content words stay in one field. */
function groupRoleFamilies(roles: RoleSignal[]): RoleFamily[] {
  const families: RoleFamily[] = [];
  for (const role of roles) {
    const stems = roleStems(role.role);
    const current = families[families.length - 1];
    if (!current || !stemsOverlap(current.stems, stems)) {
      families.push({ stems: [...stems], roles: [role] });
      continue;
    }
    for (const stem of stems) {
      if (!current.stems.includes(stem)) current.stems.push(stem);
    }
    current.roles.push(role);
  }
  return families;
}

/**
 * Career switcher: the latest title family follows a different field.
 * Years in the earlier field must not inflate seniority in the current field.
 */
function detectCareerSwitcher(roles: RoleSignal[], grad: Date | null): {
  isSwitcher: boolean;
  inFieldYears: number;
  priorFieldYears: number;
} {
  if (roles.length === 0) {
    return { isSwitcher: false, inFieldYears: 0, priorFieldYears: 0 };
  }

  const families = groupRoleFamilies(roles);
  const current = families[families.length - 1]!;
  const priorRoles = families.slice(0, -1).flatMap((family) => family.roles);
  const inFieldYears = roundYears(unionYears(current.roles));
  const priorFieldYears = roundYears(unionYears(priorRoles));

  if (families.length < 2 || priorFieldYears <= 0) {
    return { isSwitcher: false, inFieldYears, priorFieldYears };
  }

  if (priorFieldYears >= 2 && inFieldYears <= 4) {
    return { isSwitcher: true, inFieldYears, priorFieldYears };
  }

  if (grad && priorFieldYears >= 1.5 && inFieldYears <= 3) {
    const yearsSinceGrad = yearsBetween(grad, new Date());
    if (yearsSinceGrad <= 4) {
      return { isSwitcher: true, inFieldYears, priorFieldYears };
    }
  }

  if (
    priorFieldYears >= 3 &&
    inFieldYears < priorFieldYears &&
    inFieldYears <= 4
  ) {
    return { isSwitcher: true, inFieldYears, priorFieldYears };
  }

  return { isSwitcher: false, inFieldYears, priorFieldYears };
}

function toneForTier(
  tier: SeniorityTier,
  inFieldYears: number,
  priorFieldYears: number
): string {
  const grounding =
    "Stay factually grounded in CANDIDATE_SKILLS / CANDIDATE_SUMMARY only. Never invent tenure, senior titles, leadership scope, or tool depth. Never posture as more senior than the persona allows.";

  switch (tier) {
    case "Early Career / New Grad":
      return `${grounding} Write as an early-career candidate: curious, clear, and concise. Emphasize availability and learning without sounding desperate. Do not claim senior scope of ownership or deep domain authority.`;
    case "Mid-Level Professional":
      return `${grounding} Write as a mid-level peer (${
        inFieldYears > 0 ? formatHumanYears(inFieldYears) : "a few years"
      } in the current field): confident, practical, logistics-first. Reference recent contributions and day-to-day responsibilities when useful. Do not inflate into staff/lead voice.`;
    case "Senior / Lead Professional":
      return `${grounding} Write as an experienced peer: terse, calm, and logistics-first with hiring managers. Do not oversell or restate the resume. Keep replies short and match their formality.`;
    case "Career Switcher":
      return `${grounding} Write as a career switcher with ${formatHumanYears(
        inFieldYears
      )} in the current field (not ${formatHumanYears(
        inFieldYears + priorFieldYears
      )} of calendar time as in-field seniority). Be honest about the change. Highlight transferable skills without inventing tenure in the new field. Stay humble about depth in the new field. Focus on motivation, learning, and next steps — never claim a higher seniority level than verified in-field experience supports.`;
  }
}

/**
 * Inspect experiences + education to derive seniority, timeline summary, tone,
 * the current title family, and the tenure rules that selected the tier.
 */
export function explainCandidatePersona(profile: unknown): PersonaBreakdown {
  const normalized = normalizeProfile(profile);
  const skipped = normalized.experiences.filter(
    (exp) => !isWorkExperienceCategory(exp.category)
  );
  const roles = collectRoles(normalized);
  const calendarYears = roundYears(unionYears(roles));
  const grad = latestGraduation(normalized);
  const yearsSinceGrad = grad
    ? roundYears(yearsBetween(grad, new Date()))
    : null;

  const families = groupRoleFamilies(roles);
  const currentFamily = families[families.length - 1];
  const titleFamily = currentFamily
    ? [...new Set(currentFamily.roles.map((role) => role.role))].join(", ")
    : "No professional title family yet";

  const switcher = detectCareerSwitcher(roles, grad);
  const relevantYears =
    switcher.priorFieldYears > 0 ? switcher.inFieldYears : calendarYears;

  let seniorityTier: SeniorityTier;
  let tierReason: string;

  if (switcher.isSwitcher) {
    seniorityTier = "Career Switcher";
    tierReason = `The latest title family follows a different field after ${formatHumanYears(
      switcher.priorFieldYears
    )} earlier, with ${formatHumanYears(
      switcher.inFieldYears
    )} in the current family, so earlier years stay out of current-field seniority.`;
  } else if (
    relevantYears < 2 ||
    (yearsSinceGrad !== null && yearsSinceGrad <= 1.5 && relevantYears < 3)
  ) {
    seniorityTier = "Early Career / New Grad";
    tierReason =
      yearsSinceGrad !== null && yearsSinceGrad <= 1.5 && relevantYears < 3
        ? `Graduation was ${formatHumanYears(yearsSinceGrad)} ago and in-field tenure is ${formatHumanYears(relevantYears)}, which stays in the early-career band.`
        : `In-field tenure is ${formatHumanYears(relevantYears)}, under the two-year mid-level threshold.`;
  } else if (relevantYears >= 6) {
    seniorityTier = "Senior / Lead Professional";
    tierReason = `In-field tenure is ${formatHumanYears(relevantYears)}, at or above the six-year senior threshold.`;
  } else {
    seniorityTier = "Mid-Level Professional";
    tierReason = `In-field tenure is ${formatHumanYears(relevantYears)}, between the two-year and six-year bands.`;
  }

  const latestRole = roles.length > 0 ? roles[roles.length - 1] : null;
  const firstRole = roles.length > 0 ? roles[0] : null;
  const timelineParts: string[] = [];

  if (switcher.isSwitcher) {
    timelineParts.push(
      `Career switcher: ${formatHumanYears(
        switcher.priorFieldYears
      )} of professional experience in an earlier field, then ${formatHumanYears(
        switcher.inFieldYears
      )} in the current field`
    );
    timelineParts.push(
      `Do NOT treat the combined ${formatHumanYears(
        calendarYears
      )} of calendar time as in-field seniority`
    );
  } else if (relevantYears > 0) {
    timelineParts.push(
      `${formatHumanYears(relevantYears)} of in-field professional experience`
    );
    if (calendarYears > relevantYears + 0.5) {
      timelineParts.push(
        `(${formatHumanYears(
          calendarYears
        )} calendar span including earlier roles in another field)`
      );
    }
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
        yearsSinceGrad !== null
          ? ` (${formatHumanYears(yearsSinceGrad)} ago)`
          : ""
      }`
    );
  }

  const rationale = [
    `${roles.length} professional ${roles.length === 1 ? "role" : "roles"} counted toward tenure. ${skipped.length} ${skipped.length === 1 ? "entry" : "entries"} under other headings ${skipped.length === 1 ? "was" : "were"} left out.`,
    `Current title family: ${titleFamily}. Consecutive titles stay in one family when their content words overlap.`,
    tierReason,
  ];

  return {
    seniorityTier,
    timelineContext: timelineParts.join(". ") + ".",
    toneGuidance: toneForTier(
      seniorityTier,
      switcher.inFieldYears || relevantYears,
      switcher.priorFieldYears
    ),
    titleFamily,
    rationale,
  };
}

/**
 * Inspect experiences + education to derive seniority, timeline summary, and tone guardrails.
 * Accepts a MasterProfileInput-shaped object (or loose profile payload).
 */
export function synthesizeCandidatePersona(profile: unknown): CandidatePersona {
  const explained = explainCandidatePersona(profile);
  return {
    seniorityTier: explained.seniorityTier,
    timelineContext: explained.timelineContext,
    toneGuidance: explained.toneGuidance,
  };
}

/**
 * Prefer DB-cached persona fields when present; otherwise synthesize from resume
 * data and persist them on UserProfile so the next draft skips recomputation.
 *
 * Cache hit requires both seniorityTier and toneGuidance (valid tier).
 * Missing/null fields trigger synthesize + optional prisma write-back.
 */
export async function getCachedOrSynthesizePersona(
  profile: ProfileWithPersonaCache,
  dbClient?: PersonaDbClient | null
): Promise<CandidatePersona> {
  const tier = profile.seniorityTier?.trim() ?? "";
  const tone = profile.toneGuidance?.trim() ?? "";
  const timeline = profile.timelineContext?.trim() ?? "";
  const cacheHit =
    Boolean(tier) &&
    Boolean(tone) &&
    SENIORITY_TIERS.includes(tier as SeniorityTier);

  if (cacheHit) {
    const staleDecimals =
      hasRoboticDecimalYears(tone) || hasRoboticDecimalYears(timeline);

    // Refresh when timeline is missing OR cached prose still has decimal tenure.
    if (!timeline || staleDecimals) {
      const synthesized = synthesizeCandidatePersona(profile);
      const filled: CandidatePersona = staleDecimals
        ? synthesized
        : {
            seniorityTier: tier as SeniorityTier,
            timelineContext: synthesized.timelineContext,
            toneGuidance: tone,
          };
      await persistPersonaCache(profile, filled, dbClient);
      return filled;
    }

    return {
      seniorityTier: tier as SeniorityTier,
      timelineContext: timeline,
      toneGuidance: tone,
    };
  }

  const persona = synthesizeCandidatePersona(profile);
  await persistPersonaCache(profile, persona, dbClient);
  return persona;
}

async function persistPersonaCache(
  profile: ProfileWithPersonaCache,
  persona: CandidatePersona,
  dbClient?: PersonaDbClient | null
): Promise<void> {
  const accountId = profile.accountId?.trim();
  if (!dbClient || !accountId) return;

  try {
    await dbClient.userProfile.update({
      where: { accountId },
      data: {
        seniorityTier: persona.seniorityTier,
        timelineContext: persona.timelineContext,
        toneGuidance: persona.toneGuidance,
      },
    });
  } catch (error) {
    console.warn(
      "[persona] Failed to persist synthesized persona cache",
      error
    );
  }
}
