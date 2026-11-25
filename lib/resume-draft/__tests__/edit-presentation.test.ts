import { describe, expect, it } from "vitest";

import {
  classifyResumeEditProbe,
  resolveEditScreenAnchor,
  resolveEditableAnchorRect,
  resolveEditableMeasureTarget,
  resumeDisplayZoomChoice,
  resumeEffectiveZoom,
  scrollDeltaForZoomAroundPoint,
  RESUME_EDIT_ZOOM_FLOOR,
  type ResumeEditTargetProbe,
} from "@/lib/resume-draft/edit-presentation";

describe("resumeEffectiveZoom", () => {
  it("leaves idle zoom unchanged", () => {
    expect(resumeEffectiveZoom("fit", 0.7, false)).toBeCloseTo(0.7);
    expect(resumeEffectiveZoom("0.85", 0.7, false)).toBe(0.85);
  });

  it("floors edit zoom at 100% without mutating stored choice semantics", () => {
    expect(resumeEffectiveZoom("fit", 0.7, true)).toBe(RESUME_EDIT_ZOOM_FLOOR);
    expect(resumeEffectiveZoom("0.85", 0.7, true)).toBe(RESUME_EDIT_ZOOM_FLOOR);
    expect(resumeEffectiveZoom("1", 0.7, true)).toBe(1);
    expect(resumeEffectiveZoom("1.25", 0.7, true)).toBe(1.25);
    expect(resumeEffectiveZoom("fit", 1.15, true)).toBeCloseTo(1.15);
  });
});

describe("scrollDeltaForZoomAroundPoint", () => {
  it("scales scroll by cursor offset inside the scroller", () => {
    expect(
      scrollDeltaForZoomAroundPoint({
        oldZoom: 1,
        newZoom: 2,
        anchorXInScroller: 100,
        anchorYInScroller: 200,
      })
    ).toEqual({ dx: 100, dy: 200 });
    expect(
      scrollDeltaForZoomAroundPoint({
        oldZoom: 0.5,
        newZoom: 1,
        anchorXInScroller: 80,
        anchorYInScroller: 40,
      })
    ).toEqual({ dx: 80, dy: 40 });
  });

  it("is a no-op when scale is unchanged", () => {
    expect(
      scrollDeltaForZoomAroundPoint({
        oldZoom: 0.85,
        newZoom: 0.85,
        anchorXInScroller: 50,
        anchorYInScroller: 50,
      })
    ).toEqual({ dx: 0, dy: 0 });
  });
});

describe("resumeDisplayZoomChoice", () => {
  it("always mirrors stored choice — edit floor does not hop the chip", () => {
    expect(resumeDisplayZoomChoice("fit", 0.7, false)).toBe("fit");
    expect(resumeDisplayZoomChoice("fit", 0.7, true)).toBe("fit");
    expect(resumeDisplayZoomChoice("0.85", 0.7, true)).toBe("0.85");
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
    insideResumeRoot: false,
  };

  it("returns detached when resume root is missing", () => {
    expect(classifyResumeEditProbe(base, false)).toBe("detached");
    expect(classifyResumeEditProbe(null, false)).toBe("detached");
  });

  it("returns external for null probe with a live root", () => {
    expect(classifyResumeEditProbe(null, true)).toBe("external");
  });

  it("classifies contenteditable lines as editable", () => {
    expect(
      classifyResumeEditProbe(
        { ...base, inResumeLine: true, isContentEditablePath: true },
        true
      )
    ).toBe("editable");
  });

  it("treats skills label host with inner editable as editable", () => {
    expect(
      classifyResumeEditProbe(
        {
          ...base,
          inResumeLine: true,
          isContentEditablePath: false,
          lineHasContentEditable: true,
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
