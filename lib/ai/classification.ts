import {
  buildClassifierUserPrompt,
  buildProfileAwareClassifierSystemPrompt,
  ensureCandidateProfileForScoring,
  type CandidateProfileSummary,
} from "./classifier";
import { shouldClassifyEmail } from "./prefilter";
import { cleanEmailPayload } from "./email-cleaner";
import { type AccountRules } from "@/lib/validations/rules.schema";
import { callLLMWithFallback, MissingLlmKeyError } from "./dispatcher";
import { type LlmProvider } from "./provider.schema";
import {
  OllamaUnreachableError,
  OllamaInvalidJsonError,
} from "./local-ollama";
import { CloudLlmRateLimitError } from "./client";
import { resolveProviderScopedCloudModel } from "./vault";
import {
  extractedJobSchema,
  type ExtractedJob,
  jobClassificationSchema,
  type JobClassification,
} from "@/lib/validations/classification.schema";
import {
  isValidEmployerName,
  isValidRoleTitle,
  sanitizeRoleTitle,
  loadCandidateProfileSummary,
  coerceClassificationPayload,
  normalizeClassification,
} from "./classification-helpers";
import {
  extractMessageBody,
  extractMessageHtml,
} from "@/lib/gmail/message-parser";

export {
  extractedJobSchema,
  type ExtractedJob,
  jobClassificationSchema,
  type JobClassification,
  isValidEmployerName,
  isValidRoleTitle,
  sanitizeRoleTitle,
  loadCandidateProfileSummary,
  coerceClassificationPayload,
  normalizeClassification,
  extractMessageBody,
  extractMessageHtml,
};

export type ClassifyOptions = {
  subject: string;
  body: string;
  fromEmail?: string | null;
  fromName?: string | null;
  candidateProfile?: CandidateProfileSummary | null;
  llmProvider?: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  devModelOverride?: string | null;
  /** Account rule: allow cloud when local Ollama fails. */
  allowCloudFallback?: boolean;
  accountId?: string | null;
  accountRules?: Partial<AccountRules> | null;
  cloudModel?: string | null;
  receivedAt?: Date | string | null;
  /** @deprecated Cloud inference targets explicitly configured model directly */
  openRouterModels?: string[];
};

/**
 * Strips HTML/tracking while preserving link destinations for applyUrl extraction.
 * Delegates to cleanEmailPayload for a single minification path.
 */
export function sanitizeEmailBody(raw: string): string {
  return cleanEmailPayload(raw);
}

/**
 * Classifies a job-related email with optional profile-aware match scoring.
 */
export async function classifyJobEmail(
  options: ClassifyOptions
): Promise<JobClassification | null> {
  if (
    !shouldClassifyEmail({
      subject: options.subject,
      body: options.body,
      fromEmail: options.fromEmail,
    })
  ) {
    return null;
  }

  const sanitizedBody = sanitizeEmailBody(options.body).slice(0, 8000);
  const systemPrompt = buildProfileAwareClassifierSystemPrompt(
    ensureCandidateProfileForScoring(options.candidateProfile ?? null)
  );
  const userPrompt = buildClassifierUserPrompt({
    subject: options.subject,
    body: sanitizedBody,
    fromEmail: options.fromEmail,
  });

  const effectiveModel =
    options.cloudModel?.trim() ||
    resolveProviderScopedCloudModel(options.accountRules) ||
    null;

  let result: Record<string, unknown> | null = null;
  let capturedRoutingLines: string[] | undefined;
  let capturedSourceTier:
    | "TIER 1 (OLLAMA)"
    | "TIER 2 (CLOUD)"
    | undefined;

  try {
    result = await callLLMWithFallback({
      systemPrompt,
      userPrompt,
      llmProvider: options.llmProvider,
      localOllamaUrl: options.localOllamaUrl,
      ollamaModel: options.ollamaModel,
      devModelOverride: options.devModelOverride,
      allowCloudFallback: options.allowCloudFallback,
      accountId: options.accountId,
      accountRules: options.accountRules,
      cloudModel: effectiveModel,
    });
    if (result && typeof result === "object") {
      capturedRoutingLines = (result as Record<string, unknown>)
        ._routingLines as string[] | undefined;
      capturedSourceTier = (result as Record<string, unknown>)._sourceTier as
        | "TIER 1 (OLLAMA)"
        | "TIER 2 (CLOUD)"
        | undefined;
    }
  } catch (error) {
    if (error instanceof CloudLlmRateLimitError) {
      if (process.env.DEBUG_VERBOSE) {
        console.warn(
          `[classify] Rate limit encountered on cloud provider: ${error.message}`
        );
      }
      return null;
    }
    if (error instanceof OllamaInvalidJsonError) {
      if (process.env.DEBUG_VERBOSE) {
        console.debug(
          `[classify] Ollama returned invalid JSON: ${error.message}`
        );
      }
      return null;
    }
    if (error instanceof OllamaUnreachableError) {
      if (process.env.DEBUG_VERBOSE) {
        console.debug(
          `[classify] Ollama unreachable at ${error.url} (${error.message})`
        );
      }
      return null;
    }
    if (error instanceof MissingLlmKeyError) {
      if (process.env.DEBUG_VERBOSE) {
        console.debug(
          `[classify] No cloud API key configured for ${error.provider}`
        );
      }
      return null;
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (process.env.DEBUG_VERBOSE === "1") {
      console.warn(`[classify] AI pass failed: ${msg}`);
    }
    return null;
  }

  if (!result) {
    return null;
  }

  try {
    const normalizedPayload = coerceClassificationPayload(result);
    const parsed = jobClassificationSchema.parse(normalizedPayload);
    return normalizeClassification(parsed, {
      subject: options.subject,
      fromEmail: options.fromEmail,
      fromName: options.fromName,
      emailBody: sanitizedBody,
      candidateProfile: options.candidateProfile,
      routingLines: capturedRoutingLines,
      sourceTier: capturedSourceTier,
      receivedAt: options.receivedAt,
    });
  } catch (error) {
    console.warn(
      "Failed to parse job classification JSON",
      (error as Error)?.message || error,
      JSON.stringify(result).slice(0, 300)
    );
    return null;
  }
}

/** Spec alias used by historical scan. */
export const classifyEmail = classifyJobEmail;
