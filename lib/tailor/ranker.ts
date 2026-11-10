import { z } from "zod";
import { callLLMWithFallback } from "@/lib/ai";
import { extractCompetencyTokens } from "./distiller";
import {
  matrixRankSchema,
  type HierarchicalProfileTree,
  type JobTargetContext,
  type MatrixRankResult,
  type TailorOptions,
} from "@/lib/validations/tailor.schema";

/**
 * Lean, career-agnostic system prompt dedicated solely to relevance evaluation.
 * Evaluates candidate background against target posting across 4 universal dimensions.
 */
export const HIERARCHICAL_RANKER_SYSTEM_PROMPT = `You are an expert talent evaluator scoring candidate achievements against a target role across four universal, career-agnostic dimensions:
1. Functional & Domain Alignment: Direct crossover of candidate's verified methods, techniques, credentials, or core competencies to target role duties.
2. Scope, Scale & Responsibility: Magnitude of autonomy, operational footprint, stakeholder volume, or project/program leadership.
3. Measurable Impact & Outcomes: Tangible verified results, efficiency gains, compliance standards, or quantitative outcomes.
4. Problem-Solving & Operational Rigor: Critical thinking, crisis/incident resolution, risk mitigation, process improvement, or quality control.

YOUR TASK:
1. Evaluate each work experience and portfolio project with a composite relevance score from 1.0 to 5.0 (decimals permitted, e.g., 4.6, 3.8) reflecting the four dimensions.
2. For each experience/project, rank ALL of its bullet IDs strictly from highest relevance/impact to lowest relevance: include every bullet ID provided in the input for that entity so all bullets are prioritized.
3. Extract key skill keywords from the candidate's background that directly match the target role requirements.

STRICT CONSTRAINTS:
- 100% Career Agnostic: Apply the four dimensions completely neutrally across any trade, industry, profession, or discipline.
- Zero Concrete Example Bleed: Evaluate solely using the candidate's verified input text; never hallucinate external domain assumptions.
- Zero Hallucination: ONLY return IDs that exist in the provided input. Do not invent IDs.
- Lean JSON Output: Return ONLY the specified JSON schema.

Return format:
{
  "rankedExperiences": [
    { "id": "exp_0", "relevanceScore": 4.6, "topBulletIds": ["exp_0_b1", "exp_0_b0", "exp_0_b2"] }
  ],
  "rankedProjects": [
    { "id": "proj_0", "relevanceScore": 4.2, "topBulletIds": ["proj_0_b1", "proj_0_b0", "proj_0_b2"] }
  ],
  "matchedSkillKeywords": ["Competency_A", "Competency_B"]
}`;

/**
 * Deterministic heuristic fallback evaluator when LLMs are unreachable or offline.
 */
export function heuristicRankProfile(
  tree: HierarchicalProfileTree,
  job: JobTargetContext
): MatrixRankResult {
  const reqTokens = new Set(
    job.coreCompetencies.length > 0
      ? job.coreCompetencies.map((t) => t.toLowerCase())
      : extractCompetencyTokens(`${job.roleTitle} ${job.rawText || ""}`)
  );

  const rankedExperiences = tree.experiences.map((exp, expIdx) => {
    let matchPoints = 0;
    const roleHay = `${exp.role} ${exp.company}`.toLowerCase();
    let roleTokenMatches = 0;
    reqTokens.forEach((token) => {
      if (roleHay.includes(token)) roleTokenMatches += 2;
    });

    const scoredBullets = exp.bullets.map((b) => {
      let tokenMatches = 0;
      const hay = `${b.text} ${b.technologies.join(" ")}`.toLowerCase();
      reqTokens.forEach((token) => {
        if (hay.includes(token)) tokenMatches += 2;
      });

      let bScore = tokenMatches;
      if (tokenMatches > 0 && b.hasMetric) bScore += 2;
      if (b.text.length > 120) bScore += 0.5;
      matchPoints += bScore;
      return { id: b.id, score: bScore };
    });

    scoredBullets.sort((a, b) => b.score - a.score);

    // Recency boost: recent in-field roles score higher
    const recencyBoost = expIdx === 0 ? 0.4 : expIdx === 1 ? 0.2 : 0;
    const totalScore = matchPoints + roleTokenMatches;
    const rawScore =
      totalScore === 0
        ? 1.0
        : Math.min(5, Math.max(1, Number((1.5 + totalScore / 6 + recencyBoost).toFixed(2))));

    return {
      id: exp.id,
      relevanceScore: rawScore,
      topBulletIds: scoredBullets.map((b) => b.id),
    };
  });

  rankedExperiences.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const rankedProjects = tree.projects.map((proj) => {
    let pScore = 0;
    const hay = `${proj.name} ${proj.description} ${proj.technologies.join(" ")}`.toLowerCase();
    reqTokens.forEach((token) => {
      if (hay.includes(token)) pScore += 3;
    });

    const scoredBullets = proj.bullets.map((b) => {
      let bScore = b.hasMetric ? 2 : 0;
      const bHay = `${b.text} ${b.technologies.join(" ")}`.toLowerCase();
      reqTokens.forEach((token) => {
        if (bHay.includes(token)) bScore += 2;
      });
      if (b.text.length > 120) bScore += 0.5;
      return { id: b.id, score: bScore };
    });

    scoredBullets.sort((a, b) => b.score - a.score);
    const relevanceScore = Math.min(5, Math.max(1, Number((1.5 + pScore / 4).toFixed(2))));

    return {
      id: proj.id,
      relevanceScore,
      topBulletIds: scoredBullets.map((b) => b.id),
    };
  });

  rankedProjects.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const matchedSkillKeywords = Array.from(reqTokens).slice(0, 10);

  return {
    rankedExperiences,
    rankedProjects,
    matchedSkillKeywords,
  };
}

/**
 * Evaluates candidate experiences and projects against the target role using
 * a fast, focused LLM ranking call with automatic heuristic fallback.
 */
export async function rankProfileAgainstJob(
  tree: HierarchicalProfileTree,
  job: JobTargetContext,
  options: TailorOptions = {}
): Promise<MatrixRankResult> {
  const heuristic = heuristicRankProfile(tree, job);
  const heuristicProjMap = new Map(heuristic.rankedProjects.map((p) => [p.id, p.relevanceScore]));
  const heuristicExpMap = new Map(heuristic.rankedExperiences.map((e) => [e.id, e.relevanceScore]));

  // Pre-sort projects and experiences by heuristic score to eliminate LLM array-index bias
  const sortedExperiences = [...tree.experiences].sort(
    (a, b) => (heuristicExpMap.get(b.id) ?? 1) - (heuristicExpMap.get(a.id) ?? 1)
  );
  const sortedProjects = [...tree.projects].sort(
    (a, b) => (heuristicProjMap.get(b.id) ?? 1) - (heuristicProjMap.get(a.id) ?? 1)
  );

  // Send top candidates to LLM to keep prompt lean (~4k chars instead of 18k) and avoid position degradation
  const candidateProjects = sortedProjects.slice(0, 6);
  const experiencesPayload = sortedExperiences.map((exp) => ({
    id: exp.id,
    role: exp.role,
    company: exp.company,
    category: exp.category,
    bullets: exp.bullets.map((b) => ({ id: b.id, text: b.text.slice(0, 160) })),
  }));

  const projectsPayload = candidateProjects.map((proj) => ({
    id: proj.id,
    name: proj.name,
    tech: proj.technologies.slice(0, 6),
    bullets: proj.bullets.map((b) => ({ id: b.id, text: b.text.slice(0, 160) })),
  }));

  const userPrompt = JSON.stringify({
    targetRole: {
      title: job.roleTitle,
      company: job.companyName,
      coreCompetencies: job.coreCompetencies.slice(0, 12),
      seniorityExpectation: job.seniorityExpectation,
    },
    experiences: experiencesPayload,
    projects: projectsPayload,
    customInstruction: options.customInstruction?.trim() || null,
  });

  try {
    const rawResult = await callLLMWithFallback({
      systemPrompt: HIERARCHICAL_RANKER_SYSTEM_PROMPT,
      userPrompt,
      llmProvider: options.llmProvider ?? "OPENROUTER",
      localOllamaUrl: options.localOllamaUrl,
      ollamaModel: options.ollamaModel,
      devModelOverride: options.devModelOverride,
      allowCloudFallback: options.allowCloudFallback,
      accountId: options.accountId,
      accountRules: options.accountRules,
      ollamaOptions: { temperature: 0.1 },
    });

    if (rawResult) {
      const parsed = matrixRankSchema.safeParse(rawResult);
      if (parsed.success && parsed.data.rankedExperiences.length > 0) {
        // Blend LLM score with heuristic baseline to prevent single-turn LLM hallucination
        const blendedExperiences = parsed.data.rankedExperiences.map((e) => {
          const hScore = heuristicExpMap.get(e.id) ?? e.relevanceScore;
          return {
            ...e,
            relevanceScore: Number((0.5 * e.relevanceScore + 0.5 * hScore).toFixed(2)),
          };
        });

        const llmProjMap = new Map(parsed.data.rankedProjects.map((p) => [p.id, p]));
        const blendedProjects = heuristic.rankedProjects.map((hp) => {
          const llmMatch = llmProjMap.get(hp.id);
          if (llmMatch) {
            return {
              id: hp.id,
              relevanceScore: Number((0.5 * llmMatch.relevanceScore + 0.5 * hp.relevanceScore).toFixed(2)),
              topBulletIds: llmMatch.topBulletIds.length > 0 ? llmMatch.topBulletIds : hp.topBulletIds,
            };
          }
          return hp;
        });

        blendedExperiences.sort((a, b) => b.relevanceScore - a.relevanceScore);
        blendedProjects.sort((a, b) => b.relevanceScore - a.relevanceScore);

        return {
          rankedExperiences: blendedExperiences,
          rankedProjects: blendedProjects,
          matchedSkillKeywords: parsed.data.matchedSkillKeywords.length > 0
            ? parsed.data.matchedSkillKeywords
            : heuristic.matchedSkillKeywords,
        };
      }
    }
  } catch (err) {
    console.warn(
      "[Ranker] LLM ranking call failed, falling back to heuristics:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return heuristic;
}
