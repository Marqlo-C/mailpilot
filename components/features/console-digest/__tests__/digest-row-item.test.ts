import { describe, it, expect, vi } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { DigestRowItem } from "../digest-row-item";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

vi.mock("@/components/ui/logo-frame", () => ({
  CompanyLogo: ({ name }: { name: string }) =>
    React.createElement("div", { "data-testid": "company-logo" }, name),
}));

describe("DigestRowItem Component", () => {
  it("renders the link, logo, titles, and metric badge slot correctly", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(DigestRowItem, {
        href: "/jobs",
        logoSrc: null,
        logoName: "Anthropic",
        title: "Anthropic",
        subtitle: "Senior Research Scientist",
        metricBadge: React.createElement("span", { className: "metric-badge" }, "95%"),
      })
    );

    expect(html).toContain("href=\"/jobs\"");
    expect(html).toContain("Anthropic");
    expect(html).toContain("Senior Research Scientist");
    expect(html).toContain("95%");
    expect(html).toContain("data-testid=\"company-logo\"");
  });
});
