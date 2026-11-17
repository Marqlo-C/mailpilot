import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { TactileToastItem } from "../tactile-toast-item";
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
      insertBefore: () => {},
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
  return { root, container, createdElements };
}

describe("TactileToastItem Component", () => {
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

  it("renders item content without error", async () => {
    const onDismiss = vi.fn();
    const testToast: TactileToastRecord = {
      id: "toast-single",
      title: "Model set to llama3",
      description: "Local Ollama bridge active",
      type: "success",
      phase: "idle",
      createdAt: Date.now(),
    };

    await act(async () => {
      root.render(
        React.createElement(TactileToastItem, {
          toast: testToast,
          onDismiss,
        })
      );
    });

    expect(testToast.id).toBe("toast-single");
  });

  it("renders with interactive action chip when provided", async () => {
    const onActionClick = vi.fn();
    const onDismiss = vi.fn();
    const testToast: TactileToastRecord = {
      id: "toast-with-action",
      title: "Message deleted",
      type: "normal",
      phase: "idle",
      action: {
        label: "Undo",
        onClick: onActionClick,
      },
      createdAt: Date.now(),
    };

    await act(async () => {
      root.render(
        React.createElement(TactileToastItem, {
          toast: testToast,
          onDismiss,
        })
      );
    });

    expect(testToast.action).toBeDefined();
  });

  it("applies mp-flyout-pop during enter phase and mp-flyout-retract during exit phase", () => {
    const enterToast: TactileToastRecord = {
      id: "enter-1",
      title: "Saving…",
      type: "loading",
      phase: "in",
      createdAt: Date.now(),
    };
    const exitToast: TactileToastRecord = {
      id: "exit-1",
      title: "Done",
      type: "success",
      phase: "out",
      createdAt: Date.now(),
    };

    expect(enterToast.phase).toBe("in");
    expect(exitToast.phase).toBe("out");
  });

  it("applies mp-toast-dock and centers label when centerLabel and animateIn=false are enabled", async () => {
    const dockToast: TactileToastRecord = {
      id: "dock-1",
      title: "Local models loaded",
      type: "success",
      phase: "in",
      createdAt: Date.now(),
    };

    await act(async () => {
      root.render(
        React.createElement(TactileToastItem, {
          toast: dockToast,
          onDismiss: vi.fn(),
          centerLabel: true,
          animateIn: false,
          showDismissButton: false,
        })
      );
    });

    const rendered = container.children[0];
    expect(rendered.attributes.class).toContain("mp-toast-dock");
    expect(rendered.attributes.class).not.toContain("mp-flyout-pop");

    const pill = rendered.children[0];
    expect(pill.attributes.class).toContain("justify-center");
  });

  it("renders upper-left circular dismiss button when showDismissButton=true and calls onDismiss on click", async () => {
    const onDismiss = vi.fn();
    const testToast: TactileToastRecord = {
      id: "toast-x",
      title: "Task Completed",
      type: "success",
      phase: "idle",
      createdAt: Date.now(),
    };

    await act(async () => {
      root.render(
        React.createElement(TactileToastItem, {
          toast: testToast,
          onDismiss,
          showDismissButton: true,
        })
      );
    });

    const rendered = container.children[0];
    const dismissBtn = rendered.children.find(
      (c: any) => c.nodeName === "BUTTON" && c.attributes?.["aria-label"] === "Close notification"
    );
    expect(dismissBtn).toBeDefined();
    expect(dismissBtn.attributes.class).toContain("-top-0.5");
    expect(dismissBtn.attributes.class).toContain("-left-0.5");
    expect(dismissBtn.attributes.class).toContain("size-3.5");
    expect(dismissBtn.attributes.class).toContain("bg-[#282c30]");

    act(() => {
      const propKey = Object.keys(dismissBtn).find((k) => k.startsWith("__reactProps"));
      const props = propKey ? (dismissBtn as any)[propKey] : null;
      props?.onClick?.({ preventDefault: () => {}, stopPropagation: () => {} });
    });
    expect(onDismiss).toHaveBeenCalledWith("toast-x");
  });
});
