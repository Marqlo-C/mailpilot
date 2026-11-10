import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  rememberSidebarPageTab,
  clearSidebarPageTab,
  peekSidebarPageTab,
  persistActivePageTab,
  readActivePageTab,
  resolveInitialPageTab,
  SETTINGS_PAGE_TABS,
  JOB_RADAR_PAGE_TABS,
  SUBSCRIPTION_PAGE_TABS,
} from "../page-tabs";

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

describe("Navigation & Account-Scoped Tab Persistence", () => {
  let mockSessionStorage: MemoryStorage;
  let mockLocalStorage: MemoryStorage;
  let cookieStore: string;

  beforeEach(() => {
    mockSessionStorage = new MemoryStorage();
    mockLocalStorage = new MemoryStorage();
    cookieStore = "";

    // Setup browser globals for test environment
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", mockSessionStorage);
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("document", {
      get cookie() {
        return cookieStore;
      },
      set cookie(val: string) {
        cookieStore = val;
      },
    });
  });

  describe("Sidebar Navigation Tab Passing (sessionStorage)", () => {
    it("stores and peeks a sidebar tab for matching href", () => {
      rememberSidebarPageTab("/settings", "profile");
      const tab = peekSidebarPageTab(
        "/settings",
        SETTINGS_PAGE_TABS.map((t) => t.value)
      );
      expect(tab).toBe("profile");
    });

    it("returns null when href does not match", () => {
      rememberSidebarPageTab("/settings", "profile");
      const tab = peekSidebarPageTab(
        "/jobs",
        JOB_RADAR_PAGE_TABS.map((t) => t.value)
      );
      expect(tab).toBeNull();
    });

    it("returns null when tab is not in allowed list", () => {
      rememberSidebarPageTab("/settings", "unknown_tab");
      const tab = peekSidebarPageTab(
        "/settings",
        SETTINGS_PAGE_TABS.map((t) => t.value)
      );
      expect(tab).toBeNull();
    });

    it("clears pending sidebar tab cleanly", () => {
      rememberSidebarPageTab("/settings", "profile");
      clearSidebarPageTab();
      const tab = peekSidebarPageTab(
        "/settings",
        SETTINGS_PAGE_TABS.map((t) => t.value)
      );
      expect(tab).toBeNull();
    });
  });

  describe("Persistent Active Tab Persistence (localStorage & Cookie)", () => {
    it("persists and reads active tab scoped to account", () => {
      persistActivePageTab("/settings", "profile", "acc_123");
      const tab = readActivePageTab(
        "/settings",
        SETTINGS_PAGE_TABS.map((t) => t.value),
        "acc_123"
      );
      expect(tab).toBe("profile");
    });

    it("isolates tabs across different accounts on the same page", () => {
      persistActivePageTab("/settings", "profile", "acc_1");
      persistActivePageTab("/settings", "ai", "acc_2");

      expect(
        readActivePageTab(
          "/settings",
          SETTINGS_PAGE_TABS.map((t) => t.value),
          "acc_1"
        )
      ).toBe("profile");

      expect(
        readActivePageTab(
          "/settings",
          SETTINGS_PAGE_TABS.map((t) => t.value),
          "acc_2"
        )
      ).toBe("ai");
    });

    it("falls back to global tab when account-scoped tab is not yet set", () => {
      persistActivePageTab("/jobs", "applied", null);
      const tab = readActivePageTab(
        "/jobs",
        JOB_RADAR_PAGE_TABS.map((t) => t.value),
        "acc_fresh"
      );
      expect(tab).toBe("applied");
    });

    it("returns null if stored tab is no longer allowed in taxonomy", () => {
      localStorage.setItem("mailpilot_active_tab:account:acc_1:/settings", "deprecated_tab");
      const tab = readActivePageTab(
        "/settings",
        SETTINGS_PAGE_TABS.map((t) => t.value),
        "acc_1"
      );
      expect(tab).toBeNull();
    });
  });

  describe("resolveInitialPageTab Resolution Priority", () => {
    it("prioritizes pending sidebar navigation click over persistent storage", () => {
      rememberSidebarPageTab("/settings", "automation");
      persistActivePageTab("/settings", "profile", "acc_1");

      const resolved = resolveInitialPageTab({
        href: "/settings",
        allowed: SETTINGS_PAGE_TABS.map((t) => t.value),
        fallback: "accounts",
        accountId: "acc_1",
      });

      expect(resolved).toBe("automation");
    });

    it("falls back to persistent tab when no sidebar navigation is pending (e.g. Page Refresh)", () => {
      persistActivePageTab("/settings", "outbound", "acc_1");

      const resolved = resolveInitialPageTab({
        href: "/settings",
        allowed: SETTINGS_PAGE_TABS.map((t) => t.value),
        fallback: "accounts",
        accountId: "acc_1",
      });

      expect(resolved).toBe("outbound");
    });

    it("falls back to default fallback when neither sidebar nor storage is present", () => {
      const resolved = resolveInitialPageTab({
        href: "/subscriptions",
        allowed: SUBSCRIPTION_PAGE_TABS.map((t) => t.value),
        fallback: "active",
        accountId: "acc_new",
      });

      expect(resolved).toBe("active");
    });
  });
});
