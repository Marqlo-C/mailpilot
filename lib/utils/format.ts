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
