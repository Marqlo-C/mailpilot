import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { FeatureFlagsCard } from "../feature-flags-card";
import { DEFAULT_ACCOUNT_RULES, type AccountRules } from "@/lib/validations/rules.schema";

const mockToggleFeatureFlagAction = vi.fn();
vi.mock("@/app/actions/settings", () => ({
  toggleFeatureFlagAction: (...args: any[]) => mockToggleFeatureFlagAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

const mockRules: AccountRules = {
  ...DEFAULT_ACCOUNT_RULES,
  applicationMode: "MANUAL_REVIEW",
  autoCleanAfterUnsub: "NONE",
  allowCloudFallback: false,
  inventMetrics: false,
  sectionOrderingMode: "AI_OPTIMAL",
  contentInclusionMode: "AI_OPTIMAL",
  targetPageBudget: "auto",
  enableAiTailoringDefaults: true,
  featureFlags: {
    embedded_ai: true,
    shadow_evaluation: false,
  },
};

function createMockEnvironment() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class MockElement {}
  class MockIFrame {}
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  const createMockNode = (tag: string) => {
    let directText = "";
    const el: any = {
      nodeType: 1,
      nodeName: tag.toUpperCase(),
      tagName: tag.toUpperCase(),
      style: {},
      attributes: {} as Record<string, string>,
      children: [] as any[],
      get textContent() {
        if (directText) return directText;
        return el.children
          .map((c: any) => c.textContent || c.nodeValue || "")
          .join("");
      },
      set textContent(v: string) {
        directText = v;
      },
      setAttribute: (k: string, v: string) => {
        el.attributes[k] = v;
      },
      getAttribute: (k: string) => el.attributes[k],
      removeAttribute: (k: string) => {
        delete el.attributes[k];
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: (child: any) => {
        el.children.push(child);
      },
      removeChild: (child: any) => {
        const idx = el.children.indexOf(child);
        if (idx >= 0) el.children.splice(idx, 1);
      },
      insertBefore: (child: any) => {
        el.children.push(child);
      },
      getBoundingClientRect: () => ({
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      }),
      getContext: () => null,
      contains: () => false,
      closest: () => null,
    };
    return el;
  };

  const doc: any = {
    nodeType: 9,
    nodeName: "#document",
    activeElement: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tag: string) => {
      const el = createMockNode(tag);
      el.ownerDocument = doc;
      return el;
    },
    createElementNS: (_ns: string, tag: string) => {
      const el = createMockNode(tag);
      el.ownerDocument = doc;
      return el;
    },
    createTextNode: (text: string) => {
      let val = text;
      const node: any = {
        nodeType: 3,
        nodeName: "#text",
        get nodeValue() {
          return val;
        },
        set nodeValue(v: string) {
          val = v;
        },
        get data() {
          return val;
        },
        set data(v: string) {
          val = v;
        },
        get textContent() {
          return val;
        },
        set textContent(v: string) {
          val = v;
        },
        ownerDocument: doc,
      };
      return node;
    },
  };

  const body = createMockNode("BODY");
  body.ownerDocument = doc;
  doc.body = body;

  const win: any = {
    document: doc,
    Element: MockElement,
    HTMLIFrameElement: MockIFrame,
    ResizeObserver: MockResizeObserver,
    setTimeout: (fn: Function, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: NodeJS.Timeout) => clearTimeout(id),
    requestAnimationFrame: (cb: Function) => setTimeout(cb, 16),
    cancelAnimationFrame: (id: any) => clearTimeout(id),
    getComputedStyle: () => ({
      fontWeight: "400",
      fontSize: "12px",
      fontFamily: "sans-serif",
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  };
  doc.defaultView = win;

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("localStorage", win.localStorage);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal("requestAnimationFrame", win.requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", win.cancelAnimationFrame);

  const container = createMockNode("DIV");
  container.ownerDocument = doc;

  const root = ReactDOMClient.createRoot(container);
  return { root, container };
}

function findNode(node: any, predicate: (n: any) => boolean): any {
  if (!node) return null;
  if (predicate(node)) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function findNodes(node: any, predicate: (n: any) => boolean): any[] {
  const results: any[] = [];
  function walk(n: any) {
    if (!n) return;
    if (predicate(n)) results.push(n);
    if (n.children) {
      for (const child of n.children) walk(child);
    }
  }
  walk(node);
  return results;
}

function getReactProps(el: any) {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key ? el[key] : null;
}

describe("FeatureFlagsCard - Multicard Layout", () => {
  let root: ReactDOMClient.Root;
  let container: any;

  beforeEach(() => {
    mockToggleFeatureFlagAction.mockReset();
    mockToggleFeatureFlagAction.mockResolvedValue({ success: true });
    const env = createMockEnvironment();
    root = env.root;
    container = env.container;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    vi.restoreAllMocks();
  });

  it("renders with Level 1 SettingsSectionCard and Level 2 SettingsFeatureCard multicards", async () => {
    await act(async () => {
      root.render(
        React.createElement(FeatureFlagsCard, {
          accountId: "acc_1",
          rules: mockRules,
          environment: "development",
        })
      );
    });

    // Check collapsible feature cards exist for the 3 system groups
    const featureCardHeaders = findNodes(
      container,
      (n) => n.attributes?.["aria-expanded"] !== undefined
    );
    expect(featureCardHeaders.length).toBe(3);

    // Group titles should appear inside the Level 2 cards
    const textContent = container.textContent;
    expect(textContent).toContain("AI & Vector Engines");
    expect(textContent).toContain("Platform Telemetry");
    expect(textContent).toContain("Scraping & Egress");
  });

  it("renders status pills for each system group card", async () => {
    await act(async () => {
      root.render(
        React.createElement(FeatureFlagsCard, {
          accountId: "acc_1",
          rules: mockRules,
          environment: "development",
        })
      );
    });

    const featureCardHeaders = findNodes(
      container,
      (n) => n.attributes?.["aria-expanded"] !== undefined
    );
    expect(featureCardHeaders.length).toBe(3);

    // AI & Vector engines: embedded_ai is true, mode_b_metric_synthesis default false -> 1/2 Active
    const aiCardText = featureCardHeaders[0].textContent;
    expect(aiCardText).toContain("1/2 Active");

    // Platform telemetry: shadow_evaluation is false -> Disabled
    const telemetryCardText = featureCardHeaders[1].textContent;
    expect(telemetryCardText).toContain("Disabled");
  });

  it("allows collapsing and expanding individual feature flag group cards", async () => {
    await act(async () => {
      root.render(
        React.createElement(FeatureFlagsCard, {
          accountId: "acc_1",
          rules: mockRules,
          environment: "development",
        })
      );
    });

    const featureCardHeaders = findNodes(
      container,
      (n) => n.attributes?.["aria-expanded"] !== undefined
    );
    const firstHeader = featureCardHeaders[0];
    expect(Boolean(firstHeader.attributes["aria-expanded"])).toBe(true);

    // Click to collapse
    const headerProps = getReactProps(firstHeader);
    await act(async () => {
      headerProps.onClick({ target: firstHeader });
    });

    expect(firstHeader.attributes["aria-expanded"]).toBe(false);
  });
});
