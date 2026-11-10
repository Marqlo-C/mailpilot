import { describe, it, expect, beforeEach, vi } from "vitest";
import { uiCookieKey, writeUiCookie, readUiCookie } from "../ui-cookie-helper";
import { readTabRail, persistTabRail } from "../tab-rail-preference";
import { readToolbar, persistToolbar } from "../toolbar-preference";
import { readRailAction, persistRailAction } from "../rail-action-preference";
import {
  readWavyMeterPreference,
  persistWavyMeterPreference,
} from "../wavy-meter-preference";
import {
  readWaveTogglePreference,
  persistWaveTogglePreference,
} from "../wave-toggle-preference";
import { readServerUiPreferences } from "../ui-preferences-server";

const mockCookiesStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const val = mockCookiesStore.get(name);
      return val ? { value: val } : undefined;
    },
  }),
}));

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe("UI Preferences Persistence & SSR Sync", () => {
  let mockLocalStorage: MemoryStorage;
  let cookieStore: string;

  beforeEach(() => {
    mockLocalStorage = new MemoryStorage();
    cookieStore = "";
    mockCookiesStore.clear();

    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("document", {
      get cookie() {
        return cookieStore;
      },
      set cookie(val: string) {
        const parts = val.split(";")[0].trim();
        const [k, v] = parts.split("=");
        const existing = cookieStore
          ? cookieStore.split("; ").filter((c) => !c.startsWith(`${k}=`))
          : [];
        existing.push(`${k}=${v}`);
        cookieStore = existing.join("; ");
      },
    });
  });

  describe("Cookie Helper Utilities", () => {
    it("generates correct cookie keys with and without accountId", () => {
      expect(uiCookieKey("test", "acc_123")).toBe("mp_ui_test_acc_123");
      expect(uiCookieKey("test", null)).toBe("mp_ui_test_global");
      expect(uiCookieKey("test", undefined)).toBe("mp_ui_test_global");
    });

    it("writes and reads cookies with account fallback", () => {
      writeUiCookie("demo", "acc_1", "dark");
      expect(readUiCookie("demo", "acc_1")).toBe("dark");

      // Global fallback test: writing to global
      writeUiCookie("demo", null, "light");
      expect(readUiCookie("demo", "acc_2")).toBe("light");
    });

    it("mirrors account cookie writes to global cookie", () => {
      writeUiCookie("demo_mirror", "acc_1", "dark");
      expect(readUiCookie("demo_mirror", "acc_1")).toBe("dark");
      // Another account should find the global fallback
      expect(readUiCookie("demo_mirror", "acc_99")).toBe("dark");
    });
  });

  describe("Tab Rail Preference", () => {
    it("reads default when storage is empty", () => {
      expect(readTabRail("acc_1")).toBe("light");
    });

    it("saves to both localStorage and cookies, and restores from either", () => {
      persistTabRail("acc_1", "dark");
      expect(mockLocalStorage.getItem("mailpilot_tab_rail:acc_1")).toBe("dark");
      expect(readUiCookie("tab_rail", "acc_1")).toBe("dark");

      // Clear localStorage - should still read from cookie
      mockLocalStorage.clear();
      expect(readTabRail("acc_1")).toBe("dark");
    });

    it("auto-backfills cookie when preference is present in localStorage but absent from cookies", () => {
      mockLocalStorage.setItem("mailpilot_tab_rail:acc_backfill", "dark");
      expect(readUiCookie("tab_rail", "acc_backfill")).toBeNull();

      const result = readTabRail("acc_backfill");
      expect(result).toBe("dark");
      expect(readUiCookie("tab_rail", "acc_backfill")).toBe("dark");
    });
  });

  describe("Toolbar Preference", () => {
    it("reads default when empty", () => {
      expect(readToolbar("acc_1")).toBe("light");
    });

    it("persists and restores dark variant", () => {
      persistToolbar("acc_1", "dark");
      expect(mockLocalStorage.getItem("mailpilot_toolbar:acc_1")).toBe("dark");
      expect(readUiCookie("toolbar", "acc_1")).toBe("dark");
      expect(readToolbar("acc_1")).toBe("dark");
    });
  });

  describe("Rail Action Preference", () => {
    it("reads default when empty", () => {
      expect(readRailAction("acc_1")).toBe("light");
    });

    it("persists and restores dark variant", () => {
      persistRailAction("acc_1", "dark");
      expect(mockLocalStorage.getItem("mailpilot_rail_action:acc_1")).toBe("dark");
      expect(readUiCookie("rail_action", "acc_1")).toBe("dark");
      expect(readRailAction("acc_1")).toBe("dark");
    });
  });

  describe("Wavy Meter Preference", () => {
    it("reads default light", () => {
      expect(readWavyMeterPreference("acc_1")).toBe("light");
    });

    it("persists dark and light variants with custom event dispatch", () => {
      let eventFired = false;
      vi.stubGlobal("CustomEvent", class CustomEvent {
        constructor(public type: string, public detail?: any) {}
      });
      vi.stubGlobal("window", {
        dispatchEvent: () => {
          eventFired = true;
          return true;
        },
      });

      persistWavyMeterPreference("acc_1", "dark");
      expect(mockLocalStorage.getItem("mailpilot_wavy_meter:acc_1")).toBe("dark");
      expect(readUiCookie("wavy_meter", "acc_1")).toBe("dark");
      expect(readWavyMeterPreference("acc_1")).toBe("dark");
      expect(eventFired).toBe(true);
    });

    it("ensures cookie is written before event dispatch so sync listeners read fresh variant on first click", () => {
      let readValueInsideListener: string | null = null;
      vi.stubGlobal("CustomEvent", class CustomEvent {
        constructor(public type: string, public detail?: any) {}
      });
      vi.stubGlobal("window", {
        dispatchEvent: () => {
          // Emulate what MeterPreferencesCard listener does synchronously inside dispatchEvent
          readValueInsideListener = readWavyMeterPreference("acc_1");
          return true;
        },
      });

      persistWavyMeterPreference("acc_1", "dark");
      expect(readValueInsideListener).toBe("dark");
    });
  });

  describe("Wave Toggle Preference", () => {
    it("reads default dark", () => {
      expect(readWaveTogglePreference("acc_1")).toBe("dark");
    });

    it("persists light and dark variants with custom event dispatch", () => {
      let eventFired = false;
      vi.stubGlobal("CustomEvent", class CustomEvent {
        constructor(public type: string, public detail?: any) {}
      });
      vi.stubGlobal("window", {
        dispatchEvent: () => {
          eventFired = true;
          return true;
        },
      });

      persistWaveTogglePreference("acc_1", "light");
      expect(mockLocalStorage.getItem("mailpilot_wave_toggle:acc_1")).toBe("light");
      expect(readUiCookie("wave_toggle", "acc_1")).toBe("light");
      expect(readWaveTogglePreference("acc_1")).toBe("light");
      expect(eventFired).toBe(true);
    });

    it("ensures cookie is written before event dispatch so toggle sync listeners read fresh variant on first click", () => {
      let readValueInsideListener: string | null = null;
      vi.stubGlobal("CustomEvent", class CustomEvent {
        constructor(public type: string, public detail?: any) {}
      });
      vi.stubGlobal("window", {
        dispatchEvent: () => {
          readValueInsideListener = readWaveTogglePreference("acc_1");
          return true;
        },
      });

      persistWaveTogglePreference("acc_1", "light");
      expect(readValueInsideListener).toBe("light");
    });
  });

  describe("Server Cookie Reader (SSR)", () => {
    it("reads defaults when no cookies exist", async () => {
      const prefs = await readServerUiPreferences("acc_1");
      expect(prefs).toEqual({
        tabRail: "light",
        toolbar: "light",
        railAction: "light",
        wavyMeter: "light",
        waveToggle: "dark",
      });
    });

    it("reads persisted cookie values on the server", async () => {
      mockCookiesStore.set(uiCookieKey("tab_rail", "acc_42"), "dark");
      mockCookiesStore.set(uiCookieKey("toolbar", "acc_42"), "dark");
      mockCookiesStore.set(uiCookieKey("rail_action", "acc_42"), "dark");
      mockCookiesStore.set(uiCookieKey("wavy_meter", "acc_42"), "dark");
      mockCookiesStore.set(uiCookieKey("wave_toggle", "acc_42"), "light");

      const prefs = await readServerUiPreferences("acc_42");
      expect(prefs).toEqual({
        tabRail: "dark",
        toolbar: "dark",
        railAction: "dark",
        wavyMeter: "dark",
        waveToggle: "light",
      });
    });

    it("falls back to global cookie when account cookie is absent", async () => {
      mockCookiesStore.set(uiCookieKey("tab_rail", null), "dark");

      const prefs = await readServerUiPreferences("acc_new");
      expect(prefs.tabRail).toBe("dark");
      expect(prefs.toolbar).toBe("light"); // default
    });
  });
});
