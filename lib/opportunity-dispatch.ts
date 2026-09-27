import { randomBytes } from "crypto";

import { canDraftDirectEmail } from "@/lib/application-method";
import {
  getGmailClientForAccount,
  rethrowIfInsufficientScope,
} from "@/lib/google";
import { generateTailoredResumePdf } from "@/lib/pdf-generator";
import { prisma } from "@/lib/prisma";
import { tailorResumeForJob } from "@/lib/resume-tailor";
import type { MasterProfileInput } from "@/lib/validations/profile";
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
      bullets:
        (e.bullets as MasterProfileInput["experiences"][number]["bullets"]) ??
        [],
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

/**
 * Builds an in-app draft for a JobOpportunity. Throws if no recruiter email.
 */
export async function prepareOpportunityDraft(
  accountId: string,
  opportunityId: string
): Promise<{ subject: string; body: string; recipient: string }> {
  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }
  if (!canDraftDirectEmail(opportunity.recipientEmail)) {
    throw new Error(
      "No recruiter email address — email drafts are forbidden for job-board / portal listings."
    );
  }

  const profile = await loadMasterProfile(accountId);
  const tailored = await tailorResumeForJob(
    [opportunity.title, opportunity.company, opportunity.location ?? ""].filter(
      Boolean
    ),
    profile,
    {
      companyName: opportunity.company,
      roleTitle: opportunity.title,
      jobText: [
        opportunity.title,
        opportunity.company,
        opportunity.location,
        opportunity.salary,
        opportunity.applyUrl,
      ]
        .filter(Boolean)
        .join("\n"),
    }
  );

  const subject = `Application: ${opportunity.title} at ${opportunity.company}`;
  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      draftSubject: subject,
      draftBody: tailored.coverLetter,
      status: "REVIEW_READY",
    },
  });

  return {
    subject,
    body: tailored.coverLetter,
    recipient: opportunity.recipientEmail!,
  };
}

export async function updateOpportunityDraft(
  accountId: string,
  opportunityId: string,
  input: { subject: string; body: string }
): Promise<void> {
  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }
  if (!canDraftDirectEmail(opportunity.recipientEmail)) {
    throw new Error("Cannot edit an email draft without a recruiter email.");
  }

  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      draftSubject: input.subject.trim(),
      draftBody: input.body.trim(),
      status: "REVIEW_READY",
    },
  });
}

export async function dispatchOpportunityEmail(
  accountId: string,
  opportunityId: string,
  options: { createDraftOnly?: boolean } = {}
): Promise<{ mode: "draft" | "sent" }> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.isActive) {
    throw new Error("Account not found or inactive");
  }

  const opportunity = await prisma.jobOpportunity.findFirst({
    where: { id: opportunityId, accountId },
  });
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }
  if (!canDraftDirectEmail(opportunity.recipientEmail)) {
    throw new Error(
      "No recruiter email address — refusing to create or send an email draft."
    );
  }

  const profile = await loadMasterProfile(accountId);
  const subject =
    opportunity.draftSubject?.trim() ||
    `Application: ${opportunity.title} at ${opportunity.company}`;
  const body =
    opportunity.draftBody?.trim() ||
    (
      await tailorResumeForJob(
        [opportunity.title, opportunity.company],
        profile,
        {
          companyName: opportunity.company,
          roleTitle: opportunity.title,
        }
      )
    ).coverLetter;

  const tailored = await tailorResumeForJob(
    [opportunity.title, opportunity.company],
    profile,
    {
      companyName: opportunity.company,
      roleTitle: opportunity.title,
    }
  );

  const pdf = await generateTailoredResumePdf(
    profile,
    tailored.selectedExperience.length > 0
      ? tailored.selectedExperience
      : profile.experiences
  );

  const filename = `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`;
  const raw = buildMimeMessage({
    from: account.email,
    to: opportunity.recipientEmail!,
    subject,
    body,
    pdf,
    filename,
  });

  const gmail = await getGmailClientForAccount(account);
  const createDraftOnly = options.createDraftOnly === true;

  try {
    if (createDraftOnly) {
      await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw: encodeRaw(raw) } },
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

  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      draftSubject: subject,
      draftBody: body,
      status: createDraftOnly ? "REVIEW_READY" : "APPLIED",
    },
  });

  return { mode: createDraftOnly ? "draft" : "sent" };
}

export async function countSendsToday(accountId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [apps, opps] = await Promise.all([
    prisma.jobApplication.count({
      where: {
        accountId,
        OR: [
          { dispatchStatus: "SENT", sentAt: { gte: start } },
          { opportunityStatus: "SENT", sentAt: { gte: start } },
        ],
      },
    }),
    prisma.jobOpportunity.count({
      where: {
        accountId,
        status: "APPLIED",
        updatedAt: { gte: start },
        applicationType: "DIRECT_EMAIL",
      },
    }),
  ]);
  return apps + opps;
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
