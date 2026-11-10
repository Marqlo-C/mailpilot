import { type MasterProfileInput } from "@/lib/validations/profile.schema";
import {
  strategyRationaleSchema,
  tailorSchema,
  type TailorPayload,
} from "@/lib/validations/resume-draft.schema";
import { COMMON_STOP_WORDS } from "./distiller";

/** @deprecated Re-exported for backwards compatibility; consume directly from `@/lib/validations/resume-draft.schema`. */
export { strategyRationaleSchema, tailorSchema };
export type { TailorPayload };

function formatProfessionalTenureYears(years: number): string {
  if (!Number.isFinite(years) || years < 0.5) {
    return "less than 1 year of professional experience";
  }
  const rounded = Math.max(1, Math.round(years));
  return `${rounded} year${rounded === 1 ? "" : "s"} of professional experience`;
}

/** Legacy Stage A prompt generator kept for backward compatibility with existing tests. */
export function buildTailoredStrategySystemPrompt(input: {
  seniorityTier: string;
  timelineContext: string;
  professionalYears: number;
  includeSummary?: boolean;
  inventMetrics?: boolean;
  projectsDisabled?: boolean;
  isCareerSwitcherOrEarlyTenure?: boolean;
  isManualInclusion?: boolean;
}): string {
  const tenurePhrase = formatProfessionalTenureYears(input.professionalYears);
  const timeline = input.timelineContext.trim() || "No additional timeline context.";
  const includeSummary = input.includeSummary !== false;
  const summaryBlock = includeSummary
    ? `2. SUMMARY CONSTRAINTS:
   - Draft a punchy, confident 2-sentence executive summary highlighting alignment with the target role requirements and concrete, verifiable achievements.
   - Write strictly as a practicing professional in the target discipline.
   - NEVER refer to yourself as a "career switcher" or mention career transitions, "in-field tenure", "title family", or "calendar years" in the summary.
   - NEVER quote raw profile telemetry or internal transition metrics.
   - NEVER adopt inflated seniority titles if candidate's verified tenure indicates early career or career switcher.`
    : `2. SUMMARY OMITTED:
   - The candidate has opted to omit the Summary section.
   - Set tailoredSummary to null.
   - Since the summary is omitted, fill the single-page budget by featuring 2–3 relevant projects alongside relevant experiences with strong signal, avoiding empty vertical space on the sheet.`;

  let projectDirective: string;
  if (input.projectsDisabled) {
    projectDirective = `3. PROJECT INTEGRITY: The candidate has opted to omit the Projects section. Set selectedProjectIds to [].`;
  } else if (input.isCareerSwitcherOrEarlyTenure) {
    projectDirective = `3. PROJECT INTEGRITY: For career switchers or early-tenure candidates, select 2–3 distinct practical projects that directly demonstrate target-discipline capability and tools matching the target job description. Only feature distinct projects with concrete outcomes. Prefer 2–4 strong bullets per project.`;
  } else {
    projectDirective = `3. PROJECT INTEGRITY: Select 1–3 distinct projects demonstrating key competencies requested by the job description. Feature 2–4 strong bullets per project. Skip empty placeholders and profile-only pages.`;
  }

  const metricGuidance = input.inventMetrics === false
    ? `9. METRIC INTEGRITY: Do NOT invent metrics or unverified numbers. In strategyRationale (under featuredExperiencesReasoning or roleFitAnalysis), include constructive advice on what metrics the candidate could measure themselves for un-metricized achievements.`
    : `9. METRIC INTEGRITY: Modest, realistic metrics calibrated to candidate leveling (${input.seniorityTier}) may be synthesized when source bullets lack metrics using domain-native impact dimensions (efficiency, quality, volume, satisfaction). Never invent inflated enterprise revenue.`;

  const crossoverDirective = `10. FUNCTIONAL CROSSOVER & MULTI-ROLE CONTINUITY:
    - When evaluating candidate work experiences outside the target role's immediate title family, do NOT reject or drop those roles simply because domain keywords differ from the target job posting.
    - Evaluate and select out-of-family roles through universal functional crossover: workflow orchestration, process automation, data accuracy, SLA/deadline adherence, root-cause troubleshooting, risk mitigation, and cross-functional coordination.
    - Ground Truth vs. Framing Agility: NEVER invent tools, platforms, or responsibilities absent from the source bullet. Translate raw operational tasks into rigorous, outcome-driven language.
    - For candidates with under 2 years in their current field or career switchers, do NOT drop preceding history to leave a half-empty page. Ensure you select 2–3 high-ownership bullets from prior roles to demonstrate professional accountability, scale, and execution.`;

  const manualInclusionDirective = input.isManualInclusion
    ? `\n11. MANDATORY BASELINE ROLE COVERAGE:
    - The candidate has chosen "Include All Baseline Content".
    - You MUST include bullets from EVERY work experience in the applicant's history. Do not omit or drop any company/role.
    - Allocate at least 1 bullet per role, and up to 3-5 bullets for the most relevant roles, budgeting total bullets within bulletBudgetMax.`
    : "";

  return `You are a senior talent strategist evaluating a candidate's master database for an opening at your organization.

Your task is to select the most relevant roles, projects, and bullets for a targeted resume, and explain WHY each choice beats alternatives for this specific role and company.

CRITICAL FACTUAL & SENIORITY CONSTRAINTS:
1. SENIORITY INTEGRITY: Verified persona tier is "${input.seniorityTier}". Candidate has ${tenurePhrase}.
   Timeline context: ${timeline}
   - Profile content MUST reflect only the scope and scale documented in the candidate's profile records.
   - NEVER adopt seniority designations, ownership claims, or scale metrics from the target job posting unless that exact achievement is explicitly present in the candidate's master database.
${summaryBlock}
${projectDirective}
4. TRUTH INTEGRITY: Only select IDs that exist in the candidate's database. Never invent experience, metrics, or tools.
5. SKILLS: Return tailoredSkills as groups of { "label": string, "items": string[] }. Reorder items so competencies requested by the job description appear first.
6. DOCUMENT BUDGET: Allocate 2–4 strong bullets per featured role and 2–4 strong bullets per featured project to create a complete, well-proportioned single-page document.
7. STRATEGY RATIONALE: Provide explicit recruiter-style reasoning.
8. CREDENTIALS: Certifications, honors, and interests are separate profile sections. Never invent them.
${metricGuidance}
${crossoverDirective}${manualInclusionDirective}

Return ONLY valid JSON:
{
  "tailoredSummary": string | null,
  "tailoredSkills": [
    { "label": "Category", "items": ["Skill"] }
  ],
  "selectedBulletIds": string[],
  "selectedProjectIds": string[],
  "strategyRationale": {
    "roleFitAnalysis": string,
    "selectedSkillsReasoning": string,
    "featuredExperiencesReasoning": string,
    "featuredProjectsReasoning": string
  },
  "coverLetter": string,
  "jobRequirements": string[]
}`;
}

export const TAILORED_STRATEGY_SYSTEM_PROMPT = buildTailoredStrategySystemPrompt({
  seniorityTier: "Mid-Level Professional",
  timelineContext: "",
  professionalYears: 3,
});

export function heuristicProjectIds(
  requirements: string[],
  projects: MasterProfileInput["projects"],
  limit: number = 2
): string[] {
  if (!projects || projects.length === 0) return [];
  const reqText = requirements.join(" ").toLowerCase();
  const tokens = reqText
    .split(/[^a-z0-9+#.]/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 2 && !COMMON_STOP_WORDS.has(t));

  const scored = projects.map((p) => {
    let score = 0;
    const nameDesc = `${p.name} ${p.description ?? ""}`.toLowerCase();
    const tech = p.technologies.map((t) => t.toLowerCase()).join(" ");
    const bullets = p.bullets.map((b) => b.toLowerCase()).join(" ");

    for (const token of tokens) {
      if (tech.includes(token)) score += 4;
      if (nameDesc.includes(token)) score += 2;
      if (bullets.includes(token)) score += 1;
    }
    if (p.bullets.length > 0) score += 1;
    return { id: p.id ?? p.name, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.id)
    .filter((id): id is string => Boolean(id));
}
