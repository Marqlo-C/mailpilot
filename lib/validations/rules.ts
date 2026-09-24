import { z } from "zod";

export const accountRulesSchema = z.object({
  rejectionMode: z.enum(["LABEL_ONLY", "AUTO_TRASH"]).default("LABEL_ONLY"),
  rejectionLabelName: z.string().default("Job Search/Rejections"),
  rejectionLabelId: z.string().nullable().default(null),
  autoCleanAfterUnsub: z.enum(["NONE", "TRASH", "ARCHIVE"]).default("NONE"),
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
