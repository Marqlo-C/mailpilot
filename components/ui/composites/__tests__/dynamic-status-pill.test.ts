import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { DynamicStatusPill } from "../dynamic-status-pill";
import type { DynamicStatusSlotState } from "@/hooks/use-dynamic-status-slot";
import type { TactileToastRecord } from "@/hooks/use-tactile-toasts";

// Mock the hook so tests can control state directly or test hook integration
let mockHookState: DynamicStatusSlotState;

vi.mock("@/hooks/use-dynamic-status-slot", () => ({
  useDynamicStatusSlot: () => mockHookState,
}));

vi.mock("@/components/layout/classifying-flyout-status", () => ({
  ClassifyingFlyoutStatus: ({ className }: { className?: string }) =>
    React.createElement("span", { "data-testid": "classifying-status-mock", className }, "Ace reviewing 4 queued…"),
}));

function createMockEnvironment() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class MockElement {}
  class MockIFrame {}

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

describe("DynamicStatusPill Component (Phase 2)", () => {
  let root: ReactDOMClient.Root;
  let container: any;
  const mockDismissActiveToast = vi.fn();
  const mockPauseHover = vi.fn();
  const mockResumeHover = vi.fn();

  beforeEach(() => {
    const env = createMockEnvironment();
    root = env.root;
    container = env.container;

    mockDismissActiveToast.mockClear();
    mockPauseHover.mockClear();
    mockResumeHover.mockClear();

    mockHookState = {
      mode: "idle",
      activeToast: null,
      isRolling: false,
      showSync: false,
      syncVisible: false,
      showToast: false,
      toastVisible: false,
      dismissActiveToast: mockDismissActiveToast,
      dismissCurrentToast: mockDismissActiveToast,
      pauseHover: mockPauseHover,
      resumeHover: mockResumeHover,
      hasActiveContent: false,
      queuedToastCount: 0,
      syncStatus: null,
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

  it("renders null when there is no active content and not lingering", async () => {
    await act(async () => {
      root.render(React.createElement(DynamicStatusPill));
    });

    expect(container.children.length).toBe(0);
  });

  it("renders Track A in normal flow when sync is active", async () => {
    mockHookState = {
      ...mockHookState,
      mode: "sync",
      hasActiveContent: true,
      showSync: true,
      syncVisible: true,
      showToast: false,
      toastVisible: false,
    };

    await act(async () => {
      root.render(React.createElement(DynamicStatusPill));
    });

    const syncTrack = findNode(container, (n) => n.attributes?.["data-testid"] === "status-track-sync");
    const toastTrack = findNode(container, (n) => n.attributes?.["data-testid"] === "status-track-toast");

    expect(syncTrack).toBeDefined();
    expect(syncTrack.attributes.class).toContain("translate-y-0");
    expect(syncTrack.attributes.class).toContain("opacity-100");

    expect(toastTrack).toBeDefined();
    expect(toastTrack.attributes.class).toContain("translate-y-full");
    expect(toastTrack.attributes.class).toContain("opacity-0");
    expect(toastTrack.attributes.class).toContain("pointer-events-none");
  });

  it("rolls Track B into view when toast arrives over sync", async () => {
    const testToast: TactileToastRecord = {
      id: "toast-1",
      title: "Settings saved successfully",
      type: "success",
      phase: "idle",
      createdAt: Date.now(),
    };

    mockHookState = {
      ...mockHookState,
      mode: "toast-over-sync",
      hasActiveContent: true,
      showSync: false,
      syncVisible: false,
      showToast: true,
      toastVisible: true,
      activeToast: testToast,
    };

    await act(async () => {
      root.render(React.createElement(DynamicStatusPill));
    });

    const syncTrack = findNode(container, (n) => n.attributes?.["data-testid"] === "status-track-sync");
    const toastTrack = findNode(container, (n) => n.attributes?.["data-testid"] === "status-track-toast");

    // Track A slid UP and faded out
    expect(syncTrack.attributes.class).toContain("-translate-y-full");
    expect(syncTrack.attributes.class).toContain("opacity-0");
    expect(syncTrack.attributes.class).toContain("pointer-events-none");

    // Track B slid IN and is visible
    expect(toastTrack.attributes.class).toContain("translate-y-0");
    expect(toastTrack.attributes.class).toContain("opacity-100");

    // Toast title text is rendered
    const titleTextNode = findNode(container, (n) => n.nodeType === 3 && n.nodeValue === "Settings saved successfully");
    expect(titleTextNode).toBeDefined();
  });

  it("fires action button onClick and dismisses toast", async () => {
    const actionSpy = vi.fn();
    const testToast: TactileToastRecord = {
      id: "toast-action",
      title: "Item archived",
      type: "normal",
      phase: "idle",
      createdAt: Date.now(),
      action: {
        label: "Undo",
        onClick: actionSpy,
      },
    };

    mockHookState = {
      ...mockHookState,
      mode: "toast",
      hasActiveContent: true,
      showToast: true,
      toastVisible: true,
      activeToast: testToast,
    };

    await act(async () => {
      root.render(React.createElement(DynamicStatusPill));
    });

    const buttons = findNodes(container, (n) => n.tagName === "BUTTON");
    expect(buttons.length).toBeGreaterThanOrEqual(2); // Action button + micro-dismiss button

    const actionBtn = buttons[0];
    const props = getReactProps(actionBtn);
    expect(props).toBeDefined();

    act(() => {
      props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    expect(actionSpy).toHaveBeenCalledTimes(1);
    expect(mockDismissActiveToast).toHaveBeenCalledTimes(1);
  });

  it("fires micro-dismiss button and dismisses toast", async () => {
    const testToast: TactileToastRecord = {
      id: "toast-dismissable",
      title: "API key updated",
      type: "info",
      phase: "idle",
      createdAt: Date.now(),
    };

    mockHookState = {
      ...mockHookState,
      mode: "toast",
      hasActiveContent: true,
      showToast: true,
      toastVisible: true,
      activeToast: testToast,
    };

    await act(async () => {
      root.render(React.createElement(DynamicStatusPill));
    });

    const dismissBtn = findNode(container, (n) => n.tagName === "BUTTON" && n.attributes?.title === "Dismiss notification");
    expect(dismissBtn).toBeDefined();

    const props = getReactProps(dismissBtn);
    expect(props).toBeDefined();

    act(() => {
      props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    expect(mockDismissActiveToast).toHaveBeenCalledTimes(1);
  });

  it("coordinates hover pause and resume events on container", async () => {
    mockHookState = {
      ...mockHookState,
      mode: "toast",
      hasActiveContent: true,
      showToast: true,
      toastVisible: true,
      activeToast: {
        id: "toast-hover",
        title: "Hover test",
        type: "success",
        phase: "idle",
        createdAt: Date.now(),
      },
    };

    await act(async () => {
      root.render(React.createElement(DynamicStatusPill));
    });

    const pillRoot = findNode(container, (n) => n.attributes?.role === "status");
    expect(pillRoot).toBeDefined();

    const props = getReactProps(pillRoot);
    expect(props).toBeDefined();

    act(() => {
      props.onMouseEnter();
    });
    expect(mockPauseHover).toHaveBeenCalledTimes(1);

    act(() => {
      props.onMouseLeave();
    });
    expect(mockResumeHover).toHaveBeenCalledTimes(1);
  });
});
