import { describe, expect, it } from "vitest";

import {
  classifyResumeEditProbe,
  clampResumeZoom,
  easeAppleSnappy,
  lerp,
  pageLocalToScreen,
  pointHitsPaddedRects,
  projectContentPointToScreen,
  RESUME_EDIT_ENTRY_ZOOM,
  resolveEditScreenAnchor,
  resolveEditableAnchorRect,
  resolveEditableMeasureTarget,
  resumeBaseZoom,
  resumeDisplayZoomChoice,
  resumeEffectiveZoom,
  resumeZoomPercent,
  screenToPageLocal,
  scrollForContentPointAtScreen,
  type ResumeEditTargetProbe,
} from "@/lib/resume-draft/edit-presentation";

describe("resumeBaseZoom / resumeEffectiveZoom", () => {
  it("maps Fit to live fitScale and explicit chips to their ratios", () => {
    expect(resumeBaseZoom("fit", 0.7)).toBeCloseTo(0.7);
    expect(resumeBaseZoom("1", 0.7)).toBe(1);
    expect(resumeBaseZoom("1.25", 0.7)).toBe(1.25);
  });

  it("uses clamped manualScale for custom zoom", () => {
    expect(resumeBaseZoom("custom", 0.7, 0.42)).toBeCloseTo(0.42);
    expect(resumeBaseZoom("custom", 0.7, 0.01)).toBe(0.25);
    expect(resumeBaseZoom("custom", 0.7, 9)).toBe(3);
  });

  it("keeps chips honest while editing — no 100% floor", () => {
    expect(resumeEffectiveZoom("fit", 0.7, true)).toBeCloseTo(0.7);
    expect(resumeEffectiveZoom("1", 0.7, true)).toBe(1);
    expect(resumeEffectiveZoom("1.25", 0.7, true)).toBe(1.25);
    expect(resumeEffectiveZoom("custom", 0.7, true, 0.85)).toBeCloseTo(0.85);
    expect(resumeEffectiveZoom("fit", 1.15, true)).toBeCloseTo(1.15);
    expect(resumeEffectiveZoom("fit", 0.7, false)).toBeCloseTo(0.7);
  });
});

describe("clampResumeZoom / resumeZoomPercent", () => {
  it("clamps to the supported range", () => {
    expect(clampResumeZoom(0)).toBe(0.25);
    expect(clampResumeZoom(4)).toBe(3);
    expect(clampResumeZoom(1.1)).toBeCloseTo(1.1);
  });

  it("rounds live scale to a whole percent", () => {
    expect(resumeZoomPercent(0.7)).toBe(70);
    expect(resumeZoomPercent(1)).toBe(100);
    expect(resumeZoomPercent(1.25)).toBe(125);
    expect(resumeZoomPercent(0.856)).toBe(86);
  });
});

describe("resumeDisplayZoomChoice", () => {
  it("always mirrors stored choice", () => {
    expect(resumeDisplayZoomChoice("fit", 0.7, false)).toBe("fit");
    expect(resumeDisplayZoomChoice("fit", 0.7, true)).toBe("fit");
    expect(resumeDisplayZoomChoice("custom", 0.7, true)).toBe("custom");
    expect(resumeDisplayZoomChoice("1", 0.7, true)).toBe("1");
    expect(resumeDisplayZoomChoice("1.25", 0.7, true)).toBe("1.25");
  });
});

describe("classifyResumeEditProbe", () => {
  const base: ResumeEditTargetProbe = {
    isResumeLocal: false,
    inResumeLine: false,
    isContentEditablePath: false,
    lineHasContentEditable: false,
    nearEditableText: null,
    insideResumeRoot: false,
  };

  it("returns detached when resume root is missing", () => {
    expect(classifyResumeEditProbe(base, false)).toBe("detached");
    expect(classifyResumeEditProbe(null, false)).toBe("detached");
  });

  it("returns external for null probe with a live root", () => {
    expect(classifyResumeEditProbe(null, true)).toBe("external");
  });

  it("classifies focused contenteditable paths as editable", () => {
    expect(
      classifyResumeEditProbe(
        { ...base, inResumeLine: true, isContentEditablePath: true },
        true
      )
    ).toBe("editable");
  });

  it("treats same-row whitespace (line host, not near glyphs) as resume-other", () => {
    expect(
      classifyResumeEditProbe(
        {
          ...base,
          inResumeLine: true,
          isContentEditablePath: false,
          lineHasContentEditable: true,
          nearEditableText: false,
        },
        true
      )
    ).toBe("resume-other");
    expect(
      classifyResumeEditProbe(
        {
          ...base,
          inResumeLine: true,
          lineHasContentEditable: true,
          nearEditableText: null,
        },
        true
      )
    ).toBe("resume-other");
  });

  it("treats pointer near editable glyphs as editable even off the CE path", () => {
    expect(
      classifyResumeEditProbe(
        {
          ...base,
          inResumeLine: true,
          lineHasContentEditable: true,
          nearEditableText: true,
        },
        true
      )
    ).toBe("editable");
  });

  it("allowlists float / Ace / toolbar as resume-local", () => {
    expect(
      classifyResumeEditProbe({ ...base, isResumeLocal: true }, true)
    ).toBe("resume-local");
  });

  it("classifies canvas whitespace as resume-other and email as external", () => {
    expect(
      classifyResumeEditProbe({ ...base, insideResumeRoot: true }, true)
    ).toBe("resume-other");
    expect(classifyResumeEditProbe(base, true)).toBe("external");
  });
});

describe("pointHitsPaddedRects", () => {
  it("hits inside pad and misses beyond it", () => {
    const rects = [{ x: 100, y: 50, width: 80, height: 16 }];
    expect(
      pointHitsPaddedRects({ x: 100, y: 50 }, rects, 6)
    ).toBe(true);
    expect(
      pointHitsPaddedRects({ x: 94, y: 58 }, rects, 6)
    ).toBe(true);
    expect(
      pointHitsPaddedRects({ x: 93, y: 58 }, rects, 6)
    ).toBe(false);
    expect(
      pointHitsPaddedRects({ x: 200, y: 58 }, rects, 6)
    ).toBe(false);
  });
});

describe("resolveEditableMeasureTarget / anchor rects", () => {
  it("prefers inner contenteditable for skills-style hosts", () => {
    expect(
      resolveEditableMeasureTarget({
        hostIsContentEditable: false,
        hasInnerContentEditable: true,
      })
    ).toBe("inner");
    expect(
      resolveEditableMeasureTarget({
        hostIsContentEditable: true,
        hasInnerContentEditable: false,
      })
    ).toBe("host");
  });

  it("uses first client rect when wrapped; else bounding box", () => {
    const first = { x: 10, y: 20, width: 100, height: 14 };
    const second = { x: 10, y: 36, width: 80, height: 14 };
    const bounding = { x: 10, y: 20, width: 100, height: 30 };
    expect(
      resolveEditableAnchorRect({
        clientRects: [first, second],
        boundingRect: bounding,
      })
    ).toEqual(first);
    expect(
      resolveEditableAnchorRect({
        clientRects: [],
        boundingRect: bounding,
      })
    ).toEqual(bounding);
  });

  it("prefers caret when present; else first-line center", () => {
    const firstLine = { x: 0, y: 100, width: 200, height: 16 };
    expect(
      resolveEditScreenAnchor({
        caret: { x: 40, y: 102, width: 0, height: 14 },
        firstLine,
      })
    ).toEqual({ x: 40, y: 109 });
    expect(
      resolveEditScreenAnchor({
        caret: null,
        firstLine,
      })
    ).toEqual({ x: 100, y: 108 });
    expect(
      resolveEditScreenAnchor({
        caret: { x: 0, y: 0, width: 0, height: 0 },
        firstLine,
      })
    ).toEqual({ x: 100, y: 108 });
  });
});

describe("content-local projection / scroll solve", () => {
  it("exposes the 125% edit-entry zoom constant", () => {
    expect(RESUME_EDIT_ENTRY_ZOOM).toBeCloseTo(1.25);
  });

  it("round-trips screen ↔ page-local under origin 0 0", () => {
    const pagesOrigin = { x: 120, y: 80 };
    const scale = 0.7;
    const screen = { x: 260, y: 220 };
    const local = screenToPageLocal(screen, pagesOrigin, scale);
    expect(local.x).toBeCloseTo((260 - 120) / 0.7);
    expect(local.y).toBeCloseTo((220 - 80) / 0.7);
    const back = pageLocalToScreen(local, pagesOrigin, scale);
    expect(back.x).toBeCloseTo(screen.x);
    expect(back.y).toBeCloseTo(screen.y);
  });

  it("scroll solve puts the projected point on the mouse at entry zoom", () => {
    // Numbers chosen so the unclamped solve is well inside [0, max].
    const contentLocal = { x: 400, y: 500 };
    const mouseScreen = { x: 520, y: 280 };
    const viewportOrigin = { x: 200, y: 80 };
    const pagesContentOrigin = { x: 40, y: 16 };
    const scale = RESUME_EDIT_ENTRY_ZOOM;

    const scroll = scrollForContentPointAtScreen({
      contentLocal,
      mouseScreen,
      viewportOrigin,
      pagesContentOrigin,
      scale,
      maxScrollLeft: 2000,
      maxScrollTop: 2000,
    });

    expect(scroll.scrollLeft).toBeGreaterThan(0);
    expect(scroll.scrollTop).toBeGreaterThan(0);

    const projected = projectContentPointToScreen({
      contentLocal,
      viewportOrigin,
      pagesContentOrigin,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
      scale,
    });

    expect(projected.x).toBeCloseTo(mouseScreen.x);
    expect(projected.y).toBeCloseTo(mouseScreen.y);
  });

  it("clamps scroll when the solve hits 0 or max", () => {
    const viewportOrigin = { x: 0, y: 0 };
    const pagesContentOrigin = { x: 0, y: 0 };

    const atFloor = scrollForContentPointAtScreen({
      contentLocal: { x: 10, y: 10 },
      mouseScreen: { x: 900, y: 900 },
      viewportOrigin,
      pagesContentOrigin,
      scale: RESUME_EDIT_ENTRY_ZOOM,
      maxScrollLeft: 500,
      maxScrollTop: 500,
    });
    expect(atFloor.scrollLeft).toBe(0);
    expect(atFloor.scrollTop).toBe(0);

    const atCeil = scrollForContentPointAtScreen({
      contentLocal: { x: 800, y: 800 },
      mouseScreen: { x: 0, y: 0 },
      viewportOrigin,
      pagesContentOrigin,
      scale: RESUME_EDIT_ENTRY_ZOOM,
      maxScrollLeft: 200,
      maxScrollTop: 150,
    });
    expect(atCeil.scrollLeft).toBe(200);
    expect(atCeil.scrollTop).toBe(150);
  });

  it("lerp and easeAppleSnappy stay in range", () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 1)).toBe(100);
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(10, 20, -1)).toBe(10);
    expect(lerp(10, 20, 2)).toBe(20);
    expect(easeAppleSnappy(0)).toBe(0);
    expect(easeAppleSnappy(1)).toBe(1);
    expect(easeAppleSnappy(0.5)).toBeGreaterThan(0.5);
  });
});
