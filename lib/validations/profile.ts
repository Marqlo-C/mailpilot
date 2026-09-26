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

export const tailoredDataSchema = z.object({
  selectedBullets: z.array(z.string()).default([]),
  coverLetter: z.string().default(""),
  jobRequirements: z.array(z.string()).default([]),
});

export type TailoredData = z.infer<typeof tailoredDataSchema>;

const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s().-]{7,20}$/, "Enter a valid phone number");

export const MFA_PREFERRED_CHANNELS = ["SMS", "EMAIL", "BOTH"] as const;
export type MfaPreferredChannel = (typeof MFA_PREFERRED_CHANNELS)[number];

/**
 * Resolves MFA channel from available contacts + optional preference.
 */
export function resolveMfaPreferredChannel(input: {
  mfaPhoneNumber?: string | null;
  mfaReserveEmail?: string | null;
  mfaPreferredChannel?: MfaPreferredChannel | null;
}): MfaPreferredChannel {
  const phone = Boolean(input.mfaPhoneNumber?.trim());
  const email = Boolean(input.mfaReserveEmail?.trim());

  if (phone && !email) return "SMS";
  if (email && !phone) return "EMAIL";
  if (phone && email) {
    return input.mfaPreferredChannel ?? "EMAIL";
  }
  return input.mfaPreferredChannel ?? "EMAIL";
}

/** Contact / MFA fields stored on UserProfile. */
export const contactInfoSchema = z
  .object({
    mfaPhoneNumber: z.string().trim().nullable().optional(),
    mfaReserveEmail: z.string().trim().nullable().optional(),
    mfaEnabled: z.boolean().default(false),
    mfaPreferredChannel: z.enum(MFA_PREFERRED_CHANNELS).default("EMAIL"),
  })
  .superRefine((data, ctx) => {
    const phone = (data.mfaPhoneNumber ?? "").trim();
    const email = (data.mfaReserveEmail ?? "").trim();

    if (phone) {
      const parsed = phoneNumberSchema.safeParse(phone);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mfaPhoneNumber"],
          message: parsed.error.issues[0]?.message ?? "Invalid phone",
        });
      }
    }

    if (email) {
      const parsed = z.string().email("Enter a valid reserve email").safeParse(email);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mfaReserveEmail"],
          message: parsed.error.issues[0]?.message ?? "Invalid email",
        });
      }
    }
  })
  .refine(
    (data) => {
      if (data.mfaEnabled) {
        return Boolean(
          data.mfaPhoneNumber?.trim() || data.mfaReserveEmail?.trim()
        );
      }
      return true;
    },
    {
      message:
        "To enable MFA, provide at least a phone number OR a reserve email.",
      path: ["mfaEnabled"],
    }
  );

export type ContactInfoInput = {
  mfaPhoneNumber?: string | null;
  mfaReserveEmail?: string | null;
  mfaEnabled: boolean;
  mfaPreferredChannel?: MfaPreferredChannel;
};

export const matchThresholdSchema = z.number().int().min(50).max(100);

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
  linkedIndeed: optionalHttpsUrl("Indeed"),
  linkedGlassdoor: optionalHttpsUrl("Glassdoor"),
  linkedGithub: optionalHttpsUrl("GitHub"),
  linkedLinkedin: optionalHttpsUrl("LinkedIn"),
  linkedHandshake: optionalHttpsUrl("Handshake"),
});

export type LinkedAccountsInput = {
  linkedIndeed?: string | null;
  linkedGlassdoor?: string | null;
  linkedGithub?: string | null;
  linkedLinkedin?: string | null;
  linkedHandshake?: string | null;
};

/**
 * Full master profile payload for manual editing (core resume + MFA + linked URLs).
 * Alias requested by settings UX: `masterProfileSchema`.
 */
export const masterProfileSchema = masterProfileInputSchema
  .extend({
    mfaPhoneNumber: z.string().trim().nullable().optional(),
    mfaReserveEmail: z.string().trim().nullable().optional(),
    mfaEnabled: z.boolean().optional().default(false),
    mfaPreferredChannel: z.enum(MFA_PREFERRED_CHANNELS).optional().default("EMAIL"),
    linkedIndeed: optionalHttpsUrl("Indeed"),
    linkedGlassdoor: optionalHttpsUrl("Glassdoor"),
    linkedGithub: optionalHttpsUrl("GitHub"),
    linkedLinkedin: optionalHttpsUrl("LinkedIn"),
    linkedHandshake: optionalHttpsUrl("Handshake"),
  })
  .superRefine((data, ctx) => {
    const phone = (data.mfaPhoneNumber ?? "").trim();
    const email = (data.mfaReserveEmail ?? "").trim();

    if (phone) {
      const parsed = phoneNumberSchema.safeParse(phone);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mfaPhoneNumber"],
          message: parsed.error.issues[0]?.message ?? "Invalid phone",
        });
      }
    }

    if (email) {
      const parsed = z.string().email().safeParse(email);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mfaReserveEmail"],
          message: "Enter a valid reserve email",
        });
      }
    }
  })
  .refine(
    (data) => {
      if (data.mfaEnabled) {
        return Boolean(
          data.mfaPhoneNumber?.trim() || data.mfaReserveEmail?.trim()
        );
      }
      return true;
    },
    {
      message:
        "To enable MFA, provide at least a phone number OR a reserve email.",
      path: ["mfaEnabled"],
    }
  );

export type MasterProfileUpdateInput = z.infer<typeof masterProfileSchema>;
