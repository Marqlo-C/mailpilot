import { describe, it, expect } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { EmptyState } from "../empty-state";
import { EmptyState as SubscriptionsEmptyState } from "@/components/features/subscriptions/parts/empty-state";

describe("EmptyState Composite Component", () => {
  it("renders title and text description correctly", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(EmptyState, {
        title: "Connect a Gmail account first",
        description: "Job classification starts once an inbox is linked.",
      })
    );

    expect(html).toContain("Connect a Gmail account first");
    expect(html).toContain("Job classification starts once an inbox is linked.");
    expect(html).toContain("border-dashed");
  });

  it("renders with custom action slot and icon", () => {
    const DummyIcon = ({ className }: { className?: string }) =>
      React.createElement("svg", { "data-testid": "dummy-icon", className });

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(EmptyState, {
        icon: DummyIcon,
        title: "No matching items",
        action: React.createElement("button", null, "Reset Filters"),
        size: "sm",
      })
    );

    expect(html).toContain("data-testid=\"dummy-icon\"");
    expect(html).toContain("No matching items");
    expect(html).toContain("Reset Filters");
    expect(html).toContain("px-4 py-6");
  });

  it("renders prominent lg size correctly", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(EmptyState, {
        title: "No accounts connected",
        size: "lg",
      })
    );

    expect(html).toContain("px-6 py-16");
    expect(html).toContain("No accounts connected");
  });

  it("supports the Subscriptions EmptyState wrapper with backward compatibility", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SubscriptionsEmptyState, {
        title: "No subscribed senders",
        body: "MailPilot will capture senders automatically.",
      })
    );

    expect(html).toContain("No subscribed senders");
    expect(html).toContain("MailPilot will capture senders automatically.");
    expect(html).toContain("border-dashed");
  });
});
