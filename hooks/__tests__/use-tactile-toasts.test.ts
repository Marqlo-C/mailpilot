import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act, useEffect } from "react";
import ReactDOMClient from "react-dom/client";
import type { ToastT } from "sonner";
import { useTactileToasts } from "../use-tactile-toasts";

// Mutable array and spy for mock Sonner state
let mockSonnerToasts: ToastT[] = [];
const mockDismissSpy = vi.fn();

vi.mock("sonner", () => ({
  useSonner: () => ({ toasts: mockSonnerToasts }),
  toast: {
    dismiss: (id: string | number) => mockDismissSpy(id),
  },
}));

// Minimal in-memory DOM harness for Node testing with React 19
function createMockEnvironment() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class MockElement {}
  class MockIFrame {}

  const doc: any = {
    nodeType: 9,
    nodeName: "#document",
    activeElement: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({
      nodeType: 1,
      nodeName: "DIV",
      tagName: "DIV",
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: () => {},
      removeChild: () => {},
    }),
  };

  const win: any = {
    document: doc,
    HTMLIFrameElement: MockIFrame,
    Element: MockElement,
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
  };
  doc.defaultView = win;

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);

  const container: any = {
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

  const root = ReactDOMClient.createRoot(container);
  return { root };
}

describe("useTactileToasts Hook (Phase 1 & Phase 4)", () => {
  let root: ReactDOMClient.Root;
  let hookResult: ReturnType<typeof useTactileToasts>;

  function HookHarness({ onRender }: { onRender: (val: ReturnType<typeof useTactileToasts>) => void }) {
    const val = useTactileToasts();
    useEffect(() => {
      onRender(val);
    });
    return null;
  }

  async function renderHarness() {
    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          onRender: (val) => {
            hookResult = val;
          },
        })
      );
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mockSonnerToasts = [];
    mockDismissSpy.mockClear();
    const env = createMockEnvironment();
    root = env.root;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("initializes with an empty toast list", async () => {
    await renderHarness();
    expect(hookResult.toasts).toEqual([]);
  });

  it("adds a new incoming toast in 'in' phase and transitions to 'idle' after 589ms", async () => {
    mockSonnerToasts = [
      {
        id: "toast-1",
        title: "Profile saved",
        type: "success",
      } as ToastT,
    ];

    await renderHarness();

    expect(hookResult.toasts.length).toBe(1);
    expect(hookResult.toasts[0].id).toBe("toast-1");
    expect(hookResult.toasts[0].title).toBe("Profile saved");
    expect(hookResult.toasts[0].type).toBe("success");
    expect(hookResult.toasts[0].phase).toBe("in");

    // Advance past POP_DURATION_MS (589ms)
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(hookResult.toasts[0].phase).toBe("idle");
  });

  it("updates an existing toast in-place without resetting phase to 'in'", async () => {
    mockSonnerToasts = [
      {
        id: "upload-1",
        title: "Uploading resume…",
        type: "loading",
      } as ToastT,
    ];

    await renderHarness();

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(hookResult.toasts[0].phase).toBe("idle");

    // Sonner mutates the toast from loading to success
    mockSonnerToasts = [
      {
        id: "upload-1",
        title: "Resume parsed successfully",
        type: "success",
      } as ToastT,
    ];

    await renderHarness();

    expect(hookResult.toasts.length).toBe(1);
    expect(hookResult.toasts[0].title).toBe("Resume parsed successfully");
    expect(hookResult.toasts[0].type).toBe("success");
    // Remains idle — does not re-trigger enter animation!
    expect(hookResult.toasts[0].phase).toBe("idle");
  });

  it("triggers exit phase and delayed unmount when dismissToast is called", async () => {
    mockSonnerToasts = [
      {
        id: "toast-dismiss",
        title: "API key updated",
        type: "success",
      } as ToastT,
    ];

    await renderHarness();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // Dismiss manually
    await act(async () => {
      hookResult.dismissToast("toast-dismiss");
    });

    expect(mockDismissSpy).toHaveBeenCalledWith("toast-dismiss");
    expect(hookResult.toasts.length).toBe(1);
    expect(hookResult.toasts[0].phase).toBe("out");

    // Halfway through retract duration (1050ms)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    // Still present while animating!
    expect(hookResult.toasts.length).toBe(1);

    // Complete the 1050ms retract animation
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(hookResult.toasts.length).toBe(0);
  });

  it("automatically dismisses non-loading toasts after their lifetime", async () => {
    mockSonnerToasts = [
      {
        id: "toast-timed",
        title: "Auto timeout test",
        type: "info",
        duration: 3000,
      } as ToastT,
    ];

    await renderHarness();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(hookResult.toasts[0].phase).toBe("idle");

    // Advance 3000ms: should trigger dismiss ("out" phase)
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(hookResult.toasts[0].phase).toBe("out");

    // Advance 1050ms retract: should unmount
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(hookResult.toasts.length).toBe(0);
  });

  it("pauses auto-dismiss timer on pauseAll and resumes on resumeAll", async () => {
    mockSonnerToasts = [
      {
        id: "toast-hover",
        title: "Hover pause test",
        type: "success",
        duration: 4000,
      } as ToastT,
    ];

    await renderHarness();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // Advance 2000ms (halfway)
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Hover occurs
    act(() => {
      hookResult.pauseAll();
    });

    // Advance another 5000ms while paused
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Still idle, not dismissed!
    expect(hookResult.toasts.length).toBe(1);
    expect(hookResult.toasts[0].phase).toBe("idle");

    // Hover leaves
    act(() => {
      hookResult.resumeAll();
    });

    // Remaining ~2000ms completes
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(hookResult.toasts[0].phase).toBe("out");
  });

  it("immediately removes toast when completeExit is called", async () => {
    mockSonnerToasts = [
      {
        id: "toast-fast",
        title: "Fast exit",
        type: "info",
      } as ToastT,
    ];

    await renderHarness();

    await act(async () => {
      hookResult.completeExit("toast-fast");
    });

    expect(hookResult.toasts.length).toBe(0);
  });
});
