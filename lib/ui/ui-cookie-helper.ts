/**
 * Shared client-side cookie helper for UI tactile appearance preferences.
 * Mirrored alongside localStorage so that SSR layouts and Settings cards
 * render with the user's saved UI look immediately on first paint.
 */

export function uiCookieKey(
  name: string,
  accountId: string | null | undefined
): string {
  const prefix = accountId
    ? accountId.replace(/[^a-zA-Z0-9]/g, "_")
    : "global";
  return `mp_ui_${name}_${prefix}`;
}

export function writeUiCookie(
  name: string,
  accountId: string | null | undefined,
  value: string
): void {
  if (typeof document === "undefined") return;
  try {
    const key = uiCookieKey(name, accountId);
    document.cookie = `${key}=${encodeURIComponent(
      value
    )}; path=/; max-age=31536000; SameSite=Lax`;

    // Also mirror to global cookie so SSR layouts without resolved account still receive the preference
    if (accountId) {
      const globalKey = uiCookieKey(name, null);
      document.cookie = `${globalKey}=${encodeURIComponent(
        value
      )}; path=/; max-age=31536000; SameSite=Lax`;
    }
  } catch {
    // Ignore quota / cookie errors
  }
}

export function readUiCookie(
  name: string,
  accountId: string | null | undefined
): string | null {
  if (typeof document === "undefined") return null;
  try {
    const key = uiCookieKey(name, accountId);
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${key}=`));
    if (match) {
      return decodeURIComponent(match.split("=")[1] || "");
    }
    if (accountId) {
      const globalKey = uiCookieKey(name, null);
      const globalMatch = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${globalKey}=`));
      if (globalMatch) {
        return decodeURIComponent(globalMatch.split("=")[1] || "");
      }
    }
    return null;
  } catch {
    return null;
  }
}
