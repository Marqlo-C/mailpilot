import { readUiCookie, writeUiCookie } from "./ui-cookie-helper";

/**
 * Per-account light/dark choice for the white action buttons on the tab rail
 * row (localStorage and cookie mirrored).
 */

export type RailActionVariant = "light" | "dark";

function railActionKey(accountId: string): string {
  return `mailpilot_rail_action:${accountId}`;
}

export function readRailAction(accountId: string): RailActionVariant {
  if (typeof window === "undefined") return "light";
  const cookieVal = readUiCookie("rail_action", accountId);
  if (cookieVal === "dark" || cookieVal === "light") return cookieVal;
  try {
    const saved = localStorage.getItem(railActionKey(accountId));
    if (saved === "dark" || saved === "light") {
      writeUiCookie("rail_action", accountId, saved);
      return saved;
    }
    const globalSaved = localStorage.getItem("mailpilot_rail_action_global");
    if (globalSaved === "dark" || globalSaved === "light") {
      writeUiCookie("rail_action", accountId, globalSaved);
      return globalSaved;
    }
    return "light";
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
  writeUiCookie("rail_action", accountId, variant);
}
