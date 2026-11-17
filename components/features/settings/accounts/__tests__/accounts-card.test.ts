import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { AccountsCard } from "../accounts-card";
import { ENTRY_CHIP_CLASSNAME } from "@/components/ui/tactile/entry-chip";
import type { AccountSummary } from "@/lib/data";

const mockAccounts: AccountSummary[] = [
  {
    id: "acc_1",
    email: "user1@example.com",
    name: "Alex Rivera",
    picture: "https://example.com/avatar1.png",
    isActive: true,
    historyId: "891234",
    updatedAt: new Date(),
    createdAt: new Date(),
    persistentProfileId: "prof_1",
    encryptedAccess: "enc_1",
    isSyncing: false,
    lastSyncedAt: new Date(),
    syncError: null,
  },
  {
    id: "acc_2",
    email: "user2@example.com",
    name: "Jordan Lee",
    picture: null,
    isActive: false,
    historyId: null,
    updatedAt: new Date(),
    createdAt: new Date(),
    persistentProfileId: "prof_2",
    encryptedAccess: null,
    isSyncing: false,
    lastSyncedAt: new Date(),
    syncError: null,
  },
];

vi.mock("@/app/actions/accounts", () => ({
  unlinkAccountCredentials: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

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
      get className() {
        return el.attributes["class"] || "";
      },
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
        width: 100,
        height: 20,
      }),
      contains: () => false,
      closest: () => null,
      getContext: () => null,
    };
    return el;
  };

  const doc: any = {
    nodeType: 9,
    nodeName: "#document",
    activeElement: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    getComputedStyle: () => ({
      fontWeight: "400",
      fontSize: "12px",
      fontFamily: "sans-serif",
    }),
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
    setTimeout: (fn: Function, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: NodeJS.Timeout) => clearTimeout(id),
    addEventListener: () => {},
    removeEventListener: () => {},
    getComputedStyle: () => ({
      fontWeight: "400",
      fontSize: "12px",
      fontFamily: "sans-serif",
    }),
  };
  doc.defaultView = win;

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);

  const container = createMockNode("DIV");
  container.ownerDocument = doc;

  const root = ReactDOMClient.createRoot(container);
  return { root, container };
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

describe("AccountsCard Watch History DateChip", () => {
  let env: ReturnType<typeof createMockEnvironment>;

  beforeEach(() => {
    env = createMockEnvironment();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders watch history wrapped in DateChip (EntryChip pill) for linked accounts", async () => {
    await act(async () => {
      env.root.render(
        React.createElement(AccountsCard, {
          accounts: mockAccounts,
          activeAccountId: "acc_1",
        })
      );
    });

    // Find all SPAN nodes matching DateChip styling
    const dateChips = findNodes(
      env.container,
      (n) =>
        n.tagName === "SPAN" &&
        typeof n.className === "string" &&
        n.className.includes("border-border/60") &&
        n.className.includes("rounded-md")
    );

    expect(dateChips.length).toBeGreaterThanOrEqual(2);

    const chipTexts = dateChips.map((c) => c.textContent);
    expect(chipTexts).toContain("Watch History #891234");
    expect(chipTexts).toContain("Watch Not Registered");

    // Verify the account title/name container has optical indent to clear curved corner
    const titleContainers = findNodes(
      env.container,
      (n) =>
        n.tagName === "DIV" &&
        typeof n.className === "string" &&
        n.className.includes("pl-1")
    );
    expect(titleContainers.length).toBeGreaterThanOrEqual(2);
  });
});
