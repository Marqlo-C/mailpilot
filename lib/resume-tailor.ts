/**
 * Resume Tailoring & Ranking Engine (Backward Compatibility Barrel)
 *
 * This module re-exports the modular, decoupled tailoring sub-system from '@/lib/tailor'.
 * Sub-modules:
 * - schema.ssot.ts: Standardized contracts (JobTargetContext, HierarchicalProfileTree, TailorResult)
 * - tree.ts: Deterministic parent-child key addressing & hydration (zero stranding/mismatching)
 * - distiller.ts: Upstream job description distillation & token extraction
 * - ranker.ts: Hierarchical co-ranker (Entity 1-5 + Bullet 1-5) with heuristic fallback
 * - assembler.ts: Pure TypeScript budget allocator adhering to calculateElasticPageBudget
 * - reframe.ts: Focused Google XYZ reframe engine for surviving bullets
 * - auxiliary.ts: Summary sanitization, verbatim skill reordering, cover letters
 * - email.ts: Recruiter contextual email drafting
 * - legacy.ts: Backward-compatible prompts and schemas for existing test suites
 */

export * from "./tailor";
