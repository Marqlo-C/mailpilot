import type {
  MasterProfileInput,
  ProjectInput,
  WorkExperienceInput,
} from "@/lib/validations/profile.schema";
import { cleanDisplayUrl } from "@/lib/utils/format";
import type {
  HierarchicalBulletNode,
  HierarchicalExperienceNode,
  HierarchicalProfileTree,
  HierarchicalProjectNode,
} from "@/lib/validations/tailor.schema";

/**
 * Detects GitHub profile / meta repositories that shouldn't be featured as portfolio projects.
 */
export function extractGitHubHandle(profile: MasterProfileInput): string | null {
  for (const link of profile.links ?? []) {
    const url = cleanDisplayUrl(link.url);
    const match = /github\.com\/([A-Za-z0-9-]+)(?:\/|$)/i.exec(url);
    if (match?.[1] && match[1].toLowerCase() !== "orgs") {
      return match[1].toLowerCase();
    }
  }
  return null;
}

export function isGitHubMetaProject(
  name: string,
  githubHandle: string | null
): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower) return false;
  if (lower.endsWith(".github.io")) return true;
  if (githubHandle && lower === githubHandle) return true;
  return false;
}

export interface TreeBuildOptions {
  excludeProjects?: boolean;
}

/**
 * Builds a deterministic hierarchical tree from the candidate's master profile.
 * Every entity and bullet receives a deterministic hierarchical ID (e.g. "exp_0_b1", "proj_0_b0")
 * eliminating stranding or cross-entity misattribution.
 */
export function buildHierarchicalProfileTree(
  profile: MasterProfileInput,
  options: TreeBuildOptions = {}
): HierarchicalProfileTree {
  const githubHandle = extractGitHubHandle(profile);

  const experiences: HierarchicalExperienceNode[] = profile.experiences.map(
    (exp, expIndex) => {
      const expId = `exp_${expIndex}`;
      const bullets: HierarchicalBulletNode[] = exp.bullets.map(
        (b, bIndex) => ({
          id: `${expId}_b${bIndex}`,
          originalId: b.id,
          text: b.rawText.trim(),
          hasMetric: b.hasMetric,
          technologies: b.technologies || [],
        })
      );

      return {
        id: expId,
        originalId: exp.id || `${exp.company}-${exp.role}`,
        company: exp.company,
        role: exp.role,
        category: exp.category || "Work",
        location: exp.location ?? null,
        startDate: exp.startDate,
        endDate: exp.endDate ?? null,
        displayOrder: exp.displayOrder ?? expIndex,
        bullets,
      };
    }
  );

  const eligibleProjects = options.excludeProjects
    ? []
    : profile.projects.filter(
        (p) => !isGitHubMetaProject(p.name, githubHandle)
      );

  const projects: HierarchicalProjectNode[] = eligibleProjects.map(
    (proj, pIndex) => {
      const projId = `proj_${pIndex}`;
      const rawBullets =
        proj.bullets.length > 0
          ? proj.bullets
          : proj.description?.trim()
            ? [proj.description.trim()]
            : [];

      const bullets: HierarchicalBulletNode[] = rawBullets.map(
        (text, bIndex) => ({
          id: `${projId}_b${bIndex}`,
          originalId: proj.id ? `${proj.id}-b-${bIndex}` : `${projId}-b-${bIndex}`,
          text: text.trim(),
          hasMetric: /\b\d+(?:\.\d+)?%?\b/.test(text),
          technologies: proj.technologies || [],
        })
      );

      return {
        id: projId,
        originalId: proj.id || proj.name,
        name: proj.name,
        description: proj.description || "",
        technologies: proj.technologies || [],
        link: proj.link ?? null,
        bullets,
      };
    }
  );

  return {
    applicant: {
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone ?? null,
      location: profile.location ?? null,
      summary: profile.summary ?? null,
      links: profile.links || [],
    },
    experiences,
    projects,
    skills: profile.skills || [],
    education: profile.education || [],
    certifications: profile.certifications || [],
    awards: profile.awards || [],
    interests: profile.interests || [],
  };
}

/**
 * Deterministically hydrates selected hierarchical bullet IDs back into
 * fully formed WorkExperienceInput[] and ProjectInput[] preserving authentic parent metadata.
 */
export function hydrateSelectedFromTree(input: {
  tree: HierarchicalProfileTree;
  originalProfile: MasterProfileInput;
  selectedBulletIds: Set<string>;
  projectBulletMap?: Map<string, string[]>;
}): {
  selectedExperience: WorkExperienceInput[];
  selectedProjects: ProjectInput[];
} {
  const { tree, originalProfile, selectedBulletIds, projectBulletMap } = input;

  // 1. Hydrate experiences
  const selectedExperience: WorkExperienceInput[] = [];

  tree.experiences.forEach((expNode, expIndex) => {
    const originalExp = originalProfile.experiences[expIndex];
    if (!originalExp) return;

    const survivingBullets: typeof originalExp.bullets = [];
    expNode.bullets.forEach((bNode, bIdx) => {
      if (selectedBulletIds.has(bNode.id) || selectedBulletIds.has(bNode.originalId)) {
        const origBullet = originalExp.bullets[bIdx];
        if (origBullet) {
          survivingBullets.push(origBullet);
        }
      }
    });

    if (survivingBullets.length > 0) {
      selectedExperience.push({
        ...originalExp,
        bullets: survivingBullets,
      });
    }
  });

  // 2. Hydrate projects
  const selectedProjects: ProjectInput[] = [];

  tree.projects.forEach((projNode) => {
    const originalProj = originalProfile.projects.find(
      (p) => (p.id && p.id === projNode.originalId) || p.name === projNode.name
    );
    if (!originalProj) return;

    let projectBullets: string[] = [];

    // If explicit bullet list was assembled
    if (projectBulletMap && projectBulletMap.has(projNode.id)) {
      projectBullets = projectBulletMap.get(projNode.id)!;
    } else {
      const matched = projNode.bullets.filter(
        (b) => selectedBulletIds.has(b.id) || selectedBulletIds.has(b.originalId)
      );
      projectBullets = matched.map((b) => b.text);
    }

    if (projectBullets.length > 0 || (projNode.description && selectedBulletIds.has(projNode.id))) {
      selectedProjects.push({
        ...originalProj,
        bullets: projectBullets.length > 0 ? projectBullets : (projNode.description ? [projNode.description] : []),
      });
    }
  });

  return { selectedExperience, selectedProjects };
}
