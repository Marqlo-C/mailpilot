import type {
  CandidateArchetype,
  DistinctionAnchor,
  LeadershipScope,
  SeniorityTier,
} from "./schema.ssot";

/**
 * Human-facing tenure phrases for prompts / timelineContext / toneGuidance.
 * Never emits robotic decimals like "0.7 years" or "8.3 years".
 */
export function formatHumanYears(years: number): string {
  if (!Number.isFinite(years) || years < 0.5) {
    return "less than a year";
  }
  const rounded = Math.round(years);
  if (rounded < 1) {
    return "nearly a year";
  }
  const unit = rounded === 1 ? "year" : "years";
  const floor = Math.floor(years);
  const frac = Math.round((years - floor) * 100) / 100;

  if (frac >= 0.7 && frac < 0.95) {
    const ceil = Math.ceil(years);
    return ceil === 1 ? "nearly a year" : `nearly ${ceil} years`;
  }
  if (frac > 0.15 && frac < 0.45 && floor >= 1) {
    return `over ${floor} ${floor === 1 ? "year" : "years"}`;
  }
  if (Math.abs(years - rounded) <= 0.15) {
    return `about ${rounded} ${unit}`;
  }
  return `around ${rounded} ${unit}`;
}

export type TimelineContextParams = {
  seniorityTier: SeniorityTier;
  inFieldYears: number;
  calendarYears: number;
  priorFieldYears?: number;
  firstRole?: { start: Date; role: string; company: string } | null;
  latestRole?: { end: Date; role: string; company: string } | null;
  latestGraduationDate?: Date | null;
  yearsSinceGrad?: number | null;
};

/**
 * Builds grounded timeline summary for prompt injection.
 */
export function buildTimelineContext(params: TimelineContextParams): string {
  const {
    seniorityTier,
    inFieldYears,
    calendarYears,
    priorFieldYears = 0,
    firstRole,
    latestRole,
    latestGraduationDate,
    yearsSinceGrad,
  } = params;

  const timelineParts: string[] = [];

  if (seniorityTier === "Career Switcher") {
    timelineParts.push(
      `Career switcher: ${formatHumanYears(
        priorFieldYears
      )} of professional experience in an earlier field, then ${formatHumanYears(
        inFieldYears
      )} in the current field`
    );
    timelineParts.push(
      `Do NOT treat the combined ${formatHumanYears(
        calendarYears
      )} of calendar time as in-field seniority`
    );
  } else if (seniorityTier === "Student / Intern") {
    if (inFieldYears > 0) {
      timelineParts.push(
        `Student / intern: ${formatHumanYears(
          inFieldYears
        )} of practical experience`
      );
    } else {
      timelineParts.push(
        "Student / intern: Currently active in studies with early practical experience"
      );
    }
  } else if (inFieldYears > 0) {
    timelineParts.push(
      `${formatHumanYears(inFieldYears)} of in-field professional experience`
    );
    if (calendarYears > inFieldYears + 0.5) {
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

  if (latestGraduationDate) {
    timelineParts.push(
      `Most recent graduation around ${latestGraduationDate.getFullYear()}${
        yearsSinceGrad !== null && yearsSinceGrad !== undefined
          ? ` (${formatHumanYears(yearsSinceGrad)} ago)`
          : ""
      }`
    );
  }

  return timelineParts.join(". ") + ".";
}

export type ToneGuidanceParams = {
  seniorityTier: SeniorityTier;
  archetype: CandidateArchetype;
  leadershipScope: LeadershipScope;
  distinctionAnchor: DistinctionAnchor;
  inFieldYears: number;
  priorFieldYears?: number;
};

/**
 * 4-Layer Interlocking Tone Composition Engine:
 * - Grounding Base: Forbids hallucinating tools, certifications, or metrics not in the profile.
 * - Layer 1 (Seniority Guardrail & Ceiling): Sets posture bounds.
 * - Layer 2 (Leadership & Agency Dial): Sets drive level.
 * - Layer 3 (Narrative & Archetype Angle): Steers angle.
 * - Layer 4 (Proof Anchor): Directs what evidence to substantiate claims with.
 */
export function composeToneGuidance(params: ToneGuidanceParams): string {
  const {
    seniorityTier,
    archetype,
    leadershipScope,
    distinctionAnchor,
    inFieldYears,
    priorFieldYears = 0,
  } = params;

  /* -------------------------------------------------------------------------- */
  /*                             GROUNDING BASE                                 */
  /* -------------------------------------------------------------------------- */
  const grounding =
    "Stay factually grounded in verified profile data only. Never invent tenure, titles, leadership scope, tools, credentials, or metrics not present in the candidate record. Never posture as more senior or specialized than verified experience supports.";

  /* -------------------------------------------------------------------------- */
  /*                 LAYER 1: SENIORITY GUARDRAIL & CEILING                     */
  /* -------------------------------------------------------------------------- */
  let layer1: string;
  switch (seniorityTier) {
    case "Student / Intern":
      layer1 =
        "Write as an emerging student or intern: curious, clear, humble, and eager to learn. Emphasize enthusiasm, academic or foundational coursework, and practical adaptability. Do not claim senior scope, autonomous enterprise ownership, or deep commercial tenure.";
      break;
    case "Early Career / New Grad":
      layer1 =
        "Write as an early-career candidate: curious, clear, energetic, and concise. Emphasize rapid ramp-up ability, foundational discipline, and availability without sounding ungrounded. Do not claim senior scope of ownership or deep domain authority.";
      break;
    case "Mid-Level Professional":
      layer1 = `Write as a mid-level peer (${
        inFieldYears > 0 ? formatHumanYears(inFieldYears) : "a few years"
      } in the current field): confident, practical, logistics-first. Reference recent contributions and day-to-day execution when useful. Do not inflate into staff/lead voice.`;
      break;
    case "Senior / Lead Professional":
      layer1 = `Write as an experienced peer (${
        inFieldYears > 0 ? formatHumanYears(inFieldYears) : "several years"
      } in the field): terse, calm, and logistics-first with hiring managers. Do not oversell or restate the resume. Keep replies short and match their formality.`;
      break;
    case "Principal / Executive / Director":
      layer1 = `Write as an organizational or strategic leader (${
        inFieldYears > 0 ? formatHumanYears(inFieldYears) : "many years"
      } in the field): terse, visionary, and high-agency with executive presence. Frame contributions around business impact, architecture, or organizational scale without tactical micromanagement.`;
      break;
    case "Career Switcher":
      layer1 = `Write as a career switcher with ${formatHumanYears(
        inFieldYears
      )} in the current field (not ${formatHumanYears(
        inFieldYears + priorFieldYears
      )} of calendar time as in-field seniority). Be honest about the change. Highlight transferable strengths without inventing tenure in the new field. Stay humble about depth in the new field and focus on motivation and learning.`;
      break;
  }

  /* -------------------------------------------------------------------------- */
  /*                 LAYER 2: LEADERSHIP & AGENCY DIAL                          */
  /* -------------------------------------------------------------------------- */
  let layer2: string;
  switch (leadershipScope) {
    case "Founder / Organizational Leader":
      layer2 =
        "Agency dial: High-ownership 0-to-1 builder voice. Speak with direct accountability, organizational initiative, and entrepreneurial drive.";
      break;
    case "Project / Team Lead":
      layer2 =
        "Agency dial: Collaborative multiplier and team lead. Emphasize team coordination, delivery momentum, unblocking contributors, and project accountability.";
      break;
    case "Individual Contributor / Practitioner":
      layer2 =
        "Agency dial: Dedicated implementation craftsperson. Highlight execution rigor, domain craftsmanship, and dependable individual delivery.";
      break;
  }

  /* -------------------------------------------------------------------------- */
  /*                 LAYER 3: NARRATIVE & ARCHETYPE ANGLE                       */
  /* -------------------------------------------------------------------------- */
  let layer3: string;
  switch (archetype) {
    case "Applied Practitioner / Skill-Certified":
      layer3 =
        "Narrative angle: Applied practitioner and demonstrated skill builder. Lead with tangible project deliverables, certified competencies, and verified execution proof.";
      break;
    case "Cross-Disciplinary Hybrid":
      layer3 =
        "Narrative angle: Cross-disciplinary hybrid. Highlight the unique ability to bridge multiple disciplines, integrating diverse perspectives and connecting cross-functional workflows.";
      break;
    case "Deep Specialist":
      layer3 =
        "Narrative angle: Deep specialist. Showcase focused domain depth, nuanced problem-solving, and rigorous technical or functional mastery within the primary field.";
      break;
    case "Generalist Practitioner":
      layer3 =
        "Narrative angle: Versatile generalist practitioner. Showcase adaptability across varied operational challenges, broad context awareness, and fast adjustment to team needs.";
      break;
  }

  /* -------------------------------------------------------------------------- */
  /*                         LAYER 4: PROOF ANCHOR                              */
  /* -------------------------------------------------------------------------- */
  let layer4: string;
  switch (distinctionAnchor) {
    case "Academic Honors / Pedigree":
      layer4 =
        "Proof anchor: Anchor credibility in verified academic honors, distinguished scholastic performance, and rigorous institutional fundamentals.";
      break;
    case "High Project Velocity / Certified Portfolio":
      layer4 =
        "Proof anchor: Anchor credibility in high-velocity project output, verified portfolio work, and recognized certifications.";
      break;
    case "None / Production Tenure":
      layer4 =
        "Proof anchor: Anchor credibility in steady production tenure, dependable day-to-day execution, and verified organizational track record.";
      break;
  }

  return `${grounding} ${layer1} ${layer2} ${layer3} ${layer4}`;
}
