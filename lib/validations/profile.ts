import { z } from "zod";

export const experienceBulletSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  technologies: z.array(z.string()).default([]),
  hasMetric: z.boolean().default(false),
});

export const skillsSchema = z.object({
  languages: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  concepts: z.array(z.string()).default([]),
});

export const profileLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export const workExperienceInputSchema = z.object({
  id: z.string().optional(),
  company: z.string().min(1),
  role: z.string().min(1),
  location: z.string().nullable().optional(),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
  bullets: z.array(experienceBulletSchema).default([]),
  displayOrder: z.number().int().default(0),
});

export const projectInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().default(""),
  technologies: z.array(z.string()).default([]),
  link: z.string().nullable().optional(),
  bullets: z.array(z.string()).default([]),
});

export const educationInputSchema = z.object({
  id: z.string().optional(),
  institution: z.string().min(1),
  degree: z.string().min(1),
  fieldOfStudy: z.string().nullable().optional(),
  graduationDate: z.string().nullable().optional(),
});

export const masterProfileInputSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  links: z.array(profileLinkSchema).default([]),
  skills: skillsSchema.default({
    languages: [],
    frameworks: [],
    tools: [],
    concepts: [],
  }),
  experiences: z.array(workExperienceInputSchema).default([]),
  projects: z.array(projectInputSchema).default([]),
  education: z.array(educationInputSchema).default([]),
});

export type ExperienceBullet = z.infer<typeof experienceBulletSchema>;
export type Skills = z.infer<typeof skillsSchema>;
export type MasterProfileInput = z.infer<typeof masterProfileInputSchema>;
export type WorkExperienceInput = z.infer<typeof workExperienceInputSchema>;
export type ProjectInput = z.infer<typeof projectInputSchema>;
export type EducationInput = z.infer<typeof educationInputSchema>;

export const APPLICATION_STATUSES = [
  "LEAD",
  "APPLIED",
  "OA",
  "INTERVIEW",
  "OFFER",
  "REJECTION",
  "ARCHIVED",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const OPPORTUNITY_STATUSES = [
  "DETECTED",
  "DRAFT_PREPARED",
  "DRAFT_SAVED_GMAIL",
  "SENT",
  "DISMISSED",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const APPLICATION_METHODS = [
  "DIRECT_EMAIL",
  "EXTERNAL_LINK",
  "PORTAL_QUICK_APPLY",
] as const;

export type ApplicationMethod = (typeof APPLICATION_METHODS)[number];

export const tailoredDataSchema = z.object({
  selectedBullets: z.array(z.string()).default([]),
  coverLetter: z.string().default(""),
  jobRequirements: z.array(z.string()).default([]),
});

export type TailoredData = z.infer<typeof tailoredDataSchema>;

/** Canonical Job Radar match threshold (PermanentSettings + UserProfile mirror). */
export const DEFAULT_MATCH_THRESHOLD = 75;
/** @deprecated Prefer any integer 0–100; kept for settings UI defaults. */
export const MATCH_THRESHOLD_STEP = 1;

export const matchThresholdSchema = z.number().int().min(0).max(100);

/** Clamp to a whole-number Fit Score in 0–100. */
export function snapMatchThreshold(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Single read-path resolver: PermanentSettings first, then UserProfile mirror.
 * Never falls back to AccountSettings.rules.
 */
export function resolveMatchThreshold(input: {
  permanentMatchScoreThreshold?: number | null;
  profileMatchThreshold?: number | null;
}): number {
  for (const candidate of [
    input.permanentMatchScoreThreshold,
    input.profileMatchThreshold,
  ]) {
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) continue;
    const parsed = matchThresholdSchema.safeParse(candidate);
    if (parsed.success) return snapMatchThreshold(parsed.data);
  }
  return DEFAULT_MATCH_THRESHOLD;
}

function optionalHttpsUrl(label: string) {
  return z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => {
      const value = (v ?? "").trim();
      return value.length === 0 ? null : value;
    })
    .refine(
      (v) => v === null || z.string().url().safeParse(v).success,
      `${label} must be a valid URL`
    );
}

/** External professional profile URLs on UserProfile. */
export const linkedAccountsSchema = z.object({
  linkedWebsite: optionalHttpsUrl("Personal Website"),
  linkedIndeed: optionalHttpsUrl("Indeed"),
  linkedGlassdoor: optionalHttpsUrl("Glassdoor"),
  linkedGithub: optionalHttpsUrl("GitHub"),
  linkedLinkedin: optionalHttpsUrl("LinkedIn"),
  linkedHandshake: optionalHttpsUrl("Handshake"),
});

export type LinkedAccountsInput = {
  linkedWebsite?: string | null;
  linkedIndeed?: string | null;
  linkedGlassdoor?: string | null;
  linkedGithub?: string | null;
  linkedLinkedin?: string | null;
  linkedHandshake?: string | null;
};

/**
 * Full master profile payload for manual editing (core resume + linked URLs).
 * Alias requested by settings UX: `masterProfileSchema`.
 */
export const masterProfileSchema = masterProfileInputSchema.extend({
  linkedWebsite: optionalHttpsUrl("Personal Website"),
  linkedIndeed: optionalHttpsUrl("Indeed"),
  linkedGlassdoor: optionalHttpsUrl("Glassdoor"),
  linkedGithub: optionalHttpsUrl("GitHub"),
  linkedLinkedin: optionalHttpsUrl("LinkedIn"),
  linkedHandshake: optionalHttpsUrl("Handshake"),
});

export type MasterProfileUpdateInput = z.infer<typeof masterProfileSchema>;
