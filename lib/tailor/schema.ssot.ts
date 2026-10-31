import { z } from "zod";
import type {
  MasterProfileInput,
  ProjectInput,
  WorkExperienceInput,
} from "@/lib/validations/profile";
import type { AccountRules } from "@/lib/validations/rules";
import type { LlmProvider } from "@/lib/llm";
import type { CandidatePersona } from "@/lib/persona/schema.ssot";
import type { PersonaDbClient } from "@/lib/ai/persona";

/**
 * Standardized job target interface passed into the ranking and tailoring engine.
 * Decoupled from specific scraping or inbound ingestion sources.
 */
export interface JobTargetContext {
  roleTitle: string;
  companyName?: string | null;
  coreCompetencies: string[];
  seniorityExpectation?: string | null;
  rawText?: string | null;
}

/**
 * Hierarchical bullet representation bound deterministically to a parent entity.
 */
export interface HierarchicalBulletNode {
  id: string; // Deterministic key, e.g. "exp_0_b1" or "proj_0_b0"
  originalId: string;
  text: string;
  hasMetric: boolean;
  technologies: string[];
}

/**
 * Hierarchical work or activity experience node preserving parent metadata.
 */
export interface HierarchicalExperienceNode {
  id: string; // Deterministic key, e.g. "exp_0"
  originalId: string;
  company: string;
  role: string;
  category: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  displayOrder: number;
  bullets: HierarchicalBulletNode[];
}

/**
 * Hierarchical project node preserving parent metadata and technologies.
 */
export interface HierarchicalProjectNode {
  id: string; // Deterministic key, e.g. "proj_0"
  originalId: string;
  name: string;
  description: string;
  technologies: string[];
  link: string | null;
  bullets: HierarchicalBulletNode[];
}

/**
 * Complete hierarchical profile tree ensuring deterministic parent-child pointers.
 */
export interface HierarchicalProfileTree {
  applicant: {
    fullName: string;
    email: string;
    phone?: string | null;
    location?: string | null;
    summary?: string | null;
    links: MasterProfileInput["links"];
  };
  experiences: HierarchicalExperienceNode[];
  projects: HierarchicalProjectNode[];
  skills: MasterProfileInput["skills"];
  education: MasterProfileInput["education"];
  certifications: MasterProfileInput["certifications"];
  awards: MasterProfileInput["awards"];
  interests: MasterProfileInput["interests"];
}

/**
 * Entity-level ranking with ordered child bullet IDs.
 */
export const scoredEntityRankSchema = z.object({
  id: z.string(),
  relevanceScore: z.number().min(1).max(5).default(3),
  topBulletIds: z.array(z.string()).default([]),
});
export type ScoredEntityRank = z.infer<typeof scoredEntityRankSchema>;

/**
 * Lean JSON output returned by the hierarchical matrix ranker.
 */
export const matrixRankSchema = z.object({
  rankedExperiences: z.array(scoredEntityRankSchema).default([]),
  rankedProjects: z.array(scoredEntityRankSchema).default([]),
  matchedSkillKeywords: z.array(z.string()).default([]),
});
export type MatrixRankResult = z.infer<typeof matrixRankSchema>;

export type StrategyRationale = {
  roleFitAnalysis: string;
  selectedSkillsReasoning: string;
  featuredExperiencesReasoning: string;
  featuredProjectsReasoning: string;
};

export type TailorResult = {
  selectedExperience: WorkExperienceInput[];
  selectedProjects: ProjectInput[];
  tailoredSummary?: string | null;
  tailoredSkills?: MasterProfileInput["skills"];
  strategyRationale?: StrategyRationale;
  coverLetter: string;
  selectedBullets: string[];
  jobRequirements: string[];
  warningFlags?: string[];
};

export type TailorOptions = {
  llmProvider?: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  devModelOverride?: string | null;
  allowCloudFallback?: boolean;
  jobText?: string;
  companyName?: string | null;
  roleTitle?: string | null;
  customInstruction?: string | null;
  previousSelectedBulletIds?: string[] | null;
  dbClient?: PersonaDbClient | null;
  includeSummary?: boolean;
  inventMetrics?: boolean;
  targetPages?: "auto" | 1 | 2 | "1" | "2";
  accountId?: string | null;
  accountRules?: Partial<AccountRules> | null;
  contentInclusionMode?: "AI_OPTIMAL" | "MANUAL";
};
