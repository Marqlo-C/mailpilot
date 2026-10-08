/**
 * Per-account tab rail choice (localStorage only).
 */

export type TabRailVariant = "light" | "dark";

function tabRailKey(accountId: string): string {
  return `mailpilot_tab_rail:${accountId}`;
}

export function readTabRail(accountId: string): TabRailVariant {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(tabRailKey(accountId)) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function persistTabRail(
  accountId: string,
  variant: TabRailVariant
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(tabRailKey(accountId), variant);
  } catch {
    // Quota / private mode — ignore.
  }
}
