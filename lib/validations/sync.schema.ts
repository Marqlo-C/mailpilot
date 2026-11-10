import { z } from "zod";

export const scanDaysSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(30),
]);
export type ScanDays = z.infer<typeof scanDaysSchema>;

export const scanInputSchema = z.object({
  accountId: z.string().min(1),
  days: scanDaysSchema,
});
export type ScanInput = z.infer<typeof scanInputSchema>;

export const syncInputSchema = z.object({
  forceRescan: z.boolean().default(false),
  lookbackDays: z.number().int().min(1).max(30).default(14),
  accountId: z.string().min(1).optional(),
});
export type SyncInput = z.infer<typeof syncInputSchema>;

export const drainQueuedSchema = z.object({
  accountId: z.string().min(1).optional(),
});
export type DrainQueuedInput = z.infer<typeof drainQueuedSchema>;
