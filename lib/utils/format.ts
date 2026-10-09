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

/** Role line. The workplace is included only when one was captured. */
export function formatExperienceHeading(
  role?: string | null,
  company?: string | null,
  location?: string | null
): string {
  const title = role?.trim() ?? "";
  const org = company?.trim() ?? "";
  const place = location?.trim() ?? "";
  const parts = [title];
  if (org && org.toLowerCase() !== title.toLowerCase()) parts.push(org);
  if (place) parts.push(place);
  return parts.filter(Boolean).join(" · ");
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

/**
 * Education date line.
 * A finished range stays a range. An open enrollment ends at Present.
 * A target date on an unfinished record is prefixed with Expected.
 */
export function formatEducationDates(education: {
  startDate?: string | null;
  graduationDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}): string {
  const start = education.startDate?.trim() ?? "";
  const end = (education.graduationDate || education.endDate)
    ?.replace(/^(?:expected|anticipated)\s+/i, "")
    .trim() ?? "";
  const status = education.status ?? "GRADUATED";
  if (start && end) return `${start} – ${end}`;
  if (start && status === "IN_PROGRESS") return `${start} – Present`;
  if (!start && end && status === "IN_PROGRESS") return `Expected ${end}`;
  if (end) return end;
  return start;
}

/** Short label for an unfinished education record. */
export function educationProgressLabel(education: {
  startDate?: string | null;
  graduationDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}): "In Progress" | "Expected" | null {
  if (education.status !== "IN_PROGRESS") return null;
  const start = education.startDate?.trim() ?? "";
  const end = (education.graduationDate || education.endDate)?.trim() ?? "";
  if (!start && end) return "Expected";
  return "In Progress";
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
