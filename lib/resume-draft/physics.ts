import type { WorkExperienceInput, ProjectInput } from "@/lib/validations/profile";
import { RESUME_PAGE_GEOMETRY, RESUME_SPACING, RESUME_TYPOGRAPHY } from "./layout.ssot";
import {
  measureBulletHeightPoints,
  measureSummaryHeightPoints,
} from "./typography";

export { measureBulletHeightPoints, measureSummaryHeightPoints };

/**
 * ============================================================================
 * RESUME PHYSICAL GEOMETRY & SPACE ALLOCATION ENGINE (SSOT)
 *
 * Provides deterministic point-height calculations for US Letter PDF rendering
 * in @react-pdf/renderer (792pt total, 728pt printable at 32pt vertical margins).
 * ============================================================================
 */

export const RESUME_PAGE_HEIGHT_POINTS = RESUME_PAGE_GEOMETRY.sheetHeightPt;
export const RESUME_MARGIN_POINTS = RESUME_PAGE_GEOMETRY.paddingTopPt;
export const PRINTABLE_PAGE_HEIGHT_POINTS = RESUME_PAGE_GEOMETRY.printableHeightPt;
export const SAFE_PAGE_CEILING_POINTS = RESUME_PAGE_GEOMETRY.safeCeilingPoints;

export const HEIGHT_CONSTANTS = {
  CONTACT_HEADER: Math.round(
    RESUME_TYPOGRAPHY.name.pt * RESUME_TYPOGRAPHY.name.lineHeight +
      RESUME_SPACING.nameToContact.pt +
      RESUME_TYPOGRAPHY.contact.pt * RESUME_TYPOGRAPHY.contact.lineHeight +
      RESUME_SPACING.contactToFirstSection.pt
  ),
  SECTION_HEADING: Math.round(
    RESUME_TYPOGRAPHY.heading.pt +
      RESUME_SPACING.sectionBefore.pt +
      RESUME_SPACING.sectionHeadingBottom.pt +
      2
  ),
  SUMMARY_PER_LINE: Math.round(
    RESUME_TYPOGRAPHY.summary.pt * RESUME_TYPOGRAPHY.summary.lineHeight
  ),
  SKILL_LINE: Math.round(
    RESUME_TYPOGRAPHY.skills.pt * RESUME_TYPOGRAPHY.skills.lineHeight
  ),
  EDUCATION_ITEM: Math.round(
    RESUME_TYPOGRAPHY.educationTitle.pt *
      RESUME_TYPOGRAPHY.educationTitle.lineHeight +
      RESUME_SPACING.degreeToDegree.pt
  ),
  CERTIFICATION_ITEM: Math.round(
    RESUME_TYPOGRAPHY.body.pt * RESUME_TYPOGRAPHY.body.lineHeight +
      RESUME_SPACING.certToCert.pt
  ),
  AWARD_ITEM: Math.round(
    RESUME_TYPOGRAPHY.body.pt * RESUME_TYPOGRAPHY.body.lineHeight +
      RESUME_SPACING.certToCert.pt
  ),
  INTEREST_ITEM: 13,
  ENTITY_HEADER: Math.round(
    RESUME_TYPOGRAPHY.roleTitle.pt * RESUME_TYPOGRAPHY.roleTitle.lineHeight +
      RESUME_SPACING.roleTitleToFirstBullet.pt +
      RESUME_SPACING.roleToRole.pt
  ),
  CHARS_PER_LINE: 108, // Printable width 540pt / ~5.0pt per char in Helvetica 9.5pt
} as const;

/** Estimate the vertical height of a single bullet based on exact AFM word-boundary line count. */
export function estimateBulletHeightPoints(text: string): number {
  if (!text || !text.trim()) return 13;
  return measureBulletHeightPoints(text);
}

export interface FixedSectionsHeightParams {
  hasSummary: boolean;
  summaryText?: string | null;
  skillsCount?: number;
  skillsLineCount?: number;
  educationCount: number;
  certificationsCount?: number;
  awardsCount?: number;
  interestsCount?: number;
  disabledSections?: string[];
}

/** Calculate the exact point height occupied by non-experience/non-project sections. */
export function estimateFixedSectionsHeight(params: FixedSectionsHeightParams): number {
  const disabled = new Set((params.disabledSections || []).map((s) => s.toLowerCase()));
  let height = HEIGHT_CONSTANTS.CONTACT_HEADER;

  // Summary
  if (!disabled.has("summary") && params.hasSummary) {
    if (params.summaryText?.trim()) {
      height += HEIGHT_CONSTANTS.SECTION_HEADING + measureSummaryHeightPoints(params.summaryText);
    } else {
      const textLen = 180;
      const lines = Math.max(2, Math.ceil(textLen / HEIGHT_CONSTANTS.CHARS_PER_LINE));
      height += HEIGHT_CONSTANTS.SECTION_HEADING + lines * HEIGHT_CONSTANTS.SUMMARY_PER_LINE;
    }
  }

  // Skills: @react-pdf/renderer renders groups in a single inline flow separated by bullet dots.
  // Physical lines depend on total character count across the 540pt printable width, not grouping count.
  if (!disabled.has("skills")) {
    const count = params.skillsCount ?? 20;
    const estimatedChars = count * 13;
    const lines = Math.max(2, Math.min(4, Math.ceil(estimatedChars / HEIGHT_CONSTANTS.CHARS_PER_LINE)));
    height += HEIGHT_CONSTANTS.SECTION_HEADING + lines * HEIGHT_CONSTANTS.SKILL_LINE;
  }

  // Education (Mandatory Anchor)
  if (!disabled.has("education") && params.educationCount > 0) {
    height += HEIGHT_CONSTANTS.SECTION_HEADING + params.educationCount * HEIGHT_CONSTANTS.EDUCATION_ITEM;
  }

  // Certifications
  if (!disabled.has("certifications") && (params.certificationsCount ?? 0) > 0) {
    height += HEIGHT_CONSTANTS.SECTION_HEADING + (params.certificationsCount ?? 0) * HEIGHT_CONSTANTS.CERTIFICATION_ITEM;
  }

  // Awards
  if (!disabled.has("awards") && (params.awardsCount ?? 0) > 0) {
    height += HEIGHT_CONSTANTS.SECTION_HEADING + (params.awardsCount ?? 0) * HEIGHT_CONSTANTS.AWARD_ITEM;
  }

  // Interests
  if (!disabled.has("interests") && (params.interestsCount ?? 0) > 0) {
    height += HEIGHT_CONSTANTS.SECTION_HEADING + (params.interestsCount ?? 0) * HEIGHT_CONSTANTS.INTEREST_ITEM;
  }

  return height;
}

/** Calculate total available points for Experiences & Projects combined. */
export function calculateAvailableContentPoints(params: {
  targetPages: 1 | 2;
  fixedSectionsHeight: number;
}): number {
  const totalBudget = params.targetPages * SAFE_PAGE_CEILING_POINTS;
  return Math.max(100, totalBudget - params.fixedSectionsHeight);
}

/** Compute point height of given experiences and projects. */
export function calculateContentPointHeight(
  experiences: WorkExperienceInput[],
  projects: ProjectInput[]
): {
  projectsHeight: number;
  experiencesHeight: number;
  totalContentHeight: number;
} {
  let projectsHeight = 0;
  if (projects.length > 0) {
    projectsHeight += HEIGHT_CONSTANTS.SECTION_HEADING;
    for (const proj of projects) {
      projectsHeight += HEIGHT_CONSTANTS.ENTITY_HEADER;
      for (const b of proj.bullets) {
        projectsHeight += estimateBulletHeightPoints(b);
      }
    }
  }

  let experiencesHeight = 0;
  if (experiences.length > 0) {
    experiencesHeight += HEIGHT_CONSTANTS.SECTION_HEADING;
    for (const exp of experiences) {
      experiencesHeight += HEIGHT_CONSTANTS.ENTITY_HEADER;
      for (const b of exp.bullets) {
        experiencesHeight += estimateBulletHeightPoints(b.rawText);
      }
    }
  }

  return {
    projectsHeight,
    experiencesHeight,
    totalContentHeight: projectsHeight + experiencesHeight,
  };
}

/**
 * Safely clamps content nodes to guarantee zero overflow beyond target page ceiling.
 * Runs right before PDF rendering to prevent unexpected page spillage.
 */
export function clampPdfContentToPhysicalCeiling(params: {
  targetPages: 1 | 2;
  fixedSectionsHeight: number;
  experiences: WorkExperienceInput[];
  projects: ProjectInput[];
}): {
  experiences: WorkExperienceInput[];
  projects: ProjectInput[];
  didClamp: boolean;
} {
  const availableContentPoints = calculateAvailableContentPoints({
    targetPages: params.targetPages,
    fixedSectionsHeight: params.fixedSectionsHeight,
  });

  const { totalContentHeight } = calculateContentPointHeight(
    params.experiences,
    params.projects
  );

  if (totalContentHeight <= availableContentPoints) {
    return {
      experiences: params.experiences,
      projects: params.projects,
      didClamp: false,
    };
  }

  // Overflow detected: clamp gracefully
  let clampedProjects = [...params.projects];
  let clampedExperiences = [...params.experiences];

  // 1. If single-page and candidate has both jobs and projects, clamp projects to top 2 with max 3 bullets
  if (params.targetPages === 1 && clampedExperiences.length > 0 && clampedProjects.length > 2) {
    clampedProjects = clampedProjects.slice(0, 2).map((p) => ({
      ...p,
      bullets: p.bullets.slice(0, 3),
    }));
  }

  // 2. Surgical, iterative 1-bullet trimming until content fits within availableContentPoints
  let check = calculateContentPointHeight(clampedExperiences, clampedProjects);

  while (check.totalContentHeight > availableContentPoints) {
    let trimmed = false;

    // Step A: If any project has > 2 bullets, trim 1 bullet from the lowest-priority project
    for (let i = clampedProjects.length - 1; i >= 0; i--) {
      if (clampedProjects[i].bullets.length > 2) {
        clampedProjects[i] = {
          ...clampedProjects[i],
          bullets: clampedProjects[i].bullets.slice(0, -1),
        };
        trimmed = true;
        break;
      }
    }
    if (trimmed) {
      check = calculateContentPointHeight(clampedExperiences, clampedProjects);
      continue;
    }

    // Step B: If any experience beyond top 1 has > 2 bullets, trim 1 bullet from lowest experience
    for (let i = clampedExperiences.length - 1; i >= 1; i--) {
      if (clampedExperiences[i].bullets.length > 2) {
        clampedExperiences[i] = {
          ...clampedExperiences[i],
          bullets: clampedExperiences[i].bullets.slice(0, -1),
        };
        trimmed = true;
        break;
      }
    }
    if (trimmed) {
      check = calculateContentPointHeight(clampedExperiences, clampedProjects);
      continue;
    }

    // Step C: If any project has > 1 bullet, trim 1 bullet from lowest project
    for (let i = clampedProjects.length - 1; i >= 0; i--) {
      if (clampedProjects[i].bullets.length > 1) {
        clampedProjects[i] = {
          ...clampedProjects[i],
          bullets: clampedProjects[i].bullets.slice(0, -1),
        };
        trimmed = true;
        break;
      }
    }
    if (trimmed) {
      check = calculateContentPointHeight(clampedExperiences, clampedProjects);
      continue;
    }

    // Step D: If primary experience has > 3 bullets, trim 1 bullet
    if (clampedExperiences.length > 0 && clampedExperiences[0].bullets.length > 3) {
      clampedExperiences[0] = {
        ...clampedExperiences[0],
        bullets: clampedExperiences[0].bullets.slice(0, -1),
      };
      trimmed = true;
      check = calculateContentPointHeight(clampedExperiences, clampedProjects);
      continue;
    }

    // Step E: If any experience has > 1 bullet, trim 1 bullet from lowest experience
    for (let i = clampedExperiences.length - 1; i >= 0; i--) {
      if (clampedExperiences[i].bullets.length > 1) {
        clampedExperiences[i] = {
          ...clampedExperiences[i],
          bullets: clampedExperiences[i].bullets.slice(0, -1),
        };
        trimmed = true;
        break;
      }
    }
    if (trimmed) {
      check = calculateContentPointHeight(clampedExperiences, clampedProjects);
      continue;
    }

    // Safety fallback: drop lowest project
    if (clampedProjects.length > 0) {
      clampedProjects.pop();
      check = calculateContentPointHeight(clampedExperiences, clampedProjects);
      continue;
    }

    // Safety fallback: drop lowest experience beyond primary
    if (clampedExperiences.length > 1) {
      clampedExperiences.pop();
      check = calculateContentPointHeight(clampedExperiences, clampedProjects);
      continue;
    }

    break;
  }

  return {
    experiences: clampedExperiences,
    projects: clampedProjects,
    didClamp: true,
  };
}
