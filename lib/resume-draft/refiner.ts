import { callLLMWithFallback, type LlmProvider } from "@/lib/llm";
import type { AccountRules } from "@/lib/validations/rules";
import {
  refineLineSchema,
  type RefineLinePayload,
} from "./schema.ssot";

export { refineLineSchema };
export type { RefineLinePayload };

/**
 * Rewrite one node. The model only sees that line plus the instruction.
 */
export async function refineResumeLine(input: {
  content: string;
  instruction: string;
  llmProvider: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  allowCloudFallback?: boolean;
  accountId?: string | null;
  accountRules?: Partial<AccountRules> | null;
}): Promise<string> {
  const instruction = input.instruction.trim();
  if (!instruction) {
    throw new Error("Refinement instruction is required");
  }
  const result = await callLLMWithFallback({
    llmProvider: input.llmProvider,
    localOllamaUrl: input.localOllamaUrl,
    ollamaModel: input.ollamaModel,
    allowCloudFallback: input.allowCloudFallback,
    accountId: input.accountId,
    accountRules: input.accountRules,
    systemPrompt:
      "You edit one resume line. Return JSON {\"content\":\"...\"} containing only the rewritten line. Do not add bullets, headings, or extra sentences.",
    userPrompt: `Instruction: ${instruction}\nLine: ${input.content}`,
  });
  const parsed = refineLineSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error("The model did not return a single rewritten line");
  }
  return parsed.data.content.trim();
}
