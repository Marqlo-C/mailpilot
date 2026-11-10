import type {
  BulletVariant,
  ProjectInput,
} from "@/lib/validations/profile.schema";
import {
  cleanProjectUrl,
  getProjectBaseName,
  normalizeProjectName,
  sanitizeBulletText,
} from "@/lib/utils/format";
import {
  calculateJaccardSimilarity,
  calculateOverlapCoefficient,
  classifyBulletTypologies,
  computeBulletDensity,
  hasThematicOverlap,
  normalizeString,
  resolveBestProjectTitle,
  tokenizeThematicWords,
} from "./token-similarity";

export const MAX_PRIMARY_PROJECT_BULLETS = 15;

/**
 * 4-Signal Project Similarity Engine ($S \in [0.0, 1.0]$)
 */
export function calculateProjectSimilarity(
  a: Partial<ProjectInput> & { name: string },
  b: Partial<ProjectInput> & { name: string }
): { score: number; isMatch: boolean; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const urlA = a.link ? cleanProjectUrl(a.link).toLowerCase() : "";
  const urlB = b.link ? cleanProjectUrl(b.link).toLowerCase() : "";
  const urlMatch = Boolean(urlA && urlB && urlA === urlB);
  if (urlMatch) {
    score += 0.50;
    reasons.push("Exact repo URL match");
  }

  const baseA = normalizeString(getProjectBaseName(a.name));
  const baseB = normalizeString(getProjectBaseName(b.name));
  const baseMatch = Boolean(baseA && baseB && baseA === baseB && baseA.length >= 3);
  let basePrefixMatch = false;
  if (baseMatch) {
    score += 0.50;
    reasons.push(`Base name match (${baseA})`);
  } else if (baseA && baseB && baseA.length >= 4 && baseB.length >= 4) {
    if (baseA.startsWith(baseB) || baseB.startsWith(baseA)) {
      basePrefixMatch = true;
      score += 0.40;
      reasons.push(`Base name root prefix match (${baseA.slice(0, 8)})`);
    }
  }

  const nameNormA = normalizeString(a.name);
  const nameNormB = normalizeString(b.name);
  if (nameNormA && nameNormB && nameNormA === nameNormB) {
    score += 0.50;
    reasons.push("Exact normalized name match");
  }

  const tokensA = tokenizeThematicWords(a.name);
  const tokensB = tokenizeThematicWords(b.name);
  const tokenJaccard = calculateJaccardSimilarity(tokensA, tokensB);
  const tokenOverlap = calculateOverlapCoefficient(tokensA, tokensB);
  const compositeTokenScore = Math.max(tokenJaccard, tokenOverlap * 0.85);

  if (compositeTokenScore > 0) {
    score += compositeTokenScore * 0.35;
    reasons.push(`Token similarity (${(compositeTokenScore * 100).toFixed(0)}%)`);
  }

  const firstWordA = Array.from(tokensA)[0];
  const firstWordB = Array.from(tokensB)[0];
  const leadingRootMatch = Boolean(
    firstWordA && firstWordB && firstWordA === firstWordB && firstWordA.length >= 4
  );
  if (leadingRootMatch && !baseMatch && score < 0.85) {
    score += 0.25;
    reasons.push(`Leading anchor token match (${firstWordA})`);
  }

  const techA = new Set((a.technologies || []).map((t) => normalizeString(t)).filter(Boolean));
  const techB = new Set((b.technologies || []).map((t) => normalizeString(t)).filter(Boolean));
  let hasStackContradiction = false;
  if (techA.size > 0 && techB.size > 0) {
    const techJaccard = calculateJaccardSimilarity(techA, techB);
    if (techJaccard > 0) {
      score += techJaccard * 0.20;
      reasons.push(`Stack overlap (${(techJaccard * 100).toFixed(0)}%)`);
    } else if (techA.size >= 2 && techB.size >= 2) {
      score -= 0.35;
      hasStackContradiction = true;
      reasons.push("Disjoint stack contradiction penalty");
    }
  }

  const hasSharedNameToken =
    tokenJaccard > 0 ||
    tokenOverlap > 0 ||
    (tokensA.size > 0 && Array.from(tokensB).some((t) => tokensA.has(t)));
  if ((score >= 0.20 || hasSharedNameToken) && score < 0.65) {
    let sharedSubsystem = false;
    for (const bA of a.bullets || []) {
      for (const bB of b.bullets || []) {
        if (hasThematicOverlap(bA, bB, 0.40)) {
          sharedSubsystem = true;
          break;
        }
      }
      if (sharedSubsystem) break;
    }
    if (sharedSubsystem) {
      score += 0.45;
      reasons.push("Subsystem bullet probe confirmed match");
    }
  }

  const isMatch =
    !hasStackContradiction &&
    (score >= 0.50 ||
      (baseMatch && score >= 0.40) ||
      (basePrefixMatch && score >= 0.45) ||
      (leadingRootMatch && tokenOverlap >= 0.50) ||
      (urlMatch && (baseMatch || score >= 0.40)));
  return {
    score: Math.max(0, Math.min(1.0, score)),
    isMatch,
    reason: reasons.join("; ") || "Insufficient similarity",
  };
}

/**
 * Reconciles primary bullets and variant revisions for matching projects.
 */
export function reconcileProjectBullets(
  primaryBullets: string[],
  incomingBullets: string[],
  primaryVariants: BulletVariant[] = [],
  incomingVariants: BulletVariant[] = [],
  primaryOrigin?: string,
  incomingOrigin?: string,
  primaryBulletOrigins?: Record<string, string>,
  incomingBulletOrigins?: Record<string, string>
): {
  bullets: string[];
  variants: BulletVariant[];
  bulletOrigins: Record<string, string>;
} {
  const getBulletOrigin = (
    bullet: string,
    explicitOrigins?: Record<string, string>,
    fallbackOrigin?: string
  ): "HUMAN_VERIFIED" | "GITHUB_INFERRED" => {
    const found = explicitOrigins?.[bullet];
    if (found === "GITHUB_INFERRED" || found === "HUMAN_VERIFIED") {
      return found;
    }
    return fallbackOrigin === "GITHUB_INFERRED" ? "GITHUB_INFERRED" : "HUMAN_VERIFIED";
  };

  const isPrimaryAllInferred =
    primaryOrigin === "GITHUB_INFERRED" &&
    primaryBullets.every(
      (b) => getBulletOrigin(b, primaryBulletOrigins, primaryOrigin) === "GITHUB_INFERRED"
    );

  const isIncomingAllInferred =
    incomingOrigin === "GITHUB_INFERRED" &&
    incomingBullets.every(
      (b) => getBulletOrigin(b, incomingBulletOrigins, incomingOrigin) === "GITHUB_INFERRED"
    );

  if (isPrimaryAllInferred && isIncomingAllInferred && incomingBullets.length > 0) {
    const refreshedBullets = incomingBullets.slice(0, MAX_PRIMARY_PROJECT_BULLETS);
    const refreshedOrigins: Record<string, string> = {};
    for (const b of refreshedBullets) {
      refreshedOrigins[b] = "GITHUB_INFERRED";
    }
    return {
      bullets: refreshedBullets,
      variants: [...primaryVariants, ...incomingVariants],
      bulletOrigins: refreshedOrigins,
    };
  }

  const resultBullets: string[] = [...primaryBullets];
  const resultVariants: BulletVariant[] = [...primaryVariants, ...incomingVariants];
  const resultOrigins: Record<string, string> = { ...(primaryBulletOrigins || {}) };

  for (const b of primaryBullets) {
    if (typeof b === "string" && b && !resultOrigins[b]) {
      resultOrigins[b] = getBulletOrigin(b, primaryBulletOrigins, primaryOrigin);
    }
  }

  for (const incBullet of incomingBullets) {
    const trimmedInc = incBullet.trim();
    if (!trimmedInc) continue;

    const incOrigin = getBulletOrigin(trimmedInc, incomingBulletOrigins, incomingOrigin);

    const exactIndex = resultBullets.findIndex(
      (b) => normalizeString(b) === normalizeString(trimmedInc)
    );
    if (exactIndex >= 0) {
      const existingExact = resultBullets[exactIndex]!;
      if (incOrigin === "HUMAN_VERIFIED" && resultOrigins[existingExact] !== "HUMAN_VERIFIED") {
        resultOrigins[existingExact] = "HUMAN_VERIFIED";
      }
      continue;
    }

    const isVariantExact = resultVariants.some(
      (v) => normalizeString(v.text) === normalizeString(trimmedInc)
    );
    if (isVariantExact) continue;

    let overlappingIndex = -1;
    let highestOverlap = 0;
    const incTokens = tokenizeThematicWords(trimmedInc);

    for (let i = 0; i < resultBullets.length; i++) {
      const bTokens = tokenizeThematicWords(resultBullets[i]!);
      const ov = calculateOverlapCoefficient(bTokens, incTokens);
      if (ov >= 0.50 && ov > highestOverlap) {
        highestOverlap = ov;
        overlappingIndex = i;
      }
    }

    if (overlappingIndex >= 0) {
      const existingAnchor = resultBullets[overlappingIndex]!;
      const anchorOrigin =
        resultOrigins[existingAnchor] ||
        getBulletOrigin(existingAnchor, primaryBulletOrigins, primaryOrigin);

      const dynamicScore = Math.min(1.0, Math.max(0.50, Number(highestOverlap.toFixed(2))));

      if (anchorOrigin === "HUMAN_VERIFIED" && incOrigin === "HUMAN_VERIFIED") {
        if (highestOverlap >= 0.60) {
          resultBullets[overlappingIndex] = trimmedInc;
          resultOrigins[trimmedInc] = "HUMAN_VERIFIED";
          delete resultOrigins[existingAnchor];

          for (const v of resultVariants) {
            if (v.shadowOf === existingAnchor) {
              v.shadowOf = trimmedInc;
            }
          }

          resultVariants.push({
            id: `rev-human-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: existingAnchor,
            origin: "HUMAN_VERIFIED",
            typologies: classifyBulletTypologies(existingAnchor),
            confidenceScore: 1.0,
            shadowOf: trimmedInc,
            supersededAt: new Date().toISOString(),
            status: "ARCHIVED_REVISION",
          });
        } else {
          if (resultBullets.length < MAX_PRIMARY_PROJECT_BULLETS) {
            resultBullets.push(trimmedInc);
            resultOrigins[trimmedInc] = "HUMAN_VERIFIED";
          } else {
            resultVariants.push({
              id: `var-prim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              text: trimmedInc,
              origin: "HUMAN_VERIFIED",
              typologies: classifyBulletTypologies(trimmedInc),
              confidenceScore: 1.0,
              status: "ACTIVE_VARIANT",
            });
          }
        }
      } else if (anchorOrigin === "HUMAN_VERIFIED" && incOrigin === "GITHUB_INFERRED") {
        resultVariants.push({
          id: `var-inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: trimmedInc,
          origin: "GITHUB_INFERRED",
          typologies: classifyBulletTypologies(trimmedInc),
          confidenceScore: dynamicScore,
          shadowOf: existingAnchor,
          status: "ACTIVE_VARIANT",
        });
      } else if (anchorOrigin === "GITHUB_INFERRED" && incOrigin === "HUMAN_VERIFIED") {
        resultBullets[overlappingIndex] = trimmedInc;
        resultOrigins[trimmedInc] = "HUMAN_VERIFIED";
        delete resultOrigins[existingAnchor];

        for (const v of resultVariants) {
          if (v.shadowOf === existingAnchor) {
            v.shadowOf = trimmedInc;
          }
        }

        resultVariants.push({
          id: `var-inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: existingAnchor,
          origin: "GITHUB_INFERRED",
          typologies: classifyBulletTypologies(existingAnchor),
          confidenceScore: dynamicScore,
          shadowOf: trimmedInc,
          status: "ACTIVE_VARIANT",
        });
      } else {
        const existingDensity = computeBulletDensity(existingAnchor);
        const incDensity = computeBulletDensity(trimmedInc);
        const incIsBetter =
          incDensity > existingDensity ||
          (incDensity === existingDensity && trimmedInc.length > existingAnchor.length);

        if (incIsBetter) {
          resultBullets[overlappingIndex] = trimmedInc;
          resultOrigins[trimmedInc] = "GITHUB_INFERRED";
          delete resultOrigins[existingAnchor];

          for (const v of resultVariants) {
            if (v.shadowOf === existingAnchor) {
              v.shadowOf = trimmedInc;
            }
          }

          resultVariants.push({
            id: `var-inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: existingAnchor,
            origin: "GITHUB_INFERRED",
            typologies: classifyBulletTypologies(existingAnchor),
            confidenceScore: dynamicScore,
            shadowOf: trimmedInc,
            status: "ACTIVE_VARIANT",
          });
        } else {
          resultVariants.push({
            id: `var-inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: trimmedInc,
            origin: "GITHUB_INFERRED",
            typologies: classifyBulletTypologies(trimmedInc),
            confidenceScore: dynamicScore,
            shadowOf: existingAnchor,
            status: "ACTIVE_VARIANT",
          });
        }
      }
    } else {
      if (resultBullets.length < MAX_PRIMARY_PROJECT_BULLETS) {
        resultBullets.push(trimmedInc);
        resultOrigins[trimmedInc] = incOrigin;
      } else {
        resultVariants.push({
          id: `var-overflow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: trimmedInc,
          origin: incOrigin,
          typologies: classifyBulletTypologies(trimmedInc),
          confidenceScore: 0.80,
          status: "ACTIVE_VARIANT",
        });
      }
    }
  }

  return {
    bullets: resultBullets.slice(0, MAX_PRIMARY_PROJECT_BULLETS),
    variants: resultVariants,
    bulletOrigins: resultOrigins,
  };
}

export function reconcileProjectPair(
  target: ProjectInput,
  incoming: ProjectInput
): ProjectInput {
  const bestTitle = resolveBestProjectTitle(
    target.name,
    incoming.name,
    { origin: target.origin, description: target.description },
    { origin: incoming.origin, description: incoming.description }
  );

  const finalDesc =
    (target.origin === "HUMAN_VERIFIED" ? target.description : null) ||
    incoming.description ||
    target.description ||
    "";

  const techMap = new Map<string, string>();
  for (const t of [...(target.technologies || []), ...(incoming.technologies || [])]) {
    const key = normalizeString(t);
    if (key && !techMap.has(key)) techMap.set(key, t.trim());
  }

  const link = target.link || incoming.link || null;

  const finalDescNorm = normalizeString(finalDesc);
  const isDescriptionBullet = (bullet: string) => {
    if (!finalDescNorm) return false;
    const bNorm = normalizeString(bullet);
    return (
      bNorm === finalDescNorm ||
      (finalDescNorm.length >= 10 && bNorm.startsWith(finalDescNorm))
    );
  };

  const bulletResolution = reconcileProjectBullets(
    target.bullets || [],
    incoming.bullets || [],
    target.variants || [],
    incoming.variants || [],
    target.origin,
    incoming.origin,
    target.bulletOrigins,
    incoming.bulletOrigins
  );

  const cleanBullets = bulletResolution.bullets
    .map(sanitizeBulletText)
    .filter((b) => !isDescriptionBullet(b));

  const bulletOrigins = bulletResolution.bulletOrigins;

  const hasHumanBullet =
    cleanBullets.some((b) => bulletOrigins[b] === "HUMAN_VERIFIED") ||
    target.origin === "HUMAN_VERIFIED" ||
    incoming.origin === "HUMAN_VERIFIED";

  const origin: ProjectInput["origin"] = hasHumanBullet
    ? "HUMAN_VERIFIED"
    : "GITHUB_INFERRED";

  return {
    id: target.id || incoming.id,
    name: bestTitle,
    description: finalDesc,
    technologies: Array.from(techMap.values()),
    link,
    bullets: cleanBullets,
    bulletOrigins,
    variants: bulletResolution.variants,
    origin,
  };
}

export function deduplicateProjectCollection(
  projects: ProjectInput[],
  options?: { preserveRawNames?: boolean }
): ProjectInput[] {
  const consolidated: ProjectInput[] = [];

  for (const proj of projects) {
    if (!proj.name || !proj.name.trim()) continue;

    const matchIndex = consolidated.findIndex((existing) => {
      const similarity = calculateProjectSimilarity(existing, proj);
      return similarity.isMatch;
    });

    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileProjectPair(consolidated[matchIndex]!, proj);
    } else {
      const cleanName = options?.preserveRawNames
        ? proj.name
        : normalizeProjectName(proj.name);
      const descNorm = normalizeString(proj.description);
      const filteredBullets = (proj.bullets || [])
        .map(sanitizeBulletText)
        .filter((b) => {
          if (!descNorm) return true;
          const bNorm = normalizeString(b);
          return (
            bNorm !== descNorm &&
            !(descNorm.length >= 10 && bNorm.startsWith(descNorm))
          );
        })
        .slice(0, MAX_PRIMARY_PROJECT_BULLETS);

      const bulletOrigins: Record<string, string> = {
        ...(proj.bulletOrigins || {}),
      };
      for (const b of filteredBullets) {
        if (!bulletOrigins[b]) {
          bulletOrigins[b] = proj.origin || "HUMAN_VERIFIED";
        }
      }

      const projOrigin = proj.origin || "HUMAN_VERIFIED";
      consolidated.push({
        ...proj,
        name: cleanName,
        origin: projOrigin,
        bullets: filteredBullets,
        bulletOrigins,
        variants: proj.variants || [],
      });
    }
  }

  return consolidated.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );
}
