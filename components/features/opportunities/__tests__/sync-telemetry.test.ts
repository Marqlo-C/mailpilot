import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { SyncTelemetry } from "../sync-telemetry";

let mockSyncState = {
  isSyncing: false,
  syncKind: null as string | null,
  pendingCount: 0,
  hasEverSynced: true,
  connected: true,
  forceReset: vi.fn(),
  markSyncStarted: vi.fn(),
  totalToProcess: null as number | null,
  lastSyncProcessed: null as number | null,
  syncPendingTotal: null as number | null,
  lastSyncPendingProcessed: null as number | null,
  recentCount: 0,
  accountId: "acc_test",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/layout/sync-status-provider", () => ({
  SYNC_STARTED_EVENT: "mailpilot:sync-started",
  useSyncStatus: () => mockSyncState,
}));

vi.mock("@/components/layout/sidebar-flyout-provider", () => ({
  useSidebarFlyout: () => ({
    closeSidebarFlyout: vi.fn(),
  }),
}));

vi.mock("@/app/actions/email", () => ({
  drainPendingAiQueue: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  LabelTooltip: ({ children, label }: any) =>
    React.createElement("div", { "data-testid": "label-tooltip", title: label }, children),
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
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
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
    createTextNode: (text: string) => ({
      nodeType: 3,
      nodeName: "#text",
      nodeValue: text,
      ownerDocument: doc,
    }),
  };

  const body = createMockNode("BODY");
  body.ownerDocument = doc;
  doc.body = body;

  const win: any = {
    document: doc,
    HTMLIFrameElement: MockIFrame,
    Element: MockElement,
    setTimeout: (fn: Function, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: NodeJS.Timeout) => clearTimeout(id),
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
  };

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);

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

describe("SyncTelemetry sidebar Ace reviewing action", () => {
  let env: ReturnType<typeof createMockEnvironment>;

  beforeEach(() => {
    env = createMockEnvironment();
    mockSyncState = {
      isSyncing: true,
      syncKind: "queued",
      pendingCount: 4,
      hasEverSynced: true,
      connected: true,
      forceReset: vi.fn(),
      markSyncStarted: vi.fn(),
      totalToProcess: null,
      lastSyncProcessed: null,
      syncPendingTotal: 4,
      lastSyncPendingProcessed: 1,
      recentCount: 0,
      accountId: "acc_test",
    };
  });

  afterEach(() => {
    act(() => {
      env.root.unmount();
    });
    vi.restoreAllMocks();
  });

  it("renders a filled in Square icon (size-2 fill-current) instead of X when Ace review is running", async () => {
    await act(async () => {
      env.root.render(
        React.createElement(SyncTelemetry, {
          panel: true,
          connected: true,
        })
      );
    });

    const squareIcon = findNode(
      env.container,
      (n) =>
        (n.tagName === "SVG" || n.tagName === "svg") &&
        (n.attributes?.class?.includes("lucide-square") ||
          n.className?.includes("lucide-square"))
    );
    expect(squareIcon).not.toBeNull();
    const squareClass = squareIcon?.attributes?.class || squareIcon?.className || "";
    expect(squareClass).toContain("fill-current");
    expect(squareClass).toContain("size-2.5");

    // Ensure X is not rendered
    const xIcon = findNode(
      env.container,
      (n) =>
        (n.tagName === "SVG" || n.tagName === "svg") &&
        (n.attributes?.class?.includes("lucide-x") ||
          n.className?.includes("lucide-x"))
    );
    expect(xIcon).toBeNull();
  });
});
