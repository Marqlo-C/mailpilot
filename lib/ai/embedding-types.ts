import type { EmbeddingProviderType } from "@/lib/validations/rules.schema";

export type { EmbeddingProviderType };

/**
 * Normalized task type for embedding requests across multi-provider drivers.
 */
export type EmbeddingTaskType = "query" | "document" | "similarity";

/**
 * Driver configuration for generating vector embeddings.
 */
export interface EmbeddingDriverConfig {
  /** Target provider: "disabled" | "local_ollama" | "openai" | "gemini" | "jina" */
  provider: EmbeddingProviderType;
  /** Model identifier (e.g. "nomic-embed-text", "text-embedding-3-small", "text-embedding-004", "jina-embeddings-v3") */
  model: string;
  /** Optional BYOK decrypted API key for cloud providers */
  apiKey?: string;
  /** Base URL override (e.g. custom Ollama endpoint or OpenAI-compatible proxy) */
  baseUrl?: string;
  /** Optional bearer token for authenticating local Ollama reverse proxy tunnels */
  authToken?: string;
  /** Output vector dimension (for Matryoshka models supporting dimension scaling) */
  dimensions?: number;
  /** Contextual task type for retrieval vs. similarity */
  taskType?: EmbeddingTaskType;
  /** Per-request network timeout in milliseconds (capped at 5,500ms to stay within serverless limits) */
  timeoutMs?: number;
}

/**
 * Grounded transferable skill mapping anchored to a literal excerpt from candidate profile.
 */
export interface TransferableSkillMapping {
  /** Opportunity requirement statement being addressed */
  targetRequirement: string;
  /** ID of the candidate experience record providing the transfer basis */
  sourceExperienceId: string;
  /** Literal substring extracted from the candidate profile text */
  verbatimAnchorText: string;
  /** Cosine similarity score between target requirement and source anchor */
  similarity: number;
  /** Grounded rationale explaining functional transferability across domains */
  transferRationale: string;
}

/**
 * Extracted candidate accomplishment or experience bullet item for vector evaluation.
 */
export interface CandidateAccomplishmentItem {
  /** Unique identifier of the bullet or accomplishment */
  id: string;
  /** ID of the parent experience or project */
  sourceExperienceId: string;
  /** Organization or company name */
  company: string;
  /** Role or job title held */
  role: string;
  /** Resume category heading (e.g. "Work", "Clinical", "Military") */
  category: string;
  /** Sanitized text representation for embedding computation */
  text: string;
  /** Verbatim raw source text for literal anchor substring validation */
  rawBullet: string;
}

/**
 * Options controlling semantic crossover scoring and transferable skills extraction.
 */
export interface SemanticCrossoverOptions {
  /** Similarity threshold to qualify as a transferable skill (0.0 to 1.0, defaults to 0.55) */
  transferableThreshold?: number;
  /** Maximum number of transferable skill mappings to return (defaults to 5) */
  maxTransferableSkills?: number;
  /** Minimum similarity for a requirement to be considered covered (defaults to 0.40) */
  coverageThreshold?: number;
}

/**
 * Result of evaluating an opportunity against candidate profile via embedded vector AI.
 */
export interface EmbeddedEvaluationResult {
  /** Normalized semantic crossover match score (0 - 100) */
  crossoverScore: number;
  /** Grounded transferable skills extracted without hallucination */
  transferableSkills: TransferableSkillMapping[];
  /** Embedding provider that generated the underlying vectors */
  providerUsed: EmbeddingProviderType;
  /** Total evaluation duration in milliseconds */
  latencyMs: number;
  /** Error message if vector generation or evaluation failed */
  error?: string;
}
