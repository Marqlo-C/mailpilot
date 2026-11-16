import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchApplicationEmail } from "../application-dispatch.service";
import { prisma } from "@/lib/core/prisma";
import * as googleModule from "@/lib/gmail/google";
import * as profileModule from "@/lib/profile/master-profile";
import * as pdfModule from "@/lib/document/pdf-generator";
import * as tailorModule from "@/lib/tailor";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules.schema";

describe("Application Dispatch Service - Workflow Protection", () => {
  const sampleAccountId = "acc_dispatch_123";
  const sampleApplicationId = "app_123";

  const mockAccount = {
    id: sampleAccountId,
    email: "sender@example.com",
    isActive: true,
    settings: {
      rules: { ...DEFAULT_ACCOUNT_RULES },
      llmProvider: "OPENROUTER",
    },
  };

  const mockApplication = {
    id: sampleApplicationId,
    accountId: sampleAccountId,
    roleTitle: "Staff Systems Engineer",
    companyName: "Acme Corp",
    actionSummary: "Apply via email to hr@acme.com",
    actionUrl: "mailto:hr@acme.com",
    applyUrl: null,
    toEmail: "hr@acme.com",
    draftSubject: "Application: Staff Systems Engineer",
    draftBody: "Dear Hiring Team, I am writing to apply...",
    gmailDraftId: null,
    gmailMessageId: null,
    tailoredData: null,
  };

  const mockProfile = {
    fullName: "Alex Rivera",
    email: "alex@example.com",
    experiences: [],
    projects: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("forces draft-only mode when applicationMode is MANUAL_REVIEW (fail-safe)", async () => {
    vi.spyOn(prisma.account, "findUnique").mockResolvedValue({
      ...mockAccount,
      settings: {
        ...mockAccount.settings,
        rules: {
          ...DEFAULT_ACCOUNT_RULES,
          applicationMode: "MANUAL_REVIEW",
          featureFlags: {},
        },
      },
    } as any);

    vi.spyOn(prisma.jobApplication, "findFirst").mockResolvedValue(
      mockApplication as any
    );

    const updateSpy = vi
      .spyOn(prisma.jobApplication, "update")
      .mockResolvedValue({} as any);

    vi.spyOn(profileModule, "loadMasterProfileForDraft").mockResolvedValue(
      mockProfile as any
    );

    vi.spyOn(pdfModule, "generateTailoredResumePdf").mockResolvedValue(
      Buffer.from("pdf-data")
    );

    vi.spyOn(tailorModule, "tailorResumeForJob").mockResolvedValue({
      selectedExperience: [],
      selectedProjects: [],
      coverLetter: "Cover letter text",
      selectedBullets: [],
      jobRequirements: ["Staff Systems Engineer"],
    } as any);

    const draftCreateMock = vi.fn().mockResolvedValue({ data: { id: "draft_new_123" } });
    const messageSendMock = vi.fn().mockResolvedValue({ data: { id: "msg_new_123" } });

    vi.spyOn(googleModule, "getGmailClientForAccount").mockResolvedValue({
      users: {
        drafts: { create: draftCreateMock },
        messages: { send: messageSendMock },
      },
    } as any);

    // Caller requests SEND (createDraftOnly: false)
    const result = await dispatchApplicationEmail(
      sampleAccountId,
      sampleApplicationId,
      { createDraftOnly: false }
    );

    // Fail-safe override: result must be 'draft'
    expect(result.mode).toBe("draft");
    expect(result.gmailDraftId).toBe("draft_new_123");

    // Gmail message send must NEVER have been called
    expect(messageSendMock).not.toHaveBeenCalled();
    // Gmail draft create MUST have been called
    expect(draftCreateMock).toHaveBeenCalled();

    // Database record must be saved as DRAFT_SAVED_GMAIL and PENDING_REVIEW
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleApplicationId },
        data: expect.objectContaining({
          opportunityStatus: "DRAFT_SAVED_GMAIL",
          dispatchStatus: "PENDING_REVIEW",
          gmailDraftId: "draft_new_123",
        }),
      })
    );
  });

  it("permits auto-send dispatch when applicationMode is explicitly AUTO_SEND", async () => {
    vi.spyOn(prisma.account, "findUnique").mockResolvedValue({
      ...mockAccount,
      settings: {
        ...mockAccount.settings,
        rules: {
          ...DEFAULT_ACCOUNT_RULES,
          applicationMode: "AUTO_SEND",
          featureFlags: {},
        },
      },
    } as any);

    vi.spyOn(prisma.jobApplication, "findFirst").mockResolvedValue(
      mockApplication as any
    );

    const updateSpy = vi
      .spyOn(prisma.jobApplication, "update")
      .mockResolvedValue({} as any);

    vi.spyOn(profileModule, "loadMasterProfileForDraft").mockResolvedValue(
      mockProfile as any
    );

    vi.spyOn(pdfModule, "generateTailoredResumePdf").mockResolvedValue(
      Buffer.from("pdf-data")
    );

    vi.spyOn(tailorModule, "tailorResumeForJob").mockResolvedValue({
      selectedExperience: [],
      selectedProjects: [],
      coverLetter: "Cover letter text",
      selectedBullets: [],
      jobRequirements: ["Staff Systems Engineer"],
    } as any);

    const draftCreateMock = vi.fn();
    const messageSendMock = vi.fn().mockResolvedValue({ data: { id: "sent_msg_999" } });

    vi.spyOn(googleModule, "getGmailClientForAccount").mockResolvedValue({
      users: {
        drafts: { create: draftCreateMock },
        messages: { send: messageSendMock },
      },
    } as any);

    const result = await dispatchApplicationEmail(
      sampleAccountId,
      sampleApplicationId,
      { createDraftOnly: false }
    );

    expect(result.mode).toBe("sent");
    expect(messageSendMock).toHaveBeenCalled();
    expect(draftCreateMock).not.toHaveBeenCalled();

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleApplicationId },
        data: expect.objectContaining({
          opportunityStatus: "SENT",
          dispatchStatus: "SENT",
          status: "APPLIED",
          gmailMessageId: "sent_msg_999",
        }),
      })
    );
  });
});
