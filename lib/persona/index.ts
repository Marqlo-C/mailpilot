/**
 * ============================================================================
 * PERSONA ENGINE - PUBLIC API
 * ============================================================================
 */

export * from "./schema.ssot";
export {
  extractPersonaFacts,
  type ProfileWithPersonaCache,
} from "./lens";
export {
  classifyPersonaMatrix,
  collectRolesFromFacts,
  detectCareerSwitcher,
  groupRoleFamilies,
  parseFlexibleDate,
  roleStems,
  roundYears,
  unionYears,
  yearsBetween,
  type MatrixClassificationResult,
  type RoleFamily,
  type RoleSignal,
} from "./matrix";
export {
  buildTimelineContext,
  composeToneGuidance,
  formatHumanYears,
  type TimelineContextParams,
  type ToneGuidanceParams,
} from "./tone-composer";
export {
  explainCandidatePersona,
  synthesizeCandidatePersona,
} from "./synthesize";
export {
  getCachedOrSynthesizePersona,
  hasRoboticDecimalYears,
  persistPersonaCache,
  type PersonaDbClient,
} from "./cache";
