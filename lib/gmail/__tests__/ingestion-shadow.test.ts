import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistClassifiedEmail } from "../ingestion-pipeline";
import * as shadowModule from "@/lib/services/shadow-evaluation.service";
import { prisma } from "@/lib/core/prisma";
import { parseAccountRules, type AccountRules } from "@/lib/validations/rules.schema";
import type { JobOpportunity } from "@prisma/client";

describe("Ingestion Pipeline Shadow Mode Integration", () => {
  const originalEnv = { ...process.env };

  const defaultRules: AccountRules = parseAccountRules({
    embeddingProvider: "local_ollama",
    embeddingModel: "nomic-embed-text",
    enableShadowEmbeddings: true,
    crossoverScoreThreshold: 60,
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("dispatches shadow evaluation when opportunity is created", async () => {
    const dispatchSpy = vi
      .spyOn(shadowModule, "dispatchShadowEvaluation")
      .mockResolvedValue(null);

    vi.spyOn(prisma.emailMessage, "upsert").mockResolvedValue({
      id: "email_msg_1",
      accountId: "acc_shadow_1",
      messageId: "msg_123",
      threadId: "th_123",
      subject: "Job Opportunity: Operations Lead",
      fromEmail: "jobs@apex.com",
      fromName: "Apex Jobs",
      emailCategory: "JOB_BOARD_DIGEST",
      emailDate: new Date(),
      snippet: "Great role",
      rawBody: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.spyOn(prisma.jobOpportunity, "findMany").mockResolvedValue([]);

    const createdOpp: Partial<JobOpportunity> = {
      id: "opp_shadow_1",
      accountId: "acc_shadow_1",
      emailMessageId: "email_msg_1",
      company: "Apex Global",
      title: "Operations Coordinator",
      location: "Remote",
      salary: "$90,000",
      salaryMax: 90000,
      postedAt: new Date().toISOString(),
      receivedAt: new Date(),
      description: "Coordinate global logistics and triage operational issues.",
      applyUrl: "https://apex.com/apply",
      applicationType: "EXTERNAL_LINK",
      recipientEmail: null,
      recipientName: null,
      companyDomain: "apex.com",
      logoUrl: null,
      matchScore: 78,
      matchReason: "Strong heuristic alignment",
      status: "DISCOVERED",
      appliedAt: null,
      isArchived: false,
      previousStatus: null,
      dismissedAt: null,
      classificationMethod: "AI",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(prisma.jobOpportunity, "create").mockResolvedValue(
      createdOpp as JobOpportunity
    );

    const result = await persistClassifiedEmail({
      gmail: {} as any,
      account: {
        id: "acc_shadow_1",
        email: "test@example.com",
        persistentProfileId: null,
        settings: null,
      },
      messageId: "msg_123",
      threadId: "th_123",
      subject: "Job Opportunity: Operations Lead",
      body: "We have an opening for an Operations Coordinator.",
      sender: { name: "Apex Jobs", email: "jobs@apex.com" },
      emailDate: new Date(),
      classification: {
        is_job_related: true,
        email_category: "JOB_BOARD_DIGEST",
        company_name: "Apex Global",
        role_title: "Operations Coordinator",
        status: "LEAD",
        action_required: false,
        action_summary: null,
        action_url: null,
        deadline_iso: null,
        classificationMethod: "AI",
        jobs: [
          {
            company: "Apex Global",
            title: "Operations Coordinator",
            location: "Remote",
            salary: "$90,000",
            salaryMax: 90000,
            postedAt: null,
            description: "Coordinate global logistics and triage operational issues.",
            applyUrl: "https://apex.com/apply",
            applicationType: "EXTERNAL_LINK",
            recipientEmail: null,
            recipientName: null,
            isAlreadyApplied: false,
            matchScore: 78,
            matchReason: "Strong heuristic alignment",
          },
        ],
      },
      rules: defaultRules,
    });

    expect(result.createdCount).toBe(1);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc_shadow_1",
        opportunity: expect.objectContaining({
          id: "opp_shadow_1",
          company: "Apex Global",
          title: "Operations Coordinator",
          matchScore: 78,
        }),
        rules: defaultRules,
      })
    );
  });

  it("awaits shadow evaluation when in development mode for synchronous telemetry", async () => {
    vi.stubEnv("NODE_ENV", "development");
    let completedAsyncWork = false;
    const dispatchSpy = vi
      .spyOn(shadowModule, "dispatchShadowEvaluation")
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        completedAsyncWork = true;
        return null;
      });

    vi.spyOn(prisma.emailMessage, "upsert").mockResolvedValue({
      id: "email_msg_dev",
      accountId: "acc_shadow_dev",
      messageId: "msg_dev",
      threadId: "th_dev",
      subject: "Dev Role",
      fromEmail: "jobs@apex.com",
      fromName: "Apex Jobs",
      emailCategory: "JOB_BOARD_DIGEST",
      emailDate: new Date(),
      snippet: "Great role",
      rawBody: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.spyOn(prisma.jobOpportunity, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.jobOpportunity, "create").mockResolvedValue({
      id: "opp_dev_sync",
      accountId: "acc_shadow_dev",
      emailMessageId: "email_msg_dev",
      company: "Apex Global",
      title: "Operations Lead",
      location: "Remote",
      salary: "$100,000",
      salaryMax: 100000,
      postedAt: new Date().toISOString(),
      receivedAt: new Date(),
      description: "Triage and coordinate.",
      applyUrl: "https://apex.com/apply",
      applicationType: "EXTERNAL_LINK",
      recipientEmail: null,
      recipientName: null,
      companyDomain: "apex.com",
      logoUrl: null,
      matchScore: 85,
      matchReason: "Direct match",
      status: "DISCOVERED",
      appliedAt: null,
      isArchived: false,
      previousStatus: null,
      dismissedAt: null,
      classificationMethod: "AI",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as JobOpportunity);

    const result = await persistClassifiedEmail({
      gmail: {} as any,
      account: {
        id: "acc_shadow_dev",
        email: "test@example.com",
        persistentProfileId: null,
        settings: null,
      },
      messageId: "msg_dev",
      threadId: "th_dev",
      subject: "Dev Role",
      body: "We have an opening.",
      sender: { name: "Apex Jobs", email: "jobs@apex.com" },
      emailDate: new Date(),
      classification: {
        is_job_related: true,
        email_category: "JOB_BOARD_DIGEST",
        company_name: "Apex Global",
        role_title: "Operations Lead",
        status: "LEAD",
        action_required: false,
        action_summary: null,
        action_url: null,
        deadline_iso: null,
        classificationMethod: "AI",
        jobs: [
          {
            company: "Apex Global",
            title: "Operations Lead",
            location: "Remote",
            salary: "$100,000",
            salaryMax: 100000,
            postedAt: null,
            description: "Triage and coordinate.",
            applyUrl: "https://apex.com/apply",
            applicationType: "EXTERNAL_LINK",
            recipientEmail: null,
            recipientName: null,
            isAlreadyApplied: false,
            matchScore: 85,
            matchReason: "Direct match",
          },
        ],
      },
      rules: defaultRules,
    });

    expect(result.createdCount).toBe(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    // Because it was awaited in dev mode, completedAsyncWork MUST be true immediately
    expect(completedAsyncWork).toBe(true);
  });
});
