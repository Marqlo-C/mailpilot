import { describe, it, expect } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { MobileOrientationGate } from "../mobile-orientation-gate";

describe("MobileOrientationGate", () => {
  it("renders the MailPilot logo, title, and explanatory copy", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MobileOrientationGate)
    );

    // Verifies accessibility landmark and identification
    expect(html).toContain("data-mobile-orientation-gate");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Device orientation required"');

    // Verifies MailPilot brand icon mark
    expect(html).toContain('alt="MailPilot"');
    expect(html).toContain("/logos/transparent-logo-only.png");

    // Verifies heading and copy
    expect(html).toContain("Rotate to Landscape");
    expect(html).toContain(
      "MailPilot is a dense workstation designed for wide displays. Please turn your phone to landscape mode to continue."
    );
  });

  it("applies the responsive CSS media query classes for portrait phones (<744px)", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MobileOrientationGate)
    );

    // CSS-first media query triggers flex ONLY on mobile portrait (max-width: 743px and orientation: portrait)
    expect(html).toContain(
      "[@media(max-width:743px)_and_(orientation:portrait)]:flex"
    );
    expect(html).toContain("portrait:max-[743px]:flex");

    // Otherwise hidden and inert by default
    expect(html).toContain("hidden");

    // Styling matches MailPilot dark canvas palette and full-screen blocking overlay
    expect(html).toContain("bg-[#101418]");
    expect(html).toContain("text-[#e4f7f3]");
    expect(html).toContain("z-[100]");
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("select-none");
  });

  it("merges custom className when provided", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MobileOrientationGate, {
        className: "custom-gate-class",
      })
    );

    expect(html).toContain("custom-gate-class");
    expect(html).toContain("bg-[#101418]");
  });
});
