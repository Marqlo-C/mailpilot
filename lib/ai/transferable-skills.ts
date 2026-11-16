/**
 * ============================================================================
 * GROUNDED TRANSFERABLE SKILLS ENGINE
 *
 * Extracts candidate accomplishments, maps cross-domain competencies to job
 * requirements via functional vector similarity, and guarantees 100% verbatim
 * quote anchoring from source profile documents to eliminate hallucinations.
 * ============================================================================
 */

import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import type {
  CandidateAccomplishmentItem,
  TransferableSkillMapping,
} from "./embedding-types";
import { roleStems, stemsOverlap } from "@/lib/persona/matrix";

/**
 * Default cosine similarity threshold for an accomplishment to qualify
 * as a grounded transferable skill mapping across distinct domains.
 */
export const DEFAULT_TRANSFERABLE_THRESHOLD = 0.55;

/** Maximum number of transferable skills returned by default */
export const DEFAULT_MAX_TRANSFERABLE_SKILLS = 5;

/**
 * Extracts candidate accomplishments and experience bullets into normalized vector units.
 * Preserves exact verbatim text for literal anchor validation.
 *
 * @param profile - Master profile input containing experiences, projects, and summary
 * @returns Array of candidate accomplishment items
 */
export function extractCandidateAccomplishments(
  profile: MasterProfileInput
): CandidateAccomplishmentItem[] {
  const items: CandidateAccomplishmentItem[] = [];

  // 1. Extract from professional work experiences
  const experiences = profile.experiences ?? [];
  for (let expIdx = 0; expIdx < experiences.length; expIdx++) {
    const exp = experiences[expIdx];
    const expId = exp.id?.trim() || `exp-${expIdx}`;
    const company = exp.company?.trim() || "Organization";
    const role = exp.role?.trim() || "Professional";
    const category = exp.category?.trim() || "Work";

    const bullets = exp.bullets ?? [];
    for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
      const b = bullets[bIdx];
      const rawText =
        typeof (b as unknown) === "string"
          ? (b as unknown as string).trim()
          : (b.rawText || (b as { text?: string }).text || "").trim();

      if (rawText.length > 0) {
        const bulletId =
          typeof b === "object" && b && "id" in b && b.id
            ? b.id
            : `${expId}-bullet-${bIdx}`;

        items.push({
          id: bulletId,
          sourceExperienceId: expId,
          company,
          role,
          category,
          text: rawText,
          rawBullet: rawText,
        });
      }
    }
  }

  // 2. Extract from candidate projects
  const projects = profile.projects ?? [];
  for (let projIdx = 0; projIdx < projects.length; projIdx++) {
    const proj = projects[projIdx];
    const projId = proj.id?.trim() || `proj-${projIdx}`;
    const name = proj.name?.trim() || "Project";
    const bullets = proj.bullets ?? [];

    for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
      const rawText = (bullets[bIdx] || "").trim();
      if (rawText.length > 0) {
        items.push({
          id: `${projId}-bullet-${bIdx}`,
          sourceExperienceId: projId,
          company: "Independent Project",
          role: name,
          category: "Project",
          text: rawText,
          rawBullet: rawText,
        });
      }
    }

    // Include project description if no bullet points are defined
    if (bullets.length === 0 && proj.description?.trim()) {
      const descText = proj.description.trim();
      items.push({
        id: `${projId}-desc`,
        sourceExperienceId: projId,
        company: "Independent Project",
        role: name,
        category: "Project",
        text: descText,
        rawBullet: descText,
      });
    }
  }

  // 3. Fallback to summary if no experiences or project bullets exist
  if (items.length === 0 && profile.summary?.trim()) {
    const summaryText = profile.summary.trim();
    items.push({
      id: "summary-0",
      sourceExperienceId: "summary",
      company: "Professional Summary",
      role: "Candidate",
      category: "Summary",
      text: summaryText,
      rawBullet: summaryText,
    });
  }

  return items;
}

/**
 * Checks whether an accomplishment comes from a disjoint, non-matching,
 * or previous career domain relative to the target role.
 */
export function isDisjointDomain(
  targetRoleTitle: string | undefined,
  accomplishmentRole: string,
  category: string
): boolean {
  // Non-work categories (Clinical, Military, Athletics, Volunteer) represent disjoint tracks
  if (
    category &&
    category !== "Work" &&
    category !== "Project" &&
    category !== "Summary"
  ) {
    return true;
  }

  if (!targetRoleTitle || !targetRoleTitle.trim()) {
    return false;
  }

  const targetStems = roleStems(targetRoleTitle);
  const expStems = roleStems(accomplishmentRole);

  // If role token stems do not overlap, they belong to disjoint career families
  return !stemsOverlap(targetStems, expStems);
}

/**
 * Extracts a verbatim anchor excerpt from the candidate bullet.
 * Guarantees that the returned string is a 100% literal substring of the source bullet.
 */
export function extractVerbatimAnchorText(
  sourceBullet: string,
  _targetRequirement?: string
): string {
  const trimmed = sourceBullet.trim();
  if (trimmed.length <= 140) {
    return trimmed;
  }

  // Try breaking into clauses or sentences while guaranteeing verbatim substring
  const segments = trimmed
    .split(/(?:;\s*|\.\s+|\s+[-–—]\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25);

  for (const seg of segments) {
    if (trimmed.includes(seg)) {
      return seg;
    }
  }

  // Fallback: take leading natural slice at word boundary
  const sliceCandidate = trimmed.slice(0, 120).replace(/\s+\S*$/, "");
  if (trimmed.includes(sliceCandidate)) {
    return sliceCandidate;
  }

  return trimmed;
}

/**
 * Composes a career-neutral, grounded rationale explaining functional transferability.
 * Zero hardcoded discipline or industry terms.
 */
export function composeTransferRationale(params: {
  sourceRole: string;
  sourceCompany: string;
  targetRequirement: string;
  similarity: number;
}): string {
  const { sourceRole, sourceCompany, targetRequirement, similarity } = params;
  const truncatedReq =
    targetRequirement.length > 75
      ? `${targetRequirement.slice(0, 72).trim()}...`
      : targetRequirement;
  const similarityPct = Math.round(similarity * 100);

  return `Demonstrated competency as ${sourceRole} at ${sourceCompany} applies directly to requirement '${truncatedReq}' (${similarityPct}% functional alignment).`;
}

/**
 * Validates that a transferable skill mapping strictly anchors to a verbatim substring
 * in the candidate's master profile to prevent AI hallucination.
 *
 * @param mapping - Transferable skill mapping to validate
 * @param profile - Source candidate profile
 * @returns True if anchor text is an exact literal substring of the source record
 */
export function validateVerbatimAnchor(
  mapping: TransferableSkillMapping,
  profile: MasterProfileInput
): boolean {
  if (!mapping.verbatimAnchorText || !mapping.sourceExperienceId) {
    return false;
  }

  const anchor = mapping.verbatimAnchorText.trim();
  if (!anchor) {
    return false;
  }

  // 1. Search work experiences
  const experiences = profile.experiences ?? [];
  for (let idx = 0; idx < experiences.length; idx++) {
    const exp = experiences[idx];
    const expId = exp.id?.trim() || `exp-${idx}`;
    if (expId === mapping.sourceExperienceId) {
      for (const b of exp.bullets ?? []) {
        const text =
          typeof b === "string"
            ? b
            : b.rawText || (b as { text?: string }).text || "";
        if (text.includes(anchor)) {
          return true;
        }
      }
    }
  }

  // 2. Search projects
  const projects = profile.projects ?? [];
  for (let idx = 0; idx < projects.length; idx++) {
    const proj = projects[idx];
    const projId = proj.id?.trim() || `proj-${idx}`;
    if (projId === mapping.sourceExperienceId) {
      for (const b of proj.bullets ?? []) {
        if (typeof b === "string" && b.includes(anchor)) {
          return true;
        }
      }
      if (proj.description && proj.description.includes(anchor)) {
        return true;
      }
    }
  }

  // 3. Search summary
  if (
    mapping.sourceExperienceId === "summary" &&
    profile.summary &&
    profile.summary.includes(anchor)
  ) {
    return true;
  }

  return false;
}

interface MatchCandidatePair {
  reqIdx: number;
  accIdx: number;
  similarity: number;
  isDisjoint: boolean;
}

/**
 * Maps grounded transferable skills from candidate accomplishments to job requirements
 * based on functional vector similarity and cross-domain differentiation.
 */
export function mapTransferableSkills(params: {
  requirements: string[];
  accomplishments: CandidateAccomplishmentItem[];
  similarityMatrix: number[][];
  targetRoleTitle?: string;
  threshold?: number;
  maxResults?: number;
}): TransferableSkillMapping[] {
  const {
    requirements,
    accomplishments,
    similarityMatrix,
    targetRoleTitle,
    threshold = DEFAULT_TRANSFERABLE_THRESHOLD,
    maxResults = DEFAULT_MAX_TRANSFERABLE_SKILLS,
  } = params;

  if (
    requirements.length === 0 ||
    accomplishments.length === 0 ||
    similarityMatrix.length === 0
  ) {
    return [];
  }

  const candidatePairs: MatchCandidatePair[] = [];

  for (let r = 0; r < requirements.length; r++) {
    const row = similarityMatrix[r];
    if (!row) continue;

    for (let a = 0; a < accomplishments.length; a++) {
      const sim = row[a] ?? 0;
      if (sim >= threshold) {
        const acc = accomplishments[a];
        const isDisjoint = isDisjointDomain(
          targetRoleTitle,
          acc.role,
          acc.category
        );

        candidatePairs.push({
          reqIdx: r,
          accIdx: a,
          similarity: sim,
          isDisjoint,
        });
      }
    }
  }

  // Sort pairs: prioritize disjoint/cross-disciplinary domains first, then highest similarity
  candidatePairs.sort((a, b) => {
    if (a.isDisjoint !== b.isDisjoint) {
      return a.isDisjoint ? -1 : 1;
    }
    return b.similarity - a.similarity;
  });

  const mappings: TransferableSkillMapping[] = [];
  const usedReqs = new Set<number>();
  const usedAccs = new Set<number>();

  for (const pair of candidatePairs) {
    if (mappings.length >= maxResults) {
      break;
    }

    // Ensure diverse mapping: avoid duplicate accomplishments or duplicate requirements
    if (usedReqs.has(pair.reqIdx) || usedAccs.has(pair.accIdx)) {
      continue;
    }

    const req = requirements[pair.reqIdx];
    const acc = accomplishments[pair.accIdx];
    const verbatimAnchor = extractVerbatimAnchorText(acc.rawBullet, req);

    const rationale = composeTransferRationale({
      sourceRole: acc.role,
      sourceCompany: acc.company,
      targetRequirement: req,
      similarity: pair.similarity,
    });

    mappings.push({
      targetRequirement: req,
      sourceExperienceId: acc.sourceExperienceId,
      verbatimAnchorText: verbatimAnchor,
      similarity: Math.round(pair.similarity * 1000) / 1000,
      transferRationale: rationale,
    });

    usedReqs.add(pair.reqIdx);
    usedAccs.add(pair.accIdx);
  }

  return mappings;
}
