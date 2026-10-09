/**
 * Shared display formatting for contact lines and URLs.
 * Agnostic — no candidate-, domain-, or username-specific logic.
 */

/** Strip protocol / www / trailing punctuation for human-readable URL display. */
export function cleanDisplayUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .replace(/\.+$/, "");
}

/** Degree line without repeating a major that is already inside the degree name. */
export function formatEducationTitle(
  degree?: string | null,
  fieldOfStudy?: string | null
): string {
  const deg = degree?.trim() || "";
  const rawField = fieldOfStudy?.trim() || "";
  if (!deg && !rawField) return "";
  if (!rawField) return deg;
  if (!deg) return rawField;
  const field = rawField.replace(/^in\s+/i, "").trim();
  if (!field) return deg;
  if (deg.toLowerCase().includes(field.toLowerCase())) return deg;
  const minorLead = /^minor\s+in\s+/i.test(rawField);
  const mode = deg.toLowerCase().endsWith(" in")
    ? "space"
    : minorLead || /\bin\b/i.test(deg)
      ? "comma"
      : "in";
  if (mode === "space") return `${deg} ${field}`;
  if (mode === "comma") return `${deg}, ${field}`;
  return `${deg} in ${field}`;
}

/** Parent institution with a constituent school in parentheses. */
export function formatSchoolName(
  school: string,
  subSchool?: string | null
): string {
  const parent = school.trim();
  const child = subSchool?.trim() || "";
  if (!parent) return child;
  if (!child) return parent;
  if (parent.toLowerCase().includes(child.toLowerCase())) return parent;
  return `${parent} (${child})`;
}

/** Case-insensitive dedupe of contact strings; preserves first-seen order. */
export function dedupeContactItems(
  items: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of items) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result;
}
