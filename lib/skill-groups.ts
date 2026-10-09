import type { SkillGroup } from "@/lib/types/resume-draft";

export type { SkillGroup };

const LEGACY_SKILL_LABELS: Record<string, string> = {
  languages: "Languages",
  frameworks: "Frameworks",
  tools: "Tools",
  concepts: "Concepts",
};

function formatLabel(key: string): string {
  const legacy = LEGACY_SKILL_LABELS[key.trim().toLowerCase()];
  if (legacy) return legacy;
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function itemsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function groupFromRecord(record: Record<string, unknown>): SkillGroup | null {
  const explicit =
    typeof record.label === "string"
      ? record.label
      : typeof record.categoryLabel === "string"
        ? record.categoryLabel
        : typeof record.category === "string"
          ? formatLabel(record.category)
          : "";
  const items = itemsFromUnknown(record.items ?? record.content);
  const label = explicit.trim() || (items.length > 0 ? "Skills" : "");
  if (!label) return null;
  return { label, items };
}

function isSingleGroupShape(record: Record<string, unknown>): boolean {
  const hasGroupFields =
    typeof record.label === "string" ||
    typeof record.categoryLabel === "string" ||
    Array.isArray(record.items);
  const hasLegacy = Object.keys(LEGACY_SKILL_LABELS).some((key) => key in record);
  return hasGroupFields && !hasLegacy;
}

/** Read skill groups from legacy buckets, a string-list record, or `{ label, items }[]`. */
export function skillGroupsFromUnknown(value: unknown): SkillGroup[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const group = groupFromRecord(entry as Record<string, unknown>);
      return group ? [group] : [];
    });
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isSingleGroupShape(record)) {
      const group = groupFromRecord(record);
      return group ? [group] : [];
    }
    return Object.entries(record).flatMap(([key, raw]) => {
      const items = itemsFromUnknown(raw);
      if (items.length === 0) return [];
      const label = formatLabel(key);
      if (!label) return [];
      return [{ label, items }];
    });
  }
  return [];
}

/** Flat, case-insensitively deduped skill names from any stored skills value. */
export function flattenSkillItems(value: unknown): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const group of skillGroupsFromUnknown(value)) {
    for (const item of group.items) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items;
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
