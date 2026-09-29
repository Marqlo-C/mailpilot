import { z } from "zod";

export const DISMISSED_RETENTION_OPTIONS = [10, 15, 30, 45, 60] as const;

export const accountRulesSchema = z.object({
  rejectionMode: z.enum(["LABEL_ONLY", "AUTO_TRASH"]).default("LABEL_ONLY"),
  rejectionLabelName: z.string().default("Job Search/Rejections"),
  rejectionLabelId: z.string().nullable().default(null),
  autoCleanAfterUnsub: z.enum(["NONE", "TRASH", "ARCHIVE"]).default("NONE"),
  applicationMode: z
    .enum(["MANUAL_REVIEW", "AUTO_SEND"])
    .default("MANUAL_REVIEW"),
  matchScoreThreshold: z.number().min(50).max(100).default(75),
  maxAutoSendsPerDay: z.number().min(1).max(20).default(5),
  /** Days before DISMISSED History items are permanently purged. */
  dismissedRetentionDays: z
    .union([
      z.literal(10),
      z.literal(15),
      z.literal(30),
      z.literal(45),
      z.literal(60),
    ])
    .default(30),
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
});

export type AccountRules = z.infer<typeof accountRulesSchema>;

export const DEFAULT_ACCOUNT_RULES: AccountRules = accountRulesSchema.parse({});

/**
 * Parses and validates the Json `rules` field from AccountSettings.
 * Unknown or partial payloads are filled with schema defaults.
 */
export function parseAccountRules(rules: unknown): AccountRules {
  return accountRulesSchema.parse(rules ?? {});
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
