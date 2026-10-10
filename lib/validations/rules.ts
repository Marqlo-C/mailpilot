import { z } from "zod";

export const DISMISSED_RETENTION_OPTIONS = [7, 14, 30] as const;

export const resumePageBudgetSchema = z.union([
  z.literal("auto"),
  z.literal(1),
  z.literal(2),
]);

export const resumePreferencesSchema = z.object({
  /** When false, tailored resumes omit the professional summary by default. */
  includeSummary: z.boolean().default(false),
  /**
   * When true, outbound opportunity drafts/sends attach the tailored resume PDF
   * unless the reviewer toggles it off for that send.
   */
  attachPdfByDefault: z.boolean().default(true),
  /** Soft page target for resume layout (`auto` leaves budgeting to the tailor). */
  maxPages: resumePageBudgetSchema.default("auto"),
});

export type ResumePreferences = z.infer<typeof resumePreferencesSchema>;

export const DEFAULT_RESUME_PREFERENCES: ResumePreferences = {
  includeSummary: false,
  attachPdfByDefault: true,
  maxPages: "auto",
};

export const accountRulesSchema = z.object({
  rejectionMode: z.enum(["LABEL_ONLY", "AUTO_TRASH"]).default("LABEL_ONLY"),
  rejectionLabelName: z.string().default("Job Search/Rejections"),
  rejectionLabelId: z.string().nullable().default(null),
  autoCleanAfterUnsub: z.enum(["NONE", "TRASH", "ARCHIVE"]).default("NONE"),
  applicationMode: z
    .enum(["MANUAL_REVIEW", "AUTO_SEND"])
    .default("MANUAL_REVIEW"),
  /**
   * @deprecated Threshold lives on PermanentSettings / UserProfile.
   * Stripped on parse; kept optional so legacy JSON blobs do not fail validation.
   */
  matchScoreThreshold: z.number().int().min(0).max(100).optional(),
  maxAutoSendsPerDay: z.number().min(1).max(20).default(5),
  /** Days before DISMISSED History items are permanently purged. */
  dismissedRetentionDays: z.preprocess((value) => {
    if (value === 7 || value === 14 || value === 30) return value;
    return 30;
  }, z.union([z.literal(7), z.literal(14), z.literal(30)])),
  /** Role titles / patterns banned via "Less like this". */
  excludedTitles: z.array(z.string()).default([]),
  /**
   * Optional secret required by the Ollama terminal bridge when registering a
   * Cloudflare Quick Tunnel URL against this account.
   */
  bridgeSecret: z
    .string()
    .nullish()
    .transform((val) => {
      const trimmed = val?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    }),
  /** Last known model tags returned from a successful Ollama /api/tags ping. */
  availableModels: z.array(z.string()).default([]),
  /** Whether the last verify ping reached Ollama successfully. */
  bridgeConnected: z.boolean().default(false),
  /**
   * When true and llmProvider is LOCAL_OLLAMA, failed/unreachable local calls
   * may fall back to OpenRouter. Default false — no silent cloud fallback.
   */
  allowCloudFallback: z.boolean().default(false),
  /** Defaults for on-demand tailored resume generation. */
  resumePreferences: resumePreferencesSchema.default(DEFAULT_RESUME_PREFERENCES),
});

export type AccountRules = Omit<
  z.infer<typeof accountRulesSchema>,
  "matchScoreThreshold"
>;

export const DEFAULT_ACCOUNT_RULES: AccountRules = (() => {
  const parsed = accountRulesSchema.parse({});
  const { matchScoreThreshold: _deprecated, ...rest } = parsed;
  return rest;
})();

/**
 * Parses and validates the Json `rules` field from AccountSettings.
 * Unknown or partial payloads are filled with schema defaults.
 * Legacy `matchScoreThreshold` is dropped — use PermanentSettings / UserProfile.
 */
export function parseAccountRules(rules: unknown): AccountRules {
  const parsed = accountRulesSchema.parse(rules ?? {});
  const { matchScoreThreshold: _deprecated, ...rest } = parsed;
  return rest;
}

/** Case-insensitive exact or substring match against excluded title patterns. */
export function titleMatchesExcluded(
  title: string,
  excludedTitles: string[] | null | undefined
): boolean {
  const t = title.toLowerCase().trim();
  if (!t || !excludedTitles?.length) return false;
  return excludedTitles.some((ex) => {
    const e = ex.toLowerCase().trim();
    return e.length > 0 && (t === e || t.includes(e));
  });
}
