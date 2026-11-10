import { z } from "zod";
import { APPLICATION_STATUSES } from "./profile.schema";

/**
 * Single Source of Truth (SSOT): Dispatch & Outbound Application Validation Schemas.
 */

export const dispatchStatusSchema = z.enum(APPLICATION_STATUSES);
export type DispatchStatus = z.infer<typeof dispatchStatusSchema>;

export const saveDraftEditsSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required"),
  body: z.string().trim().min(1, "Body is required"),
  recipientEmail: z.string().trim().email("Invalid recipient email address").optional(),
});
export type SaveDraftEditsInput = z.infer<typeof saveDraftEditsSchema>;
