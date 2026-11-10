import { readUiCookie, writeUiCookie } from "./ui-cookie-helper";

/**
 * Per-account wavy meter variant preference (localStorage and cookie mirrored).
 */

export type WavyMeterVariant = "light" | "dark";

export const WAVY_METER_CHANGE_EVENT = "mailpilot_wavy_meter_change";

function wavyMeterKey(accountId: string): string {
  return `mailpilot_wavy_meter:${accountId}`;
}

export function readWavyMeterPreference(
  accountId?: string | null
): WavyMeterVariant {
  if (typeof window === "undefined") return "light";
  try {
    if (accountId) {
      const saved = localStorage.getItem(wavyMeterKey(accountId));
      if (saved === "dark" || saved === "light") {
        return saved;
      }
    }
    const fallback = localStorage.getItem("mailpilot_wavy_meter_global");
    if (fallback === "dark" || fallback === "light") {
      return fallback;
    }
  } catch {
    // Quota / private mode — fallback to cookie
  }

  const cookieVal = readUiCookie("wavy_meter", accountId);
  if (cookieVal === "dark" || cookieVal === "light") return cookieVal;
  return "light";
}

export function persistWavyMeterPreference(
  accountId: string | null | undefined,
  variant: WavyMeterVariant
): void {
  if (typeof window === "undefined") return;
  try {
    if (accountId) {
      localStorage.setItem(wavyMeterKey(accountId), variant);
    }
    localStorage.setItem("mailpilot_wavy_meter_global", variant);
  } catch {
    // Quota / private mode — ignore.
  }

  writeUiCookie("wavy_meter", accountId, variant);

  window.dispatchEvent(
    new CustomEvent(WAVY_METER_CHANGE_EVENT, {
      detail: { variant, accountId },
    })
  );
}
