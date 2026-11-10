import { z } from "zod";

export const patchNodeSchema = z.object({
  opportunityId: z.string().min(1),
  nodeId: z.string().min(1),
  content: z.string().optional(),
  selected: z.boolean().optional(),
});
export type PatchNodeInput = z.infer<typeof patchNodeSchema>;

export const refineNodeSchema = z.object({
  opportunityId: z.string().min(1),
  nodeId: z.string().min(1),
  instruction: z.string().min(1, "Instruction is required"),
});
export type RefineNodeInput = z.infer<typeof refineNodeSchema>;

export const reorderNodeSchema = z.object({
  opportunityId: z.string().min(1),
  nodeId: z.string().min(1),
  direction: z.enum(["up", "down"]),
});
export type ReorderNodeInput = z.infer<typeof reorderNodeSchema>;

export const exportSchema = z.object({
  opportunityId: z.string().min(1),
  format: z.enum(["pdf", "docx"]).default("pdf"),
});
export type ExportInput = z.infer<typeof exportSchema>;

export const tailorRequestSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  title: z.string().min(1, "Job title is required"),
  description: z.string().min(1, "Job description is required"),
  url: z.string().url().optional().or(z.literal("")).or(z.null()),
  location: z.string().optional().or(z.null()),
  salary: z.string().optional().or(z.null()),
  logoUrl: z.string().optional().or(z.null()),
  pageBudget: z.union([z.literal("auto"), z.literal(1), z.literal(2)]).optional().default("auto"),
  includeSummary: z.boolean().optional().default(true),
  opportunityId: z.string().optional().or(z.null()),
});
export type TailorRequestInput = z.infer<typeof tailorRequestSchema>;
