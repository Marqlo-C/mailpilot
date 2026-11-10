import { randomUUID } from "crypto";
import type { WorkExperienceInput } from "@/lib/validations/profile.schema";
import {
  areDatePointsCompatible,
  areDateRangesCompatible,
  normalizeDateString,
  resolveGranularDate,
} from "@/lib/utils/date";
import {
  calculateEntitySimilarity,
  calculateOverlapCoefficient,
  classifyBulletTypologies,
  hasThematicOverlap,
  normalizeString,
  tokenizeThematicWords,
} from "./token-similarity";

export const MAX_PRIMARY_EXPERIENCE_BULLETS = 15;

/**
 * Checks whether two work experiences describe the same tenure and role.
 * Accurately prevents merging promotions (distinct roles at the same employer).
 */
export function isWorkExperienceMatch(
  a: Partial<WorkExperienceInput> & { company: string },
  b: Partial<WorkExperienceInput> & { company: string }
): boolean {
  if (!a.company || !b.company) return false;

  const catA = (a.category || "Work").toLowerCase();
  const catB = (b.category || "Work").toLowerCase();
  if (catA !== catB) return false;

  const compSim = calculateEntitySimilarity(a.company, b.company);
  if (!compSim.isMatch) return false;

  const rangeA = { start: a.startDate, end: a.endDate };
  const rangeB = { start: b.startDate, end: b.endDate };
  if (!areDateRangesCompatible(rangeA, rangeB)) {
    return false;
  }

  const startA = a.startDate?.trim() || "";
  const startB = b.startDate?.trim() || "";
  if (startA && startB && !areDatePointsCompatible(startA, startB)) {
    return false;
  }

  const roleA = normalizeString(a.role);
  const roleB = normalizeString(b.role);
  if (roleA && roleB && roleA === roleB) return true;

  if (a.role && b.role) {
    const roleSim = calculateEntitySimilarity(a.role, b.role);
    if (roleSim.isMatch && roleSim.overlap >= 0.70) {
      return true;
    }
  }

  if (a.bullets?.length && b.bullets?.length) {
    for (const bA of a.bullets) {
      const textA = typeof bA === "string" ? bA : bA.rawText;
      for (const bB of b.bullets) {
        const textB = typeof bB === "string" ? bB : bB.rawText;
        if (hasThematicOverlap(textA, textB, 0.40)) {
          return true;
        }
      }
    }
  }

  if (!roleA || !roleB || roleA.includes(roleB) || roleB.includes(roleA)) {
    return true;
  }

  return false;
}

/**
 * Reconciles two matching work experiences without dropping bullets.
 */
export function reconcileWorkExperiencePair(
  target: WorkExperienceInput,
  incoming: WorkExperienceInput
): WorkExperienceInput {
  const existingBulletMap = new Map<string, typeof target.bullets[number]>();
  for (const b of target.bullets) {
    existingBulletMap.set(normalizeString(b.rawText), b);
  }

  const mergedBullets = [...target.bullets];

  for (const incBullet of incoming.bullets) {
    const norm = normalizeString(incBullet.rawText);
    if (!norm) continue;

    const existingMatch = existingBulletMap.get(norm);
    if (!existingMatch) {
      let overlapIndex = -1;
      let highestOverlap = 0;
      const incTokens = tokenizeThematicWords(incBullet.rawText);

      for (let i = 0; i < mergedBullets.length; i++) {
        const bTokens = tokenizeThematicWords(mergedBullets[i]!.rawText);
        const ov = calculateOverlapCoefficient(bTokens, incTokens);
        if (ov >= 0.40 && ov > highestOverlap) {
          highestOverlap = ov;
          overlapIndex = i;
        }
      }

      if (overlapIndex >= 0) {
        const oldBullet = mergedBullets[overlapIndex]!;
        const idClash = mergedBullets.some((b, idx) => idx !== overlapIndex && b.id === incBullet.id);
        const resolvedId = idClash
          ? `exp-b-${randomUUID().slice(0, 8)}`
          : incBullet.id;

        mergedBullets[overlapIndex] = {
          ...incBullet,
          id: resolvedId,
          typologies: incBullet.typologies?.length
            ? incBullet.typologies
            : classifyBulletTypologies(incBullet.rawText),
          variants: [
            ...(oldBullet.variants || []),
            {
              id: `rev-exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              text: oldBullet.rawText,
              origin: "HUMAN_VERIFIED",
              typologies: oldBullet.typologies?.length
                ? oldBullet.typologies
                : classifyBulletTypologies(oldBullet.rawText),
              confidenceScore: 1.0,
              supersededAt: new Date().toISOString(),
              status: "ARCHIVED_REVISION",
            },
          ],
        };
      } else if (mergedBullets.length < MAX_PRIMARY_EXPERIENCE_BULLETS) {
        const idClash = mergedBullets.some((b) => b.id === incBullet.id);
        const resolvedId = idClash
          ? `exp-b-${randomUUID().slice(0, 8)}`
          : incBullet.id;

        mergedBullets.push({
          ...incBullet,
          id: resolvedId,
          typologies: incBullet.typologies?.length
            ? incBullet.typologies
            : classifyBulletTypologies(incBullet.rawText),
        });
      }
    }
  }

  return {
    ...target,
    role: target.role || incoming.role,
    location: target.location || incoming.location || null,
    category: target.category || incoming.category || "Work",
    startDate:
      resolveGranularDate(target.startDate, incoming.startDate) ||
      target.startDate ||
      incoming.startDate ||
      "Present",
    endDate: resolveGranularDate(target.endDate, incoming.endDate),
    bullets: mergedBullets.slice(0, MAX_PRIMARY_EXPERIENCE_BULLETS),
  };
}

/**
 * Universally deduplicates a collection of work experiences.
 */
export function deduplicateWorkExperienceCollection(
  experiences: WorkExperienceInput[]
): WorkExperienceInput[] {
  const consolidated: WorkExperienceInput[] = [];

  for (const exp of experiences) {
    if (!exp.company || !exp.company.trim()) continue;

    const matchIndex = consolidated.findIndex((existing) =>
      isWorkExperienceMatch(existing, exp)
    );

    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileWorkExperiencePair(
        consolidated[matchIndex]!,
        exp
      );
    } else {
      consolidated.push({
        ...exp,
        startDate: normalizeDateString(exp.startDate) || exp.startDate,
        endDate: normalizeDateString(exp.endDate) ?? exp.endDate,
        bullets: exp.bullets.map((b) => ({
          ...b,
          typologies: b.typologies?.length
            ? b.typologies
            : classifyBulletTypologies(b.rawText),
        })),
      });
    }
  }

  return consolidated;
}
