import { afterEach, describe, expect, it, vi } from "vitest";

import { measureToolbarMinWidthPx } from "@/hooks/use-toolbar-min-width";

describe("measureToolbarMinWidthPx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sums in-flow child widths + gap + padding without writing styles", () => {
    const left = {
      getBoundingClientRect: () => ({ width: 120 }),
    };
    const right = {
      getBoundingClientRect: () => ({ width: 80 }),
    };
    const root = {
      style: { width: "100%" },
      children: [left, right],
      getBoundingClientRect: vi.fn(),
    } as unknown as HTMLElement;

    vi.stubGlobal(
      "getComputedStyle",
      vi.fn((el: unknown) => {
        if (el === root) {
          return {
            paddingLeft: "12px",
            paddingRight: "12px",
            columnGap: "8px",
            gap: "8px",
          };
        }
        return { position: "static" };
      })
    );

    expect(measureToolbarMinWidthPx(root)).toBe(232); // 12+12 + 120+8+80
    expect(root.style.width).toBe("100%");
    expect(root.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it("ignores absolute overlay children (Ace refine / notes)", () => {
    const row = {
      getBoundingClientRect: () => ({ width: 200 }),
    };
    const overlay = {
      getBoundingClientRect: () => ({ width: 900 }),
    };
    const root = {
      style: { width: "100%" },
      children: [row, overlay],
    } as unknown as HTMLElement;

    vi.stubGlobal(
      "getComputedStyle",
      vi.fn((el: unknown) => {
        if (el === root) {
          return {
            paddingLeft: "12px",
            paddingRight: "12px",
            columnGap: "8px",
            gap: "8px",
          };
        }
        if (el === overlay) return { position: "absolute" };
        return { position: "static" };
      })
    );

    expect(measureToolbarMinWidthPx(root)).toBe(224); // 12+12 + 200
  });
});
