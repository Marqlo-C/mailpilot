import { readUiCookie, writeUiCookie } from "./ui-cookie-helper";

/**
 * Per-account tab rail choice (localStorage and cookie mirrored).
 */

export type TabRailVariant = "light" | "dark";

function tabRailKey(accountId: string): string {
  return `mailpilot_tab_rail:${accountId}`;
}

export function readTabRail(accountId: string): TabRailVariant {
  if (typeof window === "undefined") return "light";
  const cookieVal = readUiCookie("tab_rail", accountId);
  if (cookieVal === "dark" || cookieVal === "light") return cookieVal;
  try {
    const saved = localStorage.getItem(tabRailKey(accountId));
    if (saved === "dark" || saved === "light") {
      writeUiCookie("tab_rail", accountId, saved);
      return saved;
    }
    const globalSaved = localStorage.getItem("mailpilot_tab_rail_global");
    if (globalSaved === "dark" || globalSaved === "light") {
      writeUiCookie("tab_rail", accountId, globalSaved);
      return globalSaved;
    }
    return "light";
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
  writeUiCookie("tab_rail", accountId, variant);
}
