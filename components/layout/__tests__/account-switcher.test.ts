import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { AccountSwitcher } from "../account-switcher";
import { SidebarFlyoutProvider } from "../sidebar-flyout-provider";
import type { AccountSummary } from "@/lib/data";

const mockAccounts: AccountSummary[] = [
  {
    id: "acc_1",
    email: "user1@example.com",
    name: "Alex Rivera",
    picture: "https://example.com/avatar1.png",
    isActive: true,
    historyId: "h_1",
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
    historyId: "h_2",
    updatedAt: new Date(),
    createdAt: new Date(),
    persistentProfileId: "prof_2",
    encryptedAccess: "enc_2",
    isSyncing: false,
    lastSyncedAt: new Date(),
    syncError: null,
  },
];

vi.mock("@/app/actions/accounts", () => ({
  setActiveAccount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/app/actions/auth", () => ({
  logoutSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => "/jobs",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
  }) => React.createElement("a", { href, onClick, className }, children),
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
    setTimeout: (fn: Function, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: NodeJS.Timeout) => clearTimeout(id),
    addEventListener: () => {},
    removeEventListener: () => {},
    innerHeight: 800,
    innerWidth: 1200,
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

function getReactProps(el: any) {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key ? el[key] : null;
}

describe("AccountSwitcher Sidebar Flyout", () => {
  let env: ReturnType<typeof createMockEnvironment>;

  beforeEach(() => {
    env = createMockEnvironment();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the account cog and opens SidebarFlyout to the right when clicked", async () => {
    await act(async () => {
      env.root.render(
        React.createElement(
          SidebarFlyoutProvider,
          null,
          React.createElement(AccountSwitcher, {
            accounts: mockAccounts,
            activeAccountId: "acc_1",
            surface: "sidebar",
            collapsed: false,
          })
        )
      );
    });

    // Before clicking: flyout is closed
    const initialFlyout = findNode(
      env.container,
      (n) => n.attributes?.["data-sidebar-flyout"] === "account"
    );
    expect(initialFlyout).toBeNull();

    // Find the Account options cog button
    const cogButton = findNode(
      env.container,
      (n) =>
        n.tagName === "BUTTON" &&
        n.attributes?.["aria-label"] === "Account options"
    );
    expect(cogButton).not.toBeNull();

    // Click to open using React synthetic event props
    const cogProps = getReactProps(cogButton);
    expect(cogProps).not.toBeNull();
    await act(async () => {
      cogProps.onClick({ stopPropagation: () => {} });
    });

    // After clicking: SidebarFlyout should be mounted with marker="account"
    const openFlyout = findNode(
      env.container,
      (n) => n.attributes?.["data-sidebar-flyout"] === "account"
    );
    expect(openFlyout).not.toBeNull();

    // Verify it is positioned to the right of the sidebar using the calculated edge
    expect(openFlyout.style.left).toContain("calc(100% +");

    // Verify connected accounts and menu options are rendered inside the flyout
    expect(openFlyout.textContent).toContain("Connected accounts");
    expect(openFlyout.textContent).toContain("Alex Rivera");
    expect(openFlyout.textContent).toContain("Jordan Lee");
    expect(openFlyout.textContent).toContain("Link Gmail account");
    expect(openFlyout.textContent).toContain("Account Settings");
    expect(openFlyout.textContent).toContain("Log Out");

    // Click again to close
    await act(async () => {
      cogProps.onClick({ stopPropagation: () => {} });
    });

    const closedFlyout = findNode(
      env.container,
      (n) => n.attributes?.["data-sidebar-flyout"] === "account"
    );
    expect(closedFlyout).toBeNull();
  });

  it("renders collapsed mode and opens SidebarFlyout on user profile avatar click", async () => {
    await act(async () => {
      env.root.render(
        React.createElement(
          SidebarFlyoutProvider,
          null,
          React.createElement(AccountSwitcher, {
            accounts: mockAccounts,
            activeAccountId: "acc_1",
            surface: "sidebar",
            collapsed: true,
          })
        )
      );
    });

    const userProfileButton = findNode(
      env.container,
      (n) =>
        n.tagName === "BUTTON" &&
        n.attributes?.["aria-label"] === "User profile"
    );
    expect(userProfileButton).not.toBeNull();

    const profileProps = getReactProps(userProfileButton);
    expect(profileProps).not.toBeNull();
    await act(async () => {
      profileProps.onClick({ stopPropagation: () => {} });
    });

    const openFlyout = findNode(
      env.container,
      (n) => n.attributes?.["data-sidebar-flyout"] === "account"
    );
    expect(openFlyout).not.toBeNull();
    expect(openFlyout.style.left).toContain("calc(100% +");
  });

  it("renders compact mode with avatar-only trigger button and accounts indicator", async () => {
    await act(async () => {
      env.root.render(
        React.createElement(AccountSwitcher, {
          accounts: mockAccounts,
          activeAccountId: "acc_1",
          compact: true,
        })
      );
    });

    const compactButton = findNode(
      env.container,
      (n) =>
        n.tagName === "BUTTON" &&
        n.attributes?.["aria-label"]?.includes("Account menu for")
    );
    expect(compactButton).not.toBeNull();

    // Verify indicator dot exists for multiple accounts
    const accountIndicator = findNode(
      compactButton,
      (n) => n.attributes?.["title"] === "2 connected accounts"
    );
    expect(accountIndicator).not.toBeNull();
  });
});
