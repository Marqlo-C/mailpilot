import { readUiCookie, writeUiCookie } from "./ui-cookie-helper";

/**
 * Per-account wave toggle variant preference (localStorage and cookie mirrored).
 */

export type WaveToggleVariant = "light" | "dark";

export const WAVE_TOGGLE_CHANGE_EVENT = "mailpilot_wave_toggle_change";

function waveToggleKey(accountId: string): string {
  return `mailpilot_wave_toggle:${accountId}`;
}

export function readWaveTogglePreference(
  accountId?: string | null
): WaveToggleVariant {
  if (typeof window === "undefined") return "dark";
  try {
    if (accountId) {
      const saved = localStorage.getItem(waveToggleKey(accountId));
      if (saved === "dark" || saved === "light") {
        return saved;
      }
    }
    const fallback = localStorage.getItem("mailpilot_wave_toggle_global");
    if (fallback === "dark" || fallback === "light") {
      return fallback;
    }
  } catch {
    // Quota / private mode — fallback to cookie
  }

  const cookieVal = readUiCookie("wave_toggle", accountId);
  if (cookieVal === "dark" || cookieVal === "light") return cookieVal;
  return "dark";
}

export function persistWaveTogglePreference(
  accountId: string | null | undefined,
  variant: WaveToggleVariant
): void {
  if (typeof window === "undefined") return;
  try {
    if (accountId) {
      localStorage.setItem(waveToggleKey(accountId), variant);
    }
    localStorage.setItem("mailpilot_wave_toggle_global", variant);
  } catch {
    // Quota / private mode — ignore.
  }

  writeUiCookie("wave_toggle", accountId, variant);

  window.dispatchEvent(
    new CustomEvent(WAVE_TOGGLE_CHANGE_EVENT, {
      detail: { variant, accountId },
    })
  );
}
