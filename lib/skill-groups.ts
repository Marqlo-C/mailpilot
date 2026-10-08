import type { SkillGroup } from "@/lib/types/resume-draft";

function labelFromKey(key: string): string {
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

/** Read skill groups from a record of lists or an array of `{ label, items }`. */
export function skillGroupsFromUnknown(value: unknown): SkillGroup[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      const explicit =
        typeof record.label === "string"
          ? record.label
          : typeof record.categoryLabel === "string"
            ? record.categoryLabel
            : typeof record.category === "string"
              ? labelFromKey(record.category)
              : "";
      const items = itemsFromUnknown(record.items ?? record.content);
      if (items.length === 0) return [];
      return [{ label: explicit.trim(), items }];
    });
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, raw]) => {
        const items = itemsFromUnknown(raw);
        if (items.length === 0) return [];
        return [{ label: labelFromKey(key), items }];
      }
    );
  }
  return [];
}

export function skillCategoryLabel(node: {
  metadata?: Record<string, unknown>;
}): string | null {
  const explicit = node.metadata?.categoryLabel;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const raw = node.metadata?.category;
  if (typeof raw === "string" && raw.trim()) return labelFromKey(raw);
  return null;
}
