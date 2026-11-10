/**
 * ============================================================================
 * RESUME DRAFTING & TAILORING DOMAIN MODULE - PUBLIC API
 * 
 * Re-exports the SSOT schema contract, adapter lens, elastic budgeting engine,
 * node operations, composer, and line refiner.
 * ============================================================================
 */

export * from "./schema.ssot";
export * from "./lens";
export * from "./budget";
export * from "./layout.ssot";
export * from "./physics";
export * from "./typography";
export * from "./node-ops";
export * from "./composer";
export * from "./refiner";

export {
  cleanProjectUrl,
  getProjectBaseName,
  isAuthenticContactItem,
  isAuthenticLocation,
  normalizeProjectName,
  sanitizeResumeContactLine,
} from "@/lib/utils/format";
