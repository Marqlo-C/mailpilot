import { z } from "zod";

/**
 * Single Source of Truth (SSOT): Subscription Domain Validation Schemas.
 */

export const cleanupActionSchema = z.enum(["NONE", "TRASH", "ARCHIVE"]);
export type CleanupAction = z.infer<typeof cleanupActionSchema>;

export const subscriptionSenderSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  senderEmail: z.string().email().or(z.string().min(3)),
});
export type SubscriptionSenderInput = z.infer<typeof subscriptionSenderSchema>;

export const subscriptionDigestCreateSchema = z.object({
  senderEmails: z.array(z.string().email()).min(1).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SubscriptionDigestCreateInput = z.infer<typeof subscriptionDigestCreateSchema>;

export const subscriptionDigestDeleteSchema = z.object({
  subscriptionIds: z.array(z.string().min(1)).min(1).max(100),
});
export type SubscriptionDigestDeleteInput = z.infer<typeof subscriptionDigestDeleteSchema>;
