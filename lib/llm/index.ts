/**
 * ============================================================================
 * MODULAR LLM DOMAIN ENGINE - PUBLIC BARREL
 *
 * Re-exports provider SSOT contracts, BYOK vault utilities, local Ollama
 * adapters, multi-cloud clients, dispatch router, and classification pipeline.
 * ============================================================================
 */

export * from "./provider.ssot";
export * from "./vault";
export * from "./local-ollama";
export * from "./client";
export * from "./dispatcher";
export * from "./classification";

export {
  JOB_EMAIL_KEYWORD_PATTERNS,
  matchesJobEmailKeywords,
  matchesJobSubjectKeywords,
  shouldClassifyEmail,
  looksLikeDigest,
} from "@/lib/ai/prefilter";
