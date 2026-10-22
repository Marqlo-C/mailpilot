/**
 * Server-side stubs for browser geometry APIs.
 * pdf-parse / pdf.js (and similar) reference DOMMatrix during module evaluation.
 */
if (typeof window === "undefined") {
  if (typeof globalThis.DOMMatrix === "undefined") {
    class DOMMatrixMock {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      m11 = 1;
      m12 = 0;
      m13 = 0;
      m14 = 0;
      m21 = 0;
      m22 = 1;
      m23 = 0;
      m24 = 0;
      m31 = 0;
      m32 = 0;
      m33 = 1;
      m34 = 0;
      m41 = 0;
      m42 = 0;
      m43 = 0;
      m44 = 1;
      is2D = true;
      isIdentity = true;
      constructor() {}
      static fromMatrix() {
        return new DOMMatrixMock();
      }
      multiply() {
        return this;
      }
      translate() {
        return this;
      }
      scale() {
        return this;
      }
      rotate() {
        return this;
      }
      transformPoint(point: unknown) {
        return point;
      }
    }
    // @ts-expect-error — Node lacks DOMMatrix; stub for SSR-only consumers
    globalThis.DOMMatrix = DOMMatrixMock;
  }

  if (typeof globalThis.DOMPoint === "undefined") {
    class DOMPointMock {
      x = 0;
      y = 0;
      z = 0;
      w = 1;
      constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
      }
      static fromPoint(other?: { x?: number; y?: number; z?: number; w?: number }) {
        return new DOMPointMock(other?.x, other?.y, other?.z, other?.w);
      }
    }
    // @ts-expect-error — Node lacks DOMPoint; stub for SSR-only consumers
    globalThis.DOMPoint = DOMPointMock;
  }
}

export {};
