import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { TactileToastStack } from "../tactile-toast-stack";
import type { TactileToastRecord } from "@/hooks/use-tactile-toasts";

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
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
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
  return { root, container, createdElements };
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

describe("TactileToastStack Component", () => {
  let root: ReactDOMClient.Root;
  let container: any;

  beforeEach(() => {
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

  it("renders null when there are no toasts and no underlay", async () => {
    await act(async () => {
      root.render(
        React.createElement(TactileToastStack, {
          toasts: [],
          onDismiss: vi.fn(),
        })
      );
    });

    expect(container.children.length).toBe(0);
  });

  it("renders only underlay in-flow when there are no toasts", async () => {
    await act(async () => {
      root.render(
        React.createElement(TactileToastStack, {
          toasts: [],
          onDismiss: vi.fn(),
          underlay: React.createElement("div", { "data-testid": "sync-underlay" }, "Sync status"),
        })
      );
    });

    const underlayNode = findNode(container, (n) => n.attributes?.["data-testid"] === "sync-underlay");
    expect(underlayNode).toBeDefined();
  });

  it("stacks multiple toasts in 3D card depth and renders underlay underneath", async () => {
    const mockToasts: TactileToastRecord[] = [
      {
        id: "t1",
        title: "Front Toast",
        type: "success",
        phase: "idle",
        createdAt: Date.now(),
      },
      {
        id: "t2",
        title: "Second Toast",
        type: "info",
        phase: "idle",
        createdAt: Date.now(),
      },
      {
        id: "t3",
        title: "Third Toast",
        type: "warning",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(TactileToastStack, {
          toasts: mockToasts,
          onDismiss: vi.fn(),
          underlay: React.createElement("div", { "data-testid": "sync-underlay" }, "Sync status"),
        })
      );
    });

    const toastNodes = findNodes(container, (n) => n.attributes?.["data-toast-id"]);
    expect(toastNodes.length).toBe(3);

    // Front toast should be in-flow
    expect(toastNodes[0].attributes["data-toast-id"]).toBe("t1");

    // Underlay should also be present in the container
    const underlayNode = findNode(container, (n) => n.attributes?.["data-testid"] === "sync-underlay");
    expect(underlayNode).toBeDefined();
  });

  it("calls pauseAll and resumeAll on mouseEnter and mouseLeave", async () => {
    const pauseAllSpy = vi.fn();
    const resumeAllSpy = vi.fn();

    const mockToasts: TactileToastRecord[] = [
      {
        id: "t1",
        title: "Hoverable Toast",
        type: "info",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(TactileToastStack, {
          toasts: mockToasts,
          onDismiss: vi.fn(),
          onPause: pauseAllSpy,
          onResume: resumeAllSpy,
        })
      );
    });

    const stackRegion = findNode(container, (n) => n.attributes?.["role"] === "region");
    expect(stackRegion).toBeDefined();

    const props = getReactProps(stackRegion);
    act(() => {
      props.onMouseEnter();
    });
    expect(pauseAllSpy).toHaveBeenCalledTimes(1);

    act(() => {
      props.onMouseLeave();
    });
    expect(resumeAllSpy).toHaveBeenCalledTimes(1);
  });

  it("applies justify-items-stretch so cards match width and tuck background cards cleanly", async () => {
    const mockToasts: TactileToastRecord[] = [
      {
        id: "t1",
        title: "Local models loaded",
        type: "success",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(TactileToastStack, {
          toasts: mockToasts,
          onDismiss: vi.fn(),
          underlay: React.createElement("div", { "data-testid": "sync-card" }, "Ace reviewing queued…"),
        })
      );
    });

    const stackRegion = findNode(container, (n) => n.attributes?.["role"] === "region");
    const stackProps = getReactProps(stackRegion);
    expect(stackProps.className).toContain("justify-items-stretch");
    expect(stackProps.className).not.toContain("justify-items-center");

    const underlayNode = findNode(container, (n) => n.attributes?.["data-testid"] === "sync-card");
    const underlayWrapper = getReactProps(underlayNode.parent || underlayNode);
    // Find wrapper element containing overflow-hidden rounded-2xl
    const allWrappers = findNodes(container, (n) => {
      const p = getReactProps(n);
      return p?.className?.includes("col-start-1");
    });
    expect(allWrappers.length).toBe(2); // underlay wrapper + front toast wrapper
    const underlayP = getReactProps(allWrappers[0]);
    const frontP = getReactProps(allWrappers[1]);
    expect(underlayP.className).toContain("w-full");
    expect(underlayP.className).toContain("overflow-hidden");
    expect(frontP.className).toContain("w-full");
    expect(frontP.className).toContain("overflow-visible");

    // Front toast should render dismiss button
    const dismissBtn = findNode(container, (n) => n.attributes?.["aria-label"] === "Close notification");
    expect(dismissBtn).toBeDefined();
  });
});
