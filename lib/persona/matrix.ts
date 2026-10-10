import type {
  CandidateArchetype,
  DistinctionAnchor,
  LeadershipScope,
  PersonaFactLens,
  SeniorityTier,
} from "./schema.ssot";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Rank, level, and glue words stripped before comparing job titles. Not a profession list. */
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
  "executive",
  "officer",
  "founder",
  "co-founder",
  "cofounder",
  "partner",
  "ii",
  "iii",
  "iv",
  "v",
]);

/**
 * Parse flexible resume dates: "2021-06", "Jun 2021", "2021", "Present", etc.
 */
export function parseFlexibleDate(raw: string | null | undefined): Date | null {
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

export function yearsBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / MS_PER_YEAR);
}

/** Tenths precision for internal tier thresholds only — never inject into prose. */
export function roundYears(years: number): number {
  return Math.round(years * 10) / 10;
}

export type RoleSignal = {
  role: string;
  company: string;
  start: Date;
  end: Date;
  years: number;
  bulletsCount: number;
};

export function collectRolesFromFacts(facts: PersonaFactLens): RoleSignal[] {
  const now = new Date();
  const roles: RoleSignal[] = [];

  for (const exp of facts.experiences) {
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
      bulletsCount: exp.bulletsCount,
    });
  }

  return roles.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Approximate total years with light overlap collapse (union of intervals). */
export function unionYears(roles: RoleSignal[]): number {
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

/** Content tokens of a title, so "Senior Teacher" and "Teaching Assistant" can match. */
export function roleStems(title: string): string[] {
  const stems = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !TITLE_RANK_TOKENS.has(token))
    .map((token) => token.slice(0, 6));
  return [...new Set(stems)];
}

export function stemsOverlap(left: string[], right: string[]): boolean {
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

export type RoleFamily = {
  stems: string[];
  roles: RoleSignal[];
};

/** Consecutive titles that share content words stay in one field. */
export function groupRoleFamilies(roles: RoleSignal[]): RoleFamily[] {
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

export function latestGraduation(facts: PersonaFactLens): Date | null {
  let latest: Date | null = null;
  for (const ed of facts.education) {
    if (ed.status === "IN_PROGRESS") continue;
    const grad = parseFlexibleDate(ed.graduationDate);
    if (!grad) continue;
    if (!latest || grad.getTime() > latest.getTime()) {
      latest = grad;
    }
  }
  return latest;
}

export function isCurrentlyStudent(facts: PersonaFactLens): boolean {
  const now = new Date();
  for (const ed of facts.education) {
    if (ed.status === "IN_PROGRESS") return true;
    const grad = parseFlexibleDate(ed.graduationDate);
    if (grad && grad.getTime() > now.getTime()) return true;
  }
  return false;
}

/**
 * Career switcher: the latest title family follows a different field.
 * Years in the earlier field must not inflate seniority in the current field.
 */
export function detectCareerSwitcher(
  roles: RoleSignal[],
  grad: Date | null
): {
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

export type MatrixClassificationResult = {
  seniorityTier: SeniorityTier;
  archetype: CandidateArchetype;
  leadershipScope: LeadershipScope;
  distinctionAnchor: DistinctionAnchor;
  titleFamily: string;
  inFieldYears: number;
  calendarYears: number;
  priorFieldYears: number;
  tierReason: string;
  rationale: string[];
  firstRole: RoleSignal | null;
  latestRole: RoleSignal | null;
  latestGraduationDate: Date | null;
  yearsSinceGrad: number | null;
};

/**
 * Classifies candidate facts across the 4 orthogonal dimensions using zero-token
 * deterministic heuristics. 100% career-agnostic across any profession.
 */
export function classifyPersonaMatrix(
  facts: PersonaFactLens
): MatrixClassificationResult {
  const roles = collectRolesFromFacts(facts);
  const calendarYears = roundYears(unionYears(roles));
  const grad = latestGraduation(facts);
  const yearsSinceGrad = grad
    ? roundYears(yearsBetween(grad, new Date()))
    : null;
  const isEnrolledStudent = isCurrentlyStudent(facts);

  const families = groupRoleFamilies(roles);
  const currentFamily = families[families.length - 1];
  const titleFamily = currentFamily
    ? [...new Set(currentFamily.roles.map((role) => role.role))].join(", ")
    : "No professional title family yet";

  const switcher = detectCareerSwitcher(roles, grad);
  const relevantYears =
    switcher.priorFieldYears > 0 ? switcher.inFieldYears : calendarYears;

  /* -------------------------------------------------------------------------- */
  /*                       DIMENSION 1: SENIORITY TIER                          */
  /* -------------------------------------------------------------------------- */
  const allRolesIntern =
    roles.length > 0 &&
    roles.every((r) =>
      /\b(intern|internship|co-op|coop|student|apprentice|trainee)\b/i.test(
        r.role
      )
    );

  const hasExecTitle = roles.some((r) =>
    /\b(principal|director|vp\b|vice\s+president|chief|partner|head\s+of|c-level|executive)\b/i.test(
      r.role
    )
  );

  let seniorityTier: SeniorityTier;
  let tierReason: string;

  if (isEnrolledStudent && relevantYears < 2) {
    seniorityTier = "Student / Intern";
    tierReason =
      "Currently active degree or study status on file with under two years of formal post-qualification experience.";
  } else if (allRolesIntern && relevantYears < 2) {
    seniorityTier = "Student / Intern";
    tierReason =
      "All recorded experience comprises internship, apprenticeship, or trainee positions.";
  } else if (switcher.isSwitcher) {
    seniorityTier = "Career Switcher";
    tierReason = `The latest title family follows a different discipline after prior tenure, with ${relevantYears} years in the current family.`;
  } else if (relevantYears >= 10 || (hasExecTitle && relevantYears >= 7)) {
    seniorityTier = "Principal / Executive / Director";
    tierReason = `In-field tenure is ${relevantYears} years, satisfying the executive/principal organizational tier.`;
  } else if (relevantYears >= 6) {
    seniorityTier = "Senior / Lead Professional";
    tierReason = `In-field tenure is ${relevantYears} years, at or above the senior threshold.`;
  } else if (
    relevantYears < 2 ||
    (yearsSinceGrad !== null && yearsSinceGrad <= 1.5 && relevantYears < 3)
  ) {
    seniorityTier = "Early Career / New Grad";
    tierReason =
      yearsSinceGrad !== null && yearsSinceGrad <= 1.5 && relevantYears < 3
        ? `Graduation was recent and in-field tenure is ${relevantYears} years, situating the candidate in the early-career band.`
        : `In-field tenure is ${relevantYears} years, under the two-year mid-level threshold.`;
  } else {
    seniorityTier = "Mid-Level Professional";
    tierReason = `In-field tenure is ${relevantYears} years, within the established mid-level professional band.`;
  }

  /* -------------------------------------------------------------------------- */
  /*                       DIMENSION 2: CANDIDATE ARCHETYPE                     */
  /* -------------------------------------------------------------------------- */
  const certCount = facts.certificationsCount;
  const projectCount = facts.projectsCount;
  const hasDegrees = facts.education.some(
    (e) => Boolean(e.degree?.trim()) && e.status === "GRADUATED"
  );
  const hasAdvancedDegree = facts.education.some((e) =>
    /\b(master|phd|doctor|doctorate|md|jd|ms|ma|mba|postgrad)\b/i.test(
      e.degree || ""
    )
  );

  let archetype: CandidateArchetype;

  if (
    certCount >= 2 ||
    (certCount >= 1 && projectCount >= 2) ||
    (!hasDegrees && (certCount >= 1 || projectCount >= 3))
  ) {
    archetype = "Applied Practitioner / Skill-Certified";
  } else if (
    (families.length >= 2 &&
      switcher.priorFieldYears >= 1.5 &&
      switcher.inFieldYears >= 1) ||
    switcher.isSwitcher
  ) {
    archetype = "Cross-Disciplinary Hybrid";
  } else if (
    (families.length === 1 && relevantYears >= 3) ||
    (relevantYears >= 4 &&
      relevantYears / Math.max(calendarYears, 1) >= 0.8) ||
    (hasAdvancedDegree && relevantYears >= 2)
  ) {
    archetype = "Deep Specialist";
  } else {
    archetype = "Generalist Practitioner";
  }

  /* -------------------------------------------------------------------------- */
  /*                       DIMENSION 3: LEADERSHIP SCOPE                        */
  /* -------------------------------------------------------------------------- */
  const hasFounderScope = roles.some((r) =>
    /\b(founder|co-founder|cofounder|owner|ceo|cfo|coo|cto|cmo|chief|managing\s+director|executive\s+director|president|partner)\b/i.test(
      r.role
    )
  );

  const hasLeadScope = roles.some((r) =>
    /\b(lead|manager|head|supervisor|director|coordinator|team\s+lead|project\s+manager|program\s+manager|chair)\b/i.test(
      r.role
    )
  );

  let leadershipScope: LeadershipScope;

  if (hasFounderScope) {
    leadershipScope = "Founder / Organizational Leader";
  } else if (hasLeadScope) {
    leadershipScope = "Project / Team Lead";
  } else {
    leadershipScope = "Individual Contributor / Practitioner";
  }

  /* -------------------------------------------------------------------------- */
  /*                       DIMENSION 4: DISTINCTION ANCHOR                      */
  /* -------------------------------------------------------------------------- */
  const hasAcademicHonors = facts.education.some(
    (e) => Array.isArray(e.honors) && e.honors.length > 0
  );
  const hasHighProjectVelocity =
    projectCount >= 3 || certCount >= 2 || (projectCount >= 2 && certCount >= 1);

  let distinctionAnchor: DistinctionAnchor;

  if (hasAcademicHonors && (relevantYears < 4 || !hasHighProjectVelocity)) {
    distinctionAnchor = "Academic Honors / Pedigree";
  } else if (hasHighProjectVelocity) {
    distinctionAnchor = "High Project Velocity / Certified Portfolio";
  } else if (hasAcademicHonors) {
    distinctionAnchor = "Academic Honors / Pedigree";
  } else {
    distinctionAnchor = "None / Production Tenure";
  }

  /* -------------------------------------------------------------------------- */
  /*                       RATIONALE & SIGNALS                                  */
  /* -------------------------------------------------------------------------- */
  const firstRole = roles.length > 0 ? roles[0] : null;
  const latestRole = roles.length > 0 ? roles[roles.length - 1] : null;

  const rationale = [
    `${roles.length} professional ${roles.length === 1 ? "role" : "roles"} counted toward tenure across ${families.length} title ${families.length === 1 ? "family" : "families"}.`,
    `Current title family: ${titleFamily}. Consecutive titles stay in one family when their content words overlap.`,
    tierReason,
    `Classified archetype as "${archetype}", leadership scope as "${leadershipScope}", and distinction anchor as "${distinctionAnchor}".`,
  ];

  return {
    seniorityTier,
    archetype,
    leadershipScope,
    distinctionAnchor,
    titleFamily,
    inFieldYears: switcher.priorFieldYears > 0 ? switcher.inFieldYears : calendarYears,
    calendarYears,
    priorFieldYears: switcher.priorFieldYears,
    tierReason,
    rationale,
    firstRole,
    latestRole,
    latestGraduationDate: grad,
    yearsSinceGrad,
  };
}
