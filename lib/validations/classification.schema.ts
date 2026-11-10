import { z } from "zod";

export const extractedJobSchema = z.object({
  company: z.preprocess((v) => (v == null ? "" : v), z.string().min(1)),
  companyDomain: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  logoUrl: z.preprocess(
    (v) => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null),
    z.string().nullable().optional()
  ),
  title: z.preprocess((v) => (v == null ? "" : v), z.string().min(1)),
  location: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  salary: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  salaryMax: z.coerce.number().nullable().optional(),
  postedAt: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  description: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  applyUrl: z.preprocess(
    (v) => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null),
    z.string().nullable().optional()
  ),
  applicationType: z
    .enum(["DIRECT_EMAIL", "EXTERNAL_LINK", "QUICK_APPLY"])
    .optional(),
  recipientEmail: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  recipientName: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  isAlreadyApplied: z.boolean().optional().default(false),
  matchScore: z.coerce.number().min(0).max(100).optional(),
  matchReason: z.preprocess(
    (v) => (v == null ? null : v),
    z.string().nullable().optional()
  ),
  classificationMethod: z.enum(["AI", "HEURISTIC", "HYBRID"]).optional(),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

export const jobClassificationSchema = z.object({
  is_job_related: z.boolean().default(true),
  email_category: z
    .enum([
      "DIRECT_RECRUITER",
      "JOB_BOARD_DIGEST",
      "APPLICATION_STATUS",
      "IRRELEVANT",
    ])
    .default("JOB_BOARD_DIGEST"),
  company_name: z.string().nullish().default(null),
  role_title: z.string().nullish().default(null),
  status: z
    .enum([
      "REJECTION",
      "INTERVIEW",
      "OA",
      "RECEIVED",
      "OTHER",
      "OFFER",
      "LEAD",
      "APPLIED",
    ])
    .nullish()
    .transform((value) => value ?? "LEAD"),
  action_required: z.boolean().default(false),
  action_summary: z.string().nullish().default(null),
  action_url: z.string().nullish().default(null),
  deadline_iso: z.string().nullish().default(null),
  jobs: z.array(extractedJobSchema).default([]),
  classificationMethod: z
    .enum(["AI", "HEURISTIC", "HYBRID"])
    .optional()
    .default("AI"),
  routingLines: z.array(z.string()).optional(),
  sourceTier: z
    .enum(["TIER 1 (OLLAMA)", "TIER 2 (CLOUD)", "TIER 3 (HEURISTIC)"])
    .optional(),
});

export type JobClassification = z.infer<typeof jobClassificationSchema>;
