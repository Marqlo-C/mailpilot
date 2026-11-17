import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { BulkActionsFlyout } from "../bulk-actions-flyout";
import { BulkActionsWithClassifying } from "@/components/layout/bulk-actions-with-classifying";
import type { DynamicStatusSlotState } from "@/hooks/use-dynamic-status-slot";

let mockToasts: any[] = [];
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
  syncKind: "inbox" as "inbox" | "queued" | null,
  forceReset: vi.fn(),
};

vi.mock("@/components/layout/sync-status-provider", () => ({
  useSyncStatus: () => mockSyncState,
  useOptionalSyncStatus: () => mockSyncState,
}));


// Mock DropdownMenu and AppMenu to render inline for hermetic unit testing
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) =>
    React.createElement("div", { "data-testid": "dropdown-menu-root" }, children),
  DropdownMenuTrigger: ({ children, asChild }: any) => children,
}));

vi.mock("@/components/ui/app-menu", () => ({
  AppMenuContent: ({ children, className }: any) =>
    React.createElement("div", { "data-testid": "app-menu-content", className }, children),
  AppMenuItem: ({ children, onSelect, className }: any) =>
    React.createElement(
      "button",
      {
        "data-testid": "app-menu-item",
        className,
        onClick: () => onSelect?.(),
      },
      children
    ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  LabelTooltip: ({ children, label }: any) =>
    React.createElement("div", { "data-testid": "label-tooltip", title: label }, children),
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

describe("BulkActionsFlyout Triad Menu & Classification Integration (Phase 3)", () => {
  let root: ReactDOMClient.Root;
  let createdElements: any[];

  beforeEach(() => {
    const env = createMockEnvironment();
    root = env.root;
    createdElements = env.createdElements;
    mockSyncState = {
      isSyncing: false,
      syncKind: "inbox",
      forceReset: vi.fn(),
    };
    mockToasts = [];
    mockDismissToast.mockClear();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    vi.restoreAllMocks();
  });

  it("renders single-click direct CancelTaskButton when ONLY multiselect is active", async () => {
    const onCancelSpy = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          BulkActionsFlyout,
          {
            selectedCount: 2,
            onCancel: onCancelSpy,
            syncActive: false,
          },
          React.createElement("span", null, "2 items selected")
        )
      );
    });

    // Advance 16ms animation phase timer
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const bodyRoot = createdElements[0];
    expect(bodyRoot).toBeDefined();

    // No dropdown menu
    const dropdownMenu = findNode(bodyRoot, (n) => n.attributes?.["data-testid"] === "dropdown-menu-root");
    expect(dropdownMenu).toBeNull();

    // CancelTaskButton rendered with aria-label "Clear selection"
    const cancelBtn = findNode(
      bodyRoot,
      (n) => n.tagName === "BUTTON" && n.attributes?.["aria-label"] === "Clear selection"
    );
    expect(cancelBtn).toBeDefined();

    const props = getReactProps(cancelBtn);
    expect(props).toBeDefined();

    act(() => {
      props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    expect(onCancelSpy).toHaveBeenCalledTimes(1);
  });

  it("renders dual dropdown menu when multiselect + sync coincide", async () => {
    const onCancelSpy = vi.fn();
    const onStopSyncSpy = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          BulkActionsFlyout,
          {
            selectedCount: 4,
            onCancel: onCancelSpy,
            syncActive: true,
            onStopSync: onStopSyncSpy,
            stopSyncLabel: "Stop sorting",
            toastActive: false,
          },
          React.createElement("span", null, "4 items selected")
        )
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const bodyRoot = createdElements[0];
    const dropdownMenu = findNode(bodyRoot, (n) => n.attributes?.["data-testid"] === "dropdown-menu-root");
    expect(dropdownMenu).toBeDefined();

    const menuItems = findNodes(bodyRoot, (n) => n.attributes?.["data-testid"] === "app-menu-item");
    expect(menuItems.length).toBe(2);

    // Item 1: Clear selection
    const item1Props = getReactProps(menuItems[0]);
    act(() => {
      item1Props.onClick();
    });
    expect(onCancelSpy).toHaveBeenCalledTimes(1);

    // Item 2: Stop sorting
    const item2Props = getReactProps(menuItems[1]);
    act(() => {
      item2Props.onClick();
    });
    expect(onStopSyncSpy).toHaveBeenCalledTimes(1);
  });

  it("does not offer manual toast dismissal in cancel menu when multiselect + sync + toast coincide", async () => {
    const onCancelSpy = vi.fn();
    const onStopSyncSpy = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          BulkActionsFlyout,
          {
            selectedCount: 3,
            onCancel: onCancelSpy,
            syncActive: true,
            onStopSync: onStopSyncSpy,
            stopSyncLabel: "Stop reviewing",
          },
          React.createElement("span", null, "3 items selected")
        )
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const bodyRoot = createdElements[0];
    const dropdownMenu = findNode(bodyRoot, (n) => n.attributes?.["data-testid"] === "dropdown-menu-root");
    expect(dropdownMenu).toBeDefined();

    const menuItems = findNodes(bodyRoot, (n) => n.attributes?.["data-testid"] === "app-menu-item");
    // Only 2 items: Clear selection and Stop reviewing (no manual toast dismissal)
    expect(menuItems.length).toBe(2);
  });

  it("BulkActionsWithClassifying mounts TactileToastStack when toasts and sync are active without toast dismissal", async () => {
    mockToasts = [
      {
        id: "t1",
        title: "Item archived",
        type: "success",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];
    mockSyncState = {
      isSyncing: true,
      syncKind: "queued",
      forceReset: vi.fn(),
    };

    await act(async () => {
      root.render(
        React.createElement(
          BulkActionsWithClassifying,
          {
            selectedCount: 5,
            onCancel: vi.fn(),
          },
          React.createElement("span", null, "5 items selected")
        )
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const bodyRoot = createdElements[0];
    const toastNode = findNode(bodyRoot, (n) => n.attributes?.["data-toast-id"] === "t1");
    expect(toastNode).toBeDefined();

    // Verify only 2 items appear in the dropdown (Clear selection + Stop reviewing)
    const menuItems = findNodes(bodyRoot, (n) => n.attributes?.["data-testid"] === "app-menu-item");
    expect(menuItems.length).toBe(2);
  });
});
