import { z } from "zod";
import { cloudProviderSchema } from "@/lib/llm/provider.ssot";

export const updateCustomLlmKeyInputSchema = z.object({
  provider: cloudProviderSchema,
  model: z.string().nullish(),
  apiKey: z.string().min(1, "API key cannot be empty"),
});

export type UpdateCustomLlmKeyInput = z.infer<
  typeof updateCustomLlmKeyInputSchema
>;
