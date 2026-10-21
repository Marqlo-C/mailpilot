/**
 * Per-account wavy meter variant preference (localStorage only).
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
      if (saved === "dark" || saved === "light") return saved;
    }
    const fallback = localStorage.getItem("mailpilot_wavy_meter_global");
    return fallback === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
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
    window.dispatchEvent(
      new CustomEvent(WAVY_METER_CHANGE_EVENT, {
        detail: { variant, accountId },
      })
    );
  } catch {
    // Quota / private mode — ignore.
  }
}
