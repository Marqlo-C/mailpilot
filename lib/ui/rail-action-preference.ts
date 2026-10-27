/**
 * Per-account light/dark choice for the white action buttons on the tab rail
 * row (localStorage only).
 */

export type RailActionVariant = "light" | "dark";

function railActionKey(accountId: string): string {
  return `mailpilot_rail_action:${accountId}`;
}

export function readRailAction(accountId: string): RailActionVariant {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(railActionKey(accountId)) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function persistRailAction(
  accountId: string,
  variant: RailActionVariant
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(railActionKey(accountId), variant);
  } catch {
    // Quota / private mode — ignore.
  }
}
