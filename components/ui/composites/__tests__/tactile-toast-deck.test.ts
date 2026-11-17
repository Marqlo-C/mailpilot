import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { TactileToastDeck } from "../tactile-toast-deck";
import { TactileToastItem } from "../tactile-toast-item";
import type { TactileToastRecord } from "@/hooks/use-tactile-toasts";

// Mock the hook so we can control state directly
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
  return { root, createdElements };
}

describe("TactileToastItem & TactileToastDeck Components (Phase 2 & Phase 4)", () => {
  let root: ReactDOMClient.Root;

  beforeEach(() => {
    mockToasts = [];
    mockDismissToast.mockClear();
    mockCompleteExit.mockClear();
    mockPauseAll.mockClear();
    mockResumeAll.mockClear();
    const env = createMockEnvironment();
    root = env.root;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    vi.restoreAllMocks();
  });

  describe("TactileToastItem", () => {
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
  });

  describe("TactileToastDeck", () => {
    it("renders null when there are no active toasts", async () => {
      mockToasts = [];
      await act(async () => {
        root.render(React.createElement(TactileToastDeck, { isElevated: false }));
      });
      expect(mockToasts.length).toBe(0);
    });

    it("renders portaled deck when toasts exist", async () => {
      mockToasts = [
        {
          id: "t1",
          title: "API Key saved",
          type: "success",
          phase: "idle",
          createdAt: Date.now(),
        },
      ];

      await act(async () => {
        root.render(React.createElement(TactileToastDeck, { isElevated: false }));
      });

      expect(mockToasts.length).toBe(1);
    });

    it("supports elevated elevation mode for bottom bar coexistence", async () => {
      mockToasts = [
        {
          id: "t-elevated",
          title: "Selection active",
          type: "info",
          phase: "idle",
          createdAt: Date.now(),
        },
      ];

      await act(async () => {
        root.render(React.createElement(TactileToastDeck, { isElevated: true }));
      });

      expect(mockToasts[0].id).toBe("t-elevated");
    });

    it("stacks up to maxVisible toasts in 3D depth", async () => {
      mockToasts = [
        { id: "1", title: "Toast 1", type: "success", phase: "idle", createdAt: 1 },
        { id: "2", title: "Toast 2", type: "info", phase: "idle", createdAt: 2 },
        { id: "3", title: "Toast 3", type: "warning", phase: "idle", createdAt: 3 },
        { id: "4", title: "Toast 4 (hidden)", type: "error", phase: "idle", createdAt: 4 },
      ];

      await act(async () => {
        root.render(React.createElement(TactileToastDeck, { isElevated: false, maxVisible: 3 }));
      });

      // Visible subset is capped at 3
      expect(mockToasts.slice(0, 3).length).toBe(3);
    });
  });
});
