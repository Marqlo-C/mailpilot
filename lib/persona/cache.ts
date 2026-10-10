import type { CandidatePersona, SeniorityTier } from "./schema.ssot";
import { SENIORITY_TIERS } from "./schema.ssot";
import type { ProfileWithPersonaCache } from "./lens";
import { synthesizeCandidatePersona } from "./synthesize";

/** Minimal Prisma-like client used for lazy persona write-back. */
export type PersonaDbClient = {
  userProfile: {
    update: (args: {
      where: { accountId: string };
      data: {
        seniorityTier: string;
        timelineContext: string;
        toneGuidance: string;
      };
    }) => Promise<unknown>;
  };
};

/** True when cached prose still contains literal decimal tenure readouts. */
export function hasRoboticDecimalYears(text: string): boolean {
  return (
    /\d+\.\d+\s*(?:years?|y)\b/i.test(text) || /~\d+\.\d+y\b/i.test(text)
  );
}

/**
 * Persist synthesized persona fields to UserProfile so subsequent calls skip recomputation.
 */
export async function persistPersonaCache(
  profile: ProfileWithPersonaCache,
  persona: CandidatePersona,
  dbClient?: PersonaDbClient | null
): Promise<void> {
  const accountId = profile.accountId?.trim();
  if (!dbClient || !accountId) return;

  try {
    await dbClient.userProfile.update({
      where: { accountId },
      data: {
        seniorityTier: persona.seniorityTier,
        timelineContext: persona.timelineContext,
        toneGuidance: persona.toneGuidance,
      },
    });
  } catch (error) {
    console.warn(
      "[persona] Failed to persist synthesized persona cache",
      error
    );
  }
}

/**
 * Prefer DB-cached persona fields when present; otherwise synthesize from resume
 * data and persist them on UserProfile so the next draft skips recomputation.
 *
 * Cache hit requires valid seniorityTier and toneGuidance.
 * Missing/null fields or detected decimal tenure strings trigger synthesize + write-back.
 */
export async function getCachedOrSynthesizePersona(
  profile: ProfileWithPersonaCache,
  dbClient?: PersonaDbClient | null
): Promise<CandidatePersona> {
  const tier = profile.seniorityTier?.trim() ?? "";
  const tone = profile.toneGuidance?.trim() ?? "";
  const timeline = profile.timelineContext?.trim() ?? "";
  const cacheHit =
    Boolean(tier) &&
    Boolean(tone) &&
    SENIORITY_TIERS.includes(tier as SeniorityTier);

  if (cacheHit) {
    const staleDecimals =
      hasRoboticDecimalYears(tone) || hasRoboticDecimalYears(timeline);

    // Refresh when timeline is missing OR cached prose still has decimal tenure.
    if (!timeline || staleDecimals) {
      const synthesized = synthesizeCandidatePersona(profile);
      await persistPersonaCache(profile, synthesized, dbClient);
      return synthesized;
    }

    // Retain cached prompt text & tier, deriving missing multidimensional attributes deterministically
    const base = synthesizeCandidatePersona(profile);
    return {
      ...base,
      seniorityTier: tier as SeniorityTier,
      timelineContext: timeline,
      toneGuidance: tone,
    };
  }

  const persona = synthesizeCandidatePersona(profile);
  await persistPersonaCache(profile, persona, dbClient);
  return persona;
}
