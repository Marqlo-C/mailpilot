import { readUiCookie, writeUiCookie } from "./ui-cookie-helper";

/**
 * Per-account light/dark choice for the filter toolbar plate (localStorage and cookie mirrored).
 */

export type ToolbarVariant = "light" | "dark";

function toolbarKey(accountId: string): string {
  return `mailpilot_toolbar:${accountId}`;
}

export function readToolbar(accountId: string): ToolbarVariant {
  if (typeof window === "undefined") return "light";
  const cookieVal = readUiCookie("toolbar", accountId);
  if (cookieVal === "dark" || cookieVal === "light") return cookieVal;
  try {
    const saved = localStorage.getItem(toolbarKey(accountId));
    if (saved === "dark" || saved === "light") {
      writeUiCookie("toolbar", accountId, saved);
      return saved;
    }
    const globalSaved = localStorage.getItem("mailpilot_toolbar_global");
    if (globalSaved === "dark" || globalSaved === "light") {
      writeUiCookie("toolbar", accountId, globalSaved);
      return globalSaved;
    }
    return "light";
  } catch {
    return "light";
  }
}

export function persistToolbar(
  accountId: string,
  variant: ToolbarVariant
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(toolbarKey(accountId), variant);
  } catch {
    // Quota / private mode — ignore.
  }
  writeUiCookie("toolbar", accountId, variant);
}
