import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseOutboundAccordion,
  parseAutomationAccordion,
  parseOllamaAccordion,
  loadStoredOutboundAccordion,
  saveStoredOutboundAccordion,
  loadStoredAutomationAccordion,
  saveStoredAutomationAccordion,
  loadStoredOllamaAccordion,
  saveStoredOllamaAccordion,
  DEFAULT_OUTBOUND_ACCORDION,
  DEFAULT_AUTOMATION_ACCORDION,
  DEFAULT_OLLAMA_ACCORDION,
} from "../settings-accordion";

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

describe("Settings Accordion Persistence (SSOT: localStorage & Cookies)", () => {
  let mockLocalStorage: MemoryStorage;
  let cookieStore: string;

  beforeEach(() => {
    mockLocalStorage = new MemoryStorage();
    cookieStore = "";

    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("document", {
      get cookie() {
        return cookieStore;
      },
      set cookie(val: string) {
        // Simple cookie assignment mock supporting multiple cookies separated by ;
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

  describe("Safe Parsers & Normalizers", () => {
    it("parses valid outbound accordion json", () => {
      const parsed = parseOutboundAccordion(
        JSON.stringify({
          metricOpen: false,
          orderingOpen: true,
          inclusionOpen: false,
          budgetOpen: true,
          layoutOpen: false,
        })
      );
      expect(parsed).toEqual({
        metricOpen: false,
        orderingOpen: true,
        inclusionOpen: false,
        budgetOpen: true,
        layoutOpen: false,
      });
    });

    it("falls back gracefully on malformed or empty outbound json", () => {
      expect(parseOutboundAccordion(null)).toBeNull();
      expect(parseOutboundAccordion("not json")).toBeNull();
      expect(parseOutboundAccordion("{}")).toEqual({
        metricOpen: true,
        orderingOpen: true,
        inclusionOpen: true,
        budgetOpen: true,
        layoutOpen: true,
      });
    });

    it("normalizes ollama step accordion when all steps are closed", () => {
      const parsed = parseOllamaAccordion(
        JSON.stringify({
          ollamaSubOpen: true,
          step1Open: false,
          step2Open: false,
          step3Open: false,
        })
      );
      expect(parsed?.step3Open).toBe(true);
    });
  });

  describe("Outbound Accordion Persistence (Droppable Layout Card)", () => {
    it("persists to both localStorage and cookie scoped to account", () => {
      const targetState = {
        metricOpen: false,
        orderingOpen: false,
        inclusionOpen: false,
        budgetOpen: false,
        layoutOpen: false,
      };

      saveStoredOutboundAccordion("acc_dev", targetState);

      const loaded = loadStoredOutboundAccordion("acc_dev");
      expect(loaded).toEqual(targetState);

      // Verify cookie exists
      expect(cookieStore).toContain("mp_acc_outbound_acc_dev=");
      // Verify localStorage exists
      expect(
        mockLocalStorage.getItem("mailpilot_outbound_accordion_acc_dev")
      ).toBe(JSON.stringify(targetState));
    });

    it("isolates accordion state between multiple accounts", () => {
      saveStoredOutboundAccordion("acc_1", {
        ...DEFAULT_OUTBOUND_ACCORDION,
        layoutOpen: false,
      });
      saveStoredOutboundAccordion("acc_2", {
        ...DEFAULT_OUTBOUND_ACCORDION,
        layoutOpen: true,
      });

      expect(loadStoredOutboundAccordion("acc_1").layoutOpen).toBe(false);
      expect(loadStoredOutboundAccordion("acc_2").layoutOpen).toBe(true);
    });

    it("falls back to global state if account has not yet stored state", () => {
      saveStoredOutboundAccordion(null, {
        ...DEFAULT_OUTBOUND_ACCORDION,
        layoutOpen: false,
      });

      const loaded = loadStoredOutboundAccordion("acc_fresh");
      expect(loaded.layoutOpen).toBe(false);
    });

    it("returns default state when nothing is stored", () => {
      const loaded = loadStoredOutboundAccordion("acc_brand_new");
      expect(loaded).toEqual(DEFAULT_OUTBOUND_ACCORDION);
    });
  });

  describe("Automation & AI Models Accordion Persistence", () => {
    it("persists and restores automation accordion across accounts", () => {
      const state = {
        matchOpen: false,
        syncOpen: true,
        excludedOpen: false,
        retentionOpen: true,
        lifecycleOpen: false,
      };

      saveStoredAutomationAccordion("acc_auto", state);
      expect(loadStoredAutomationAccordion("acc_auto")).toEqual(state);
      expect(cookieStore).toContain("mp_acc_automation_acc_auto=");
    });

    it("persists and restores ollama accordion", () => {
      const state = {
        ollamaSubOpen: true,
        step1Open: false,
        step2Open: true,
        step3Open: false,
      };

      saveStoredOllamaAccordion("acc_ai", state);
      expect(loadStoredOllamaAccordion("acc_ai")).toEqual(state);
      expect(cookieStore).toContain("mp_acc_ollama_acc_ai=");
    });
  });
});
