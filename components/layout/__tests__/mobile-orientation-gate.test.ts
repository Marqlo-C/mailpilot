import { describe, it, expect } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { MobileOrientationGate } from "../mobile-orientation-gate";

describe("MobileOrientationGate", () => {
  it("is inert and renders null to unblock portrait mobile users (<744px)", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MobileOrientationGate)
    );
    expect(html).toBe("");
  });

  it("safely handles custom className while remaining inert", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MobileOrientationGate, {
        className: "custom-gate-class",
      })
    );
    expect(html).toBe("");
  });
});
