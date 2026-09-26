import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";

import {
  getGmailClientForAccount,
  rethrowIfInsufficientScope,
} from "@/lib/google";
import { generateTailoredResumePdf } from "@/lib/pdf-generator";
import { prisma } from "@/lib/prisma";
import { tailorResumeForJob } from "@/lib/resume-tailor";
import type { MasterProfileInput } from "@/lib/validations/profile";
import { tailoredDataSchema } from "@/lib/validations/profile";
import { parseAccountRules } from "@/lib/validations/rules";

function encodeRaw(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMimeMessage(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  pdf: Buffer;
  filename: string;
}): string {
  const boundary = `mailpilot_${randomBytes(12).toString("hex")}`;
  const pdfBase64 = input.pdf.toString("base64").replace(/(.{76})/g, "$1\r\n");

  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.body,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${input.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${input.filename}"`,
    "",
    pdfBase64,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

async function loadMasterProfile(
  accountId: string
): Promise<MasterProfileInput> {
  const profile = await prisma.userProfile.findUnique({
    where: { accountId },
    include: {
      experiences: { orderBy: { displayOrder: "asc" } },
      projects: true,
      education: true,
    },
  });

  if (!profile) {
    throw new Error("Master resume profile not found. Upload a resume first.");
  }

  return {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    summary: profile.summary,
    links: (profile.links as MasterProfileInput["links"]) ?? [],
    skills: (profile.skills as MasterProfileInput["skills"]) ?? {
      languages: [],
      frameworks: [],
      tools: [],
      concepts: [],
    },
    experiences: profile.experiences.map((e) => ({
      id: e.id,
      company: e.company,
      role: e.role,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      bullets: (e.bullets as MasterProfileInput["experiences"][number]["bullets"]) ?? [],
      displayOrder: e.displayOrder,
    })),
    projects: profile.projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      technologies: p.technologies,
      link: p.link,
      bullets: p.bullets,
    })),
    education: profile.education.map((ed) => ({
      id: ed.id,
      institution: ed.institution,
      degree: ed.degree,
      fieldOfStudy: ed.fieldOfStudy,
      graduationDate: ed.graduationDate,
    })),
  };
}

export type DispatchOptions = {
  createDraftOnly?: boolean;
  toEmail?: string;
};

/**
 * Generates a tailored PDF and creates a Gmail draft or sends the application email.
 */
export async function dispatchApplicationEmail(
  accountId: string,
  applicationId: string,
  options: DispatchOptions = {}
): Promise<{ mode: "draft" | "sent" }> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) {
    throw new Error("Account not found or inactive");
  }

  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, accountId },
  });
  if (!application) {
    throw new Error("Application not found");
  }

  const profile = await loadMasterProfile(accountId);
  const existingTailored = application.tailoredData
    ? tailoredDataSchema.safeParse(application.tailoredData)
    : null;

  const requirements =
    existingTailored?.success && existingTailored.data.jobRequirements.length > 0
      ? existingTailored.data.jobRequirements
      : [
          application.roleTitle ?? "role",
          application.companyName ?? "company",
          application.actionSummary ?? "",
        ].filter(Boolean);

  const tailored = await tailorResumeForJob(requirements, profile, {
    jobText: application.actionSummary ?? undefined,
  });

  const pdf = await generateTailoredResumePdf(
    profile,
    tailored.selectedExperience
  );

  const emailInSummary = application.actionSummary?.match(
    /[\w.+-]+@[\w-]+\.[\w.-]+/
  )?.[0];
  const mailtoRecipient = application.actionUrl?.startsWith("mailto:")
    ? application.actionUrl.replace(/^mailto:/i, "").split("?")[0]
    : null;
  const recipient =
    options.toEmail ||
    emailInSummary ||
    mailtoRecipient ||
    account.email;

  const subject = `Application: ${application.roleTitle ?? "Role"} at ${
    application.companyName ?? "Your Company"
  }`;
  const filename = `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`;
  const raw = buildMimeMessage({
    from: account.email,
    to: recipient,
    subject,
    body: tailored.coverLetter,
    pdf,
    filename,
  });

  const gmail = await getGmailClientForAccount(account);
  const createDraftOnly = options.createDraftOnly === true;

  try {
    if (createDraftOnly) {
      await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: { raw: encodeRaw(raw) },
        },
      });
    } else {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeRaw(raw) },
      });
    }
  } catch (error) {
    rethrowIfInsufficientScope(error);
  }

  const now = new Date();
  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      tailoredData: {
        selectedBullets: tailored.selectedBullets,
        coverLetter: tailored.coverLetter,
        jobRequirements: tailored.jobRequirements,
      } as Prisma.InputJsonValue,
      ...(createDraftOnly
        ? {}
        : {
            dispatchStatus: "SENT",
            status: "APPLIED",
            sentAt: now,
            appliedAt: now,
          }),
    },
  });

  return { mode: createDraftOnly ? "draft" : "sent" };
}

export async function countSendsToday(accountId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.jobApplication.count({
    where: {
      accountId,
      dispatchStatus: "SENT",
      sentAt: { gte: start },
    },
  });
}

export async function getDailySendLimit(accountId: string): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      settings: true,
      persistentProfile: { include: { permanentSettings: true } },
    },
  });

  if (account?.persistentProfile?.permanentSettings) {
    return account.persistentProfile.permanentSettings.maxAutoSendsPerDay;
  }

  return parseAccountRules(account?.settings?.rules).maxAutoSendsPerDay;
}
