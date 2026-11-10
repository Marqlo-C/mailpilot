import { z } from "zod";

/**
 * Single Source of Truth (SSOT): Gmail Pub/Sub Webhook Payload Validation.
 */

export const pubSubBodySchema = z.object({
  message: z
    .object({
      data: z.string().optional(),
      messageId: z.string().optional(),
      publishTime: z.string().optional(),
    })
    .optional(),
  subscription: z.string().optional(),
});

export type PubSubBody = z.infer<typeof pubSubBodySchema>;

export const gmailNotificationSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.union([z.string(), z.number()]).transform(String),
});

export type GmailNotification = z.infer<typeof gmailNotificationSchema>;
