import type { SkillGroup, SkillItem } from "@/lib/types/resume-draft";

export type { SkillGroup, SkillItem };

const QUALIFIER =
  /^(significant experience|working knowledge|experienced|proficient|familiar|fluent|skilled|experience|advanced|intermediate|basic|some|limited)\b(?:\s+(?:in|with|at|of))?\s*/i;

const INLINE_MODIFIER =
  /^(some|basic|limited|advanced|intermediate|fluent|native)\s+(.+)$/i;

const NARRATIVE =
  /^(designed|built|led|managed|created|developed|implemented|established|organized|directed|produced|delivered|launched|improved|reduced|increased|coordinated|authored|maintained|supported)\b/i;

const CLAUSE_WORD =
  /^(?:Skilled|Familiar|Significant|Experienced|Proficient|Fluent|Working|Designed|Built|Led|Managed|Created|Developed|Implemented|Intro|Introduction)$/;

const COURSE_LABEL = /\b(coursework|courses?|classes|subjects|academic|foundations)\b/i;

export function isCourseworkLabel(label: string): boolean {
  return COURSE_LABEL.test(label);
}

function formatLabel(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function tidyPhrase(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function cleanToken(value: string): string {
  return value
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanToken(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function dedupeSkills(items: SkillItem[]): SkillItem[] {
  const seen = new Set<string>();
  const result: SkillItem[] = [];
  for (const item of items) {
    const name = cleanToken(item.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push({ name, proficiency: item.proficiency });
  }
  return result;
}

function splitDenseBlock(text: string): string[] {
  const marked = text
    .replace(/\)(?=[A-Z])/g, ")\n")
    .replace(/([a-z])(?=[A-Z][a-z])/g, (match, lower: string, offset: number, source: string) => {
      const before = source.slice(0, offset + 1);
      const after = source.slice(offset + 1);
      const currentWord = before.match(/[A-Za-z]+$/)?.[0] ?? "";
      const nextWord = after.match(/^[A-Z][a-zA-Z]+/)?.[0] ?? "";
      const clause = CLAUSE_WORD.test(nextWord) && currentWord.length >= 3;
      const gluedPhrase = currentWord.length >= 8 && nextWord.length >= 5;
      if (clause || gluedPhrase) return `${lower}\n`;
      return match;
    });
  return marked
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitList(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (!/[,;/]/.test(trimmed)) return [trimmed];
  return trimmed
    .split(/\s*(?:,|;|\/)\s*/)
    .map((part) => part.replace(/^(?:and|or)\s+/i, "").trim())
    .filter(Boolean);
}

function isCourseTitle(value: string): boolean {
  if (wordCount(value) < 4) return false;
  if (NARRATIVE.test(value) || QUALIFIER.test(value)) return false;
  return /\b(?:of|to)\b/i.test(value);
}

function isCourseList(parts: string[]): boolean {
  return parts.length >= 2 && parts.every((part) => wordCount(part) >= 3);
}

function peelQualifier(value: string): { proficiency: string | null; remainder: string } {
  const match = QUALIFIER.exec(value);
  if (!match) return { proficiency: null, remainder: value.trim() };
  const proficiency = tidyPhrase(match[1] ?? "");
  return {
    proficiency: proficiency || null,
    remainder: value.slice(match[0].length).trim(),
  };
}

function peelInline(value: string): { proficiency: string | null; name: string } {
  const match = INLINE_MODIFIER.exec(value.trim());
  if (!match) return { proficiency: null, name: value.trim() };
  return { proficiency: tidyPhrase(match[1] ?? "") || null, name: (match[2] ?? "").trim() };
}

const LABEL_SEPARATOR = /^([^:·•∙\n]{1,80}?)\s*(?::|·|•|∙)\s+(\S[\s\S]*)$/;

type SkillDecomposition = {
  label: string | null;
  skills: SkillItem[];
  coursework: string[];
  narratives: string[];
};

function labeledRow(text: string): { label: string; rest: string } | null {
  const match = text.match(LABEL_SEPARATOR);
  if (!match) return null;
  const label = cleanToken(match[1] ?? "");
  const rest = (match[2] ?? "").trim();
  if (!label || !rest) return null;
  if (/[,;]/.test(label) || wordCount(label) > 5) return null;
  return { label, rest };
}

/** Semicolons separate sub-rows only when more than one row has its own label. */
function rowSegments(text: string): string[] {
  const parts = text
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return [text.trim()];
  const labeledCount = parts.filter((part) => labeledRow(part)).length;
  return labeledCount >= 2 ? parts : [text.trim()];
}

function tokensFromParts(
  parts: string[],
  proficiency: string | null
): { skills: SkillItem[]; coursework: string[] } {
  const skills: SkillItem[] = [];
  const coursework: string[] = [];
  if (isCourseList(parts) || (parts.length === 1 && isCourseTitle(parts[0] ?? ""))) {
    coursework.push(...parts.map(cleanToken).filter(Boolean));
    return { skills, coursework };
  }
  for (const part of parts) {
    if (isCourseTitle(part)) {
      const title = cleanToken(part);
      if (title) coursework.push(title);
      continue;
    }
    const inline = peelInline(part);
    const name = cleanToken(inline.name);
    if (!name || wordCount(name) > 8) continue;
    skills.push({
      name,
      proficiency: inline.proficiency ?? proficiency,
    });
  }
  return { skills, coursework };
}

function analyzePiece(text: string, inherited: string | null): SkillDecomposition {
  const empty: SkillDecomposition = {
    label: null,
    skills: [],
    coursework: [],
    narratives: [],
  };
  if (!text) return empty;
  if (NARRATIVE.test(text) && wordCount(text) >= 6 && !labeledRow(text)) {
    return { ...empty, narratives: [text] };
  }
  const labeled = labeledRow(text);
  if (labeled) {
    const inner = analyzePiece(labeled.rest, inherited);
    return { ...inner, label: inner.label ?? labeled.label };
  }
  const paren = text.match(/^(.*?)\(([^()]*)\)\s*$/);
  const lead = (paren?.[1] ?? "").trim();
  const inner = paren?.[2]?.trim() ?? "";
  const innerParts = inner ? splitList(inner) : [];
  const innerIsList = /[,;]/.test(inner) && innerParts.length >= 2;
  if (paren && innerIsList && lead && wordCount(lead) <= 6 && !/[,;]/.test(lead)) {
    const peeled = peelQualifier(lead);
    const shared = peeled.proficiency ?? tidyPhrase(lead);
    const tokenized = tokensFromParts(innerParts, shared ?? inherited);
    return { ...empty, ...tokenized };
  }
  if (paren && lead && inner && !innerIsList) {
    const leadQualifier = peelQualifier(lead);
    const innerQualifier = peelQualifier(inner);
    if (leadQualifier.proficiency && !leadQualifier.remainder) {
      const tokenized = tokensFromParts(splitList(inner), leadQualifier.proficiency);
      return { ...empty, ...tokenized };
    }
    if (innerQualifier.proficiency && !innerQualifier.remainder && wordCount(inner) <= 4) {
      const tokenized = tokensFromParts([lead], innerQualifier.proficiency);
      return { ...empty, ...tokenized };
    }
    if (wordCount(lead) <= 8 && wordCount(inner) <= 6) {
      const name = cleanToken(lead);
      if (name) {
        return {
          ...empty,
          skills: [{ name, proficiency: inner.replace(/\s+/g, " ").trim() || inherited }],
        };
      }
    }
  }
  const peeled = peelQualifier(lead || text);
  const source = inner || peeled.remainder;
  if (!source) return empty;
  const parts = splitList(source);
  const tokenized = tokensFromParts(parts, peeled.proficiency ?? inherited);
  return { ...empty, ...tokenized };
}

/**
 * Splits one stored skill string into atomic items.
 * A short label before a colon or dot becomes the child group label.
 */
export function decomposeSkillString(
  raw: string,
  inheritedProficiency: string | null = null
): SkillDecomposition[] {
  const results: SkillDecomposition[] = [];
  for (const segment of splitDenseBlock(raw)) {
    const text = segment.replace(/\s+/g, " ").trim();
    if (!text) continue;
    for (const piece of rowSegments(text)) {
      results.push(analyzePiece(piece, inheritedProficiency));
    }
  }
  return results;
}

function fromStoredItem(name: string, proficiency: string | null): SkillDecomposition[] {
  const cleanedName = cleanToken(name);
  const cleanedProficiency = proficiency?.trim() || null;
  const proficiencyHoldsList = Boolean(
    cleanedProficiency && /[,;()]/.test(cleanedProficiency)
  );
  if (
    proficiencyHoldsList &&
    cleanedName &&
    !/[,:;·•∙|]/.test(cleanedName) &&
    wordCount(cleanedName) <= 5
  ) {
    return decomposeSkillString(cleanedProficiency ?? "", null).map((entry) => ({
      ...entry,
      label: entry.label ?? cleanedName,
    }));
  }
  return decomposeSkillString(cleanedName, cleanedProficiency);
}

/** Splits a dense skill line into tokens, qualifiers, course titles, and sentences. */
export function interpretSkillText(raw: string): {
  skills: SkillItem[];
  coursework: string[];
  narratives: string[];
} {
  const skills: SkillItem[] = [];
  const coursework: string[] = [];
  const narratives: string[] = [];
  for (const entry of decomposeSkillString(raw)) {
    skills.push(...entry.skills);
    coursework.push(...entry.coursework);
    narratives.push(...entry.narratives);
  }
  return {
    skills: dedupeSkills(skills),
    coursework: dedupeStrings(coursework),
    narratives: dedupeStrings(narratives),
  };
}

function skillItemFromUnknown(value: unknown): SkillItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || !record.name.trim()) return null;
  const proficiency =
    typeof record.proficiency === "string" && record.proficiency.trim()
      ? tidyPhrase(record.proficiency)
      : null;
  return { name: record.name.trim(), proficiency };
}

function groupKey(parent: string | null, label: string): string {
  return `${(parent ?? "").toLowerCase()}\n${label.toLowerCase()}`;
}

function parentForChild(baseParent: string | null, baseLabel: string): string | null {
  if (baseParent) return baseParent;
  if (baseLabel.trim().toLowerCase() === "skills") return null;
  return baseLabel;
}

export function interpretSkillGroups(
  groups: Array<{
    label?: string | null;
    parentCategory?: string | null;
    items?: unknown;
  }>
): { groups: SkillGroup[]; coursework: string[]; narratives: string[] } {
  const grouped = new Map<string, SkillGroup>();
  const order: string[] = [];
  const coursework: string[] = [];
  const narratives: string[] = [];

  const addSkill = (parent: string | null, label: string, item: SkillItem) => {
    const key = groupKey(parent, label);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { label, parentCategory: parent, items: [item] });
      order.push(key);
      return;
    }
    const existing = current.items.find(
      (skill) => skill.name.toLowerCase() === item.name.toLowerCase()
    );
    if (!existing) {
      current.items.push(item);
      return;
    }
    if (!existing.proficiency && item.proficiency) existing.proficiency = item.proficiency;
  };

  const place = (
    baseParent: string | null,
    baseLabel: string,
    entry: SkillDecomposition
  ) => {
    narratives.push(...entry.narratives);
    coursework.push(...entry.coursework);
    if (entry.skills.length === 0) return;
    const childLabel = entry.label?.trim() || "";
    const sameLabel = childLabel.toLowerCase() === baseLabel.toLowerCase();
    const label = !childLabel || sameLabel ? baseLabel : childLabel;
    const parent =
      !childLabel || sameLabel ? baseParent : parentForChild(baseParent, baseLabel);
    if (isCourseworkLabel(label) || isCourseworkLabel(baseLabel)) {
      coursework.push(...entry.skills.map((item) => item.name));
      return;
    }
    for (const item of entry.skills) addSkill(parent, label, item);
  };

  for (const group of groups) {
    const label = group.label?.trim() || "Skills";
    const parent = group.parentCategory?.trim() || null;
    const rawItems = Array.isArray(group.items) ? group.items : [];
    for (const raw of rawItems) {
      if (typeof raw === "string") {
        for (const entry of decomposeSkillString(raw)) place(parent, label, entry);
        continue;
      }
      const item = skillItemFromUnknown(raw);
      if (!item) continue;
      for (const entry of fromStoredItem(item.name, item.proficiency)) {
        place(parent, label, entry);
      }
    }
  }

  return {
    groups: order.flatMap((key) => {
      const group = grouped.get(key);
      return group && group.items.length > 0 ? [group] : [];
    }),
    coursework: dedupeStrings(coursework),
    narratives: dedupeStrings(narratives),
  };
}

function itemList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function readParentCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function rawGroupFromRecord(
  record: Record<string, unknown>
): { label: string; parentCategory: string | null; items: unknown[] } | null {
  const explicit =
    typeof record.label === "string"
      ? record.label
      : typeof record.categoryLabel === "string"
        ? record.categoryLabel
        : typeof record.category === "string"
          ? formatLabel(record.category)
          : "";
  const items = itemList(record.items ?? record.content);
  const label = explicit.trim() || (items.length > 0 ? "Skills" : "");
  if (!label) return null;
  return {
    label,
    parentCategory: readParentCategory(record.parentCategory),
    items,
  };
}

function isSingleGroupShape(record: Record<string, unknown>): boolean {
  return (
    typeof record.label === "string" ||
    typeof record.categoryLabel === "string" ||
    Array.isArray(record.items)
  );
}

function rawGroupsFromUnknown(
  value: unknown
): Array<{ label: string; parentCategory: string | null; items: unknown[] }> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const group = rawGroupFromRecord(entry as Record<string, unknown>);
      return group ? [group] : [];
    });
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isSingleGroupShape(record)) {
      const group = rawGroupFromRecord(record);
      return group ? [group] : [];
    }
    return Object.entries(record).flatMap(([key, raw]) => {
      const items = itemList(raw);
      if (items.length === 0) return [];
      const label = formatLabel(key);
      if (!label) return [];
      return [{ label, parentCategory: null, items }];
    });
  }
  return [];
}

function withCourseworkGroup(groups: SkillGroup[], coursework: string[]): SkillGroup[] {
  if (coursework.length === 0) return groups;
  const existing = groups.find((group) => isCourseworkLabel(group.label));
  if (existing) {
    for (const name of coursework) {
      if (existing.items.some((item) => item.name.toLowerCase() === name.toLowerCase())) continue;
      existing.items.push({ name, proficiency: null });
    }
    return groups;
  }
  return [
    ...groups,
    {
      label: "Coursework",
      parentCategory: null,
      items: coursework.map((name) => ({ name, proficiency: null })),
    },
  ];
}

/** Read skill groups from legacy buckets, a string-list record, or `{ label, items }[]`. */
export function skillGroupsFromUnknown(value: unknown): SkillGroup[] {
  const interpreted = interpretSkillGroups(rawGroupsFromUnknown(value));
  return withCourseworkGroup(interpreted.groups, interpreted.coursework);
}

/** Flat, case-insensitively deduped skill names from any stored skills value. */
export function flattenSkillItems(value: unknown): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const group of skillGroupsFromUnknown(value)) {
    for (const item of group.items) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item.name);
    }
  }
  return items;
}

/** Keeps child groups under the same outer heading together, in source order. */
export function groupSkillSections(groups: SkillGroup[]): Array<{
  parentCategory: string | null;
  groups: SkillGroup[];
}> {
  const sections: Array<{ parentCategory: string | null; groups: SkillGroup[] }> = [];
  for (const group of groups) {
    const parentCategory = group.parentCategory?.trim() || null;
    const last = sections[sections.length - 1];
    if (last && last.parentCategory === parentCategory) {
      last.groups.push(group);
      continue;
    }
    sections.push({ parentCategory, groups: [group] });
  }
  return sections;
}

export function skillCategoryLabel(node: {
  metadata?: Record<string, unknown>;
}): string | null {
  const explicit = node.metadata?.categoryLabel;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const raw = node.metadata?.category;
  if (typeof raw === "string" && raw.trim()) return formatLabel(raw);
  return null;
}
