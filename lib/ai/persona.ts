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

const TECH_ROLE_RE =
  /\b(software|engineer|engineering|developer|dev\b|fullstack|full[\s-]?stack|backend|front[\s-]?end|sre|devops|platform|infra(?:structure)?|data\s*engineer|ml\s*engineer|machine\s*learning|swe|programmer|coding|web\s*dev|mobile\s*(?:eng|dev)|ios|android|cloud|security\s*engineer|qa\s*engineer|test\s*engineer)\b/i;

const NON_TECH_ROLE_RE =
  /\b(teacher|teaching|educator|retail|cashier|barista|server|waiter|sales\s*assoc|customer\s*service|administrative|admin\s*assist|receptionist|warehouse|driver|nurse|nursing|paralegal|accountant|bookkeep|marketing\s*coord|real\s*estate|hospitality|chef|cook|construction|laborer|security\s*guard)\b/i;

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
  isTech: boolean;
};

function isTechRole(role: string): boolean {
  if (TECH_ROLE_RE.test(role)) return true;
  if (NON_TECH_ROLE_RE.test(role)) return false;
  return false;
}

function normalizeProfile(raw: unknown): MasterProfileInput {
  const profile = (raw ?? {}) as Partial<MasterProfileInput>;
  return {
    fullName: profile.fullName?.trim() || "Candidate",
    email: profile.email?.trim() || "candidate@example.com",
    phone: profile.phone ?? null,
    location: profile.location ?? null,
    summary: profile.summary ?? null,
    links: Array.isArray(profile.links) ? profile.links : [],
    skills: profile.skills ?? {
      languages: [],
      frameworks: [],
      tools: [],
      concepts: [],
    },
    experiences: Array.isArray(profile.experiences) ? profile.experiences : [],
    projects: Array.isArray(profile.projects) ? profile.projects : [],
    education: Array.isArray(profile.education) ? profile.education : [],
  };
}

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
      isTech: isTechRole(exp.role),
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
    const grad = parseFlexibleDate(ed.graduationDate);
    if (!grad) continue;
    if (!latest || grad.getTime() > latest.getTime()) {
      latest = grad;
    }
  }
  return latest;
}

/**
 * Career switcher: recent tech titles after a meaningful stretch of non-tech work.
 * Calendar years in non-tech MUST NOT inflate engineering seniority.
 */
function detectCareerSwitcher(roles: RoleSignal[], grad: Date | null): {
  isSwitcher: boolean;
  techYears: number;
  priorNonTechYears: number;
} {
  const techRoles = roles.filter((r) => r.isTech);
  const nonTechRoles = roles.filter((r) => !r.isTech);
  const techYears = roundYears(unionYears(techRoles));
  const priorNonTechYears = roundYears(unionYears(nonTechRoles));

  if (techRoles.length === 0) {
    return { isSwitcher: false, techYears: 0, priorNonTechYears };
  }

  const firstTech = techRoles[0]!;
  const nonTechBeforeTech = nonTechRoles.filter(
    (r) => r.start.getTime() < firstTech.start.getTime()
  );
  const priorBeforeTechYears = roundYears(unionYears(nonTechBeforeTech));

  // Classic pivot: 2+ years non-tech before first tech role, and tech tenure still short
  if (priorBeforeTechYears >= 2 && techYears <= 4) {
    return {
      isSwitcher: true,
      techYears,
      priorNonTechYears: priorBeforeTechYears,
    };
  }

  // Recent CS/bootcamp-style grad into tech after earlier non-tech work
  if (grad && priorBeforeTechYears >= 1.5 && techYears <= 3) {
    const yearsSinceGrad = yearsBetween(grad, new Date());
    if (yearsSinceGrad <= 4) {
      return {
        isSwitcher: true,
        techYears,
        priorNonTechYears: priorBeforeTechYears,
      };
    }
  }

  // Latest roles are tech but majority of calendar career was clearly non-tech
  const latest = roles[roles.length - 1]!;
  if (
    latest.isTech &&
    priorNonTechYears >= 3 &&
    techYears < priorNonTechYears &&
    techYears <= 4
  ) {
    return {
      isSwitcher: true,
      techYears,
      priorNonTechYears,
    };
  }

  return { isSwitcher: false, techYears, priorNonTechYears };
}

function toneForTier(
  tier: SeniorityTier,
  techYears: number,
  priorNonTechYears: number
): string {
  const grounding =
    "Stay factually grounded in CANDIDATE_SKILLS / CANDIDATE_SUMMARY only. Never invent tenure, senior titles, leadership scope, or tool depth. Never posture as more senior than the persona allows.";

  switch (tier) {
    case "Early Career / New Grad":
      return `${grounding} Write as an early-career candidate: curious, clear, and concise. Emphasize availability and learning without sounding desperate. Do not claim senior ownership, architecture leadership, or deep domain authority.`;
    case "Mid-Level Professional":
      return `${grounding} Write as a mid-level peer (~${techYears || "a few"} years in-track): confident, practical, logistics-first. Reference recent shipping work casually when useful. Do not inflate into staff/lead voice.`;
    case "Senior Engineer / Tech Lead":
      return `${grounding} Write as a senior peer: terse, calm, and logistics-first with hiring managers/recruiters. Do not oversell or restate the resume. Keep replies short and match their formality.`;
    case "Career Switcher":
      return `${grounding} Write as a career switcher with ~${techYears} year${techYears === 1 ? "" : "s"} in the technical track (not ${roundYears(techYears + priorNonTechYears)} total calendar years as engineering seniority). Be honest about the pivot. Highlight transferable strengths without inventing domain tenure. Stay humble about new-stack depth. Focus on motivation, learning velocity, and next steps — never fake senior alignment to a Staff/Principal/Lead role.`;
  }
}

/**
 * Inspect experiences + education to derive seniority, timeline summary, and tone guardrails.
 * Accepts a MasterProfileInput-shaped object (or loose profile payload).
 */
export function synthesizeCandidatePersona(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any
): CandidatePersona {
  const normalized = normalizeProfile(profile);
  const roles = collectRoles(normalized);
  const calendarYears = roundYears(unionYears(roles));
  const grad = latestGraduation(normalized);
  const yearsSinceGrad = grad
    ? roundYears(yearsBetween(grad, new Date()))
    : null;

  const switcher = detectCareerSwitcher(roles, grad);
  // Relevant tenure for Mid/Senior decisions = tech-track years when available
  const relevantYears =
    switcher.techYears > 0
      ? switcher.techYears
      : roles.some((r) => r.isTech)
        ? roundYears(unionYears(roles.filter((r) => r.isTech)))
        : calendarYears;

  let seniorityTier: SeniorityTier;

  if (switcher.isSwitcher) {
    // Never promote switchers to Senior based on prior non-tech calendar years
    seniorityTier = "Career Switcher";
  } else if (
    relevantYears < 2 ||
    (yearsSinceGrad !== null && yearsSinceGrad <= 1.5 && relevantYears < 3)
  ) {
    seniorityTier = "Early Career / New Grad";
  } else if (relevantYears >= 6) {
    seniorityTier = "Senior Engineer / Tech Lead";
  } else {
    seniorityTier = "Mid-Level Professional";
  }

  const latestRole = roles.length > 0 ? roles[roles.length - 1] : null;
  const firstRole = roles.length > 0 ? roles[0] : null;
  const timelineParts: string[] = [];

  if (switcher.isSwitcher) {
    timelineParts.push(
      `Career switcher: ~${switcher.priorNonTechYears}y prior non-tech experience, then ~${switcher.techYears}y in the technical track`
    );
    timelineParts.push(
      `Do NOT treat the combined ~${calendarYears} calendar years as engineering seniority`
    );
  } else if (relevantYears > 0) {
    timelineParts.push(
      `~${relevantYears} year${relevantYears === 1 ? "" : "s"} of in-track professional experience`
    );
    if (calendarYears > relevantYears + 0.5) {
      timelineParts.push(
        `(~${calendarYears}y calendar span including non-matching roles)`
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
        yearsSinceGrad !== null ? ` (~${yearsSinceGrad}y ago)` : ""
      }`
    );
  }

  return {
    seniorityTier,
    timelineContext: timelineParts.join(". ") + ".",
    toneGuidance: toneForTier(
      seniorityTier,
      switcher.techYears || relevantYears,
      switcher.priorNonTechYears
    ),
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
    // Fill a missing timeline without changing tier/tone; persist if we can.
    if (!timeline) {
      const synthesized = synthesizeCandidatePersona(profile);
      const filled: CandidatePersona = {
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
