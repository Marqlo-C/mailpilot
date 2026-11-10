import { z } from "zod";

export const recipientEmailSchema = z.string().trim().email();

export const draftAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(200),
  /** Raw base64 (no data: URL prefix); ~10MB decoded ceiling. */
  base64: z.string().min(1).max(14_000_000),
});
export type DraftAttachment = z.infer<typeof draftAttachmentSchema>;

export const draftAttachmentsSchema = z.array(draftAttachmentSchema).max(10);
export type DraftAttachments = z.infer<typeof draftAttachmentsSchema>;
