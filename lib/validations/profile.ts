import { z } from "zod";

import { skillGroupsFromUnknown } from "@/lib/skill-groups";
import { normalizeProfileUrl } from "@/lib/utils/url";

export const experienceBulletSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  technologies: z.array(z.string()).default([]),
  hasMetric: z.boolean().default(false),
});

export const skillItemSchema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .transform((name) => ({ name, proficiency: null as string | null })),
  z
    .object({
      name: z.string().trim().min(1),
      proficiency: z.string().trim().nullable().optional(),
    })
    .transform((item) => ({
      name: item.name,
      proficiency: item.proficiency?.trim() || null,
    })),
]);

export const skillGroupSchema = z.object({
  label: z.string().trim().min(1),
  parentCategory: z.preprocess((value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
  }, z.string().min(1).nullable()),
  items: z.array(skillItemSchema),
});

/** Accepts skill groups, a string-list record, or the legacy four-bucket object. */
export const skillsSchema = z.preprocess(
  (value) => skillGroupsFromUnknown(value),
  z.array(skillGroupSchema)
);

export const profileLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export const workExperienceInputSchema = z.object({
  id: z.string().optional(),
  company: z.string().min(1),
  role: z.string().min(1),
  location: z.string().nullable().optional(),
  /** Parent resume heading. "Work" is professional employment and counts toward tenure. */
  category: z.string().trim().min(1).default("Work"),
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

export const STANDARD_EXPERIENCE_CATEGORIES = [
  "Work",
  "Leadership",
  "Activity",
  "Volunteer",
  "Athletics",
  "Clinical",
  "Military",
] as const;

export type ExperienceCategory =
  | (typeof STANDARD_EXPERIENCE_CATEGORIES)[number]
  | string;

const PAID_DOMAIN_CATEGORY =
  /\b(work|professional|employment|clinical|military|practice|freelance|consulting)\b/;

const RECREATIONAL_CATEGORY =
  /\b(leadership|activities|activity|athletics|sports|volunteer)\b/;

/**
 * Paid and domain work count toward tenure, including clinical, military,
 * practice, freelance, and consulting. Leadership, activities, athletics,
 * and volunteer headings do not. Those count when the heading also marks
 * professional employment.
 */
export function isWorkExperienceCategory(category?: string | null): boolean {
  if (!category?.trim()) return true;
  const lower = category.trim().toLowerCase();
  if (PAID_DOMAIN_CATEGORY.test(lower)) return true;
  if (RECREATIONAL_CATEGORY.test(lower)) return false;
  return true;
}

const honorsListSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}, z.array(z.string()));

export const educationStatusSchema = z.enum([
  "GRADUATED",
  "IN_PROGRESS",
  "UNSURE",
]);
export type EducationStatus = z.infer<typeof educationStatusSchema>;

export function readEducationStatus(value: unknown): EducationStatus {
  const parsed = educationStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "GRADUATED";
}

export const educationInputSchema = z.object({
  id: z.string().optional(),
  /** Parent institution. */
  institution: z.string().min(1),
  subSchool: z.string().nullable().optional(),
  degree: z.string().nullable().optional(),
  fieldOfStudy: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  graduationDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  status: educationStatusSchema.default("GRADUATED"),
  gpa: z.string().nullable().optional(),
  honors: honorsListSchema.default([]),
  coursework: honorsListSchema.default([]),
});

/** Same record as `educationInputSchema`. Callers use either name. */
export const educationItemSchema = educationInputSchema;

const nullableText = z.preprocess((value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

const nullableUrl = z.preprocess((value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return z.string().url().safeParse(withProtocol).success ? withProtocol : null;
}, z.string().url().nullable());

/** Certification and professional license. */
export const certificationItemSchema = z.object({
  name: z.string().trim().min(1, "Certification or license name is required"),
  issuer: nullableText.optional(),
  date: nullableText.optional(),
  url: nullableUrl.optional(),
});
export type CertificationItem = z.infer<typeof certificationItemSchema>;

/** Honor or award. */
export const awardItemSchema = z.object({
  title: z.string().trim().min(1, "Honor or award title is required"),
  issuer: nullableText.optional(),
  date: nullableText.optional(),
  description: nullableText.optional(),
});
export type AwardItem = z.infer<typeof awardItemSchema>;

/** Personal or professional interest. */
export const interestItemSchema = z.string().trim().min(1);
export type InterestItem = z.infer<typeof interestItemSchema>;

export const certificationsSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = certificationItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}, z.array(certificationItemSchema));

export const awardsSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = awardItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}, z.array(awardItemSchema));

export const interestsSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = interestItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}, z.array(interestItemSchema));

export const masterProfileInputSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  links: z.array(profileLinkSchema).default([]),
  skills: skillsSchema.default([]),
  experiences: z.array(workExperienceInputSchema).default([]),
  projects: z.array(projectInputSchema).default([]),
  education: z.array(educationInputSchema).default([]),
  certifications: certificationsSchema.default([]),
  awards: awardsSchema.default([]),
  interests: interestsSchema.default([]),
});

export type ExperienceBullet = z.infer<typeof experienceBulletSchema>;
export type Skills = z.infer<typeof skillsSchema>;
export type MasterProfileInput = z.infer<typeof masterProfileInputSchema>;

/**
 * Canonical baseline for a blank master profile.
 * Use for resets, fallbacks, and empty editor state.
 */
export function getEmptyMasterProfileData(): MasterProfileInput {
  return {
    fullName: "",
    email: "",
    phone: null,
    location: null,
    summary: null,
    links: [],
    skills: [],
    experiences: [],
    projects: [],
    education: [],
    certifications: [],
    awards: [],
    interests: [],
  };
}
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

function optionalHttpsUrl() {
  return z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => {
      const value = (v ?? "").trim();
      if (value.length === 0) return null;
      const normalized = normalizeProfileUrl(value);
      return z.string().url().safeParse(normalized).success ? normalized : null;
    });
}

/** External professional profile URLs on UserProfile. */
export const linkedAccountsSchema = z.object({
  linkedWebsite: optionalHttpsUrl(),
  linkedIndeed: optionalHttpsUrl(),
  linkedGlassdoor: optionalHttpsUrl(),
  linkedGithub: optionalHttpsUrl(),
  linkedLinkedin: optionalHttpsUrl(),
  linkedHandshake: optionalHttpsUrl(),
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
  linkedWebsite: optionalHttpsUrl(),
  linkedIndeed: optionalHttpsUrl(),
  linkedGlassdoor: optionalHttpsUrl(),
  linkedGithub: optionalHttpsUrl(),
  linkedLinkedin: optionalHttpsUrl(),
  linkedHandshake: optionalHttpsUrl(),
});

export type MasterProfileUpdateInput = z.infer<typeof masterProfileSchema>;
