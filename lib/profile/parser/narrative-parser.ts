/**
 * Institution, Coursework, Workplace, and Narrative Placement Parsing Engine.
 */

import { isCourseworkLabel } from "@/lib/profile/skill-groups";
import type { SkillGroup, SkillItem } from "@/lib/resume-draft";

export const WORKPLACE_MODE = /^(?:remote|hybrid)$/i;
export const ORG_SUFFIX = /^(?:inc|llc|ltd|llp|lp|co|corp|plc|gmbh|pc|pa)\.?$/i;

/** Drops blank workplace text and trailing separator characters. */
export function cleanWorkplaceLocation(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\[({\s]+|[\]})\s]+$/g, "")
    .replace(/^[\s,;|·•–—-]+|[\s,;|·•–—-]+$/g, "")
    .trim();
  return text || null;
}

export function looksLikeWorkplace(value: string): boolean {
  const text = cleanWorkplaceLocation(value);
  if (!text || text.length > 80) return false;
  if (WORKPLACE_MODE.test(text)) return true;
  const parts = text.split(",").map((part) => part.trim());
  if (parts.length !== 2) return false;
  const left = parts[0] ?? "";
  const right = parts[1] ?? "";
  if (!left || !right || ORG_SUFFIX.test(right)) return false;
  if (left.length > 40 || right.length > 40 || /\d/.test(text)) return false;
  return (
    /^[\p{L}][\p{L} .'-]*$/u.test(left) && /^[\p{L}][\p{L} .'-]*$/u.test(right)
  );
}

export function splitConcatenatedWorkplace(
  label: string,
  location: string | null
): { label: string; location: string | null } {
  const cleaned = cleanWorkplaceLocation(location);
  const name = label.trim();
  if (cleaned) {
    const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = name
      .replace(new RegExp(`\\s*[|·•]\\s*${escaped}\\s*$`, "i"), "")
      .trim();
    return { label: stripped || name, location: cleaned };
  }
  const match = name.match(/^(.*?)\s*[|·•]\s*(.+)$/);
  const left = match?.[1]?.trim() ?? "";
  const right = match?.[2]?.trim() ?? "";
  if (!left || !looksLikeWorkplace(right)) return { label: name, location: null };
  return { label: left, location: cleanWorkplaceLocation(right) };
}

/**
 * Keeps a printed workplace on location. A workplace glued to the company or
 * role with a separator is moved out. A missing workplace stays null.
 */
export function normalizeExperienceLocation<
  T extends {
    company: string;
    role: string;
    location?: string | null;
    bullets?: Array<{ rawText: string }>;
  },
>(entry: T): T {
  let company = entry.company.trim();
  let role = entry.role.trim();
  const fromCompany = splitConcatenatedWorkplace(company, entry.location ?? null);
  company = fromCompany.label;
  let location = fromCompany.location;
  if (!location) {
    const fromRole = splitConcatenatedWorkplace(role, null);
    role = fromRole.label;
    location = fromRole.location;
  }
  let bullets = entry.bullets;
  const first = bullets?.[0]?.rawText ?? "";
  const firstPlace = cleanWorkplaceLocation(first);
  if (
    firstPlace &&
    bullets &&
    (location
      ? firstPlace.toLowerCase() === location.toLowerCase()
      : looksLikeWorkplace(firstPlace))
  ) {
    if (!location) location = firstPlace;
    bullets = bullets.slice(1);
  }
  return { ...entry, company, role, location, bullets };
}

export function appearsInSource(value: string, rawText: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  return rawText.toLowerCase().includes(trimmed.toLowerCase());
}

export const INTEREST_LIST_SEPARATOR =
  /\s*(?:,\s*(?:and|&)\s+|[,;|•·∙▪◦])\s*/i;

export function cleanInterestToken(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’([{]+/, "")
    .replace(/[\s"'“”‘’).,;:!?\]}]+$/, "")
    .replace(/^(?:and|&)\s+/i, "")
    .replace(/\s+(?:and|&)$/i, "")
    .trim();
}

export function expandInterestItem(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const listed = /[,;|•·∙▪◦]/.test(trimmed);
  const primary = trimmed
    .split(INTEREST_LIST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  const pieces = (listed ? primary.flatMap((part) => part.split(/\s+and\s+/i)) : primary)
    .flatMap((part) => part.split(/\s+&\s+/));
  return pieces.flatMap((part) => {
    const cleaned = cleanInterestToken(part);
    return cleaned ? [cleaned] : [];
  });
}

/** Splits a printed interest line and keeps every item that appears in the source. */
export function collectSourceInterests(items: string[], source: string): string[] {
  const normalizedSource = source.toLowerCase().replace(/\s+/g, " ");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    for (const part of expandInterestItem(item)) {
      const key = part.toLowerCase();
      if (seen.has(key) || !normalizedSource.includes(key)) continue;
      seen.add(key);
      result.push(part);
    }
  }
  return result;
}

export function linkAppearsInSource(url: string, rawText: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (appearsInSource(trimmed, rawText)) return true;
  const bare = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
  return bare.length >= 4 && appearsInSource(bare, rawText);
}

export function experienceCategory(raw: string, source: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (/\b(athletics?|sports?)\b/.test(lower)) return "Athletics";
  if (/\bleadership\b/.test(lower)) return "Leadership";
  if (/\b(activities|activity|campus|extracurriculars?)\b/.test(lower)) {
    return "Activity";
  }
  if (/\bvolunteer\b/.test(lower) || /\bcommunity\s+service\b/.test(lower)) {
    return "Volunteer";
  }
  if (/\bmilitary\b/.test(lower)) return "Military";
  if (/\bclinical\b/.test(lower)) return "Clinical";
  if (
    !trimmed ||
    lower === "work" ||
    /\b(employment|professional|experiences?)\b/.test(lower) ||
    /\bwork\b/.test(lower)
  ) {
    return "Work";
  }
  if (appearsInSource(trimmed, source)) return trimmed;
  return "Work";
}

export function anchorSkillLabels(groups: SkillGroup[], source: string): SkillGroup[] {
  const merged = new Map<string, SkillGroup>();
  for (const group of groups) {
    if (isCourseworkLabel(group.label)) continue;
    const rawLabel = group.label.trim();
    const label =
      rawLabel.toLowerCase() === "skills"
        ? "Skills"
        : appearsInSource(rawLabel, source)
          ? rawLabel
          : "Skills";
    let parent = group.parentCategory?.trim() || null;
    if (!parent || !appearsInSource(parent, source) || label === "Skills") parent = null;
    const items = group.items.filter(
      (item) => item.name.trim() && appearsInSource(item.name, source)
    );
    if (items.length === 0) continue;
    const key = `${parent?.toLowerCase() ?? ""}\n${label.toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { label, parentCategory: parent, items: [...items] });
      continue;
    }
    for (const item of items) {
      if (!existing.items.some((current) => current.name.toLowerCase() === item.name.toLowerCase())) {
        existing.items.push(item);
      }
    }
  }
  return collapseEchoSkillGroups([...merged.values()]);
}

export function isEchoSkillGroup(group: SkillGroup): boolean {
  const item = group.items[0]?.name.trim() ?? "";
  return (
    group.items.length === 1 &&
    item.length > 0 &&
    group.label.trim().toLowerCase() === item.toLowerCase()
  );
}

/**
 * Flat lists often come back as one group per skill, with the label repeating
 * the item. When that pattern is the majority, keep one Skills group.
 */
export function collapseEchoSkillGroups(groups: SkillGroup[]): SkillGroup[] {
  if (groups.length === 0) return groups;
  if (groups.some((group) => group.parentCategory?.trim())) return groups;
  const echoCount = groups.filter(isEchoSkillGroup).length;
  if (echoCount * 2 <= groups.length) return groups;
  const items: SkillItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      const name = item.name.trim();
      if (!name) continue;
      if (items.some((current) => current.name.toLowerCase() === name.toLowerCase())) {
        continue;
      }
      items.push({ name, proficiency: item.proficiency });
    }
  }
  if (items.length === 0) return [];
  return [{ label: "Skills", parentCategory: null, items }];
}

export function mergeUnique(existing: string[], incoming: string[]): string[] {
  const next = [...existing];
  for (const item of incoming) {
    const trimmed = item.trim();
    if (!trimmed || !next.some((current) => current.toLowerCase() === trimmed.toLowerCase())) {
      if (trimmed) next.push(trimmed);
    }
  }
  return next;
}

export function attachCoursework<T extends { institution: string; coursework?: string[] }>(
  education: T[],
  coursework: string[],
  source: string
): string[] {
  const titles = coursework.filter((title) => appearsInSource(title, source));
  if (titles.length === 0 || education.length === 0) return titles;
  const indexes = titles
    .map((title) => source.toLowerCase().indexOf(title.toLowerCase()))
    .filter((index) => index >= 0);
  const point = indexes.length > 0 ? Math.min(...indexes) : source.length;
  let target = education[0]!;
  let bestAt = -1;
  for (const entry of education) {
    const at = source.toLowerCase().lastIndexOf(entry.institution.toLowerCase(), point);
    if (at >= bestAt) {
      target = entry;
      bestAt = at;
    }
  }
  target.coursework = mergeUnique(target.coursework ?? [], titles);
  return [];
}

export function placeNarratives(
  narratives: string[],
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    bullets: string[];
  }>,
  experiences: Array<{ company: string; bullets: Array<{ rawText: string }> }>
): void {
  const covered = (sentence: string) => {
    const lower = sentence.toLowerCase();
    return (
      projects.some((project) =>
        [project.description, ...project.bullets].some((line) =>
          line.toLowerCase().includes(lower)
        )
      ) ||
      experiences.some((experience) =>
        experience.bullets.some((bullet) => bullet.rawText.toLowerCase().includes(lower))
      )
    );
  };
  for (const sentence of narratives) {
    if (!sentence.trim() || covered(sentence)) continue;
    const lower = sentence.toLowerCase();
    const project = projects.find(
      (item) =>
        item.technologies.some((tech) => tech && lower.includes(tech.toLowerCase())) ||
        (item.name && lower.includes(item.name.toLowerCase()))
    );
    if (project) project.bullets.push(sentence);
  }
}

export const DEGREE_MARK =
  /\b(?:bachelor|master|associate|diploma|certificate|doctorate|ph\.?\s?d|mba|b\.?\s?[a-z]{1,5}|m\.?\s?[a-z]{1,5})\b/i;

export const LATIN_HONOR_SOURCE =
  "\\b(summa cum laude|magna cum laude|cum laude|dean'?s list|with (?:high )?honou?rs|with distinction)\\b";

export const SUBSCHOOL_MARK = /\b(?:school|college|faculty|division|institute)\b/i;

export function splitParentSchool(
  institution: string,
  subSchool: string | null
): { institution: string; subSchool: string | null } {
  const parent = institution.trim();
  const child = subSchool?.trim() || "";
  if (child) return { institution: parent, subSchool: child };
  const comma = parent.match(/^(.*?),\s+(.+)$/);
  const right = comma?.[2]?.trim() ?? "";
  const left = comma?.[1]?.trim() ?? "";
  if (left.length >= 3 && right.length >= 3 && SUBSCHOOL_MARK.test(right)) {
    return { institution: left, subSchool: right };
  }
  return { institution: parent, subSchool: null };
}

export function pullLatinHonors(
  degree: string,
  honors: string[]
): { degree: string | null; honors: string[] } {
  const found = degree.match(new RegExp(LATIN_HONOR_SOURCE, "gi")) ?? [];
  const next = [...honors];
  for (const honor of found) {
    const cleaned = honor.trim();
    if (
      cleaned &&
      !next.some((item) => item.toLowerCase() === cleaned.toLowerCase())
    ) {
      next.push(cleaned);
    }
  }
  const remainder = degree
    .replace(new RegExp(LATIN_HONOR_SOURCE, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")
    .trim();
  if (!remainder) return { degree: null, honors: next };
  return { degree: remainder, honors: next };
}

export function clearStutteredField(degree: string | null, fieldOfStudy: string | null): string | null {
  const field = fieldOfStudy?.trim() || "";
  if (!field) return null;
  if (degree?.toLowerCase().includes(field.toLowerCase())) return null;
  return field;
}

export function splitCompoundParts(value: string): string[] | null {
  const parts = value
    .split(/\s*(?:&|;|\/|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

/**
 * Splits a stacked dual-degree line into one record per degree and stops a
 * shared concentration string from being copied onto every sibling record.
 */
export function disambiguateEducationEntries<
  T extends {
    institution: string;
    subSchool?: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    graduationDate?: string | null;
    honors?: string[];
  },
>(entries: T[]): T[] {
  const prepared = entries.map((entry) => {
    const school = splitParentSchool(entry.institution, entry.subSchool ?? null);
    const honorSplit = pullLatinHonors(entry.degree ?? "", entry.honors ?? []);
    return {
      ...entry,
      institution: school.institution,
      subSchool: school.subSchool,
      degree: honorSplit.degree,
      honors: honorSplit.honors,
      fieldOfStudy: clearStutteredField(honorSplit.degree, entry.fieldOfStudy),
    };
  });
  const expanded: T[] = [];
  for (const entry of prepared) {
    const degreeParts = splitCompoundParts(entry.degree ?? "");
    const splittable =
      degreeParts?.every((part) => DEGREE_MARK.test(part)) ?? false;
    if (!degreeParts || !splittable) {
      expanded.push(entry);
      continue;
    }
    const fieldParts = entry.fieldOfStudy
      ? splitCompoundParts(entry.fieldOfStudy)
      : null;
    degreeParts.forEach((degree, index) => {
      let fieldOfStudy: string | null = null;
      if (fieldParts && fieldParts.length === degreeParts.length) {
        fieldOfStudy = fieldParts[index] ?? null;
      } else if (fieldParts) {
        fieldOfStudy =
          fieldParts.find((part) =>
            degree.toLowerCase().includes(part.toLowerCase())
          ) ?? null;
      }
      expanded.push({ ...entry, degree, fieldOfStudy });
    });
  }

  const grouped = new Map<string, T[]>();
  for (const entry of expanded) {
    const key = entry.institution.trim().toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }

  const result: T[] = [];
  for (const list of grouped.values()) {
    const fields = list.map((entry) => (entry.fieldOfStudy ?? "").trim());
    const shared =
      fields.length > 1 && fields.every((field) => field && field === fields[0]);
    const parts = shared ? splitCompoundParts(fields[0] ?? "") : null;
    const assigned =
      parts && parts.length === list.length
        ? list.map((entry, index) => ({
            ...entry,
            fieldOfStudy: parts[index] ?? null,
          }))
        : list;
    const seen = new Set<string>();
    for (const entry of assigned) {
      const key = [
        (entry.degree ?? "").trim().toLowerCase(),
        (entry.subSchool ?? "").trim().toLowerCase(),
        (entry.fieldOfStudy ?? "").trim().toLowerCase(),
        (entry.graduationDate ?? "").trim().toLowerCase(),
        (entry.honors ?? []).join("|").toLowerCase(),
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        ...entry,
        fieldOfStudy: clearStutteredField(entry.degree, entry.fieldOfStudy),
      });
    }
  }
  return result;
}

export function inferTechnologies(text: string, skillTerms: string[]): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const term of skillTerms) {
    const trimmed = term.trim();
    if (trimmed.length < 2) continue;
    if (lower.includes(trimmed.toLowerCase())) found.add(trimmed);
  }
  return [...found];
}
