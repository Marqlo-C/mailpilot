import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { GlobalSyncTracker } from "../global-sync-tracker";
import type { TactileToastRecord } from "@/hooks/use-tactile-toasts";

let mockToasts: TactileToastRecord[] = [];
const mockDismissToast = vi.fn();
const mockCompleteExit = vi.fn();
const mockPauseAll = vi.fn();
const mockResumeAll = vi.fn();

vi.mock("@/hooks/use-tactile-toasts", () => ({
  useTactileToasts: () => ({
    toasts: mockToasts,
    dismissToast: mockDismissToast,
    completeExit: mockCompleteExit,
    pauseAll: mockPauseAll,
    resumeAll: mockResumeAll,
  }),
}));

let mockSyncState = {
  isSyncing: false,
  justFinished: false,
  syncKind: "inbox" as "inbox" | "queued" | null,
  forceReset: vi.fn(),
};

vi.mock("@/components/layout/sync-status-provider", () => ({
  useSyncStatus: () => mockSyncState,
}));

let mockSyncVisible = false;
vi.mock("@/components/layout/classifying-flyout-status", () => ({
  ClassifyingFlyoutStatus: () =>
    React.createElement("div", { "data-testid": "classifying-flyout-mock" }, "Sorting emails"),
  useClassifyingFlyoutVisible: () => mockSyncVisible,
}));

let mockBulkOpen = false;
let mockSelectionRequested = false;
const mockSetSyncTrackerMounted = vi.fn();

vi.mock("@/components/ui/composites/bulk-actions-flyout", () => ({
  BULK_FLYOUT_HOST_CLASSNAME: "bulk-flyout-host",
  BULK_FLYOUT_CANCEL_CLASSNAME: "bulk-flyout-cancel",
  BULK_FLYOUT_PILL_CLASSNAME: "bulk-flyout-pill",
  useBulkActionsOpen: () => mockBulkOpen,
  useBulkActionsHandoff: () => ({
    open: mockBulkOpen,
    selectionRequested: mockSelectionRequested,
    setSyncTrackerMounted: mockSetSyncTrackerMounted,
  }),
  useFlyoutPresence: (open: boolean) => ({
    mounted: open,
    phase: open ? "idle" : "prep",
    style: undefined,
    onAnimationEnd: vi.fn(),
  }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  LabelTooltip: ({ children, label }: any) =>
    React.createElement("div", { "data-testid": "label-tooltip", title: label }, children),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) =>
    React.createElement("div", { "data-testid": "dropdown-menu-root" }, children),
  DropdownMenuTrigger: ({ children }: any) => children,
}));

vi.mock("@/components/ui/app-menu", () => ({
  AppMenuContent: ({ children }: any) =>
    React.createElement("div", { "data-testid": "app-menu-content" }, children),
  AppMenuItem: ({ children, onSelect }: any) =>
    React.createElement(
      "button",
      {
        "data-testid": "app-menu-item",
        onClick: () => onSelect?.(),
      },
      children
    ),
}));

function createMockEnvironment() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class MockElement {}
  class MockIFrame {}

  const createdElements: any[] = [];
  const createMockNode = (tag: string) => {
    const el: any = {
      nodeType: 1,
      nodeName: tag.toUpperCase(),
      tagName: tag.toUpperCase(),
      style: {},
      attributes: {} as Record<string, string>,
      children: [] as any[],
      setAttribute: (k: string, v: string) => {
        el.attributes[k] = v;
      },
      getAttribute: (k: string) => el.attributes[k],
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
  body.appendChild = (child: any) => {
    createdElements.push(child);
  };
  body.removeChild = (child: any) => {
    const idx = createdElements.indexOf(child);
    if (idx >= 0) createdElements.splice(idx, 1);
  };
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
  doc.defaultView = win;

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);

  const container = createMockNode("DIV");
  container.ownerDocument = doc;

  const root = ReactDOMClient.createRoot(container);
  return { root, createdElements };
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

describe("GlobalSyncTracker Dynamic Status Slot", () => {
  let root: ReactDOMClient.Root;
  let createdElements: any[];

  beforeEach(() => {
    const env = createMockEnvironment();
    root = env.root;
    createdElements = env.createdElements;

    mockBulkOpen = false;
    mockSelectionRequested = false;
    mockSetSyncTrackerMounted.mockClear();

    mockToasts = [];
    mockDismissToast.mockClear();
    mockSyncVisible = false;
    mockSyncState = {
      isSyncing: false,
      justFinished: false,
      syncKind: "inbox",
      forceReset: vi.fn(),
    };
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    vi.restoreAllMocks();
  });

  it("renders null when there is no active status content", async () => {
    await act(async () => {
      root.render(React.createElement(GlobalSyncTracker));
    });

    expect(createdElements.length).toBe(0);
  });

  it("mounts TactileToastStack without a cancel button when only toast is active", async () => {
    mockToasts = [
      {
        id: "toast-1",
        title: "Export complete",
        type: "success",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];

    await act(async () => {
      root.render(React.createElement(GlobalSyncTracker));
    });

    const portalHost = createdElements[0];
    expect(portalHost).toBeDefined();

    // Verify toast is mounted in the stack
    const toastNode = findNode(portalHost, (n) => n.attributes?.["data-toast-id"] === "toast-1");
    expect(toastNode).toBeDefined();

    // Verify there is NO cancel button (manual dismissal is only for bulk selection and sync)
    const cancelBtn = findNode(
      portalHost,
      (n) => n.tagName === "BUTTON" && n.attributes?.["aria-label"]?.includes("Dismiss")
    );
    expect(cancelBtn).toBeNull();
  });

  it("mounts sync status and cancels sync on macro X click when only sync is active", async () => {
    mockSyncVisible = true;
    mockSyncState = {
      isSyncing: true,
      justFinished: false,
      syncKind: "inbox",
      forceReset: vi.fn(),
    };

    await act(async () => {
      root.render(React.createElement(GlobalSyncTracker));
    });

    const portalHost = createdElements[0];
    expect(portalHost).toBeDefined();

    const cancelBtn = findNode(
      portalHost,
      (n) =>
        n.tagName === "BUTTON" &&
        n.attributes?.["aria-label"] === "Stop sorting — remaining emails stay awaiting Ace"
    );
    expect(cancelBtn).toBeDefined();

    const props = getReactProps(cancelBtn);
    act(() => {
      props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    expect(mockSyncState.forceReset).toHaveBeenCalledTimes(1);
  });

  it("cancels sync directly on macro X when both sync and toasts are active", async () => {
    mockSyncVisible = true;
    mockSyncState = {
      isSyncing: true,
      justFinished: false,
      syncKind: "inbox",
      forceReset: vi.fn(),
    };
    mockToasts = [
      {
        id: "toast-active",
        title: "Email archived",
        type: "info",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];

    await act(async () => {
      root.render(React.createElement(GlobalSyncTracker));
    });

    const portalHost = createdElements[0];
    expect(portalHost).toBeDefined();

    // Directly cancels sync without showing a toast dismiss option
    const cancelBtn = findNode(
      portalHost,
      (n) =>
        n.tagName === "BUTTON" &&
        n.attributes?.["aria-label"] === "Stop sorting — remaining emails stay awaiting Ace"
    );
    expect(cancelBtn).toBeDefined();

    const props = getReactProps(cancelBtn);
    act(() => {
      props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    expect(mockSyncState.forceReset).toHaveBeenCalledTimes(1);
    expect(mockDismissToast).not.toHaveBeenCalled();
  });

  it("yields and unmounts when multiselect is active or requested", async () => {
    mockToasts = [
      {
        id: "toast-1",
        title: "Toast item",
        type: "info",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];
    mockSelectionRequested = true;

    await act(async () => {
      root.render(React.createElement(GlobalSyncTracker));
    });

    expect(createdElements.length).toBe(0);
  });
});
