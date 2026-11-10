import { z } from "zod";
import { cloudProviderSchema } from "@/lib/ai/provider.schema";

export const updateCustomLlmKeyInputSchema = z.object({
  provider: cloudProviderSchema,
  model: z.string().nullish(),
  apiKey: z.string().min(1, "API key cannot be empty"),
});

export type UpdateCustomLlmKeyInput = z.infer<
  typeof updateCustomLlmKeyInputSchema
>;

export const bridgeBodySchema = z.object({
  email: z.string().email(),
  ollamaUrl: z.string().url().optional(),
  action: z.enum(["disconnect"]).optional(),
  bridgeSecret: z.string().min(1, "bridgeSecret is required"),
  /**
   * Model tags from the bridge CLI probing localhost Ollama.
   * Trusted when bridgeSecret matches — avoids relying on Vercel→Cloudflare.
   */
  models: z.array(z.string().min(1)).optional(),
});

export type BridgeBodyInput = z.infer<typeof bridgeBodySchema>;
