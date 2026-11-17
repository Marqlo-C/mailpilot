import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act, useEffect } from "react";
import ReactDOMClient from "react-dom/client";
import type { TactileToastRecord } from "../use-tactile-toasts";
import { useDynamicStatusSlot } from "../use-dynamic-status-slot";

// Mutable mocks for dependencies
let mockToasts: TactileToastRecord[] = [];
const mockDismissToast = vi.fn((id: string | number) => {
  mockToasts = mockToasts.map((t) => (t.id === id ? { ...t, phase: "out" as const } : t));
});

let mockSyncStatusValue: {
  isSyncing: boolean;
  justFinished: boolean;
  syncKind: "inbox" | "queued" | null;
  forceReset: () => Promise<void>;
} | null = null;

vi.mock("@/hooks/use-tactile-toasts", () => ({
  useTactileToasts: () => ({
    toasts: mockToasts,
    dismissToast: mockDismissToast,
    completeExit: vi.fn(),
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
  }),
}));

vi.mock("@/components/layout/sync-status-provider", () => ({
  useOptionalSyncStatus: () => mockSyncStatusValue,
}));

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

describe("useDynamicStatusSlot Hook (Phase 1)", () => {
  let root: ReactDOMClient.Root;
  let hookResult: ReturnType<typeof useDynamicStatusSlot>;

  function HookHarness({
    onRender,
  }: {
    onRender: (val: ReturnType<typeof useDynamicStatusSlot>) => void;
  }) {
    const val = useDynamicStatusSlot();
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
    mockToasts = [];
    mockDismissToast.mockClear();
    mockSyncStatusValue = null;
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

  it("initializes in idle state when sync is inactive and toasts are empty", async () => {
    await renderHarness();
    expect(hookResult.mode).toBe("idle");
    expect(hookResult.showSync).toBe(false);
    expect(hookResult.showToast).toBe(false);
    expect(hookResult.activeToast).toBeNull();
    expect(hookResult.isRolling).toBe(false);
    expect(hookResult.hasActiveContent).toBe(false);
    expect(hookResult.queuedToastCount).toBe(0);
  });

  it("handles idle -> toast -> idle lifecycle with auto-dismiss and roll", async () => {
    await renderHarness();
    expect(hookResult.mode).toBe("idle");

    // Toast arrives
    mockToasts = [
      {
        id: "toast-1",
        title: "Cloud API key saved",
        type: "success",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];
    await renderHarness();

    expect(hookResult.mode).toBe("toast");
    expect(hookResult.showToast).toBe(true);
    expect(hookResult.showSync).toBe(false);
    expect(hookResult.activeToast?.id).toBe("toast-1");
    expect(hookResult.isRolling).toBe(true);

    // After 350ms roll duration
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(hookResult.isRolling).toBe(false);
    expect(hookResult.showToast).toBe(true);

    // Advance 3500ms default dwell time -> auto-dismiss
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });
    await renderHarness();

    expect(mockDismissToast).toHaveBeenCalledWith("toast-1");
    expect(hookResult.mode).toBe("idle");
    expect(hookResult.showToast).toBe(false);
    expect(hookResult.activeToast).toBeNull();
  });

  it("handles sync -> toast-over-sync -> sync roll restoration", async () => {
    mockSyncStatusValue = {
      isSyncing: true,
      justFinished: false,
      syncKind: "inbox",
      forceReset: vi.fn(),
    };

    await renderHarness();
    expect(hookResult.mode).toBe("sync");
    expect(hookResult.showSync).toBe(true);
    expect(hookResult.showToast).toBe(false);

    // Toast arrives while sync is ongoing
    mockToasts = [
      {
        id: "toast-save",
        title: "Preferences saved",
        type: "info",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];
    await renderHarness();

    expect(hookResult.mode).toBe("toast-over-sync");
    expect(hookResult.showSync).toBe(false);
    expect(hookResult.showToast).toBe(true);
    expect(hookResult.isRolling).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(hookResult.isRolling).toBe(false);

    // Toast dismisses manually
    await act(async () => {
      hookResult.dismissActiveToast();
    });
    await renderHarness();

    expect(mockDismissToast).toHaveBeenCalledWith("toast-save");
    // Restores sync!
    expect(hookResult.mode).toBe("sync");
    expect(hookResult.showSync).toBe(true);
    expect(hookResult.showToast).toBe(false);
    expect(hookResult.isRolling).toBe(true); // Rolling back into sync

    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(hookResult.isRolling).toBe(false);
  });

  it("drains consecutive toasts smoothly before returning to sync", async () => {
    mockSyncStatusValue = {
      isSyncing: true,
      justFinished: false,
      syncKind: "queued",
      forceReset: vi.fn(),
    };

    mockToasts = [
      {
        id: "burst-1",
        title: "First action done",
        type: "success",
        phase: "idle",
        createdAt: Date.now(),
      },
      {
        id: "burst-2",
        title: "Second action done",
        type: "success",
        phase: "idle",
        createdAt: Date.now() + 10,
      },
    ];

    await renderHarness();
    expect(hookResult.mode).toBe("toast-over-sync");
    expect(hookResult.activeToast?.id).toBe("burst-1");
    expect(hookResult.queuedToastCount).toBe(1);

    // Dismiss first toast
    await act(async () => {
      hookResult.dismissActiveToast();
    });
    await renderHarness();

    expect(mockDismissToast).toHaveBeenCalledWith("burst-1");
    // Second toast rolls in immediately!
    expect(hookResult.mode).toBe("toast-over-sync");
    expect(hookResult.activeToast?.id).toBe("burst-2");
    expect(hookResult.queuedToastCount).toBe(0);
    expect(hookResult.isRolling).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(hookResult.isRolling).toBe(false);

    // Dismiss second toast
    await act(async () => {
      hookResult.dismissActiveToast();
    });
    await renderHarness();

    expect(mockDismissToast).toHaveBeenCalledWith("burst-2");
    // Restores to sync
    expect(hookResult.mode).toBe("sync");
    expect(hookResult.showSync).toBe(true);
    expect(hookResult.showToast).toBe(false);
    expect(hookResult.activeToast).toBeNull();
  });

  it("pauses auto-dismiss on pauseHover and resumes on resumeHover", async () => {
    mockToasts = [
      {
        id: "toast-hover",
        title: "Hover test",
        type: "success",
        duration: 3500,
        phase: "idle",
        createdAt: Date.now(),
      },
    ];

    await renderHarness();
    expect(hookResult.activeToast?.id).toBe("toast-hover");

    // Advance 2000ms
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Hover starts
    act(() => {
      hookResult.pauseHover();
    });

    // Advance 5000ms during hover
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await renderHarness();

    // Still active
    expect(hookResult.activeToast?.id).toBe("toast-hover");
    expect(mockDismissToast).not.toHaveBeenCalled();

    // Hover ends
    act(() => {
      hookResult.resumeHover();
    });

    // Advance remaining 1600ms
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    await renderHarness();

    expect(mockDismissToast).toHaveBeenCalledWith("toast-hover");
  });

  it("does not auto-dismiss loading toasts until mutated to success", async () => {
    mockToasts = [
      {
        id: "toast-loading",
        title: "Parsing file…",
        type: "loading",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];

    await renderHarness();
    expect(hookResult.activeToast?.id).toBe("toast-loading");

    // Advance 10000ms: loading toast should never auto-dismiss
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    await renderHarness();
    expect(mockDismissToast).not.toHaveBeenCalled();
    expect(hookResult.activeToast?.id).toBe("toast-loading");

    // In-place mutation from loading to success
    mockToasts = [
      {
        id: "toast-loading",
        title: "File parsed successfully",
        type: "success",
        phase: "idle",
        createdAt: Date.now(),
      },
    ];
    await renderHarness();

    expect(hookResult.activeToast?.title).toBe("File parsed successfully");
    expect(hookResult.activeToast?.type).toBe("success");

    // Now auto-dismiss timer is active: advance 3500ms
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });
    await renderHarness();

    expect(mockDismissToast).toHaveBeenCalledWith("toast-loading");
  });
});
