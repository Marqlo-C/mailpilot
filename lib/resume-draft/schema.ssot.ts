import { z } from "zod";

/**
 * ============================================================================
 * RESUME DRAFTING & TAILORING DOMAIN - SINGLE SOURCE OF TRUTH (SSOT)
 * 
 * Defines canonical section keys, layout configuration, ordering modes,
 * node hierarchies, and budgeting contracts.
 * ============================================================================
 */

export const RESUME_SECTION_KEYS = [
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "awards",
  "interests",
] as const;

export type ResumeSectionKey = (typeof RESUME_SECTION_KEYS)[number];

export const resumeDraftSectionSchema = z.enum([
  "contact",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "awards",
  "interests",
]);

export type ResumeDraftSection = z.infer<typeof resumeDraftSectionSchema>;

export const RESUME_ORDERING_MODES = ["MANUAL", "AI_OPTIMAL"] as const;
export type ResumeOrderingMode = (typeof RESUME_ORDERING_MODES)[number];

export const RESUME_INCLUSION_MODES = ["MANUAL", "AI_OPTIMAL"] as const;
export type ResumeInclusionMode = (typeof RESUME_INCLUSION_MODES)[number];

export const resumePageBudgetSchema = z.union([
  z.literal("auto"),
  z.literal(1),
  z.literal(2),
]);
export type ResumePageBudget = z.infer<typeof resumePageBudgetSchema>;

export const resumeDraftNodeTypeSchema = z.enum([
  "header",
  "summary",
  "skill_group",
  "experience_header",
  "experience_bullet",
  "project_header",
  "project_bullet",
  "education_item",
  "certification_item",
  "award_item",
  "interest_item",
]);

export type ResumeDraftNodeType = z.infer<typeof resumeDraftNodeTypeSchema>;

export const resumeDraftNodeSchema = z.object({
  id: z.string().min(1),
  type: resumeDraftNodeTypeSchema,
  section: resumeDraftSectionSchema,
  parentId: z.string().min(1).optional(),
  content: z.string(),
  selected: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ResumeDraftNode = z.infer<typeof resumeDraftNodeSchema>;

export const resumeExportConfigSchema = z.object({
  includeSummary: z.boolean().default(false),
  pageBudget: resumePageBudgetSchema.default("auto"),
  sectionOrder: z.array(z.string()).optional(),
  disabledSections: z.array(z.string()).optional(),
  orderingMode: z.enum(RESUME_ORDERING_MODES).optional(),
  inclusionMode: z.enum(RESUME_INCLUSION_MODES).optional(),
  inventMetrics: z.boolean().optional(),
  warningFlags: z.array(z.string()).optional(),
});

export type ResumeExportConfig = z.infer<typeof resumeExportConfigSchema>;

export const tailoredResumeDraftSchema = z.object({
  opportunityId: z.string().min(1),
  nodes: z.array(resumeDraftNodeSchema),
  exportConfig: resumeExportConfigSchema,
  updatedAt: z.string(),
});

export type TailoredResumeDraft = z.infer<typeof tailoredResumeDraftSchema>;

export const strategyRationaleSchema = z.object({
  roleFitAnalysis: z.string(),
  selectedSkillsReasoning: z.string(),
  featuredExperiencesReasoning: z.string(),
  featuredProjectsReasoning: z.string(),
});

export type StrategyRationale = z.infer<typeof strategyRationaleSchema>;

export const storedResumeDraftSchema = z.object({
  version: z.literal(2),
  filename: z.string().optional(),
  draft: tailoredResumeDraftSchema,
  strategyRationale: strategyRationaleSchema.optional(),
});

export type StoredResumeDraft = z.infer<typeof storedResumeDraftSchema>;

/** One skill. Proficiency is the printed qualifier, when the source stated one. */
export type SkillItem = {
  name: string;
  proficiency: string | null;
};

/** A skill section group. The label is the leaf heading. parentCategory is the outer heading when the source used two tiers. */
export type SkillGroup = {
  label: string;
  parentCategory: string | null;
  items: SkillItem[];
};

export const DEFAULT_SECTION_ORDER: ResumeSectionKey[] = [
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
];

export const CAREER_SWITCHER_SECTION_ORDER: ResumeSectionKey[] = [
  "summary",
  "skills",
  "projects",
  "experience",
  "education",
  "certifications",
];

export interface ElasticBudgetParams {
  targetPages: "auto" | 1 | 2;
  careerYears: number;
  roleCount: number;
  projectCount: number;
  hasSummary: boolean;
  totalSourceBullets: number;
  matchedRequirementsCount?: number;
  inFieldRoleCount?: number;
  isCareerSwitcher?: boolean;
}

export interface ElasticBudgetResult {
  targetPages: 1 | 2;
  bulletBudgetMax: number;
  density: "SPARSE" | "BALANCED" | "DENSE";
  bulletsPerRoleMax: number;
  bulletsPerRoleMin: number;
  bulletsPerProjectMax: number;
  warningFlags: string[];
}
