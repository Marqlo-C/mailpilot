import { callLLMWithFallback } from "@/lib/llm";
import {
  computeProfileDiff,
  isEmptyProfileDiff,
  structuralRevisionTitle,
  type ProfileDiffSummary,
} from "@/lib/profile/revision-diff";
import type {
  MasterProfileInput,
  MasterProfileUpdateInput,
} from "@/lib/validations/profile";

type NamedProfile = MasterProfileInput | MasterProfileUpdateInput;

const FAST_REVISION_MODELS = [
  process.env.OPENROUTER_MODEL,
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
].filter((model): model is string => Boolean(model?.trim()));

const TITLE_PROMPT = `Name one profile revision from the change list.
Use only names that appear in that list.
Write 4-8 words describing what was added, updated, or removed.
Return JSON {"title":"..."} and nothing else.`;

function readTitle(payload: Record<string, unknown> | null): string {
  const raw = payload?.title;
  if (typeof raw !== "string") return "";
  return raw.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
}

async function titleFromDiff(diff: ProfileDiffSummary): Promise<string> {
  const payload = await callLLMWithFallback({
    systemPrompt: TITLE_PROMPT,
    userPrompt: JSON.stringify(diff),
    llmProvider: "OPENROUTER",
    openRouterModels: FAST_REVISION_MODELS,
  });
  return readTitle(payload);
}

/**
 * Human title for a save. First import and empty diffs skip the model.
 * The timestamp stays on the history row; the baseline fallback includes an ISO time.
 */
export async function nameProfileRevision(
  previous: NamedProfile | null,
  next: NamedProfile,
  at: Date = new Date()
): Promise<string> {
  if (!previous) return "Initial Profile Import";
  const diff = computeProfileDiff(previous, next);
  if (isEmptyProfileDiff(diff)) return `Profile Baseline (${at.toISOString()})`;
  try {
    const titled = await titleFromDiff(diff);
    if (titled) return titled;
  } catch (error) {
    console.warn("Revision naming failed", error);
  }
  return structuralRevisionTitle(diff);
}
