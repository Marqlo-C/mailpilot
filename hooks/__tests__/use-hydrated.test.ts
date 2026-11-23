import { describe, it, expect, vi, afterEach } from "vitest";
import React, { act, useEffect } from "react";
import ReactDOMClient from "react-dom/client";
import { renderToString } from "react-dom/server";
import { useHydrated } from "../use-hydrated";

describe("useHydrated", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false during SSR renderToString", () => {
    function SsrProbe() {
      const hydrated = useHydrated();
      return React.createElement("span", null, hydrated ? "client" : "ssr");
    }

    const html = renderToString(React.createElement(SsrProbe));
    expect(html).toContain("ssr");
  });

  it("returns true after client mount", async () => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    class MockElement {}
    class MockIFrame {}

    const doc: Record<string, unknown> = {
      nodeType: 9,
      nodeName: "#document",
      activeElement: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      createElement: (tag: string) => ({
        nodeType: 1,
        nodeName: tag,
        tagName: tag,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: () => {},
        removeChild: () => {},
      }),
    };
    const win = {
      document: doc,
      HTMLIFrameElement: MockIFrame,
      Element: MockElement,
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({ matches: false }),
    };
    doc.defaultView = win;

    const container = {
      nodeType: 1,
      nodeName: "DIV",
      tagName: "DIV",
      ownerDocument: doc,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      appendChild: () => {},
      removeChild: () => {},
      insertBefore: () => {},
    };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);

    let observed: boolean | null = null;
    function ClientProbe() {
      const hydrated = useHydrated();
      useEffect(() => {
        observed = hydrated;
      });
      return null;
    }

    const root = ReactDOMClient.createRoot(
      container as unknown as HTMLElement
    );
    await act(async () => {
      root.render(React.createElement(ClientProbe));
    });
    expect(observed).toBe(true);

    act(() => {
      root.unmount();
    });
  });
});
