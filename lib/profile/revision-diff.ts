import type {
  MasterProfileInput,
  MasterProfileUpdateInput,
} from "@/lib/validations/profile";

export interface ProfileDiffChange {
  section: string;
  summary: string;
}

export interface ProfileDiffSummary {
  added: ProfileDiffChange[];
  removed: ProfileDiffChange[];
  modified: ProfileDiffChange[];
}

type DiffableProfile = Partial<MasterProfileInput & MasterProfileUpdateInput>;

type ExperienceRow = DiffableProfile["experiences"] extends
  | Array<infer T>
  | undefined
  ? T
  : never;
type EducationRow = DiffableProfile["education"] extends Array<infer T> | undefined
  ? T
  : never;
type ProjectRow = DiffableProfile["projects"] extends Array<infer T> | undefined
  ? T
  : never;

const MAX_CHANGES = 8;

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function same(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function clip(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}...`;
}

function push(
  bucket: ProfileDiffChange[],
  section: string,
  summary: string
): void {
  if (bucket.length >= MAX_CHANGES || !summary.trim()) return;
  bucket.push({ section, summary: clip(summary) });
}

function experienceKey(row: ExperienceRow): string {
  return `${text(row.company).toLowerCase()}|${text(row.role).toLowerCase()}`;
}

function experienceLabel(row: ExperienceRow): string {
  const role = text(row.role);
  const company = text(row.company);
  if (role && company) return `${role} at ${company}`;
  return role || company || "Role";
}

function experienceBody(row: ExperienceRow): string {
  const bullets = (row.bullets ?? []).map((bullet) => text(bullet.rawText)).join("\n");
  return [
    text(row.category),
    text(row.startDate),
    text(row.endDate),
    text(row.location),
    bullets,
  ].join("\n");
}

function educationKey(row: EducationRow): string {
  return [
    text(row.institution).toLowerCase(),
    text(row.subSchool).toLowerCase(),
    text(row.degree).toLowerCase(),
  ].join("|");
}

function educationLabel(row: EducationRow): string {
  const credential = [text(row.degree), text(row.fieldOfStudy)].filter(Boolean).join(" ");
  const school = [text(row.institution), text(row.subSchool)].filter(Boolean).join(", ");
  if (credential && school) return `${credential}, ${school}`;
  return credential || school || "Education";
}

function projectKey(row: ProjectRow): string {
  return text(row.name).toLowerCase();
}

function skillLines(profile: DiffableProfile): string[] {
  return (profile.skills ?? []).flatMap((group) =>
    group.items.map((item) => {
      const parent = text(group.parentCategory);
      const prefix = parent ? `${parent} / ` : "";
      return `${prefix}${text(group.label)}: ${item.name}`.toLowerCase();
    })
  );
}

/**
 * Structural delta between two profile saves. Summaries name the changed
 * record only. They do not include the surrounding profile.
 */
export function computeProfileDiff(
  prev: DiffableProfile | null,
  next: DiffableProfile
): ProfileDiffSummary {
  const added: ProfileDiffChange[] = [];
  const removed: ProfileDiffChange[] = [];
  const modified: ProfileDiffChange[] = [];

  if (!prev) {
    return { added, removed, modified };
  }

  const previousExperiences = prev.experiences ?? [];
  const nextExperiences = next.experiences ?? [];
  const previousByRole = new Map(previousExperiences.map((row) => [experienceKey(row), row]));
  const nextByRole = new Map(nextExperiences.map((row) => [experienceKey(row), row]));
  for (const row of nextExperiences) {
    const prior = previousByRole.get(experienceKey(row));
    if (!prior) push(added, "experience", experienceLabel(row));
    else if (experienceBody(prior) !== experienceBody(row)) {
      push(modified, "experience", experienceLabel(row));
    }
  }
  for (const row of previousExperiences) {
    if (!nextByRole.has(experienceKey(row))) push(removed, "experience", experienceLabel(row));
  }

  const previousEducation = prev.education ?? [];
  const nextEducation = next.education ?? [];
  const previousSchools = new Map(previousEducation.map((row) => [educationKey(row), row]));
  const nextSchools = new Map(nextEducation.map((row) => [educationKey(row), row]));
  for (const row of nextEducation) {
    const prior = previousSchools.get(educationKey(row));
    if (!prior) push(added, "education", educationLabel(row));
    else if (
      !same(text(prior.fieldOfStudy), text(row.fieldOfStudy)) ||
      !same(text(prior.graduationDate), text(row.graduationDate)) ||
      !same(prior.status ?? "GRADUATED", row.status ?? "GRADUATED") ||
      (prior.honors ?? []).join("|") !== (row.honors ?? []).join("|") ||
      (prior.coursework ?? []).join("|") !== (row.coursework ?? []).join("|")
    ) {
      push(modified, "education", educationLabel(row));
    }
  }
  for (const row of previousEducation) {
    if (!nextSchools.has(educationKey(row))) push(removed, "education", educationLabel(row));
  }

  const previousProjects = new Map((prev.projects ?? []).map((row) => [projectKey(row), row]));
  const nextProjects = new Map((next.projects ?? []).map((row) => [projectKey(row), row]));
  for (const row of next.projects ?? []) {
    const prior = previousProjects.get(projectKey(row));
    if (!prior) push(added, "project", text(row.name) || "Project");
    else if (text(prior.description) !== text(row.description)) {
      push(modified, "project", text(row.name) || "Project");
    }
  }
  for (const row of prev.projects ?? []) {
    if (!nextProjects.has(projectKey(row))) push(removed, "project", text(row.name) || "Project");
  }

  const previousCerts = new Set((prev.certifications ?? []).map((item) => text(item.name).toLowerCase()));
  const nextCerts = new Set((next.certifications ?? []).map((item) => text(item.name).toLowerCase()));
  for (const item of next.certifications ?? []) {
    if (!previousCerts.has(text(item.name).toLowerCase())) {
      push(added, "certification", text(item.name));
    }
  }
  for (const item of prev.certifications ?? []) {
    if (!nextCerts.has(text(item.name).toLowerCase())) {
      push(removed, "certification", text(item.name));
    }
  }

  const previousAwards = new Set((prev.awards ?? []).map((item) => text(item.title).toLowerCase()));
  const nextAwards = new Set((next.awards ?? []).map((item) => text(item.title).toLowerCase()));
  for (const item of next.awards ?? []) {
    if (!previousAwards.has(text(item.title).toLowerCase())) {
      push(added, "award", text(item.title));
    }
  }
  for (const item of prev.awards ?? []) {
    if (!nextAwards.has(text(item.title).toLowerCase())) {
      push(removed, "award", text(item.title));
    }
  }

  const previousSkills = new Set(skillLines(prev));
  const nextSkills = new Set(skillLines(next));
  const skillAdds = [...nextSkills].filter((item) => !previousSkills.has(item));
  const skillDrops = [...previousSkills].filter((item) => !nextSkills.has(item));
  if (skillAdds.length > 0) push(added, "skills", `${skillAdds.length} skill item${skillAdds.length === 1 ? "" : "s"}`);
  if (skillDrops.length > 0) {
    push(removed, "skills", `${skillDrops.length} skill item${skillDrops.length === 1 ? "" : "s"}`);
  }

  const previousInterests = new Set((prev.interests ?? []).map((item) => item.trim().toLowerCase()));
  const nextInterests = new Set((next.interests ?? []).map((item) => item.trim().toLowerCase()));
  for (const item of next.interests ?? []) {
    if (!previousInterests.has(item.trim().toLowerCase())) push(added, "interest", item.trim());
  }
  for (const item of prev.interests ?? []) {
    if (!nextInterests.has(item.trim().toLowerCase())) push(removed, "interest", item.trim());
  }

  const previousLinks = new Set((prev.links ?? []).map((item) => text(item.url).toLowerCase()));
  const nextLinks = new Set((next.links ?? []).map((item) => text(item.url).toLowerCase()));
  for (const item of next.links ?? []) {
    if (!previousLinks.has(text(item.url).toLowerCase())) {
      push(added, "link", text(item.label) || text(item.url));
    }
  }
  for (const item of prev.links ?? []) {
    if (!nextLinks.has(text(item.url).toLowerCase())) {
      push(removed, "link", text(item.label) || text(item.url));
    }
  }

  return { added, removed, modified };
}

export type StoredRevisionSummary = {
  title: string;
  diff: ProfileDiffSummary;
};

const EMPTY_DIFF: ProfileDiffSummary = { added: [], removed: [], modified: [] };

function asDiffChanges(value: unknown): ProfileDiffChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { section?: unknown; summary?: unknown };
    if (typeof row.section !== "string" || typeof row.summary !== "string") return [];
    const section = row.section.trim();
    const summary = row.summary.trim();
    if (!section || !summary) return [];
    return [{ section, summary }];
  });
}

/** Reads a stored revision. Older rows are a plain title with no itemized diff. */
export function parseRevisionSummary(raw: string): StoredRevisionSummary {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "title" in parsed) {
      const record = parsed as { title?: unknown; diff?: unknown };
      if (typeof record.title === "string" && record.diff && typeof record.diff === "object") {
        const diff = record.diff as Partial<ProfileDiffSummary>;
        return {
          title: record.title.trim() || "Profile Revision",
          diff: {
            added: asDiffChanges(diff.added),
            removed: asDiffChanges(diff.removed),
            modified: asDiffChanges(diff.modified),
          },
        };
      }
    }
  } catch {
    // Plain-text titles from before structured diffs.
  }
  return {
    title: raw.trim() || "Profile Revision",
    diff: { added: [], removed: [], modified: [] },
  };
}

export function serializeRevisionSummary(value: StoredRevisionSummary): string {
  return JSON.stringify({
    title: value.title.trim() || "Profile Revision",
    diff: {
      added: value.diff.added,
      removed: value.diff.removed,
      modified: value.diff.modified,
    },
  });
}

function sectionLabel(section: string): string {
  const trimmed = section.trim();
  if (!trimmed) return "Items";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function changeCount(changes: ProfileDiffChange[]): number {
  return changes.reduce((total, change) => {
    const match = /^(\d+)\b/.exec(change.summary.trim());
    return total + (match ? Number(match[1]) : 1);
  }, 0);
}

function uniqueSections(changes: ProfileDiffChange[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const change of changes) {
    const label = sectionLabel(change.section);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function fitShortTitle(value: string): string {
  if (value.length <= 35) return value;
  return `${value.slice(0, 32)}...`;
}

function titleForBucket(verb: string, changes: ProfileDiffChange[]): string {
  const labels = uniqueSections(changes);
  const count = changeCount(changes);
  if (labels.length === 1 && count > 1) return fitShortTitle(`${verb} ${count} Items`);
  if (labels.length === 1) return fitShortTitle(`${verb} ${labels[0]}`);
  if (labels.length === 2) {
    const both = `${verb} ${labels[0]} & ${labels[1]}`;
    if (both.length <= 35) return both;
  }
  return fitShortTitle(`${verb} ${Math.max(labels.length, 1)} Sections`);
}

/** Dropdown title. Uses section names and counts already on the diff. */
export function shortRevisionTitle(diff: ProfileDiffSummary): string {
  if (isEmptyProfileDiff(diff)) return "Profile Baseline";
  const buckets = [
    { verb: "Added", changes: diff.added },
    { verb: "Updated", changes: diff.modified },
    { verb: "Removed", changes: diff.removed },
  ].filter((bucket) => bucket.changes.length > 0);
  const only = buckets[0];
  if (buckets.length === 1 && only) return titleForBucket(only.verb, only.changes);
  const combined = [
    ...diff.added,
    ...diff.modified,
    ...diff.removed,
  ];
  return titleForBucket("Updated", combined);
}

export function describeProfileRevision(
  previous: DiffableProfile | null,
  next: DiffableProfile
): StoredRevisionSummary {
  if (!previous) {
    return { title: "Initial Profile Import", diff: EMPTY_DIFF };
  }
  const diff = computeProfileDiff(previous, next);
  if (isEmptyProfileDiff(diff)) return { title: "Profile Baseline", diff };
  return { title: shortRevisionTitle(diff), diff };
}

export function isEmptyProfileDiff(diff: ProfileDiffSummary): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.modified.length === 0
  );
}

const MAX_TITLE_LENGTH = 100;

function formatChangeList(changes: ProfileDiffChange[]): string {
  const summaries = changes.map((change) => change.summary.trim()).filter(Boolean);
  if (summaries.length === 0) return "";
  if (summaries.length === 1) return summaries[0] ?? "";
  if (summaries.length === 2) return `${summaries[0]} & ${summaries[1]}`;
  return `${summaries[0]} (+${summaries.length - 1} more)`;
}

function limitTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LENGTH - 3)}...`;
}

/** Commit-style title built only from names already present in the diff. */
export function structuralRevisionTitle(diff: ProfileDiffSummary): string {
  const parts = [
    diff.added.length > 0 ? `Add ${formatChangeList(diff.added)}` : "",
    diff.modified.length > 0 ? `Update ${formatChangeList(diff.modified)}` : "",
    diff.removed.length > 0 ? `Remove ${formatChangeList(diff.removed)}` : "",
  ].filter(Boolean);
  return limitTitle(parts.join(", ")) || "Profile update";
}
