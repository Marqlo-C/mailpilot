import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { SidebarNav, SIDEBAR_SETTINGS_NAV } from "../sidebar-nav";
import { SidebarFlyoutProvider } from "../sidebar-flyout-provider";
import type { SidebarTabCounts } from "@/lib/data";

const emptyTabCounts: SidebarTabCounts = {
  jobs: { leads: 0, applied: 0, action: 0, history: 0 },
  subscriptions: { active: 0, archive: 0 },
};

let mockPathname = "/jobs";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, className }: any) =>
    React.createElement("a", { href, onClick, className }, children),
}));

vi.mock("@/components/layout/sync-status-provider", () => ({
  useSyncStatus: () => ({
    isSyncing: false,
    pendingCount: 0,
    hasEverSynced: true,
  }),
}));

function createMockEnvironment() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class MockElement {}
  class MockIFrame {}

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
        top: 100,
        bottom: 200,
        left: 100,
        right: 200,
        width: 100,
        height: 100,
      }),
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
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: NodeJS.Timeout) => clearTimeout(id),
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    sessionStorage: {
      setItem: vi.fn(),
      getItem: vi.fn(),
      removeItem: vi.fn(),
    },
  };
  doc.defaultView = win;

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("sessionStorage", win.sessionStorage);

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

describe("SidebarNav - Settings Flyout Menu", () => {
  let root: ReactDOMClient.Root;
  let container: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPathname = "/jobs";
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
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the developer tab in the settings flyout when isDev = true", async () => {
    await act(async () => {
      root.render(
        React.createElement(
          SidebarFlyoutProvider,
          null,
          React.createElement(SidebarNav, {
            collapsed: false,
            activeAccountId: "acc_1",
            items: SIDEBAR_SETTINGS_NAV,
            tabCounts: emptyTabCounts,
            isDev: true,
          })
        )
      );
    });

    // Find the settings nav row
    const rowNode = findNode(
      container,
      (n) => n.attributes?.["data-nav-href"] === "/settings"
    );
    expect(rowNode).toBeDefined();

    // Trigger hover on pointer enter to open flyout menu
    const rowProps = getReactProps(rowNode);
    act(() => {
      rowProps.onPointerEnter();
    });

    // Advance dwell timer so TabFlyout renders
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Verify flyout is mounted and includes Developer tab
    const flyout = findNode(
      container,
      (n) => n.attributes?.["data-sidebar-flyout"] === "nav-tabs"
    );
    expect(flyout).toBeDefined();

    const links = findNodes(flyout, (n) => n.tagName === "A");
    const linkTexts = links.map((link) => link.textContent);

    expect(linkTexts).toContain("Developer");
    expect(linkTexts).toContain("Accounts");
    expect(linkTexts).toContain("Automation");
  });

  it("excludes the developer tab from the settings flyout when isDev = false", async () => {
    await act(async () => {
      root.render(
        React.createElement(
          SidebarFlyoutProvider,
          null,
          React.createElement(SidebarNav, {
            collapsed: false,
            activeAccountId: "acc_1",
            items: SIDEBAR_SETTINGS_NAV,
            tabCounts: emptyTabCounts,
            isDev: false,
          })
        )
      );
    });

    const rowNode = findNode(
      container,
      (n) => n.attributes?.["data-nav-href"] === "/settings"
    );
    expect(rowNode).toBeDefined();

    const rowProps = getReactProps(rowNode);
    act(() => {
      rowProps.onPointerEnter();
    });

    act(() => {
      vi.advanceTimersByTime(250);
    });

    const flyout = findNode(
      container,
      (n) => n.attributes?.["data-sidebar-flyout"] === "nav-tabs"
    );
    expect(flyout).toBeDefined();

    const links = findNodes(flyout, (n) => n.tagName === "A");
    const linkTexts = links.map((link) => link.textContent);

    expect(linkTexts).not.toContain("Developer");
    expect(linkTexts).toContain("Accounts");
    expect(linkTexts).toContain("Automation");
  });
});
