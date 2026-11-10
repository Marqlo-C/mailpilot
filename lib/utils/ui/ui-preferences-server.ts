import { cookies } from "next/headers";
import { type TabRailVariant } from "./tab-rail-preference";
import { type ToolbarVariant } from "./toolbar-preference";
import { type RailActionVariant } from "./rail-action-preference";
import { type WavyMeterVariant } from "./wavy-meter-preference";
import { type WaveToggleVariant } from "./wave-toggle-preference";
import { uiCookieKey } from "./ui-cookie-helper";

export type ServerUiPreferences = {
  tabRail: TabRailVariant;
  toolbar: ToolbarVariant;
  railAction: RailActionVariant;
  wavyMeter: WavyMeterVariant;
  waveToggle: WaveToggleVariant;
};

/**
 * Server-side helper to read persistent UI tactile preferences directly from request cookies.
 * Enables Next.js Server Components and layout shells to render the user's selected
 * theme variants immediately on SSR, eliminating layout shifts and toggle jumping on first paint.
 */
export async function readServerUiPreferences(
  accountId?: string | null
): Promise<ServerUiPreferences> {
  try {
    const cookieStore = await cookies();

    const getPref = (name: string, fallback: string): string => {
      const key = uiCookieKey(name, accountId);
      const val = cookieStore.get(key)?.value;
      if (val === "light" || val === "dark") return val;
      if (accountId) {
        const globalVal = cookieStore.get(uiCookieKey(name, null))?.value;
        if (globalVal === "light" || globalVal === "dark") return globalVal;
      }
      return fallback;
    };

    return {
      tabRail: getPref("tab_rail", "light") as TabRailVariant,
      toolbar: getPref("toolbar", "light") as ToolbarVariant,
      railAction: getPref("rail_action", "light") as RailActionVariant,
      wavyMeter: getPref("wavy_meter", "light") as WavyMeterVariant,
      waveToggle: getPref("wave_toggle", "dark") as WaveToggleVariant,
    };
  } catch {
    return {
      tabRail: "light",
      toolbar: "light",
      railAction: "light",
      wavyMeter: "light",
      waveToggle: "dark",
    };
  }
}
