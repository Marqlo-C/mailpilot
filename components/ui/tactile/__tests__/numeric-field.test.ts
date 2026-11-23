import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { NumericField } from "../numeric-field";

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
    Element: MockElement,
    HTMLIFrameElement: MockIFrame,
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

describe("NumericField Component", () => {
  let root: ReactDOMClient.Root;
  let container: any;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders with initial value and attributes", async () => {
    const handleChange = vi.fn();
    const handleCommit = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(NumericField, {
          value: 42,
          onChange: handleChange,
          onCommit: handleCommit,
          min: 0,
          max: 100,
          steppers: true,
          percent: true,
        })
      );
    });

    const inputNode = findNode(container, (n) => n.tagName === "INPUT");
    expect(inputNode).toBeDefined();
    const props = getReactProps(inputNode);
    expect(props.value).toBe("42");
  });

  it("calls onChange immediately on arrow nudge, but debounces onCommit until timer completes", async () => {
    const handleChange = vi.fn();
    const handleCommit = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(NumericField, {
          value: 10,
          onChange: handleChange,
          onCommit: handleCommit,
          min: 0,
          max: 100,
          step: 1,
          steppers: true,
          debounceMs: 400,
        })
      );
    });

    const inputNode = findNode(container, (n) => n.tagName === "INPUT");
    const inputProps = getReactProps(inputNode);

    // Simulate ArrowUp key press
    act(() => {
      inputProps.onKeyDown({
        key: "ArrowUp",
        preventDefault: vi.fn(),
      });
    });

    // onChange is called immediately for responsive UI
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(11);

    // onCommit has NOT been called yet
    expect(handleCommit).not.toHaveBeenCalled();

    // Advance 200ms (debounce still active)
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(handleCommit).not.toHaveBeenCalled();

    // Advance remaining 200ms
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(handleCommit).toHaveBeenCalledTimes(1);
    expect(handleCommit).toHaveBeenCalledWith(11);
  });

  it("batches multiple rapid stepper clicks into a single onCommit with the final value", async () => {
    let currentValue = 5;
    const handleChange = vi.fn((val: number) => {
      currentValue = val;
    });
    const handleCommit = vi.fn();

    const renderWith = async (val: number) => {
      await act(async () => {
        root.render(
          React.createElement(NumericField, {
            value: val,
            onChange: handleChange,
            onCommit: handleCommit,
            min: 0,
            max: 20,
            step: 1,
            steppers: true,
            debounceMs: 400,
          })
        );
      });
    };

    await renderWith(currentValue);

    // Trigger hover on container so steppers render/reveal
    const wrapperNode = findNode(container, (n) => n.attributes?.["data-mp-toolbar-field"] !== undefined);
    const wrapperProps = getReactProps(wrapperNode);
    act(() => {
      wrapperProps.onMouseEnter();
    });

    const clickIncrease = async () => {
      const buttons = findNodes(container, (n) => n.tagName === "BUTTON");
      const increaseBtn = buttons[0];
      const props = getReactProps(increaseBtn);
      act(() => {
        props.onClick();
      });
      await renderWith(currentValue);
    };

    // Click 1: 5 -> 6
    await clickIncrease();

    // Click 2 (100ms later): 6 -> 7
    act(() => {
      vi.advanceTimersByTime(100);
    });
    await clickIncrease();

    // Click 3 (100ms later): 7 -> 8
    act(() => {
      vi.advanceTimersByTime(100);
    });
    await clickIncrease();

    // 3 immediate onChange calls
    expect(handleChange).toHaveBeenCalledTimes(3);
    expect(currentValue).toBe(8);

    // Zero commit calls so far
    expect(handleCommit).not.toHaveBeenCalled();

    // Wait full debounce delay after last click
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Exactly one onCommit call with the final value 8!
    expect(handleCommit).toHaveBeenCalledTimes(1);
    expect(handleCommit).toHaveBeenCalledWith(8);
  });

  it("flushes pending debounce commit immediately when blur occurs", async () => {
    const handleChange = vi.fn();
    const handleCommit = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(NumericField, {
          value: 20,
          onChange: handleChange,
          onCommit: handleCommit,
          min: 0,
          max: 100,
          debounceMs: 400,
        })
      );
    });

    const inputNode = findNode(container, (n) => n.tagName === "INPUT");
    const inputProps = getReactProps(inputNode);

    // Arrow down: 20 -> 19
    act(() => {
      inputProps.onKeyDown({
        key: "ArrowDown",
        preventDefault: vi.fn(),
      });
    });

    expect(handleChange).toHaveBeenCalledWith(19);
    expect(handleCommit).not.toHaveBeenCalled();

    // Blur before timer expires
    act(() => {
      inputProps.onBlur();
    });

    // Flushes immediately on blur
    expect(handleCommit).toHaveBeenCalledTimes(1);
    expect(handleCommit).toHaveBeenCalledWith(19);
  });

  it("flushes pending debounce commit immediately when Enter key is pressed", async () => {
    const handleChange = vi.fn();
    const handleCommit = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(NumericField, {
          value: 30,
          onChange: handleChange,
          onCommit: handleCommit,
          min: 0,
          max: 100,
          debounceMs: 400,
        })
      );
    });

    const inputNode = findNode(container, (n) => n.tagName === "INPUT");
    const inputProps = getReactProps(inputNode);

    // Arrow up: 30 -> 31
    act(() => {
      inputProps.onKeyDown({
        key: "ArrowUp",
        preventDefault: vi.fn(),
      });
    });

    expect(handleCommit).not.toHaveBeenCalled();

    // Press Enter
    act(() => {
      inputProps.onKeyDown({
        key: "Enter",
        preventDefault: vi.fn(),
        currentTarget: { blur: vi.fn() },
      });
    });

    // Flushes immediately on Enter
    expect(handleCommit).toHaveBeenCalledTimes(1);
    expect(handleCommit).toHaveBeenCalledWith(31);
  });
});
