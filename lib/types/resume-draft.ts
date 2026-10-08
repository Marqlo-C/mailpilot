import { z } from "zod";

export const resumeDraftNodeTypeSchema = z.enum([
  "header",
  "summary",
  "skill_group",
  "experience_header",
  "experience_bullet",
  "project_header",
  "project_bullet",
  "education_item",
]);

export type ResumeDraftNodeType = z.infer<typeof resumeDraftNodeTypeSchema>;

export const resumeDraftSectionSchema = z.enum([
  "contact",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
]);

export type ResumeDraftSection = z.infer<typeof resumeDraftSectionSchema>;

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

export const tailoredResumeDraftSchema = z.object({
  opportunityId: z.string().min(1),
  nodes: z.array(resumeDraftNodeSchema),
  exportConfig: z.object({
    includeSummary: z.boolean(),
    pageBudget: z.union([z.literal("auto"), z.literal(1), z.literal(2)]),
  }),
  updatedAt: z.string(),
});

export type TailoredResumeDraft = z.infer<typeof tailoredResumeDraftSchema>;

export const storedResumeDraftSchema = z.object({
  version: z.literal(2),
  filename: z.string().optional(),
  draft: tailoredResumeDraftSchema,
  strategyRationale: z
    .object({
      roleFitAnalysis: z.string(),
      selectedSkillsReasoning: z.string(),
      featuredExperiencesReasoning: z.string(),
      featuredProjectsReasoning: z.string(),
    })
    .optional(),
});

export type StoredResumeDraft = z.infer<typeof storedResumeDraftSchema>;

/** A skill section group. The label is whatever the source used. */
export type SkillGroup = {
  label: string;
  items: string[];
};
