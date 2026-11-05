/**
 * Per-account light/dark choice for the filter toolbar plate (localStorage only).
 */

export type ToolbarVariant = "light" | "dark";

function toolbarKey(accountId: string): string {
  return `mailpilot_toolbar:${accountId}`;
}

export function readToolbar(accountId: string): ToolbarVariant {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(toolbarKey(accountId)) === "dark"
      ? "dark"
      : "light";
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
}
