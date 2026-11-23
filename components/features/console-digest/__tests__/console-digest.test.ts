import { describe, it, expect, vi } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import type { JobApplication, JobOpportunity, Subscription } from "@/lib/generated/prisma/client";
import {
  computeConsoleMetrics,
  ConsoleMetricsGrid,
  ConsoleDigestCards,
  OpportunityDigestRow,
  SubscriptionDigestRow,
  ConsolePulseCapsules,
} from "../index";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

vi.mock("@/components/ui/logo-frame", () => ({
  CompanyLogo: ({ name }: { name: string }) =>
    React.createElement("div", { "data-testid": "company-logo" }, name),
}));

vi.mock("@/components/layout/sync-status-provider", () => ({
  useOptionalSyncStatus: () => ({
    isSyncing: false,
    syncKind: null,
    pendingCount: 0,
    lastSyncProcessed: 0,
    totalToProcess: 0,
  }),
}));

describe("computeConsoleMetrics", () => {
  it("computes accurate leads, action opportunities, applied counts, and loud senders", () => {
    const opportunities: Partial<JobOpportunity>[] = [
      {
        id: "opp-1",
        status: "DISCOVERED",
        company: "Vercel",
        title: "Frontend Engineer",
        matchScore: 88,
        isArchived: false,
        previousStatus: null,
      },
      {
        id: "opp-2",
        status: "REVIEW_READY",
        company: "Stripe",
        title: "Staff Systems Engineer",
        matchScore: 94,
        isArchived: false,
        previousStatus: null,
      },
      {
        id: "opp-3",
        status: "APPLIED",
        company: "GitHub",
        title: "Senior AI Engineer",
        matchScore: 91,
        isArchived: false,
        previousStatus: null,
      },
    ];

    const jobs: Partial<JobApplication>[] = [
      {
        id: "job-1",
        status: "OA",
        companyName: "Linear",
        roleTitle: "Product Designer",
        isArchived: false,
        isTrashed: false,
      },
      {
        id: "job-2",
        status: "LEAD",
        companyName: "Figma",
        roleTitle: "Design Technologist",
        isArchived: false,
        isTrashed: false,
      },
    ];

    const subscriptions: Partial<Subscription>[] = [
      {
        id: "sub-1",
        status: "ACTIVE",
        senderName: "Daily Tech Digest",
        senderEmail: "news@dailytech.com",
        emailCount: 120,
        lastReceivedAt: new Date(),
      },
      {
        id: "sub-2",
        status: "ACTIVE",
        senderName: "Low Volume Alerts",
        senderEmail: "notify@service.io",
        emailCount: 2,
        lastReceivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    ];

    const result = computeConsoleMetrics(
      opportunities as JobOpportunity[],
      jobs as JobApplication[],
      subscriptions as Subscription[]
    );

    // Leads = 1 discovered opp + 1 lead job = 2
    expect(result.leadCount).toBe(2);
    // Action opps = 1 review_ready opp
    expect(result.actionOpportunities.length).toBe(1);
    // Action jobs = 1 OA job
    expect(result.actionJobs.length).toBe(1);
    // Applied = 1 applied opp
    expect(result.appliedCount).toBe(1);
    // Subscriptions: sub-1 has 120 emails (loud), sub-2 has 2
    expect(result.activeSubscriptions.length).toBe(2);
    expect(result.loudCount).toBeGreaterThanOrEqual(1);

    // 4 Metrics check
    expect(result.metrics.length).toBe(4);
    expect(result.metrics.map((m) => m.id)).toEqual([
      "leads",
      "action",
      "applied",
      "subscriptions",
    ]);
  });
});

describe("ConsoleMetricsGrid Component", () => {
  it("renders 4 enhanced tactile cards with values, hints, and specular depth", () => {
    const data = computeConsoleMetrics([], [], []);
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ConsoleMetricsGrid, { metrics: data.metrics })
    );

    expect(html).toContain("mp-specular-depth");
    expect(html).toContain("Leads");
    expect(html).toContain("Action Required");
    expect(html).toContain("Dispatched / Applied");
    expect(html).toContain("Loud Senders");
    expect(html).toContain("active:scale-[0.98]");
  });
});

describe("OpportunityDigestRow Component", () => {
  it("renders match score badge and inline Review action button", () => {
    const opportunity: Partial<JobOpportunity> = {
      id: "opp-123",
      company: "Anthropic",
      companyDomain: "anthropic.com",
      title: "Fullstack Platform Engineer",
      matchScore: 92,
      applyUrl: "https://anthropic.com/careers/123",
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OpportunityDigestRow, {
        opportunity: opportunity as JobOpportunity,
        threshold: 70,
      })
    );

    expect(html).toContain("Anthropic");
    expect(html).toContain("Fullstack Platform Engineer");
    expect(html).toContain("92%");
    expect(html).toContain("Review");
    expect(html).toContain("https://anthropic.com/careers/123");
  });
});

describe("SubscriptionDigestRow Component", () => {
  it("renders sender info, clutter meter bar, and inline Manage action", () => {
    const subscription: Partial<Subscription> = {
      id: "sub-999",
      senderName: "Marketing Blast",
      senderEmail: "promo@blast.com",
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SubscriptionDigestRow, {
        subscription: subscription as Subscription,
        clutter: 85,
      })
    );

    expect(html).toContain("Marketing Blast");
    expect(html).toContain("promo@blast.com");
    expect(html).toContain("85%");
    expect(html).toContain("High Noise");
    expect(html).toContain("Manage");
  });
});

describe("ConsoleDigestCards Component", () => {
  it("renders two responsive columns for Action Center and Subscription Signal & Noise", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ConsoleDigestCards, {
        actionOpportunities: [],
        actionJobs: [],
        activeSubscriptions: [],
        threshold: 70,
      })
    );

    expect(html).toContain("grid gap-4 lg:grid-cols-2");
    expect(html).toContain("Action Center");
    expect(html).toContain("Subscription Signal &amp; Noise");
    expect(html).toContain("All caught up");
    expect(html).toContain("No subscriptions detected");
  });
});

describe("ConsolePulseCapsules Component", () => {
  it("renders real-time system pulse indicator capsules", () => {
    const activeAccount = {
      id: "acc-1",
      email: "engineer@company.com",
      rules: {
        bridgeConnected: true,
        encryptedHasDataApiKey: "key-123",
      },
      settings: {
        ollamaModel: "llama3.1:8b",
        localOllamaUrl: "http://localhost:11434",
      },
      matchThreshold: 75,
      isSyncing: false,
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ConsolePulseCapsules, {
        activeAccount: activeAccount as any,
      })
    );

    expect(html).toContain("Gmail Sync Active");
    expect(html).toContain("Ollama:");
    expect(html).toContain("llama3.1:8b");
    expect(html).toContain("Scrapers:");
    expect(html).toContain("HasData Active");
    expect(html).toContain("Threshold:");
    expect(html).toContain("75%");
  });
});
