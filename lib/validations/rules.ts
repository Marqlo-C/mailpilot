import { z } from "zod";
import { CLOUD_LLM_PROVIDERS } from "@/lib/llm/provider.ssot";

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
  /** Canonical section order for resume layout. */
  sectionOrder: z
    .array(z.string())
    .default([
      "summary",
      "skills",
      "experience",
      "projects",
      "education",
      "certifications",
    ]),
  /** Sections omitted from the resume layout by default. */
  disabledSections: z.array(z.string()).default([]),
  /** Whether section order is determined manually or optimized for candidate career profile. */
  orderingMode: z.enum(["MANUAL", "AI_OPTIMAL"]).default("AI_OPTIMAL"),
  /** Whether content inclusion is determined manually or optimized by AI. */
  inclusionMode: z.enum(["MANUAL", "AI_OPTIMAL"]).default("AI_OPTIMAL"),
  /** Whether the tailor is permitted to synthesize realistic metrics when none exist in source. */
  inventMetrics: z.boolean().default(false),
});

export type ResumePreferences = z.infer<typeof resumePreferencesSchema>;

export const DEFAULT_RESUME_PREFERENCES: ResumePreferences = {
  includeSummary: false,
  attachPdfByDefault: true,
  maxPages: "auto",
  sectionOrder: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],
  disabledSections: [],
  orderingMode: "AI_OPTIMAL",
  inclusionMode: "AI_OPTIMAL",
  inventMetrics: false,
};

/** @deprecated Heuristic classification modes are decommissioned. */
export const CLASSIFICATION_MODES = ["AI_ONLY"] as const;
export type ClassificationMode = (typeof CLASSIFICATION_MODES)[number];

export const accountRulesSchema = z.object({
  rejectionMode: z.enum(["LABEL_ONLY", "AUTO_TRASH"]).default("LABEL_ONLY"),
  rejectionLabelName: z.string().default("Job Search/Rejections"),
  rejectionLabelId: z.string().nullable().default(null),
  autoCleanAfterUnsub: z.enum(["NONE", "TRASH", "ARCHIVE"]).default("NONE"),
  applicationMode: z
    .enum(["MANUAL_REVIEW", "AUTO_SEND"])
    .default("MANUAL_REVIEW"),
  /**
   * @deprecated Heuristic fallback decommissioned. Pure 2-tier AI pipeline (Ollama -> Cloud BYOK).
   * Kept optional so legacy JSON blobs do not fail validation.
   */
  classificationMode: z.string().optional(),
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
   * AES-256-GCM encrypted secret required by the Ollama terminal bridge.
   */
  encryptedBridgeSecret: z.string().nullable().default(null),
  /**
   * Optional secret required by the Ollama terminal bridge when registering a
   * Cloudflare Quick Tunnel URL against this account (legacy fallback).
   */
  bridgeSecret: z
    .string()
    .nullish()
    .default(null)
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
   * may fall back to OpenRouter. Active by default for seamless 2-tier failover.
   */
  allowCloudFallback: z.boolean().default(true),
  /** Account-scoped customer BYOK cloud provider */
  cloudProvider: z.enum(CLOUD_LLM_PROVIDERS).default("OPENROUTER"),
  /** Custom cloud model override for customer's BYOK provider */
  cloudModel: z.string().nullable().default(null),
  /** Cloud provider that `cloudModel` was explicitly configured for */
  cloudModelProvider: z.enum(CLOUD_LLM_PROVIDERS).nullable().default(null),
  /** AES-256-GCM encrypted API key (never sent to client) */
  encryptedApiKey: z.string().nullable().default(null),
  /** Safe display mask (e.g. sk-...1234) for Settings UI */
  maskedApiKey: z.string().nullable().default(null),
  /** AES-256-GCM encrypted Jina API key for web scraping (deprecated; kept for backward compatibility) */
  encryptedJinaApiKey: z.string().nullable().default(null),
  /** Safe display mask (e.g. jina_...1234) for Settings UI (deprecated) */
  maskedJinaApiKey: z.string().nullable().default(null),
  /** AES-256-GCM encrypted ScrapingAnt API key for web scraping (never sent to client) */
  encryptedScrapingAntApiKey: z.string().nullable().default(null),
  /** Safe display mask (e.g. ant-...39aF) for Settings UI */
  maskedScrapingAntApiKey: z.string().nullable().default(null),
  /** Cached ScrapingAnt API subscription & usage overview */
  scrapingAntUsage: z
    .object({
      planName: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      planTotalCredits: z.number(),
      remainedCredits: z.number(),
      concurrencyLimit: z.number().nullable().default(null),
      fetchedAt: z.string(),
    })
    .nullable()
    .default(null),
  /** AES-256-GCM encrypted HasData API key for Glassdoor/Indeed on-demand scraping (never sent to client) */
  encryptedHasDataApiKey: z.string().nullable().default(null),
  /** Safe display mask (e.g. hd-...1234) for Settings UI */
  maskedHasDataApiKey: z.string().nullable().default(null),
  /** Cached HasData API subscription & credit usage overview */
  hasDataUsage: z
    .object({
      planName: z.string().default("Active"),
      totalCredits: z.number(),
      availableCredits: z.number(),
      concurrentRequests: z.number().default(0),
      availableConcurrency: z.number().nullable().default(null),
      startDate: z.string().nullable().default(null),
      endDate: z.string().nullable().default(null),
      fetchedAt: z.string(),
    })
    .nullable()
    .default(null),
  /** Defaults for on-demand tailored resume generation. */
  resumePreferences: resumePreferencesSchema.default(DEFAULT_RESUME_PREFERENCES),
});

export type ScrapingAntUsage = z.infer<
  typeof accountRulesSchema
>["scrapingAntUsage"];

export type HasDataUsage = z.infer<
  typeof accountRulesSchema
>["hasDataUsage"];

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

  const raw =
    typeof rules === "object" && rules !== null
      ? (rules as Record<string, unknown>)
      : {};

  // If allowCloudFallback is not explicitly set in the raw payload,
  // but a key is already configured, default to true so existing configured keys stay active.
  if (
    raw.allowCloudFallback === undefined &&
    Boolean(rest.maskedApiKey || rest.encryptedApiKey)
  ) {
    return { ...rest, allowCloudFallback: true };
  }

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
